# PhotoWebBlue32 (PWB32)

PhotoWebBlue32 é um sistema photogate de seis canais, de baixo custo e alta performance, projetado para laboratórios de ensino de Física. Ele utiliza um microcontrolador ESP32 para realizar a aquisição de dados e os transmite via Bluetooth para uma Progressive Web App (PWA), que serve como interface de controle e visualização.

O projeto é uma aplicação específica construída sobre a filosofia do template [ESP32WebBluetooth](https://github.com/jocoteles/ESP32WebBluetooth), priorizando clareza e facilidade de modificação para fins educacionais.

## Filosofia do Projeto

**Foco Educacional e Pragmatismo.** O código foi desenvolvido para ser uma ferramenta educacional funcional e de fácil compreensão. O objetivo é fornecer um sistema photogate completo que possa ser usado diretamente em experimentos de mecânica, ondulatória e outros campos da física, ao mesmo tempo que serve como um exemplo prático de integração entre hardware (ESP32) e software web moderno (PWA, Web Bluetooth).

---

## Como Funciona

### Lado do ESP32 (Servidor - `PWB32Server`)
O firmware do ESP32 cria um servidor Bluetooth Low Energy (BLE) com um serviço que expõe três "características" (characteristics):
1.  **JSON Variables (Read/Write):** Permite que a PWA configure remotamente parâmetros de aquisição avançados, como o tamanho do buffer de amostras (`SAMPLES_PER_CHUNK`) e o intervalo entre leituras (`SAMPLE_INTERVAL_US`).
2.  **Stream Control (Write):** Uma característica simples que aceita um único byte para controlar o fluxo de dados (`0x01` para iniciar, `0x00` para parar a aquisição).
3.  **Stream Data (Notify):** Envia pacotes de dados binários contendo as leituras dos 6 canais analógicos em alta frequência para a PWA quando a aquisição está ativa.

### Lado do Cliente (PWA)
A PWA é a interface do usuário, acessível por qualquer navegador moderno com suporte a Web Bluetooth.
1.  **Conexão:** O usuário se conecta ao ESP32 específico do seu kit, permitindo que vários sistemas funcionem simultaneamente na mesma sala.
2.  **Aquisição:** O usuário pode disparar e interromper a coleta de dados. A aquisição é limitada por um tempo máximo para evitar travamentos.
3.  **Análise:** Após a coleta, os dados são exibidos em um gráfico interativo (com zoom e pan). O usuário pode definir níveis de trigger (disparo) para cada canal e visualizar os eventos de cruzamento (subida/descida) em uma tabela de tempos.
4.  **Configuração:** A interface permite ajustar parâmetros visuais do gráfico (espessura de linhas, etc.) e, através de uma seção avançada, otimizar os parâmetros de aquisição do firmware.
5.  **Exportação:** Os dados da tabela de tempos e os dados brutos do gráfico podem ser facilmente copiados ou salvos em formato CSV para análise posterior em softwares como Excel ou Google Sheets.

---

## Instalação e Configuração

### Requisitos

1.  **Hardware:** Um ESP32 Dev Kit com os 6 sensores photogate conectados às entradas analógicas especificadas no firmware.
2.  **Firmware:**
    *   [Arduino IDE](https://www.arduino.cc/en/software) com o [board manager do ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html) instalado.
    *   Biblioteca **ArduinoJson** (instalada via Library Manager do Arduino IDE).
3.  **PWA (Cliente):**
    *   Um navegador com suporte a Web Bluetooth (Chrome, Edge, Opera em Desktop e Android).
    *   Um servidor web para hospedar os arquivos da PWA. **GitHub Pages** é a opção recomendada por ser gratuita e fornecer o HTTPS necessário para a Web Bluetooth.
    *   **Nota sobre o Chrome:** Se a aplicação reportar que o Web Bluetooth não é suportado, navegue até `chrome://flags/#enable-experimental-web-platform-features`, ative a opção e reinicie o navegador.

### Passos

#### 1. Gravar o Firmware no ESP32

1.  Copie a pasta `EWBServer` para a sua pasta de projetos do Arduino.
2.  Abra o arquivo `PWB32Server.ino`.
3.  Instale a dependência `ArduinoJson` através do Library Manager.
4.  Selecione a placa ESP32 correta e a porta serial.
5.  Compile e envie o código para o seu ESP32.
6.  Abra o Monitor Serial (baud rate 115200) para ver as mensagens de log. Você deverá ver "EWBServer started. Waiting for a client connection...".

#### 2. Hospedar a PWA

1.  Crie um novo repositório no GitHub.
2.  Envie todos os arquivos da raiz do projeto ( `index.html`, `main.js`, etc.) para o repositório.
3.  No seu repositório do GitHub, vá para `Settings` -> `Pages`.
4.  Em "Source", selecione a branch `main` e a pasta `/root`. Clique em `Save`.
5.  Aguarde alguns minutos. O GitHub irá publicar seu site em um endereço como `https://<seu-usuario>.github.io/<seu-repositorio>/`.

---

## Como Usar o Sistema

1.  Ligue o seu kit PhotoWebBlue32.
2.  No seu computador ou smartphone Android, abra o Google Chrome e navegue para o URL da sua PWA.
3.  Na aba **[Conexão]**, clique em **"Conectar"**. Selecione o dispositivo `ESP32_PWB_Control` e emparelhe. O nome do dispositivo conectado aparecerá na tela.
4.  Vá para a aba **[Canais]**.
5.  Clique em **"Disparar leitura"**. O botão ficará vermelho. Realize seu experimento (ex: passar um objeto pelos sensores).
6.  Clique em **"Interromper leitura"** ou aguarde o tempo máximo de aquisição.
7.  O gráfico com os dados coletados aparecerá. Use o mouse ou o toque para dar zoom e arrastar o gráfico.
8.  Clique/toque no gráfico para definir o nível de trigger para os canais habilitados.
9.  Use a grade de botões para selecionar quais canais e tipos de evento (subida/descida) devem ser considerados. A tabela de tempos será atualizada automaticamente.
10. Use os botões na seção "Salvar dados" para exportar seus resultados para análise externa.
11. Na aba **[Config]**, ajuste a aparência do gráfico ou os parâmetros avançados de aquisição conforme necessário.