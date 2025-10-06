# PhotoWebBlue32 (PWB32)

PhotoWebBlue32 é um sistema photogate de seis canais, de baixo custo e alta performance, projetado para laboratórios de ensino de Física. Ele utiliza um microcontrolador ESP32 para realizar a aquisição de dados e os transmite via Bluetooth para uma Progressive Web App (PWA), que serve como interface de controle e visualização.

O projeto é uma aplicação específica construída sobre a filosofia do template [ESP32WebBluetooth](https://github.com/jocoteles/ESP32WebBluetooth), priorizando clareza e facilidade de modificação para fins educacionais.

## Filosofia do Projeto

**Foco Educacional e Pragmatismo.** O código foi desenvolvido para ser uma ferramenta educacional funcional e de fácil compreensão. O objetivo é fornecer um sistema photogate completo que possa ser usado diretamente em experimentos de mecânica, ondulatória e outros campos da Física, ao mesmo tempo que serve como um exemplo prático de integração entre hardware (ESP32) e software web moderno (PWA, Web Bluetooth).

---

## Como Funciona

O sistema foi desenhado para suportar múltiplos modos de operação, tornando-o mais flexível para diferentes tipos de experimentos.

### Lado do ESP32 (Servidor - `PWB32Server`)

O firmware do ESP32 cria um servidor Bluetooth Low Energy (BLE) com um serviço que expõe três "características" (characteristics):

1.  **JSON Variables (Read/Write):** Permite que a PWA configure remotamente parâmetros de aquisição, como o modo de operação, os níveis de trigger de cada canal, o tamanho do buffer (`SAMPLES_PER_CHUNK`) e o intervalo entre leituras (`SAMPLE_INTERVAL_US`).
2.  **Stream Control (Write):** Uma característica simples que aceita um único byte para controlar o fluxo de dados (`0x01` para iniciar, `0x00` para parar a aquisição).
3.  **Stream Data (Notify):** Envia pacotes de dados para a PWA. O formato desses pacotes depende do modo de aquisição selecionado.

Para garantir a máxima performance e evitar atrasos no loop de medição, o firmware utiliza **ponteiros de função**. Ao invés de verificar o modo de operação a cada ciclo, a PWA define o modo uma única vez, e o ESP32 aponta para a função de loop específica daquele modo, executando-a diretamente sem sobrecarga.

O ESP32 opera em um dos quatro modos:

*   **Streaming de Níveis:** Lê os 6 canais analógicos e envia os dados brutos (ADC) em pacotes para a PWA. O processamento para encontrar eventos é feito no lado do cliente.
*   **Tempos de Disparo:** A PWA envia os níveis de trigger para o ESP32. O próprio firmware **processa os sinais em tempo real**, detecta os cruzamentos de trigger (subida/descida) e envia pacotes de evento muito mais leves, contendo apenas o canal, o tipo de evento e o tempo exato da ocorrência.
*   **Simulação de Streaming:** Usa a função `simGate()` para gerar dados falsos de 6 canais e os envia no mesmo formato do modo "Streaming de Níveis". Ideal para testes e demonstrações sem sensores.
*   **Simulação de Tempos de Disparo:** Usa os dados simulados da função `simGate()` e aplica a mesma lógica de detecção de eventos do modo "Tempos de Disparo", enviando os pacotes de evento para a PWA.

### Lado do Cliente (PWA)

A PWA é a interface do usuário, acessível por qualquer navegador moderno com suporte a Web Bluetooth.

1.  **Conexão:** O usuário se conecta ao ESP32 específico do seu kit, permitindo que vários sistemas funcionem simultaneamente no mesmo laboratório.
2.  **Configuração:** Na aba **[Config]**, o usuário seleciona o **Modo de Aquisição** desejado. Essa escolha determina como o ESP32 irá adquirir e enviar os dados.
3.  **Aquisição:** Na aba **[Aquisição]**, o usuário pode disparar e interromper a coleta de dados. Um indicador visual (spinner) mostra que a aquisição está em andamento.
4.  **Análise Interativa:**
    *   O usuário clica/toca no gráfico para definir o nível de trigger para os canais habilitados. Esses níveis são enviados em tempo real para o ESP32 para uso nos modos de "Tempos de Disparo".
    *   Nos modos **"Streaming de Níveis"**, o gráfico é preenchido com os dados brutos ao final da aquisição.
    *   Nos modos **"Tempos de Disparo"**, a tabela de tempos é preenchida **em tempo real** à medida que o ESP32 detecta e envia os eventos.
    *   Uma grade de botões permite filtrar a Tabela de Tempos por canal e tipo de evento (subida/descida). Botões de análise permitem zerar a origem temporal, agrupar eventos e mostrar/ocultar os marcadores de evento no gráfico.
5.  **Exportação:** Os dados da tabela de tempos e os dados brutos do gráfico (quando aplicável) podem ser facilmente copiados ou salvos em formato CSV para análise posterior em softwares como Excel ou Google Sheets.

---

## Instalação e Configuração

### Requisitos

1.  **Hardware:** Um ESP32 Dev Kit com os 6 sensores photogate conectados às entradas analógicas especificadas no firmware.
2.  **Firmware:**
    *   [Arduino IDE](https://www.arduino.cc/en/software) com o [board manager do ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html) instalado.
    *   Biblioteca **ArduinoJson** (instalada via Library Manager do Arduino IDE).
3.  **PWA (Cliente):**
    *   Um navegador com suporte a Web Bluetooth (Chrome, Edge, Opera em Desktop e Android).
    *   Um servidor web para hospedar os arquivos da PWA. Este projeto já se encontra [hospedado como uma GitHub Pages](https://jocoteles.github.io/PhotoWebBlue32/).

### Passos

#### 1. Gravar o Firmware no ESP32

1.  Copie a pasta `PWB32Server` para a sua pasta de projetos do Arduino.
2.  Abra o arquivo `PWB32Server.ino`.
3.  Instale a dependência `ArduinoJson` através do Library Manager.
4.  Selecione a placa ESP32 correta e a porta serial.
5.  Compile e envie o código para o seu ESP32.
6.  Abra o Monitor Serial (baud rate 115200) para ver as mensagens de log. Você deverá ver "EWBServer started. Waiting for a client connection...".

#### 2. Hospedar a PWA

Este passo é necessário apenas caso queira desenvolver o seu próprio aplicativo baseado neste projeto. Caso contrário, basta usar a [aplicação pronta](https://jocoteles.github.io/PhotoWebBlue32/).

1.  Crie um novo repositório no GitHub.
2.  Envie todos os arquivos da raiz do projeto ( `index.html`, `main.js`, etc.) para o repositório.
3.  No seu repositório do GitHub, vá para `Settings` -> `Pages`.
4.  Em "Source", selecione a branch `main` (ou `master`) e a pasta `/root`. Clique em `Save`.
5.  Aguarde alguns minutos. O GitHub irá publicar seu site em um endereço como `https://<seu-usuario>.github.io/<seu-repositorio>/`.

---

## Como Usar o Sistema

1.  Ligue o seu kit PhotoWebBlue32.
2.  No seu computador ou smartphone Android, abra o Google Chrome e navegue para o URL da sua PWA.
3.  Na aba **[Conexão]**, clique em **"Conectar"**. Selecione o dispositivo e emparelhe. O nome do dispositivo conectado aparecerá na tela.
4.  Vá para a aba **[Config]** e escolha o **Modo de Aquisição** desejado no menu.
5.  Vá para a aba **[Aquisição]**.
6.  Clique em **"Disparar leitura"**. O botão ficará vermelho, exibirá um spinner e o texto mudará para "Interromper leitura".
7.  Realize seu experimento (ex: passar um objeto pelos sensores).
8.  Clique em **"Interromper leitura"** ou aguarde o tempo máximo de aquisição.
9.  **Resultado:**
    *   Se você usou um modo de **Streaming**, o gráfico com os dados coletados aparecerá.
    *   Se você usou um modo de **Tempos de Disparo**, a Tabela de Tempos já terá sido preenchida em tempo real durante a aquisição.
10. Interaja com os dados:
    *   Clique/toque no gráfico para definir ou ajustar o nível de trigger.
    *   Use a grade de botões para selecionar quais canais e tipos de evento (subida/descida) devem ser considerados na Tabela de Tempos.
    *   Use os botões de análise abaixo da tabela para alternar entre **"Zerar origem temporal"** / **"Recuperar origem temporal"**, **"Mostrar/Ocultar eventos no gráfico"** e **"Juntar/Separar subida/descida"**.
11. Use os botões na seção "Salvar dados" para exportar seus resultados para análise externa.