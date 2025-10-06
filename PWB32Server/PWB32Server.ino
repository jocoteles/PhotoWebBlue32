/**
 * @file PWB32Server.ino
 * @brief Aplicação para o sistema PhotoWebBlue32 (PWB32).
 * @version 2.1 - Adicionado envio de eventos em tempo real.
 */

#include "EWBServer.h"

// --- Configuração do Dispositivo ---
const char* DEVICE_NAME = "PhotoGate-1";
EWBServer ewbServer;

// --- Ponteiro de Função para o Loop de Aquisição ---
void (*currentAcquisitionFunction)();

// --- Configuração das Variáveis (Comunicação JSON) ---
VariableConfig configurableVariables[] = {
  // Name                 Type      Int Val  Float Val  String Val  Min    Max      Limits?
  {"samples_per_chunk",   TYPE_INT, 20,      0.0f,      "",         1,     100,     true},
  {"sample_interval_us",  TYPE_INT, 250,     0.0f,      "",         50,    1000,    true},
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
struct SensorDataPacket {
  uint16_t readings[NUM_CHANNELS];
  uint32_t time_ms;
};
struct EventDataPacket {
  uint8_t channel; // 1-6
  uint8_t type;    // 0: descida, 1: subida
  uint32_t time_ms;
};
#pragma pack(pop)

SensorDataPacket* sensorDataBuffer = nullptr; 
EventDataPacket* eventDataBuffer = nullptr;
int currentBufferIndex = 0;
uint16_t lastReadings[NUM_CHANNELS] = {0};

volatile bool isAppStreaming = false;
volatile uint32_t streamStartTimeMs = 0;

// Protótipos
void loop_streaming_real();
void loop_tempos_real();
void loop_streaming_sim();
void loop_tempos_sim();
void onVariableChanged(const char* varName);

// --- Callbacks ---
void application_onStreamStart() {
  Serial.println("Application Callback: START STREAM");
  currentBufferIndex = 0;
  memset(lastReadings, 0, sizeof(lastReadings));
  streamStartTimeMs = millis();
  isAppStreaming = true;
}

void application_onStreamStop() {
  Serial.println("Application Callback: STOP STREAM");
  isAppStreaming = false;
}

uint16_t simGate(uint16_t channel) {
    uint32_t currentTime = millis();
    uint32_t timeBlock = currentTime / (150 + channel * 50);
    uint32_t seed = timeBlock * (1103515245 + channel * 100) + 12345;
    float pseudoRandom = (seed % 10000) / 10000.0;
    
    uint16_t level = (pseudoRandom < 0.2) ? 3800 : 200;
    level += random(100) - 50;
    return constrain(level, 0, 4095);
}

// --- Setup e Loop ---
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- PWB32 Application Setup v2.1 ---");
  
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

    if (currentBufferIndex >= configurableVariables[0].intValue) { // samples_per_chunk
      size_t chunkSize = currentBufferIndex * sizeof(SensorDataPacket);
      ewbServer.sendStreamData((uint8_t*)sensorDataBuffer, chunkSize);
      currentBufferIndex = 0;
    }
    delayMicroseconds(configurableVariables[1].intValue); // sample_interval_us
}

void loop_tempos_real() {
    uint32_t currentTimeMs = millis() - streamStartTimeMs;

    // 1. Detecta todos os eventos que ocorreram neste ciclo
    for(int ch=0; ch<NUM_CHANNELS; ch++) {
        uint16_t currentReading = analogRead(ANALOG_PINS[ch]);
        uint16_t trigger = configurableVariables[3+ch].intValue;

        if (lastReadings[ch] < trigger && currentReading >= trigger) { // Subida
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 1, currentTimeMs };
        } else if (lastReadings[ch] > trigger && currentReading <= trigger) { // Descida
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 0, currentTimeMs };
        }
        lastReadings[ch] = currentReading;
    }

    // 2. Se algum evento foi encontrado, envia o buffer e o limpa
    if (currentBufferIndex > 0) {
        size_t chunkSize = currentBufferIndex * sizeof(EventDataPacket);
        ewbServer.sendStreamData((uint8_t*)eventDataBuffer, chunkSize);
        currentBufferIndex = 0;
    }
    
    // 3. Aguarda o intervalo de amostragem
    delayMicroseconds(configurableVariables[1].intValue);
}

void loop_streaming_sim() {
    uint32_t currentTimeMs = millis() - streamStartTimeMs;
    
    SensorDataPacket packet;
    for(int i=0; i<NUM_CHANNELS; i++) { packet.readings[i] = simGate(i); }
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

    // 1. Detecta eventos simulados
    for(int ch=0; ch<NUM_CHANNELS; ch++) {
        uint16_t currentReading = simGate(ch);
        uint16_t trigger = configurableVariables[3+ch].intValue;

        if (lastReadings[ch] < trigger && currentReading >= trigger) {
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 1, currentTimeMs };
        } else if (lastReadings[ch] > trigger && currentReading <= trigger) {
            eventDataBuffer[currentBufferIndex++] = { (uint8_t)(ch+1), 0, currentTimeMs };
        }
        lastReadings[ch] = currentReading;
    }
    
    // 2. Se algum evento foi encontrado, envia o buffer e o limpa
    if (currentBufferIndex > 0) {
        size_t chunkSize = currentBufferIndex * sizeof(EventDataPacket);
        ewbServer.sendStreamData((uint8_t*)eventDataBuffer, chunkSize);
        currentBufferIndex = 0;
    }

    // 3. Aguarda
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