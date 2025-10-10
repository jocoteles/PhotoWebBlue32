/**
 * @file PWB32Server.ino
 * @brief Aplicação para o sistema PhotoWebBluetooth32 (PWB32).
 */

#include "EWBServer.h"

// --- Configuração do Dispositivo ---
const char* DEVICE_NAME = "PhotoGate-1";
EWBServer ewbServer;

// --- Ponteiro de Função para o Loop de Aquisição ---
void (*currentAcquisitionFunction)();

// --- Parâmetros para Simulação de Eventos ---
const uint32_t BASE_PULSE_DURATION_MS = 300; // Duração em milissegundos para cada estado (alto/baixo).
const int      CHANNEL_DURATION_VAR_MS = 50;   // Variação por canal (ex: canal 5 terá pulsos de 300 + 5*50 = 550ms).
const float    HIGH_STATE_PROBABILITY = 0.02f; // PROBABILIDADE de o sinal estar em nível ALTO. 0.2 = 20% de chance.
const uint16_t BASE_HIGH_LEVEL = 3900; // Nível alto base (valores do ADC de 12 bits, 0-4095).
const uint16_t BASE_LOW_LEVEL  = 200;  // Nível baixo base (valores do ADC de 12 bits, 0-4095).
const int      CHANNEL_LEVEL_VAR = 50;   // Variação por canal (ex: canal 5 terá nível alto de 3900 - 5*50 = 3650).
const uint16_t NOISE_AMPLITUDE = 100;  // Amplitude pico-a-pico do ruído (ex: 100 significa ruído de -50 a +50).

// --- Configuração das Variáveis (Comunicação JSON) ---
VariableConfig configurableVariables[] = {
  // Name                 Type      Int Val  Float Val  String Val  Min    Max      Limits?
  {"samples_per_chunk",   TYPE_INT, 10,      0.0f,      "",         1,     100,     true},
  {"sample_interval_us",  TYPE_INT, 500,     0.0f,      "",         50,    1000,    true},
  {"acquisition_mode",    TYPE_INT, 0,       0.0f,      "",         0,     3,       true},
  {"trigger_c1",          TYPE_INT, 2048,    0.0f,      "",         0,     4095,    true},
  {"trigger_c2",          TYPE_INT, 2048,    0.0f,      "",         0,     4095,    true},
  {"trigger_c3",          TYPE_INT, 2048,    0.0f,      "",         0,     4095,    true},
  {"trigger_c4",          TYPE_INT, 2048,    0.0f,      "",         0,     4095,    true},
  {"trigger_c5",          TYPE_INT, 2048,    0.0f,      "",         0,     4095,    true},
  {"trigger_c6",          TYPE_INT, 2048,    0.0f,      "",         0,     4095,    true}
};
const int numConfigurableVariables = sizeof(configurableVariables) / sizeof(configurableVariables[0]);

// --- Configuração do Streaming ---
const int ANALOG_PINS[] = {32, 33, 34, 35, 36, 39};
const int NUM_CHANNELS = 6;

#pragma pack(push, 1)
struct SensorDataPacket { uint16_t readings[NUM_CHANNELS]; uint32_t time_ms; };
struct EventDataPacket { uint8_t channel; uint8_t type; uint32_t time_ms; };
#pragma pack(pop)

SensorDataPacket* sensorDataBuffer = nullptr; 
EventDataPacket* eventDataBuffer = nullptr;
int currentBufferIndex = 0;
uint16_t lastReadings[NUM_CHANNELS] = {0};

volatile bool isAppStreaming = false;
volatile uint32_t streamStartTimeMs = 0;
volatile uint32_t simulationSeed = 0; // Seed de aleatoriedade, gerado a cada nova aquisição

// Protótipos
void loop_streaming_real();
void loop_tempos_real();
void loop_streaming_sim();
void loop_tempos_sim();
void onVariableChanged(const char* varName);
uint16_t simGate(uint16_t channel, uint32_t baseSeed);

// --- Callbacks ---
void application_onStreamStart() {
  Serial.println("Application Callback: START STREAM");
  currentBufferIndex = 0;
  memset(lastReadings, 0, sizeof(lastReadings));
  streamStartTimeMs = millis();
  simulationSeed = random(0, 100000); // Gera um novo seed para esta aquisição
  isAppStreaming = true;
}

void application_onStreamStop() {
  Serial.println("Application Callback: STOP STREAM");
  isAppStreaming = false;
}

/**
 * @brief Gera um valor de sinal simulado para um photogate.
 * @param channel O número do canal (0-5) a ser simulado.
 * @param baseSeed O seed de aleatoriedade para esta aquisição.
 * @return O valor simulado do sensor (0 a 4095).
 */
uint16_t simGate(uint16_t channel, uint32_t baseSeed) {
    uint32_t currentTime = millis();
    uint32_t pulseDuration = BASE_PULSE_DURATION_MS + (channel * CHANNEL_DURATION_VAR_MS);
    uint32_t timeBlock = (pulseDuration > 0) ? (currentTime / pulseDuration) : currentTime;

    // Gera um valor pseudo-aleatório determinístico para este bloco de tempo
    uint32_t finalSeed = timeBlock * (1103515245 + channel * 100) + baseSeed;
    float pseudoRandom = (finalSeed % 10000) / 10000.0f;
    
    // Define o nível com base na probabilidade
    uint16_t highLvl = BASE_HIGH_LEVEL - (channel * CHANNEL_LEVEL_VAR);
    uint16_t lowLvl  = BASE_LOW_LEVEL  + (channel * CHANNEL_LEVEL_VAR / 2); // Varia menos para não subir muito
    uint16_t level = (pseudoRandom < HIGH_STATE_PROBABILITY) ? highLvl : lowLvl;
    
    // Adiciona ruído
    if (NOISE_AMPLITUDE > 0) {
      level += random(NOISE_AMPLITUDE) - (NOISE_AMPLITUDE / 2);
    }

    return constrain(level, 0, 4095);
}

