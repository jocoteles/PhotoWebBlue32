document.addEventListener('DOMContentLoaded', () => {
    const ewbClient = new EWBClient();

    // --- Estado da Aplicação ---
    let isConnected = false;
    let isStreaming = false;
    let maxAcquisitionTimer = null;
    let allReadings = [];
    let chartInstance = null;
    
    const NUM_CHANNELS = 6;
    const CHANNEL_COLORS = ['#e74c3c', '#f39c12', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'];
    const DEFAULT_TRIGGER = 2048;

    let triggerLevels = Array(NUM_CHANNELS).fill(DEFAULT_TRIGGER);
    let toggleStates = {
        channels: Array(NUM_CHANNELS).fill(true),
        rising: Array(NUM_CHANNELS).fill(true),
        falling: Array(NUM_CHANNELS).fill(true)
    };
    let isZeroOrigin = false;
    let showEventsOnGraph = false;
    let groupEvents = false;

    // --- Elementos da UI ---
    // Navegação
    const navButtons = {
        conexao: document.getElementById('nav-btn-conexao'),
        canais: document.getElementById('nav-btn-canais'),
        config: document.getElementById('nav-btn-config'),
    };
    const pageDivs = {
        conexao: document.getElementById('div-conexao'),
        canais: document.getElementById('div-canais'),
        config: document.getElementById('div-config'),
    };

    // Conexão
    const statusBar = document.getElementById('status-bar');
    const btnConnect = document.getElementById('btn-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const deviceNameDisplay = document.getElementById('device-name-display');

    // Canais
    const btnTriggerReading = document.getElementById('btn-trigger-reading');
    const dataAcquisitionSection = document.getElementById('data-acquisition-section');
    const channelsFieldset = document.getElementById('channels-fieldset');
    const toggleGridBody = document.querySelector('.toggle-grid tbody');
    const eventsTableBody = document.querySelector('#events-table tbody');
    const analysisControls = document.getElementById('analysis-controls');
    const saveControls = document.getElementById('save-controls');
    const btnZeroOrigin = document.getElementById('btn-zero-origin');
    const btnShowEvents = document.getElementById('btn-show-events');
    const btnGroupEvents = document.getElementById('btn-group-events');

    // Salvar
    const btnCopyTimes = document.getElementById('btn-copy-times');
    const btnSaveTimes = document.getElementById('btn-save-times');
    const btnSaveGraph = document.getElementById('btn-save-graph');
    
    // Config
    const inputLineThickness = document.getElementById('line-thickness');
    const inputTriggerThickness = document.getElementById('trigger-thickness');
    const inputEventRadius = document.getElementById('event-radius');
    const inputChartHeight = document.getElementById('chart-height');
    const inputMaxAcquisitionTime = document.getElementById('max-acquisition-time');
    const btnAdvanced = document.getElementById('btn-advanced');
    const advancedSettingsDiv = document.getElementById('advanced-settings');
    const inputSamplesPerChunk = document.getElementById('samples-per-chunk');
    const inputSampleIntervalUs = document.getElementById('sample-interval-us');

    // --- Verificação de compatibilidade ---
    if (!navigator.bluetooth) {
        statusBar.textContent = 'Web Bluetooth não suportado. Use Chrome/Edge.';
        statusBar.className = 'status disconnected';
        btnConnect.disabled = true;
        return;
    }
    
    // --- Funções de Lógica Principal ---

    function switchPage(pageName) {
        Object.keys(pageDivs).forEach(key => {
            pageDivs[key].classList.toggle('visible', key === pageName);
            navButtons[key].classList.toggle('active', key === pageName);
            navButtons[key].classList.toggle('inactive', key !== pageName);
        });
    }

    function setUIConnected(connected) {
        isConnected = connected;
        btnConnect.disabled = connected;
        btnDisconnect.disabled = !connected;
        btnTriggerReading.disabled = !connected;

        if (connected) {
            statusBar.textContent = 'Conectado';
            statusBar.className = 'status connected';
            deviceNameDisplay.textContent = ewbClient.device.name || 'N/A';
        } else {
            statusBar.textContent = 'Desconectado';
            statusBar.className = 'status disconnected';
            deviceNameDisplay.textContent = 'Nenhum';
            if(isStreaming) stopReading();
        }
    }

    function startReading() {
        // 1. Limpa os dados da aquisição anterior
        allReadings = []; 
        isStreaming = true;
        
        eventsTableBody.innerHTML = '<tr><td colspan="4">Adquirindo dados...</td></tr>';
        
        btnTriggerReading.textContent = "Interromper Leitura";
        btnTriggerReading.classList.add('reading');
        channelsFieldset.disabled = true;

        
        // 2. Apenas inicia o stream. O callback já foi configurado uma vez na conexão.
        ewbClient.startStream(); 

        const maxTime = parseInt(inputMaxAcquisitionTime.value, 10) * 1000;
        maxAcquisitionTimer = setTimeout(stopReading, maxTime);
    }
    
    async function stopReading() {
        if (!isStreaming) return;
        
        isStreaming = false;
        clearTimeout(maxAcquisitionTimer);
        await ewbClient.stopStream();

        btnTriggerReading.textContent = "Disparar Leitura";
        btnTriggerReading.classList.remove('reading');
        channelsFieldset.disabled = false;
        
        processAndDisplayData();
    }
    
    // Esta é a função que é chamada pelo EWBClient a cada pacote de dados recebido.
    function handleStreamData(packet) {
        allReadings.push(packet);
    }

    function processAndDisplayData() {
        dataAcquisitionSection.style.display = 'block';
        analysisControls.style.display = 'block';
        saveControls.style.display = 'block';

        if (allReadings.length === 0) {
            eventsTableBody.innerHTML = '<tr><td colspan="4">Nenhum dado foi adquirido.</td></tr>';
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            return;
        }

        renderChart();
        rebuildTimeTable();
    }
    
    function renderChart() {
        const ctx = document.getElementById('main-chart').getContext('2d');
        const datasets = [];
        
        const decimation = parseInt(inputDataDecimation.value, 10) || 1;
        const decimatedReadings = allReadings.filter((_, index) => index % decimation === 0);

        for(let i = 0; i < NUM_CHANNELS; i++) {
            if(toggleStates.channels[i]) {
                datasets.push({
                    label: `Canal ${i+1}`,
                    data: decimatedReadings.map(d => ({ x: d.time_ms, y: d[`reading${i+1}`] })),
                    borderColor: CHANNEL_COLORS[i],
                    backgroundColor: CHANNEL_COLORS[i],
                    borderWidth: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-thickness')),
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                });
            }
        }
        
        if(chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                parsing: false,
                normalized: true,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Tempo (ms)' }
                    },
                    y: {
                        title: { display: true, text: 'Nível (ADC)' },
                        min: 0,
                        max: 4095
                    }
                },
                plugins: {
                    decimation: {
                        enabled: true,
                        algorithm: 'lttb'
                    },
                    zoom: {
                        pan: { enabled: true, mode: 'xy' },
                        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
                    },
                    legend: { display: true },
                    annotation: {
                        annotations: buildAnnotations()
                    }
                },
                onClick: (evt) => {
                    if (isStreaming || !chartInstance) return;
                    const yValue = chartInstance.scales.y.getValueForPixel(evt.native.offsetY);
                    for (let i = 0; i < NUM_CHANNELS; i++) {
                        if (toggleStates.channels[i]) {
                            triggerLevels[i] = Math.round(yValue);
                        }
                    }
                    chartInstance.options.plugins.annotation.annotations = buildAnnotations();
                    chartInstance.update('none');
                    rebuildTimeTable();
                }
            }
        });
        
        chartInstance.resetZoom();
    }
    
    function buildAnnotations() {
        const annotations = {};
        
        for(let i = 0; i < NUM_CHANNELS; i++) {
            if (toggleStates.channels[i]) {
                annotations[`trigger${i+1}`] = {
                    type: 'line',
                    yMin: triggerLevels[i],
                    yMax: triggerLevels[i],
                    borderColor: CHANNEL_COLORS[i],
                    borderWidth: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--trigger-thickness')),
                    borderDash: [6, 6],
                    label: {
                        content: `T${i+1}`,
                        enabled: true,
                        position: 'start',
                        backgroundColor: 'rgba(0,0,0,0.6)'
                    }
                };
            }
        }
        
        if(showEventsOnGraph) {
            const events = findEvents();
            
            if (groupEvents) {
                let eventNumber = 1;
                let i = 0;
                
                while (i < events.length) {
                    let currentEvent = events[i];
                    
                    annotations[`event${i}`] = {
                        type: 'point',
                        xValue: currentEvent.time,
                        yValue: triggerLevels[currentEvent.channel - 1],
                        backgroundColor: CHANNEL_COLORS[currentEvent.channel - 1],
                        radius: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--event-radius'))
                    };
                    annotations[`eventLabel${i}`] = {
                        type: 'label',
                        xValue: currentEvent.time,
                        yValue: triggerLevels[currentEvent.channel - 1],
                        content: eventNumber.toString(),
                        font: { size: 10 },
                        color: 'black',
                        yAdjust: -10
                    };
                    
                    if (i + 1 < events.length) {
                        let nextEvent = events[i + 1];
                        if (currentEvent.channel === nextEvent.channel &&
                            currentEvent.type !== nextEvent.type) {
                            i++;
                            annotations[`event${i}`] = {
                                type: 'point',
                                xValue: nextEvent.time,
                                yValue: triggerLevels[nextEvent.channel - 1],
                                backgroundColor: CHANNEL_COLORS[nextEvent.channel - 1],
                                radius: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--event-radius'))
                            };
                            annotations[`eventLabel${i}`] = {
                                type: 'label',
                                xValue: nextEvent.time,
                                yValue: triggerLevels[nextEvent.channel - 1],
                                content: eventNumber.toString(),
                                font: { size: 10 },
                                color: 'black',
                                yAdjust: -10
                            };
                        }
                    }
                    
                    eventNumber++;
                    i++;
                }
            } else {
                events.forEach((event, index) => {
                    annotations[`event${index}`] = {
                        type: 'point',
                        xValue: event.time,
                        yValue: triggerLevels[event.channel - 1],
                        backgroundColor: CHANNEL_COLORS[event.channel - 1],
                        radius: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--event-radius'))
                    };
                    annotations[`eventLabel${index}`] = {
                        type: 'label',
                        xValue: event.time,
                        yValue: triggerLevels[event.channel - 1],
                        content: (index + 1).toString(),
                        font: { size: 10 },
                        color: 'black',
                        yAdjust: -10
                    };
                });
            }
        }
        
        return annotations;
    }

    function findEvents() {
        if (allReadings.length < 2) return [];

        let events = [];
        for (let i = 1; i < allReadings.length; i++) {
            const prev = allReadings[i - 1];
            const curr = allReadings[i];

            for (let ch = 0; ch < NUM_CHANNELS; ch++) {
                if (!toggleStates.channels[ch]) continue;

                const trigger = triggerLevels[ch];
                const prevVal = prev[`reading${ch+1}`];
                const currVal = curr[`reading${ch+1}`];

                if (toggleStates.rising[ch] && prevVal < trigger && currVal >= trigger) {
                    events.push({ time: curr.time_ms, channel: ch + 1, type: 'subida' });
                }
                if (toggleStates.falling[ch] && prevVal > trigger && currVal <= trigger) {
                    events.push({ time: curr.time_ms, channel: ch + 1, type: 'descida' });
                }
            }
        }
        
        events.sort((a, b) => a.time - b.time);
        return events;
    }
        
    function rebuildTimeTable() {
        const events = findEvents();
        
        if (events.length === 0) {
            eventsTableBody.innerHTML = '<tr><td colspan="4">Nenhum evento detectado para a seleção atual.</td></tr>';
            return;
        }

        // Calcula o offset APENAS para a tabela
        const timeOffset = (isZeroOrigin && events.length > 0) ? events[0].time : 0;

        let tableHTML = '';
        
        if (groupEvents) {
            // Separa eventos por canal para facilitar o agrupamento
            let eventsByChannel = {};
            for (let ch = 1; ch <= NUM_CHANNELS; ch++) {
                eventsByChannel[ch] = [];
            }
            
            events.forEach(event => {
                eventsByChannel[event.channel].push(event);
            });
            
            // Agrupa subidas e descidas dentro de cada canal
            let groupedEvents = [];
            
            for (let ch = 1; ch <= NUM_CHANNELS; ch++) {
                let channelEvents = eventsByChannel[ch];
                let i = 0;
                
                while (i < channelEvents.length) {
                    let currentEvent = channelEvents[i];
                    
                    // Procura o par (subida/descida ou descida/subida)
                    if (i + 1 < channelEvents.length) {
                        let nextEvent = channelEvents[i + 1];
                        if (currentEvent.type !== nextEvent.type) {
                            // Encontrou um par
                            groupedEvents.push({
                                channel: ch,
                                time: Math.min(currentEvent.time, nextEvent.time), // Usa o menor tempo para ordenação
                                rising: currentEvent.type === 'subida' ? currentEvent.time - timeOffset : nextEvent.time - timeOffset,
                                falling: currentEvent.type === 'descida' ? currentEvent.time - timeOffset : nextEvent.time - timeOffset
                            });
                            i += 2; // Pula ambos
                            continue;
                        }
                    }
                    
                    // Evento isolado
                    groupedEvents.push({
                        channel: ch,
                        time: currentEvent.time, // Para ordenação
                        rising: currentEvent.type === 'subida' ? currentEvent.time - timeOffset : null,
                        falling: currentEvent.type === 'descida' ? currentEvent.time - timeOffset : null
                    });
                    i++;
                }
            }
            
            // Ordena os grupos pelo tempo do primeiro evento de cada grupo
            groupedEvents.sort((a, b) => a.time - b.time);
            
            groupedEvents.forEach((group, index) => {
                const risingStr = group.rising !== null ? Math.round(group.rising) : '';
                const fallingStr = group.falling !== null ? Math.round(group.falling) : '';
                tableHTML += `<tr>
                    <td>${index + 1}</td>
                    <td style="color:${CHANNEL_COLORS[group.channel-1]}"><b>${group.channel}</b></td>
                    <td>${risingStr}</td>
                    <td>${fallingStr}</td>
                </tr>`;
            });
        } else {
            events.forEach((event, index) => {
                const adjustedTime = event.time - timeOffset;
                const subida = event.type === 'subida' ? Math.round(adjustedTime) : '';
                const descida = event.type === 'descida' ? Math.round(adjustedTime) : '';
                tableHTML += `<tr>
                    <td>${index + 1}</td>
                    <td style="color:${CHANNEL_COLORS[event.channel-1]}"><b>${event.channel}</b></td>
                    <td>${subida}</td>
                    <td>${descida}</td>
                </tr>`;
            });
        }
        
        eventsTableBody.innerHTML = tableHTML;
    }
    function generateCSV(isForGraph) {
        if (isForGraph) {
            if (allReadings.length === 0) return '';
            const enabledChannels = toggleStates.channels.map((s, i) => s ? i + 1 : 0).filter(c => c > 0);
            let header = 'tempo_ms,' + enabledChannels.map(c => `canal_${c}`).join(',');
            let csv = header + '\n';
            allReadings.forEach(d => {
                const row = [d.time_ms.toString()];
                enabledChannels.forEach(c => row.push(d[`reading${c}`]));
                csv += row.join(',') + '\n';
            });
            return csv;
        } else {
            const rows = Array.from(eventsTableBody.querySelectorAll('tr'));
             if (rows.length === 0) return '';
            let csv = 'Evento,Canal,Subida_ms,Descida_ms\n';
            rows.forEach(row => {
                const cols = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
                csv += cols.join(',') + '\n';
            });
            return csv;
        }
    }

    function downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Inicialização e Event Listeners ---

    Object.keys(navButtons).forEach(key => {
        navButtons[key].addEventListener('click', () => switchPage(key));
    });

    btnConnect.addEventListener('click', async () => {
        try {
            await ewbClient.connect();
            setUIConnected(true);
            
            // *** MUDANÇA CRÍTICA: Define o callback de dados UMA VEZ após conectar ***
            ewbClient.setOnStreamData(handleStreamData);

            const variables = await ewbClient.getVariables();
            inputSamplesPerChunk.value = variables.samples_per_chunk;
            inputSampleIntervalUs.value = variables.sample_interval_us;
        } catch (error) {
            console.error('Falha ao conectar:', error);
            setUIConnected(false);
        }
    });

    btnDisconnect.addEventListener('click', () => ewbClient.disconnect());
    ewbClient.onDisconnect(() => setUIConnected(false));
    
    btnTriggerReading.addEventListener('click', () => {
        isStreaming ? stopReading() : startReading();
    });
    
    btnZeroOrigin.addEventListener('click', () => {
        isZeroOrigin = !isZeroOrigin;
        btnZeroOrigin.classList.toggle('enabled', isZeroOrigin);
        btnZeroOrigin.textContent = isZeroOrigin ? 'Restaurar tempo original' : 'Zerar origem temporal';
        rebuildTimeTable();
    });

    btnShowEvents.addEventListener('click', () => {
        showEventsOnGraph = !showEventsOnGraph;
        btnShowEvents.classList.toggle('enabled', showEventsOnGraph);
        btnShowEvents.textContent = showEventsOnGraph ? 'Ocultar eventos no gráfico' : 'Mostrar eventos no gráfico';
        if(chartInstance) {
            chartInstance.options.plugins.annotation.annotations = buildAnnotations();
            chartInstance.update('none');
        }
    });

    btnGroupEvents.addEventListener('click', () => {
        groupEvents = !groupEvents;
        btnGroupEvents.classList.toggle('enabled', groupEvents);
        btnGroupEvents.textContent = groupEvents ? 'Separar subida/descida' : 'Juntar subida/descida';
        rebuildTimeTable();
        if(showEventsOnGraph && chartInstance) {
            chartInstance.options.plugins.annotation.annotations = buildAnnotations();
            chartInstance.update('none');
        }
    });

    function createToggleGrid() {
        let html = '';
        for (let i = 0; i < NUM_CHANNELS; i++) {
            html += `<tr>
                <td><button class="toggle-btn enabled" id="toggle-c${i+1}">${i+1}</button></td>
                <td><button class="toggle-btn enabled" id="toggle-s${i+1}"></button></td>
                <td><button class="toggle-btn enabled" id="toggle-d${i+1}"></button></td>
            </tr>`;
        }
        toggleGridBody.innerHTML = html;
    }
    document.getElementById('toggle-col-canal').addEventListener('click', () => {
        const newState = !toggleStates.channels.every(s => s);
        toggleStates.channels.fill(newState);
        for(let i=0; i<NUM_CHANNELS; i++) document.getElementById(`toggle-c${i+1}`).classList.toggle('enabled', newState);
        processAndDisplayData();
    });
    document.getElementById('toggle-col-subida').addEventListener('click', () => {
        const newState = !toggleStates.rising.every(s => s);
        toggleStates.rising.fill(newState);
        for(let i=0; i<NUM_CHANNELS; i++) document.getElementById(`toggle-s${i+1}`).classList.toggle('enabled', newState);
        rebuildTimeTable();
    });
    document.getElementById('toggle-col-descida').addEventListener('click', () => {
         const newState = !toggleStates.falling.every(s => s);
        toggleStates.falling.fill(newState);
        for(let i=0; i<NUM_CHANNELS; i++) document.getElementById(`toggle-d${i+1}`).classList.toggle('enabled', newState);
        rebuildTimeTable();
    });
    toggleGridBody.addEventListener('click', (e) => {
        if(e.target.tagName !== 'BUTTON') return;
        const id = e.target.id;
        const type = id.charAt(7); // c, s, d
        const ch = parseInt(id.substring(8), 10) - 1;
        
        if(type === 'c') {
            toggleStates.channels[ch] = !toggleStates.channels[ch];
            e.target.classList.toggle('enabled');
            processAndDisplayData();
        } else if (type === 's') {
            toggleStates.rising[ch] = !toggleStates.rising[ch];
            e.target.classList.toggle('enabled');
            rebuildTimeTable();
        } else if (type === 'd') {
            toggleStates.falling[ch] = !toggleStates.falling[ch];
            e.target.classList.toggle('enabled');
            rebuildTimeTable();
        }
    });

    btnCopyTimes.addEventListener('click', () => {
        const csv = generateCSV(false).replace(/,/g, '\t'); // TSV for Excel
        navigator.clipboard.writeText(csv).then(() => alert('Tabela copiada!'), () => alert('Falha ao copiar.'));
    });
    btnSaveTimes.addEventListener('click', () => downloadCSV(generateCSV(false), 'tempos_photogate.csv'));
    btnSaveGraph.addEventListener('click', () => downloadCSV(generateCSV(true), 'dados_brutos_photogate.csv'));

    inputLineThickness.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--line-thickness', `${2 * e.target.value / 100}px`);
        document.getElementById('line-thickness-value').textContent = `${e.target.value}%`;
    });
    inputTriggerThickness.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--trigger-thickness', `${1 * e.target.value / 100}px`);
        document.getElementById('trigger-thickness-value').textContent = `${e.target.value}%`;
    });
    inputEventRadius.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--event-radius', `${4 * e.target.value / 100}px`);
         document.getElementById('event-radius-value').textContent = `${e.target.value}%`;
    });
    inputChartHeight.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--chart-height', `${400 * e.target.value / 100}px`);
        document.getElementById('chart-height-value').textContent = `${e.target.value}%`;
    });
    btnAdvanced.addEventListener('click', () => {
        const pass = prompt("Digite a senha de administrador:", "");
        if (pass === "bolt") {
            advancedSettingsDiv.style.display = 'block';
            inputSamplesPerChunk.disabled = false;
            inputSampleIntervalUs.disabled = false;
        } else if (pass !== null) {
            alert("Senha incorreta.");
        }
    });

    const sendAdvancedSetting = (key, value) => {
        if (!isConnected) {
            alert('Conecte ao dispositivo primeiro.');
            return;
        }
        ewbClient.setVariables({ [key]: value })
            .then(() => {
                console.log(`${key} atualizado para ${value}`);
                if (key === 'samples_per_chunk') inputSamplesPerChunk.disabled = true;
                if (key === 'sample_interval_us') inputSampleIntervalUs.disabled = true;
                if (inputSamplesPerChunk.disabled && inputSampleIntervalUs.disabled) {
                    advancedSettingsDiv.style.display = 'none';
                }
            })
            .catch(err => console.error(`Falha ao atualizar ${key}`, err));
    };

    inputSamplesPerChunk.addEventListener('change', (e) => sendAdvancedSetting('samples_per_chunk', parseInt(e.target.value, 10)));
    inputSampleIntervalUs.addEventListener('change', (e) => sendAdvancedSetting('sample_interval_us', parseInt(e.target.value, 10)));
    const inputDataDecimation = document.getElementById('data-decimation');
    inputDataDecimation.addEventListener('input', (e) => {
        document.getElementById('decimation-value').textContent = e.target.value;
        if (!isStreaming && allReadings.length > 0) {
            renderChart(); // Re-renderiza com nova decimação
        }
    });
    
    // Inicialização da UI
    switchPage('conexao');
    createToggleGrid();
});