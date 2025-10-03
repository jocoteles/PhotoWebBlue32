/**
 * @file PWB32Server.ino
 * @brief Aplicação para o sistema PhotoWebBlue32 (PWB32).
 *        Este firmware lê 6 canais analógicos e os transmite via Web Bluetooth
 *        para uma PWA para análise de dados de photogates em laboratórios de física.
 */

#include "EWBServer.h"

// --- Configuração do Dispositivo ---
const char* DEVICE_NAME = "ESP32_PWB_Control";

// --- Instância do Servidor ---
EWBServer ewbServer;

// --- Configuração das Variáveis (Comunicação JSON) ---
// Estas variáveis podem ser alteradas remotamente pela PWA na aba de Configurações Avançadas.
VariableConfig configurableVariables[] = {
  // Name                 Type      Int Val  Float Val  String Val  Min    Max      Limits?
  {"samples_per_chunk",   TYPE_INT, 20,      0.0f,      "",         1.0,   100.0,   true},
  {"sample_interval_us",  TYPE_INT, 250,     0.0f,      "",         50.0,  1000.0,  true}
};
const int numConfigurableVariables = sizeof(configurableVariables) / sizeof(configurableVariables[0]);


// --- Configuração do Streaming ---
const int ANALOG_PIN_1 = 32;
const int ANALOG_PIN_2 = 33;
const int ANALOG_PIN_3 = 34;
const int ANALOG_PIN_4 = 35;
const int ANALOG_PIN_5 = 36;
const int ANALOG_PIN_6 = 39;

// Estrutura do pacote de dados (deve ser idêntica à do cliente JS)
#pragma pack(push, 1)
struct SensorDataPacket {
  uint16_t reading1, reading2, reading3, reading4, reading5, reading6;
  uint32_t time_ms;
};
#pragma pack(pop)

const int PACKET_SIZE_BYTES = sizeof(SensorDataPacket);

// O buffer de dados será alocado dinamicamente no setup para usar a variável configurável
SensorDataPacket* sensorDataBuffer = nullptr; 
int currentBufferIndex = 0;

// --- Variáveis de Estado da Aplicação ---
// Usar 'volatile' para garantir que as alterações feitas nos callbacks de BLE
// sejam sempre visíveis dentro da função loop().
volatile bool isAppStreaming = false;
volatile uint32_t streamStartTimeMs = 0;


// --- Funções de Callback para o Streaming ---

void application_onStreamStart() {
  Serial.println("Application Callback: START STREAM");
  currentBufferIndex = 0;
  streamStartTimeMs = millis();
  isAppStreaming = true;
}

void application_onStreamStop() {
  Serial.println("Application Callback: STOP STREAM");
  isAppStreaming = false;
  //streamStartTimeMs = 0;
}

/**
 * @brief Simula um sinal de photogate com pulsos de duração controlada
 * @param upP Probabilidade de transição (0.0 a 1.0) - controla frequência de pulsos
 * @param lowL Valor do nível baixo (tipicamente 0-500)
 * @param highL Valor do nível alto (tipicamente 3500-4095)
 * @param noise Amplitude máxima do ruído a ser adicionado
 * @param pulseDuration Duração aproximada do pulso em ms
 * @return uint16_t Valor simulado do sensor (0-4095)
 */
uint16_t simGate(float upP, uint16_t lowL, uint16_t highL, uint16_t noise, uint16_t pulseDuration) {
  int level;
  
  // Usa o tempo atual como base para criar "regiões" de estado
  uint32_t currentTime = millis();
  uint32_t timeBlock = currentTime / pulseDuration;
  
  // Gera um "estado" pseudo-aleatório baseado no bloco de tempo
  // Usando uma operação de hash simples para tornar imprevisível
  uint32_t seed = timeBlock * 1103515245 + 12345;  // Linear congruential generator
  float pseudoRandom = (seed % 10000) / 10000.0;
  
  // Decide o nível base para este bloco de tempo
  if (pseudoRandom < upP) {
    level = highL;
  } else {
    level = lowL;
  }
  
  // Adiciona ruído aleatório (positivo ou negativo)
  if (noise > 0) {
    int noiseValue = random(noise * 2) - noise;
    level += noiseValue;
  }
  
  // Limita ao range válido do ADC (12-bit)
  level = constrain(level, 0, 4095);
  
  return (uint16_t)level;
}

