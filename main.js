document.addEventListener('DOMContentLoaded', () => {
    const ewbClient = new EWBClient();

    // --- Estado da Aplicação ---
    let isConnected = false;
    let isStreaming = false;
    let maxAcquisitionTimer = null;
    let allReadings = [];
    let allEvents = [];
    let chartInstance = null;
    let currentAcquisitionMode = 0;
    let eventCounter = 0; // Contador para numerar eventos em tempo real
    
    const NUM_CHANNELS = 6;
    const CHANNEL_COLORS = [ '#e91700', '#ff9d00', '#b0b305ff', '#04c755', '#0210d6', '#8601bb' ];
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
    const navButtons = {
        conexao: document.getElementById('nav-btn-conexao'),
        aquisicao: document.getElementById('nav-btn-aquisicao'),
        config: document.getElementById('nav-btn-config'),
    };
    const pageDivs = {
        conexao: document.getElementById('div-conexao'),
        aquisicao: document.getElementById('div-aquisicao'),
        config: document.getElementById('div-config'),
    };
    const statusBar = document.getElementById('status-bar');
    const btnConnect = document.getElementById('btn-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const deviceNameDisplay = document.getElementById('device-name-display');
    const btnTriggerReading = document.getElementById('btn-trigger-reading');
    const channelsFieldset = document.getElementById('channels-fieldset');
    const toggleGridBody = document.querySelector('.toggle-grid tbody');
    const eventsTableBody = document.querySelector('#events-table tbody');
    const btnTriggerReadingText = document.querySelector('#btn-trigger-reading .btn-text');
    const analysisControls = document.getElementById('analysis-controls');
    const saveControls = document.getElementById('save-controls');
    const btnZeroOrigin = document.getElementById('btn-zero-origin');
    const btnShowEvents = document.getElementById('btn-show-events');
    const btnGroupEvents = document.getElementById('btn-group-events');
    const btnCopyTimes = document.getElementById('btn-copy-times');
    const btnSaveTimes = document.getElementById('btn-save-times');
    const btnSaveGraph = document.getElementById('btn-save-graph');
    const acquisitionModeSelect = document.getElementById('acquisition-mode-select');
    const acquisitionModeSubtitle = document.getElementById('acquisition-mode-subtitle');
    const inputLineThickness = document.getElementById('line-thickness');
    const inputTriggerThickness = document.getElementById('trigger-thickness');
    const inputEventRadius = document.getElementById('event-radius');
    const inputChartHeight = document.getElementById('chart-height');
    const inputMaxAcquisitionTime = document.getElementById('max-acquisition-time');
    const btnAdvanced = document.getElementById('btn-advanced');
    const advancedSettingsDiv = document.getElementById('advanced-settings');
    const inputSamplesPerChunk = document.getElementById('samples-per-chunk');
    const inputSampleIntervalUs = document.getElementById('sample-interval-us');
    const inputDataDecimation = document.getElementById('data-decimation');

    if (!navigator.bluetooth) {
        statusBar.textContent = 'Web Bluetooth não suportado. Use Chrome/Edge.';
        statusBar.className = 'status disconnected';
        btnConnect.disabled = true;
        return;
    }
    
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
        acquisitionModeSelect.disabled = !connected;

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
    
    function updateAcquisitionModeUI(mode) {
        currentAcquisitionMode = parseInt(mode, 10);
        const selectedOption = acquisitionModeSelect.options[acquisitionModeSelect.selectedIndex];
        acquisitionModeSubtitle.textContent = `Modo: ${selectedOption.text}`;

        allReadings = [];
        allEvents = [];
        
        processAndDisplayData();
    }

    function startReading() {
        allReadings = []; 
        allEvents = [];
        eventCounter = 0;
        isStreaming = true;
        
        eventsTableBody.innerHTML = '<tr><td colspan="4">Adquirindo dados...</td></tr>';
        
        // Modifique esta linha
        btnTriggerReadingText.textContent = "Interromper Leitura"; 
        btnTriggerReading.classList.add('reading');
        channelsFieldset.disabled = true;
        
        ewbClient.startStream(); 

        const maxTime = parseInt(inputMaxAcquisitionTime.value, 10) * 1000;
        maxAcquisitionTimer = setTimeout(stopReading, maxTime);
    }
    
    async function stopReading() {
        if (!isStreaming) return;
        
        isStreaming = false;
        clearTimeout(maxAcquisitionTimer);
        await ewbClient.stopStream();

        // Modifique esta linha
        btnTriggerReadingText.textContent = "Disparar Leitura";
        btnTriggerReading.classList.remove('reading');
        channelsFieldset.disabled = false;
        
        if (currentAcquisitionMode === 0 || currentAcquisitionMode === 2) {
            processAndDisplayData();
        } else {
            if (allEvents.length === 0) {
                eventsTableBody.innerHTML = '<tr><td colspan="4">Nenhum evento detectado.</td></tr>';
            }
        }
    }
    
    function appendEventsToTable(newEvents) {
        if (eventCounter === 0) {
            eventsTableBody.innerHTML = '';
        }

        let tableHTML = '';
        const timeOffset = (isZeroOrigin && allEvents.length > 0) ? allEvents[0].time : 0;

        for (const event of newEvents) {
            const chIndex = event.channel - 1;
            if (!toggleStates.channels[chIndex]) continue;
            if (event.type === 'subida' && !toggleStates.rising[chIndex]) continue;
            if (event.type === 'descida' && !toggleStates.falling[chIndex]) continue;

            eventCounter++;
            const adjustedTime = event.time - timeOffset;
            const subida = event.type === 'subida' ? Math.round(adjustedTime) : '';
            const descida = event.type === 'descida' ? Math.round(adjustedTime) : '';
            
            tableHTML += `<tr>
                <td>${eventCounter}</td>
                <td style="color:${CHANNEL_COLORS[event.channel-1]}"><b>${event.channel}</b></td>
                <td>${subida}</td>
                <td>${descida}</td>
            </tr>`;
        }
        
        if (tableHTML) {
            eventsTableBody.insertAdjacentHTML('beforeend', tableHTML);
        }
    }

    function handleStreamData(packet) {
        const isStreamingMode = currentAcquisitionMode === 0 || currentAcquisitionMode === 2;

        if (isStreamingMode) {
            allReadings.push(packet);
        } else {
            allEvents.push(...packet);

            if (groupEvents) {
                rebuildTimeTable();
            } else {
                appendEventsToTable(packet);
            }
        }
    }

    function processAndDisplayData() {
        analysisControls.style.display = 'grid';        
        saveControls.style.display = 'grid';        
        renderChart();
        rebuildTimeTable();
    }
    
    function renderChart() {
        const ctx = document.getElementById('main-chart').getContext('2d');
        const datasets = [];
        const isStreamingMode = currentAcquisitionMode === 0 || currentAcquisitionMode === 2;

        if (isStreamingMode && allReadings.length > 0) {
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
                    x: { type: 'linear', title: { display: true, text: 'Tempo (ms)' } },
                    y: { title: { display: true, text: 'Nível (ADC)' }, min: 0, max: 4095 }
                },
                plugins: {
                    decimation: { enabled: true, algorithm: 'lttb' },
                    zoom: {
                        pan: { enabled: true, mode: 'xy' },
                        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
                    },
                    legend: { display: isStreamingMode && datasets.length > 0 },
                    annotation: { annotations: buildAnnotations() }
                },
                onClick: async (evt) => {
                    if (isStreaming || !chartInstance) return;
                    const yValue = Math.round(chartInstance.scales.y.getValueForPixel(evt.native.offsetY));
                    let varsToSend = {};
                    for (let i = 0; i < NUM_CHANNELS; i++) {
                        if (toggleStates.channels[i]) {
                            triggerLevels[i] = yValue;
                            varsToSend[`trigger_c${i+1}`] = yValue;
                        }
                    }
                    
                    if (isConnected && Object.keys(varsToSend).length > 0) {
                        try {
                            await ewbClient.setVariables(varsToSend);
                        } catch (e) { console.error("Falha ao enviar triggers:", e); }
                    }

                    chartInstance.options.plugins.annotation.annotations = buildAnnotations();
                    chartInstance.update('none');
                    rebuildTimeTable();
                }
            }
        });
        
        if(isStreamingMode) chartInstance.resetZoom();
    }
    
    function findEvents() {
        const isStreamingMode = currentAcquisitionMode === 0 || currentAcquisitionMode === 2;

        if (!isStreamingMode) {
            return allEvents.filter(event => {
                const chIndex = event.channel - 1;
                if (!toggleStates.channels[chIndex]) return false;
                if (event.type === 'subida' && !toggleStates.rising[chIndex]) return false;
                if (event.type === 'descida' && !toggleStates.falling[chIndex]) return false;
                return true;
            });
        }

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
    
    function getGroupedEvents(events) {
        let eventsByChannel = {};
        for (let ch = 1; ch <= NUM_CHANNELS; ch++) { eventsByChannel[ch] = []; }
        events.forEach(event => { eventsByChannel[event.channel].push(event); });
        
        let groupedEvents = [];
        for (let ch = 1; ch <= NUM_CHANNELS; ch++) {
            let channelEvents = eventsByChannel[ch];
            let i = 0;
            while (i < channelEvents.length) {
                let currentEvent = channelEvents[i];
                if (i + 1 < channelEvents.length) {
                    let nextEvent = channelEvents[i + 1];
                    if (currentEvent.type !== nextEvent.type) {
                        groupedEvents.push({ channel: ch, time: Math.min(currentEvent.time, nextEvent.time), events: [currentEvent, nextEvent] });
                        i += 2; continue;
                    }
                }
                groupedEvents.push({ channel: ch, time: currentEvent.time, events: [currentEvent] });
                i++;
            }
        }
        groupedEvents.sort((a, b) => a.time - b.time);
        return groupedEvents;
    }

    function buildAnnotations() {
        const annotations = {};
        for(let i = 0; i < NUM_CHANNELS; i++) {
            if (toggleStates.channels[i]) {
                annotations[`trigger${i+1}`] = {
                    type: 'line', yMin: triggerLevels[i], yMax: triggerLevels[i],
                    borderColor: CHANNEL_COLORS[i],
                    borderWidth: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--trigger-thickness')),
                    borderDash: [6, 6],
                    label: { content: `T${i+1}`, enabled: true, position: 'start', backgroundColor: 'rgba(0,0,0,0.6)' }
                };
            }
        }
        
        const isStreamingMode = currentAcquisitionMode === 0 || currentAcquisitionMode === 2;
        const hasData = isStreamingMode ? allReadings.length > 0 : allEvents.length > 0;

        if(showEventsOnGraph && hasData) {
            const events = findEvents();
            if (groupEvents) {
                const groupedEvents = getGroupedEvents(events);
                groupedEvents.forEach((group, groupIndex) => {
                    group.events.forEach(event => {
                        const uniqueId = `group_${groupIndex}_event_${event.time}`;
                        annotations[`event_${uniqueId}`] = { type: 'point', xValue: event.time, yValue: triggerLevels[event.channel - 1], backgroundColor: CHANNEL_COLORS[event.channel - 1], radius: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--event-radius')) };
                        annotations[`eventLabel_${uniqueId}`] = { type: 'label', xValue: event.time, yValue: triggerLevels[event.channel - 1], content: (groupIndex + 1).toString(), font: { size: 13 }, color: 'black', yAdjust: -10, xAdjust: 5 };
                    });
                });
            } else {
                events.forEach((event, index) => {
                    annotations[`event${index}`] = { type: 'point', xValue: event.time, yValue: triggerLevels[event.channel - 1], backgroundColor: CHANNEL_COLORS[event.channel - 1], radius: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--event-radius')) };
                    annotations[`eventLabel${index}`] = { type: 'label', xValue: event.time, yValue: triggerLevels[event.channel - 1], content: (index + 1).toString(), font: { size: 13 }, color: 'black', yAdjust: -10, xAdjust: 5 };
                });
            }
        }
        return annotations;
    }

    function rebuildTimeTable() {
        eventCounter = 0;
        const events = findEvents();
        
        if (events.length === 0) {
            const msg = isStreaming ? 'Nenhum evento detectado para a seleção atual.' : 'Aguardando dados...';
            eventsTableBody.innerHTML = `<tr><td colspan="4">${msg}</td></tr>`;
            return;
        }

        const timeOffset = (isZeroOrigin && events.length > 0) ? events[0].time : 0;
        let tableHTML = '';
        
        if (groupEvents) {
            const groupedEvents = getGroupedEvents(events);
            groupedEvents.forEach((group, index) => {
                eventCounter++;
                let risingTime = null;
                let fallingTime = null;
                group.events.forEach(event => {
                    if (event.type === 'subida') risingTime = event.time - timeOffset;
                    else if (event.type === 'descida') fallingTime = event.time - timeOffset;
                });
                tableHTML += `<tr><td>${eventCounter}</td><td style="color:${CHANNEL_COLORS[group.channel-1]}"><b>${group.channel}</b></td><td>${risingTime !== null ? Math.round(risingTime) : ''}</td><td>${fallingTime !== null ? Math.round(fallingTime) : ''}</td></tr>`;
            });
        } else {
            events.forEach((event) => {
                eventCounter++;
                const adjustedTime = event.time - timeOffset;
                const subida = event.type === 'subida' ? Math.round(adjustedTime) : '';
                const descida = event.type === 'descida' ? Math.round(adjustedTime) : '';
                tableHTML += `<tr><td>${eventCounter}</td><td style="color:${CHANNEL_COLORS[event.channel-1]}"><b>${event.channel}</b></td><td>${subida}</td><td>${descida}</td></tr>`;
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

    // --- Listeners de Eventos ---

    Object.keys(navButtons).forEach(key => {
        navButtons[key].addEventListener('click', () => switchPage(key));
    });

    acquisitionModeSelect.addEventListener('change', (e) => {
        updateAcquisitionModeUI(e.target.value);
        if (isConnected) {
            ewbClient.setVariables({ acquisition_mode: currentAcquisitionMode })
                .catch(err => console.error("Falha ao definir novo modo:", err));
        }
    });

    btnConnect.addEventListener('click', async () => {
        try {
            await ewbClient.connect();
            setUIConnected(true);
            ewbClient.setOnStreamData(handleStreamData, () => currentAcquisitionMode);

            const variables = await ewbClient.getVariables();
            inputSamplesPerChunk.value = variables.samples_per_chunk;
            inputSampleIntervalUs.value = variables.sample_interval_us;
            
            updateAcquisitionModeUI(acquisitionModeSelect.value);

            let initialConfig = {
                acquisition_mode: currentAcquisitionMode
            };
            for(let i = 0; i < NUM_CHANNELS; i++) {
                initialConfig[`trigger_c${i+1}`] = triggerLevels[i];
            }

            console.log("Enviando configuração inicial:", initialConfig);
            await ewbClient.setVariables(initialConfig);
            console.log("Configuração inicial enviada com sucesso.");

        } catch (error) {
            console.error('Falha ao conectar:', error);
            setUIConnected(false);
        }
    });

    btnDisconnect.addEventListener('click', () => ewbClient.disconnect());
    ewbClient.onDisconnect(() => setUIConnected(false));
    
    btnTriggerReading.addEventListener('click', () => { isStreaming ? stopReading() : startReading(); });
    
    btnZeroOrigin.addEventListener('click', () => { 
        isZeroOrigin = !isZeroOrigin;
        btnZeroOrigin.classList.toggle('enabled', isZeroOrigin);
        btnZeroOrigin.textContent = isZeroOrigin ? 'Recuperar origem temporal' : 'Zerar origem temporal';
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
                <td><div class="triangle-btn triangle-up enabled" id="toggle-s${i+1}" style="color: ${CHANNEL_COLORS[i]}"></div></td>
                <td><div class="triangle-btn triangle-down enabled" id="toggle-d${i+1}" style="color: ${CHANNEL_COLORS[i]}"></div></td>
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
        const target = e.target;
        if(target.tagName !== 'BUTTON' && !target.classList.contains('triangle-btn')) return;
        const id = target.id;
        const type = id.charAt(7);
        const ch = parseInt(id.substring(8), 10) - 1;
        
        if(type === 'c') {
            toggleStates.channels[ch] = !toggleStates.channels[ch];
            target.classList.toggle('enabled');
            processAndDisplayData();
        } else if (type === 's' || type === 'd') {
            if (type === 's') toggleStates.rising[ch] = !toggleStates.rising[ch];
            if (type === 'd') toggleStates.falling[ch] = !toggleStates.falling[ch];
            target.classList.toggle('enabled');
            rebuildTimeTable();
            if (chartInstance && showEventsOnGraph) {
                chartInstance.options.plugins.annotation.annotations = buildAnnotations();
                chartInstance.update('none');
            }
        }
    });

    btnCopyTimes.addEventListener('click', () => { const csv = generateCSV(false).replace(/,/g, '\t'); navigator.clipboard.writeText(csv).then(() => alert('Tabela copiada!'), () => alert('Falha ao copiar.')); });
    btnSaveTimes.addEventListener('click', () => downloadCSV(generateCSV(false), 'tempos_photogate.csv'));
    btnSaveGraph.addEventListener('click', () => downloadCSV(generateCSV(true), 'dados_brutos_photogate.csv'));

    inputLineThickness.addEventListener('input', (e) => {
        const newThickness = `${2 * e.target.value / 100}px`;
        document.documentElement.style.setProperty('--line-thickness', newThickness);
        document.getElementById('line-thickness-value').textContent = `${e.target.value}%`;
        if (chartInstance) {
            chartInstance.data.datasets.forEach(dataset => {
                dataset.borderWidth = parseFloat(newThickness);
            });
            chartInstance.update('none');
        }
    });

    inputTriggerThickness.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--trigger-thickness', `${1 * e.target.value / 100}px`);
        document.getElementById('trigger-thickness-value').textContent = `${e.target.value}%`;
        if (chartInstance) {
            chartInstance.options.plugins.annotation.annotations = buildAnnotations();
            chartInstance.update('none');
        }
    });

    inputEventRadius.addEventListener('input', (e) => {
        document.documentElement.style.setProperty('--event-radius', `${4 * e.target.value / 100}px`);
        document.getElementById('event-radius-value').textContent = `${e.target.value}%`;
        if (chartInstance && showEventsOnGraph) {
            chartInstance.options.plugins.annotation.annotations = buildAnnotations();
            chartInstance.update('none');
        }
    });
    inputChartHeight.addEventListener('input', (e) => { document.documentElement.style.setProperty('--chart-height', `${400 * e.target.value / 100}px`); document.getElementById('chart-height-value').textContent = `${e.target.value}%`; });
    inputMaxAcquisitionTime.addEventListener('input', (e) => { document.getElementById('max-acquisition-value').textContent = e.target.value; });
    inputDataDecimation.addEventListener('input', (e) => { document.getElementById('decimation-value').textContent = e.target.value; if (!isStreaming && allReadings.length > 0) renderChart(); });

    btnAdvanced.addEventListener('click', () => { const pass = prompt("Digite a senha de administrador:", ""); if (pass === "bolt") { advancedSettingsDiv.style.display = 'block'; } else if (pass !== null) { alert("Senha incorreta."); } });

    const sendAdvancedSetting = (key, value) => { if (!isConnected) { alert('Conecte ao dispositivo primeiro.'); return; } ewbClient.setVariables({ [key]: value }).then(() => console.log(`${key} atualizado para ${value}`)).catch(err => console.error(`Falha ao atualizar ${key}`, err)); };
    inputSamplesPerChunk.addEventListener('change', (e) => sendAdvancedSetting('samples_per_chunk', parseInt(e.target.value, 10)));
    inputSampleIntervalUs.addEventListener('change', (e) => sendAdvancedSetting('sample_interval_us', parseInt(e.target.value, 10)));

    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = document.getElementById(header.getAttribute('data-target'));
            content.classList.toggle('collapsed');
            header.querySelector('.arrow').classList.toggle('collapsed');
        });
    });

    // --- Inicialização da UI ---
    switchPage('conexao');
    updateAcquisitionModeUI(acquisitionModeSelect.value);
    createToggleGrid();
    renderChart();
});