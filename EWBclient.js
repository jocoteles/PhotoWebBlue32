/**
 * @file EWBclient.js
 * @brief Abstrai a comunicação Web Bluetooth para o projeto PhotoWebBlue32.
 * @version 2.1 - Adicionado suporte para múltiplos tipos de pacotes de dados.
 */

// UUIDs devem ser idênticos aos definidos no firmware do ESP32
const EWB_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const JSON_VARS_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const STREAM_DATA_CHAR_UUID = "82b934b0-a02c-4fb5-a818-a35752697d57";
const STREAM_CONTROL_CHAR_UUID = "c8a4a259-4203-48e8-b39f-5a8b71d601b0";

class EWBClient {
    constructor() {
        this.device = null;
        this.server = null;
        this.jsonVarsChar = null;
        this.streamDataChar = null;
        this.streamControlChar = null;
        this.onDisconnectCallback = null;
        this.onStreamData = null;
        this.getModeCallback = null; // Para saber como decodificar

        this._streamDataListener = this._handleStreamDataEvent.bind(this);
    }

    async connect() {
        if (!navigator.bluetooth) {
            const errorMsg = 'Web Bluetooth API is not available. Please use a compatible browser (Chrome, Edge) on a secure context (HTTPS or localhost).';
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        try {
            console.log('Requesting Bluetooth Device...');
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [EWB_SERVICE_UUID] }]
            });

            console.log('Connecting to GATT Server...');
            this.device.addEventListener('gattserverdisconnected', this._onDisconnect.bind(this));
            this.server = await this.device.gatt.connect();

            console.log('Getting Service...');
            const service = await this.server.getPrimaryService(EWB_SERVICE_UUID);

            console.log('Getting Characteristics...');
            this.jsonVarsChar = await service.getCharacteristic(JSON_VARS_CHAR_UUID);
            this.streamDataChar = await service.getCharacteristic(STREAM_DATA_CHAR_UUID);
            this.streamControlChar = await service.getCharacteristic(STREAM_CONTROL_CHAR_UUID);

            console.log('Client connected and ready.');

        } catch (error) {
            console.error('Connection failed!', error);
            if (this.device) {
                this.device.removeEventListener('gattserverdisconnected', this._onDisconnect.bind(this));
            }
            throw error;
        }
    }

    disconnect() {
        if (!this.server || !this.server.connected) {
            return;
        }
        console.log('Disconnecting...');
        this.server.disconnect();
    }

    _onDisconnect() {
        console.log('Device disconnected.');
        if (this.streamDataChar) {
            try {
                this.streamDataChar.removeEventListener('characteristicvaluechanged', this._streamDataListener);
            } catch (e) {
                console.warn("Could not remove stream listener on disconnect:", e);
            }
        }
        this.onStreamData = null;
        
        if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
    }

    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }

    async getVariables() {
        const value = await this.jsonVarsChar.readValue();
        const textDecoder = new TextDecoder('utf-8');
        const jsonString = textDecoder.decode(value);
        return JSON.parse(jsonString);
    }

    async setVariables(varsToSet) {
        const command = { set: varsToSet };
        const jsonString = JSON.stringify(command);
        const textEncoder = new TextEncoder();
        await this.jsonVarsChar.writeValue(textEncoder.encode(jsonString));
    }

    /**
     * Define a função que será chamada sempre que um novo pacote de dados de stream chegar.
     * @param {function(Object)} callback A função para processar o pacote de dados.
     * @param {function(): number} getModeCb Função que retorna o modo de aquisição atual.
     */
    setOnStreamData(callback, getModeCb) {
        this.onStreamData = callback;
        this.getModeCallback = getModeCb;
    }

    async startStream() {
        if (!this.streamDataChar) {
            console.error("Stream characteristic not available.");
            return;
        }
        this.streamDataChar.addEventListener('characteristicvaluechanged', this._streamDataListener);
        await this.streamDataChar.startNotifications();
        console.log('Stream notifications started.');

        const startCommand = new Uint8Array([0x01]);
        await this.streamControlChar.writeValue(startCommand);
        console.log('Stream START command sent.');
    }

    async stopStream() {
        if (!this.streamControlChar || !this.streamDataChar) {
            console.error("Stream characteristics not available.");
            return;
        }
        const stopCommand = new Uint8Array([0x00]);
        await this.streamControlChar.writeValue(stopCommand);
        console.log('Stream STOP command sent.');
        
        this.streamDataChar.removeEventListener('characteristicvaluechanged', this._streamDataListener);
        
        await this.streamDataChar.stopNotifications();
        console.log('Stream notifications stopped.');
    }
    
    _handleStreamDataEvent(event) {
        if (!this.onStreamData || !this.getModeCallback) {
            return;
        }

        const dataView = event.target.value;
        const currentMode = this.getModeCallback();

        // Modos de Streaming (0 ou 2)
        if (currentMode === 0 || currentMode === 2) {
            // Estrutura: 6x uint16_t + 1x uint32_t = 16 bytes por pacote
            const packetSizeBytes = (6 * 2) + 4;
            if (dataView.byteLength % packetSizeBytes !== 0) return; // Pacote malformado
            const numPackets = dataView.byteLength / packetSizeBytes;

            for (let i = 0; i < numPackets; i++) {
                const offset = i * packetSizeBytes;
                const packet = {
                    reading1: dataView.getUint16(offset + 0, true),
                    reading2: dataView.getUint16(offset + 2, true),
                    reading3: dataView.getUint16(offset + 4, true),
                    reading4: dataView.getUint16(offset + 6, true),
                    reading5: dataView.getUint16(offset + 8, true),
                    reading6: dataView.getUint16(offset + 10, true),
                    time_ms: dataView.getUint32(offset + 12, true)
                };
                this.onStreamData(packet); // Chama o callback para cada pacote individual
            }
        } 
        // Modos de Tempo (1 ou 3)
        else {
            // Estrutura: 1x uint8 (canal), 1x uint8 (tipo), 1x uint32 (tempo) = 6 bytes
            const packetSizeBytes = 1 + 1 + 4;
            if (dataView.byteLength % packetSizeBytes !== 0) return; // Pacote malformado
            const numPackets = dataView.byteLength / packetSizeBytes;
            let events = [];

            for (let i = 0; i < numPackets; i++) {
                const offset = i * packetSizeBytes;
                const eventPacket = {
                    channel: dataView.getUint8(offset + 0),
                    type: dataView.getUint8(offset + 1) === 1 ? 'subida' : 'descida',
                    time: dataView.getUint32(offset + 2, true)
                };
                events.push(eventPacket);
            }
            if (events.length > 0) {
                this.onStreamData(events); // Envia um array de eventos de uma vez
            }
        }
    }
}