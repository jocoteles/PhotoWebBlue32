#ifndef EWB_SERVER_H
#define EWB_SERVER_H

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "ArduinoJson.h"

// Definição dos tipos de variáveis para clareza
enum VariableType {
  TYPE_INT,
  TYPE_FLOAT,
  TYPE_STRING
};

// Estrutura para configurar as variáveis que serão expostas via Bluetooth
struct VariableConfig {
  const char* name;
  VariableType type;
  int intValue;
  float floatValue;
  char stringValue[64]; // Tamanho máximo para strings
  float min;
  float max;
  bool useLimits;
};

// Callbacks para o início e fim do streaming
typedef void (*StreamCallback)();

class EWBServer {
public:
  EWBServer();
  void begin(const char* deviceName, VariableConfig* vars, int numVars);
  void setStreamCallbacks(StreamCallback onStart, StreamCallback onStop);
  void sendStreamData(const uint8_t* data, size_t length);
  bool isClientConnected();

  // <-- Declarando a classe de callback como amiga
  // Isso permite que JsonCharacteristicCallbacks acesse os métodos privados abaixo.
  friend class JsonCharacteristicCallbacks; 

private:
  // Ponteiros para as variáveis da aplicação principal
  VariableConfig* variables;
  int numVariables;

  // Estado da conexão e streaming
  bool clientConnected = false;

  // Callbacks
  StreamCallback onStreamStartCallback = nullptr;
  StreamCallback onStreamStopCallback = nullptr;

  // Características BLE
  BLECharacteristic* jsonVariablesCharacteristic = nullptr;
  BLECharacteristic* streamDataCharacteristic = nullptr;
  BLECharacteristic* streamControlCharacteristic = nullptr;

  // Funções internas
  void handleJsonGet(JsonDocument& doc);
  void handleJsonSet(JsonDocument& doc);
  void generateJsonState(JsonDocument& doc);
};

// Definição de Callbacks para o servidor BLE e características
class MyServerCallbacks : public BLEServerCallbacks {
public:
    MyServerCallbacks(bool* connectedFlag);
    void onConnect(BLEServer* pServer) override;
    void onDisconnect(BLEServer* pServer) override;
private:
    bool* connectedFlag;
};

class JsonCharacteristicCallbacks : public BLECharacteristicCallbacks {
public:
    JsonCharacteristicCallbacks(EWBServer* serverInstance);
    void onWrite(BLECharacteristic* pCharacteristic) override;
    void onRead(BLECharacteristic* pCharacteristic) override;
private:
    EWBServer* server;
};

class StreamControlCallbacks : public BLECharacteristicCallbacks {
public:
    StreamControlCallbacks(StreamCallback onStart, StreamCallback onStop);
    void onWrite(BLECharacteristic* pCharacteristic) override;
private:
    StreamCallback onStreamStart;
    StreamCallback onStreamStop;
};

#endif // EWB_SERVER_H