// --- Setup e Loop ---
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- PWB32 Application Setup v2.2 ---");
  
  for(int i=0; i<NUM_CHANNELS; i++) pinMode(ANALOG_PINS[i], INPUT);

  ewbServer.begin(DEVICE_NAME, configurableVariables, numConfigurableVariables);
  ewbServer.setStreamCallbacks(application_onStreamStart, application_onStreamStop);
  ewbServer.setOnVariableChangeCallback(onVariableChanged);
  
  sensorDataBuffer = new SensorDataPacket[100]; 
  eventDataBuffer = new EventDataPacket[100];
  
  onVariableChanged("acquisition_mode"); // Define a função de loop inicial

  Serial.println("--- Setup Complete ---");
}

void loop() {
  if (isAppStreaming && ewbServer.isClientConnected()) {    
    currentAcquisitionFunction();
  } else {
    delay(50);
  }
}

// --- Implementação dos Modos de Aquisição ---
void loop_streaming_real() {
    uint32_t currentTimeMs = millis() - streamStartTimeMs;
    SensorDataPacket packet;
    for(int i=0; i<NUM_CHANNELS; i++) { packet.readings[i] = analogRead(ANALOG_PINS[i]); }
    packet.time_ms = currentTimeMs;
    sensorDataBuffer[currentBufferIndex++] = packet;

    if (currentBufferIndex >= configurableVariables[0].intValue) {
      size_t chunkSize = currentBufferIndex * sizeof(SensorDataPacket);
      ewbServer.sendStreamData((uint8_t*)sensorDataBuffer, chunkSize);
      currentBufferIndex = 0;
    }
    delayMicroseconds(configurableVariables[1].intValue);
}

void loop_tempos_real() {
    uint32_t currentTimeMs = millis() - streamStartTimeMs;
    for(int ch=0; ch<NUM_CHANNELS; ch++) {
        uint16_t currentReading = analogRead(ANALOG_PINS[ch]);
        uint16_t trigger = configurableVariables[3+ch].intValue;
        if (lastReadings[ch] < trigger && currentReading >= trigger) {
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 1, currentTimeMs };
        } else if (lastReadings[ch] > trigger && currentReading <= trigger) {
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 0, currentTimeMs };
        }
        lastReadings[ch] = currentReading;
    }
    if (currentBufferIndex > 0) {
        size_t chunkSize = currentBufferIndex * sizeof(EventDataPacket);
        ewbServer.sendStreamData((uint8_t*)eventDataBuffer, chunkSize);
        currentBufferIndex = 0;
    }
    delayMicroseconds(configurableVariables[1].intValue);
}

void loop_streaming_sim() {
    uint32_t currentTimeMs = millis() - streamStartTimeMs;
    SensorDataPacket packet;
    for(int i=0; i<NUM_CHANNELS; i++) { packet.readings[i] = simGate(i, simulationSeed); }
    packet.time_ms = currentTimeMs;
    sensorDataBuffer[currentBufferIndex++] = packet;

    if (currentBufferIndex >= configurableVariables[0].intValue) {
      size_t chunkSize = currentBufferIndex * sizeof(SensorDataPacket);
      ewbServer.sendStreamData((uint8_t*)sensorDataBuffer, chunkSize);
      currentBufferIndex = 0;
    }
    delayMicroseconds(configurableVariables[1].intValue);
}

void loop_tempos_sim() {
    uint32_t currentTimeMs = millis() - streamStartTimeMs;
    for(int ch=0; ch<NUM_CHANNELS; ch++) {
        uint16_t currentReading = simGate(ch, simulationSeed);
        uint16_t trigger = configurableVariables[3+ch].intValue;
        if (lastReadings[ch] < trigger && currentReading >= trigger) {
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 1, currentTimeMs };
        } else if (lastReadings[ch] > trigger && currentReading <= trigger) {
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 0, currentTimeMs };
        }
        lastReadings[ch] = currentReading;
    }
    if (currentBufferIndex > 0) {
        size_t chunkSize = currentBufferIndex * sizeof(EventDataPacket);
        ewbServer.sendStreamData((uint8_t*)eventDataBuffer, chunkSize);
        currentBufferIndex = 0;
    }
    delayMicroseconds(configurableVariables[1].intValue);
}

void onVariableChanged(const char* varName) {
    if (strcmp(varName, "acquisition_mode") == 0) {
        int mode = configurableVariables[2].intValue;
        Serial.printf("Mode changed to: %d\n", mode);
        switch(mode) {
            case 0: currentAcquisitionFunction = &loop_streaming_real; break;
            case 1: currentAcquisitionFunction = &loop_tempos_real; break;
            case 2: currentAcquisitionFunction = &loop_streaming_sim; break;
            case 3: currentAcquisitionFunction = &loop_tempos_sim; break;
            default: currentAcquisitionFunction = &loop_streaming_real;
        }
    }
}