// --- Funções Setup e Loop ---

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- PWB32 Application Setup ---");

  // Configura os pinos analógicos
  pinMode(ANALOG_PIN_1, INPUT);
  pinMode(ANALOG_PIN_2, INPUT);
  pinMode(ANALOG_PIN_3, INPUT);
  pinMode(ANALOG_PIN_4, INPUT);
  pinMode(ANALOG_PIN_5, INPUT);
  pinMode(ANALOG_PIN_6, INPUT);

  // Inicializa o servidor Web Bluetooth
  ewbServer.begin(DEVICE_NAME, configurableVariables, numConfigurableVariables);
  
  // Registra os callbacks da aplicação
  ewbServer.setStreamCallbacks(application_onStreamStart, application_onStreamStop);
  
  // Aloca o buffer de sensores. O tamanho máximo é baseado no limite da variável.
  sensorDataBuffer = new SensorDataPacket[100]; 
  if (!sensorDataBuffer) {
    Serial.println("!!! Failed to allocate sensor buffer !!!");
  }
  
  Serial.println("--- Setup Complete ---");
}

void loop() {
  if (isAppStreaming && ewbServer.isClientConnected()) {    

    // 1. Simula os sensores (comente para usar sensores reais)
    uint16_t val1 = simGate(0.3, 100, 2000, 50, 300);   // 30% do tempo em alto, pulsos de 100ms
    uint16_t val2 = simGate(0.2, 80, 3950, 40, 150);    // 20% do tempo em alto, pulsos de 150ms
    uint16_t val3 = simGate(0.25, 120, 3800, 60, 120);  
    uint16_t val4 = simGate(0.15, 90, 1500, 45, 450);   
    uint16_t val5 = simGate(0.35, 110, 3850, 55, 80);   
    uint16_t val6 = simGate(0.1, 70, 200, 35, 250); 
   
    // 1. Lê os sensores reais
    /*uint16_t val1 = analogRead(ANALOG_PIN_1);
    uint16_t val2 = analogRead(ANALOG_PIN_2);
    uint16_t val3 = analogRead(ANALOG_PIN_3);
    uint16_t val4 = analogRead(ANALOG_PIN_4);
    uint16_t val5 = analogRead(ANALOG_PIN_5);
    uint16_t val6 = analogRead(ANALOG_PIN_6);*/

    // 2. Obtém o timestamp
    uint32_t currentTimeMs = millis() - streamStartTimeMs;

    // 3. Preenche o buffer
    sensorDataBuffer[currentBufferIndex] = {val1, val2, val3, val4, val5, val6, currentTimeMs};
    currentBufferIndex++;

    // 4. Se o buffer estiver cheio, envia os dados
    // Usa o valor da variável que pode ser configurada remotamente
    if (currentBufferIndex >= configurableVariables[0].intValue) { // index 0 é samples_per_chunk
      size_t chunkSize = currentBufferIndex * PACKET_SIZE_BYTES;
      ewbServer.sendStreamData((uint8_t*)sensorDataBuffer, chunkSize);
      currentBufferIndex = 0;
    }

    // 5. Aguarda o intervalo de amostragem
    // Usa o valor da variável que pode ser configurada remotamente
    delayMicroseconds(configurableVariables[1].intValue); // index 1 é sample_interval_us

  } else {
    // Se não estiver em streaming, pode fazer outras tarefas
    delay(50);
  }
}