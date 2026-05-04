let port = null;
let reader = null;
let writer = null;
let statusInterval = null;
let readBuffer = '';
let selectedTool = null;
let rungs = [];
let currentElement = null;
let currentValues = {};

const CONDITION_TOOL_TYPES = new Set([
    'input-no',
    'input-nc',
    'sensor-no',
    'sensor-nc',
    'sensor-compare',
    'virtual-no',
    'virtual-nc',
    'timer-check',
    'timer-nf',
    'counter-check',
    'math-cmp',
    'analog-read'
]);

const OUTPUT_TOOL_TYPES = new Set([
    'output',
    'virtual',
    'pwm',
    'timer-start',
    'timer-reset',
    'counter-inc',
    'counter-reset',
    'display'
]);

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getToolDescription(tool) {
    const descriptions = {
        'input-no': 'Contato normalmente aberto para entradas, saidas e sensores online.',
        'input-nc': 'Contato normalmente fechado para entradas, saidas e sensores online.',
        'sensor-no': 'Contato NO para estado de sensor S1, S2, S3 e reservas.',
        'sensor-nc': 'Contato NC para estado de sensor S1, S2, S3 e reservas.',
        'sensor-compare': 'Compara leitura de temperatura ou umidade de sensores.',
        'virtual-no': 'Contato virtual normalmente aberto.',
        'virtual-nc': 'Contato virtual normalmente fechado.',
        'timer-start': 'Aciona um temporizador da tabela T1 ate T5.',
        'timer-check': 'Compara o estado de um temporizador.',
        'timer-nf': 'Compara um temporizador negado.',
        'timer-reset': 'Reseta um temporizador da tabela.',
        'counter-inc': 'Incrementa um contador da tabela C1 ate C5.',
        'counter-check': 'Compara valor de um contador.',
        'counter-reset': 'Reseta um contador da tabela.',
        'output': 'Bobina de saida digital fisica.',
        'virtual': 'Bobina de variavel virtual.',
        'pwm': 'Mapeia uma entrada analogica para uma saida PWM.',
        'math-cmp': 'Compara uma expressao matematica ou fonte analogica.',
        'analog-read': 'Leitura direta de entrada analogica.',
        'display': 'Exibe texto e variável no display I2C.',
        'or': 'Cria um grupo OR visual na linha atual.'
    };

    return descriptions[tool] || '';
}

function getDisplayMeta(code) {
    if (!code) return { label: '', description: '' };
    return PortCatalog.getByCode(code);
}

function getElementAt(reference = currentElement) {
    if (!reference) return null;
    if (reference.location === 'parallel') {
        return rungs[reference.rungIndex]?.parallels?.[reference.pIndex]?.[reference.elIndex] || null;
    }
    return rungs[reference.rungIndex]?.elements?.[reference.elIndex] || null;
}

function setSelectLabel(text) {
    const label = document.querySelector('#numGroup label');
    if (label) label.textContent = text;
}

function setSelectOptions(items, selectedValue = '') {
    PortCatalog.populateSelect(document.getElementById('elementNum'), items, selectedValue);
}

function toStoredRung(rung) {
    return {
        elements: (rung.elements || []).map(normalizeElement),
        parallels: (rung.parallels || []).map((parallel) => parallel.map(normalizeElement))
    };
}

function normalizeElement(element) {
    if (!element) return null;
    const normalized = { ...element };

    if (!normalized.target) {
        if (normalized.type === 'input-no' || normalized.type === 'input-nc') {
            normalized.target = `D${normalized.num || '1'}`;
        } else if (normalized.type === 'sensor-no' || normalized.type === 'sensor-nc') {
            normalized.target = `S${normalized.num || '1'}`;
        } else if (normalized.type === 'virtual-no' || normalized.type === 'virtual-nc' || normalized.type === 'virtual') {
            normalized.target = `V${normalized.num || '1'}`;
        } else if (normalized.type === 'timer-start' || normalized.type === 'timer-check' || normalized.type === 'timer-nf' || normalized.type === 'timer-reset') {
            normalized.target = `T${normalized.num || '1'}`;
        } else if (normalized.type === 'counter-inc' || normalized.type === 'counter-check' || normalized.type === 'counter-reset') {
            normalized.target = `C${normalized.num || '1'}`;
        } else if (normalized.type === 'output') {
            normalized.target = normalized.num === '0' ? 'A0' : normalized.num === '1' ? 'A1' : `D${normalized.num || '11'}`;
        } else if (normalized.type === 'analog-read') {
            normalized.target = `A${normalized.num || '2'}`;
        } else if (normalized.type === 'sensor-compare') {
            normalized.target = 'S1T';
        }
    }

    updateElementLabel(normalized);
    return normalized;
}

function loadFromStorage() {
    const saved = localStorage.getItem('ladderRungs');
    if (!saved) {
        rungs = [];
        return;
    }

    try {
        const parsed = JSON.parse(saved);
        rungs = Array.isArray(parsed) ? parsed.map(toStoredRung) : [];
    } catch (error) {
        rungs = [];
    }
}

function saveToStorage() {
    localStorage.setItem('ladderRungs', JSON.stringify(rungs));
}

function initStatusPanel() {
    const statusDefinitions = [
        { id: 'statusInputs', items: PortCatalog.digitalInputs },
        { id: 'statusSensors', items: PortCatalog.sensorSlots },
        { id: 'statusOutputs', items: PortCatalog.statusOutputs },
        { id: 'statusAnalog', items: PortCatalog.analogInputs },
        { id: 'statusSensorReadings', items: PortCatalog.sensorReadings },
        { id: 'statusTimers', items: PortCatalog.timers },
        { id: 'statusCounters', items: PortCatalog.counters },
        { id: 'statusVirtual', items: PortCatalog.virtuals }
    ];

    statusDefinitions.forEach(({ id, items }) => {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = items.map((item) => `
            <div class="status-item" id="status-${item.code}" title="${escapeHtml(item.description)}">
                <div class="label">${escapeHtml(item.label)}</div>
                <div class="meta">${escapeHtml(item.description)}</div>
                <div class="value">0</div>
            </div>
        `).join('');
    });
}

function updateStatusPanel() {
    Object.keys(currentValues).forEach((key) => {
        const element = document.getElementById(`status-${key}`);
        if (!element) return;
        const value = currentValues[key];
        const numericValue = Number(value);
        element.querySelector('.value').textContent = value;
        element.classList.toggle('active', !Number.isNaN(numericValue) && numericValue > 0);
    });
}

function parseStatus(line) {
    if (!line) return;

    const timerMatches = line.match(/T(\d+):(-?\d+)\/(-?\d+)/g);
    if (timerMatches) {
        timerMatches.forEach((match) => {
            const parts = match.match(/T(\d+):(-?\d+)\/(-?\d+)/);
            if (parts) {
                currentValues[`T${parts[1]}`] = parts[2];
            }
        });
    }

    const counterMatches = line.match(/C(\d+):(-?\d+)\/(-?\d+)/g);
    if (counterMatches) {
        counterMatches.forEach((match) => {
            const parts = match.match(/C(\d+):(-?\d+)\/(-?\d+)/);
            if (parts) {
                currentValues[`C${parts[1]}`] = parts[2];
            }
        });
    }

    const genericMatches = line.match(/\b((?:A|D|V|S)\d+(?:[A-Z])?):(-?\d+(?:\.\d+)?)\b/g);
    if (genericMatches) {
        genericMatches.forEach((match) => {
            const separator = match.indexOf(':');
            const key = match.slice(0, separator);
            const value = match.slice(separator + 1);
            currentValues[key] = value;
        });
    }

    updateStatusPanel();

    const iframe = document.querySelector('#scadaPage iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'statusUpdate', values: currentValues }, '*');
    }
}

async function sendCommand(command) {
    if (!writer) return false;
    try {
        await writer.write(`${command}\n`);
        return true;
    } catch (error) {
        return false;
    }
}

async function readFromArduino() {
    if (!reader) return;

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            readBuffer += value;
            const lines = readBuffer.split('\n');
            readBuffer = lines.pop() || '';
            lines.forEach((line) => {
                const trimmed = line.trim();
                if (trimmed) parseStatus(trimmed);
            });
        }
    } catch (error) {
        document.getElementById('statusText').textContent = 'Falha na leitura';
    }
}

async function connectSerial() {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        reader = textDecoder.readable.getReader();

        const textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(port.writable);
        writer = textEncoder.writable.getWriter();

        window.serialPort = { port, reader, writer };
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('statusText').textContent = 'Conectado';
        document.getElementById('statusBadge').classList.add('connected');

        readFromArduino();
        statusInterval = setInterval(() => sendCommand('STATUS'), 1000);
        setTimeout(() => sendCommand('STATUS'), 250);
        setTimeout(notifyScada, 250);
    } catch (error) {
        alert(`Erro ao conectar: ${error.message}`);
    }
}

function notifyScada() {
    const iframe = document.querySelector('#scadaPage iframe');
    if (!iframe || !iframe.contentWindow) return;

    iframe.contentWindow.postMessage({
        type: 'serialPort',
        hasConnection: !!window.serialPort
    }, '*');
}

function addRung() {
    rungs.push({ elements: [], parallels: [] });
    renderRungs();
    saveToStorage();
}

function deleteRung(index) {
    if (!confirm('Excluir esta linha?')) return;
    rungs.splice(index, 1);
    renderRungs();
    saveToStorage();
}

function moveRung(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= rungs.length) return;
    const temp = rungs[index];
    rungs[index] = rungs[newIndex];
    rungs[newIndex] = temp;
    renderRungs();
    saveToStorage();
}

function createElementFromTool(tool) {
    const element = {
        type: tool,
        symbol: '',
        label: '',
        meta: '',
        target: '',
        value: null,
        cmp: '>=',
        math: 'A2',
        pwmSource: 'A2',
        pwmOut: 'D9',
        minVal: 0,
        maxVal: 1023,
        isOutput: false,
        isCondition: true
    };

    switch (tool) {
        case 'input-no':
            element.target = 'D1';
            break;
        case 'input-nc':
            element.target = 'D1';
            element.not = true;
            break;
        case 'sensor-no':
            element.target = 'S1';
            break;
        case 'sensor-nc':
            element.target = 'S1';
            element.not = true;
            break;
        case 'sensor-compare':
            element.target = 'S1T';
            element.cmp = '>=';
            element.value = 25;
            break;
        case 'virtual-no':
            element.target = 'V1';
            break;
        case 'virtual-nc':
            element.target = 'V1';
            element.not = true;
            break;
        case 'timer-start':
            element.target = 'T1';
            element.isOutput = true;
            element.isCondition = false;
            break;
        case 'timer-check':
            element.target = 'T1';
            element.value = 1000;
            break;
        case 'timer-nf':
            element.target = 'T1';
            element.value = 1000;
            element.not = true;
            break;
        case 'timer-reset':
            element.target = 'T1';
            element.reset = true;
            element.isOutput = true;
            element.isCondition = false;
            break;
        case 'counter-inc':
            element.target = 'C1';
            element.isOutput = true;
            element.isCondition = false;
            break;
        case 'counter-check':
            element.target = 'C1';
            element.value = 3;
            break;
        case 'counter-reset':
            element.target = 'C1';
            element.reset = true;
            element.isOutput = true;
            element.isCondition = false;
            break;
        case 'output':
            element.target = 'D11';
            element.isOutput = true;
            element.isCondition = false;
            break;
        case 'virtual':
            element.target = 'V1';
            element.isOutput = true;
            element.isCondition = false;
            break;
        case 'pwm':
            element.pwmSource = 'A2';
            element.pwmOut = 'D9';
            element.isOutput = true;
            element.isCondition = false;
            break;
        case 'math-cmp':
            element.math = 'A2';
            element.cmp = '>=';
            element.value = 500;
            break;
        case 'analog-read':
            element.target = 'A2';
            break;
        case 'display':
            element.displayText = 'Temp';
            element.displayVar = 'S1T';
            element.isOutput = true;
            element.isCondition = false;
            break;
        default:
            break;
    }

    updateElementLabel(element);
    return element;
}

function updateElementLabel(element) {
    const targetMeta = getDisplayMeta(element.target);
    const valueSuffix = element.value !== null && element.value !== undefined ? element.value : '';

    if (element.type === 'input-no') {
        element.symbol = `─┤${element.target}├─`;
        element.label = targetMeta.label;
        element.meta = targetMeta.description;
    } else if (element.type === 'input-nc') {
        element.symbol = `─┤/${element.target}├─`;
        element.label = targetMeta.label;
        element.meta = `Negado - ${targetMeta.description}`;
    } else if (element.type === 'sensor-no') {
        element.symbol = `─┤${element.target}├─`;
        element.label = targetMeta.label;
        element.meta = targetMeta.description;
    } else if (element.type === 'sensor-nc') {
        element.symbol = `─┤/${element.target}├─`;
        element.label = targetMeta.label;
        element.meta = `Negado - ${targetMeta.description}`;
    } else if (element.type === 'sensor-compare') {
        const sensorMeta = getDisplayMeta(element.target);
        element.symbol = `${element.target}${element.cmp}${valueSuffix}`;
        element.label = sensorMeta.label;
        element.meta = `${sensorMeta.description} - comparacao ${element.cmp} ${valueSuffix}`;
    } else if (element.type === 'virtual-no') {
        element.symbol = `─┤${element.target}├─`;
        element.label = element.target;
        element.meta = getDisplayMeta(element.target).description;
    } else if (element.type === 'virtual-nc') {
        element.symbol = `─┤/${element.target}├─`;
        element.label = element.target;
        element.meta = `Negado - ${getDisplayMeta(element.target).description}`;
    } else if (element.type === 'timer-start') {
        element.symbol = `(${element.target})`;
        element.label = element.target;
        element.meta = `${getDisplayMeta(element.target).description} - iniciar`;
    } else if (element.type === 'timer-check') {
        element.symbol = `${element.target}=${valueSuffix}`;
        element.label = `${element.target} = ${valueSuffix}`;
        element.meta = `${getDisplayMeta(element.target).description} - comparacao`;
    } else if (element.type === 'timer-nf') {
        element.symbol = `!${element.target}=${valueSuffix}`;
        element.label = `${element.target} negado`;
        element.meta = `${getDisplayMeta(element.target).description} - comparacao negada`;
    } else if (element.type === 'timer-reset') {
        element.symbol = `${element.target}R`;
        element.label = `${element.target} reset`;
        element.meta = `${getDisplayMeta(element.target).description} - reset`;
    } else if (element.type === 'counter-inc') {
        element.symbol = `(${element.target})`;
        element.label = element.target;
        element.meta = `${getDisplayMeta(element.target).description} - incrementar`;
    } else if (element.type === 'counter-check') {
        element.symbol = `${element.target}=${valueSuffix}`;
        element.label = `${element.target} = ${valueSuffix}`;
        element.meta = `${getDisplayMeta(element.target).description} - comparacao`;
    } else if (element.type === 'counter-reset') {
        element.symbol = `${element.target}R`;
        element.label = `${element.target} reset`;
        element.meta = `${getDisplayMeta(element.target).description} - reset`;
    } else if (element.type === 'output') {
        element.symbol = `(${element.target})`;
        element.label = targetMeta.label;
        element.meta = targetMeta.description;
    } else if (element.type === 'virtual') {
        element.symbol = `(${element.target})`;
        element.label = element.target;
        element.meta = getDisplayMeta(element.target).description;
    } else if (element.type === 'pwm') {
        const sourceMeta = getDisplayMeta(element.pwmSource);
        const outMeta = getDisplayMeta(element.pwmOut);
        element.symbol = `${element.pwmSource}=${element.pwmOut}(${element.minVal},${element.maxVal})`;
        element.label = `${sourceMeta.label} -> ${outMeta.label}`;
        element.meta = `${sourceMeta.description} em ${outMeta.description}`;
    } else if (element.type === 'math-cmp') {
        element.symbol = `M(${element.math})${element.cmp}${valueSuffix}`;
        element.label = `M(${element.math})`;
        element.meta = `Comparacao matematica ${element.cmp} ${valueSuffix}`;
    } else if (element.type === 'analog-read') {
        element.symbol = element.target;
        element.label = targetMeta.label;
        element.meta = targetMeta.description;
    } else if (element.type === 'display') {
        element.symbol = `I${element.displayText}:${element.displayVar}`;
        element.label = `Display: ${element.displayText}`;
        element.meta = `Mostra "${element.displayText}" e valor de ${element.displayVar}`;
    }
}

function createElementDiv(element, rungIndex, elIndex, location, pIndex = -1) {
    const elementDiv = document.createElement('div');
    elementDiv.className = `ladder-element ${element.type}`;
    if (location === 'parallel') elementDiv.classList.add('parallel-element');
    elementDiv.title = element.meta || '';
    elementDiv.innerHTML = `
        <span class="element-symbol">${escapeHtml(element.symbol)}</span>
        <span class="element-label">${escapeHtml(element.label)}</span>
        <span class="element-meta">${escapeHtml(element.meta || '')}</span>
    `;
    elementDiv.onclick = (event) => {
        event.stopPropagation();
        currentElement = { rungIndex, elIndex, location, pIndex };
        showContextMenu(event);
    };
    return elementDiv;
}

function renderRungs() {
    const container = document.getElementById('ladderRungs');
    container.innerHTML = '';

    rungs.forEach((rung, rungIndex) => {
        const rungDiv = document.createElement('div');
        rungDiv.className = 'ladder-rung';
        rungDiv.innerHTML = `<div class="rung-number">${rungIndex + 1}</div>`;

        const mainContent = document.createElement('div');
        mainContent.className = 'rung-main';
        mainContent.onclick = (event) => {
            if (event.target === mainContent) addElementToRung(rungIndex);
        };

        rung.elements.forEach((element, elIndex) => {
            mainContent.appendChild(createElementDiv(element, rungIndex, elIndex, 'main'));
        });

        if (!rung.elements.length) {
            const hint = document.createElement('div');
            hint.className = 'or-placeholder';
            hint.textContent = selectedTool === 'or'
                ? 'Clique para criar um grupo OR nesta linha.'
                : 'Clique na linha para adicionar elementos em serie.';
            mainContent.appendChild(hint);
        }

        rungDiv.appendChild(mainContent);

        if (rung.parallels && rung.parallels.length > 0) {
            const parallelContainer = document.createElement('div');
            parallelContainer.className = 'rung-parallel';

            const header = document.createElement('div');
            header.className = 'rung-parallel-header';
            header.textContent = 'Grupos OR';
            parallelContainer.appendChild(header);

            rung.parallels.forEach((parallel, pIndex) => {
                const parallelRow = document.createElement('div');
                parallelRow.className = 'parallel-row';
                parallelRow.onclick = (event) => {
                    if (event.target === parallelRow) addElementToParallel(rungIndex, pIndex);
                };

                if (!parallel.length) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'or-placeholder';
                    placeholder.textContent = 'OR: selecione um contato e clique aqui.';
                    parallelRow.appendChild(placeholder);
                }

                parallel.forEach((element, elIndex) => {
                    parallelRow.appendChild(createElementDiv(element, rungIndex, elIndex, 'parallel', pIndex));
                });

                parallelContainer.appendChild(parallelRow);
            });

            rungDiv.appendChild(parallelContainer);
        }

        const actions = document.createElement('div');
        actions.className = 'rung-actions';
        actions.innerHTML = `
            <button class="rung-btn" onclick="moveRung(${rungIndex}, -1)">⬆️</button>
            <button class="rung-btn" onclick="moveRung(${rungIndex}, 1)">⬇️</button>
            <button class="rung-btn" onclick="deleteRung(${rungIndex})">🗑️</button>
        `;
        rungDiv.appendChild(actions);
        container.appendChild(rungDiv);
    });

    updateCodePreview();
}

function addElementToRung(rungIndex) {
    if (!selectedTool) {
        alert('Selecione uma ferramenta.');
        return;
    }

    if (selectedTool === 'or') {
        rungs[rungIndex].parallels.push([]);
        renderRungs();
        saveToStorage();
        return;
    }

    const element = createElementFromTool(selectedTool);
    rungs[rungIndex].elements.push(element);
    currentElement = {
        rungIndex,
        elIndex: rungs[rungIndex].elements.length - 1,
        location: 'main',
        pIndex: -1
    };
    renderRungs();
    saveToStorage();
    openConfigModal();
}

function addElementToParallel(rungIndex, pIndex) {
    if (!selectedTool) {
        alert('Selecione uma ferramenta.');
        return;
    }

    if (selectedTool === 'or') {
        rungs[rungIndex].parallels.push([]);
        renderRungs();
        saveToStorage();
        return;
    }

    if (!CONDITION_TOOL_TYPES.has(selectedTool)) {
        alert('Grupo OR aceita apenas contatos e comparacoes (não saídas).');
        return;
    }

    const element = createElementFromTool(selectedTool);
    rungs[rungIndex].parallels[pIndex].push(element);
    currentElement = {
        rungIndex,
        elIndex: rungs[rungIndex].parallels[pIndex].length - 1,
        location: 'parallel',
        pIndex
    };
    renderRungs();
    saveToStorage();
    openConfigModal();
}

function showContextMenu(event) {
    const menu = document.getElementById('contextMenu');
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.classList.add('show');
}

function closeModal() {
    document.getElementById('configModal').classList.remove('show');
}

function deleteElement() {
    if (!currentElement) return;

    if (currentElement.location === 'parallel') {
        const branch = rungs[currentElement.rungIndex].parallels[currentElement.pIndex];
        branch.splice(currentElement.elIndex, 1);
        if (!branch.length) {
            rungs[currentElement.rungIndex].parallels.splice(currentElement.pIndex, 1);
        }
    } else {
        rungs[currentElement.rungIndex].elements.splice(currentElement.elIndex, 1);
    }

    closeModal();
    renderRungs();
    saveToStorage();
}

function deleteElementContext() {
    document.getElementById('contextMenu').classList.remove('show');
    deleteElement();
}

function editElement() {
    document.getElementById('contextMenu').classList.remove('show');
    openConfigModal();
}

function makeParallel() {
    document.getElementById('contextMenu').classList.remove('show');
    const element = getElementAt();

    if (!element || element.isOutput || currentElement.location !== 'main') {
        alert('Selecione um contato em serie para transformar em OR.');
        return;
    }

    const moved = rungs[currentElement.rungIndex].elements.splice(currentElement.elIndex, 1)[0];
    rungs[currentElement.rungIndex].parallels.push([moved]);
    renderRungs();
    saveToStorage();
}

function openConfigModal() {
    const element = getElementAt();
    if (!element) return;

    document.getElementById('modalTitle').textContent = `Configurar ${element.type}`;
    document.getElementById('numGroup').style.display = 'none';
    document.getElementById('valueGroup').style.display = 'none';
    document.getElementById('analogGroup').style.display = 'none';
    document.getElementById('pwmGroup').style.display = 'none';
    document.getElementById('minmaxGroup').style.display = 'none';
    document.getElementById('mathGroup').style.display = 'none';
    document.getElementById('cmpGroup').style.display = 'none';
    document.getElementById('cmpValueGroup').style.display = 'none';

    if (element.type === 'input-no' || element.type === 'input-nc') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Porta / estado disponivel');
        setSelectOptions(PortCatalog.ladderConditionPorts, element.target);
    }

    if (element.type === 'sensor-no' || element.type === 'sensor-nc') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Sensor online');
        setSelectOptions(PortCatalog.sensorSlots, element.target);
    }

    if (element.type === 'sensor-compare') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Leitura do sensor');
        setSelectOptions(PortCatalog.sensorReadings, element.target);
        document.getElementById('cmpGroup').style.display = 'block';
        document.getElementById('elementCmp').value = element.cmp || '>=';
        document.getElementById('cmpValueGroup').style.display = 'block';
        document.getElementById('elementCmpValue').value = element.value ?? 25;
    }

    if (element.type === 'virtual-no' || element.type === 'virtual-nc' || element.type === 'virtual') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Variavel virtual');
        setSelectOptions(PortCatalog.virtuals, element.target);
    }

    if (element.type === 'timer-start' || element.type === 'timer-reset') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Temporizador');
        setSelectOptions(PortCatalog.timers, element.target);
    }

    if (element.type === 'timer-check' || element.type === 'timer-nf') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Temporizador');
        setSelectOptions(PortCatalog.timers, element.target);
        document.getElementById('valueGroup').style.display = 'block';
        document.getElementById('elementValue').value = element.value ?? 1000;
    }

    if (element.type === 'counter-inc' || element.type === 'counter-reset') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Contador');
        setSelectOptions(PortCatalog.counters, element.target);
    }

    if (element.type === 'counter-check') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Contador');
        setSelectOptions(PortCatalog.counters, element.target);
        document.getElementById('valueGroup').style.display = 'block';
        document.getElementById('elementValue').value = element.value ?? 3;
    }

    if (element.type === 'output') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Saida fisica');
        setSelectOptions(PortCatalog.coilOutputs, element.target);
    }

    if (element.type === 'analog-read') {
        document.getElementById('numGroup').style.display = 'block';
        setSelectLabel('Entrada analogica');
        setSelectOptions(PortCatalog.analogInputs, element.target);
    }

    if (element.type === 'pwm') {
        document.getElementById('analogGroup').style.display = 'block';
        PortCatalog.populateSelect(document.getElementById('elementAnalog'), PortCatalog.analogInputs, element.pwmSource || 'A2');
        document.getElementById('pwmGroup').style.display = 'block';
        PortCatalog.populateSelect(document.getElementById('elementPwm'), PortCatalog.pwmOutputs, element.pwmOut || 'D9');
        document.getElementById('minmaxGroup').style.display = 'block';
        document.getElementById('elementMinMax').value = `${element.minVal ?? 0},${element.maxVal ?? 1023}`;
    }

    if (element.type === 'math-cmp') {
        document.getElementById('mathGroup').style.display = 'block';
        document.getElementById('elementMath').value = element.math || 'A2';
        document.getElementById('cmpGroup').style.display = 'block';
        document.getElementById('elementCmp').value = element.cmp || '>=';
        document.getElementById('cmpValueGroup').style.display = 'block';
        document.getElementById('elementCmpValue').value = element.value ?? 500;
    }

    if (element.type === 'display') {
        document.getElementById('displayTextGroup').style.display = 'block';
        document.getElementById('elementDisplayText').value = element.displayText || 'Temp';
        document.getElementById('displayVarGroup').style.display = 'block';
        document.getElementById('elementDisplayVar').value = element.displayVar || 'S1T';
    }

    document.getElementById('deleteElementBtn').style.display = 'block';
    document.getElementById('configModal').classList.add('show');
}

function saveElement() {
    const element = getElementAt();
    if (!element) return;

    if (element.type === 'input-no' || element.type === 'input-nc' || element.type === 'sensor-no' || element.type === 'sensor-nc' || element.type === 'sensor-compare' || element.type === 'virtual-no' || element.type === 'virtual-nc' || element.type === 'virtual' || element.type === 'timer-start' || element.type === 'timer-reset' || element.type === 'timer-check' || element.type === 'timer-nf' || element.type === 'counter-inc' || element.type === 'counter-reset' || element.type === 'counter-check' || element.type === 'output' || element.type === 'analog-read') {
        element.target = document.getElementById('elementNum').value;
    }

    if (element.type === 'timer-check' || element.type === 'timer-nf' || element.type === 'counter-check') {
        element.value = parseInt(document.getElementById('elementValue').value, 10) || 0;
    }

    if (element.type === 'sensor-compare' || element.type === 'math-cmp') {
        element.cmp = document.getElementById('elementCmp').value;
        element.value = parseFloat(document.getElementById('elementCmpValue').value) || 0;
    }

    if (element.type === 'pwm') {
        element.pwmSource = document.getElementById('elementAnalog').value;
        element.pwmOut = document.getElementById('elementPwm').value;
        const [minVal, maxVal] = document.getElementById('elementMinMax').value.split(',').map((item) => parseInt(item.trim(), 10));
        element.minVal = Number.isFinite(minVal) ? minVal : 0;
        element.maxVal = Number.isFinite(maxVal) ? maxVal : 1023;
    }

    if (element.type === 'math-cmp') {
        element.math = document.getElementById('elementMath').value.trim() || 'A2';
    }

    if (element.type === 'display') {
        element.displayText = document.getElementById('elementDisplayText').value.trim() || 'Temp';
        element.displayVar = document.getElementById('elementDisplayVar').value || 'S1T';
    }

    updateElementLabel(element);
    closeModal();
    renderRungs();
    saveToStorage();
}

function generateElementCode(element) {
    if (element.type === 'input-no' || element.type === 'sensor-no' || element.type === 'virtual-no' || element.type === 'analog-read') {
        return element.target;
    }

    if (element.type === 'input-nc' || element.type === 'sensor-nc' || element.type === 'virtual-nc') {
        return `!${element.target}`;
    }

    if (element.type === 'sensor-compare') {
        return `${element.target}${element.cmp}${element.value}`;
    }

    if (element.type === 'timer-start') return element.target;
    if (element.type === 'timer-check') return `${element.target}=${element.value}`;
    if (element.type === 'timer-nf') return `!${element.target}=${element.value}`;
    if (element.type === 'timer-reset') return `${element.target}R`;
    if (element.type === 'counter-inc') return element.target;
    if (element.type === 'counter-check') return `${element.target}=${element.value}`;
    if (element.type === 'counter-reset') return `${element.target}R`;
    if (element.type === 'output') return element.target;
    if (element.type === 'virtual') return element.target;
    if (element.type === 'pwm') return `${element.pwmSource}=${element.pwmOut}(${element.minVal},${element.maxVal})`;
    if (element.type === 'math-cmp') return `M(${element.math})${element.cmp}${element.value}`;
    if (element.type === 'display') return `I${element.displayText}:${element.displayVar}`;

    return '';
}

function updateCodePreview() {
    let code = 'CODE:';

    rungs.forEach((rung, rungIndex) => {
        if (!rung.elements.length && !(rung.parallels && rung.parallels.some((parallel) => parallel.length))) return;
        if (rungIndex > 0 && code !== 'CODE:') code += ';';

        const conditions = [];
        const outputs = [];

        rung.elements.forEach((element) => {
            if (element.isOutput) outputs.push(element);
            else conditions.push(element);
        });

        (rung.parallels || []).forEach((parallel) => {
            if (!parallel.length) return;
            const codes = parallel.map(generateElementCode).filter(Boolean);
            if (!codes.length) return;
            conditions.push({ code: `(${codes.join('OR')})` });
        });

        const conditionCode = conditions.map((element) => element.code || generateElementCode(element)).filter(Boolean).join('&&');
        const outputCode = outputs.map(generateElementCode).filter(Boolean).join('');
        code += `${conditionCode}${outputCode}`;
    });

    document.getElementById('codePreview').textContent = code;
}

async function sendCode() {
    const code = document.getElementById('codePreview').textContent;
    if (code === 'CODE:') {
        alert('Nenhum codigo para enviar.');
        return;
    }

    const success = await sendCommand(code);
    if (!success) {
        alert('Nao foi possivel enviar o codigo.');
        return;
    }

    alert('Codigo enviado.');
}

function clearAll() {
    if (!confirm('Limpar todos os rungs?')) return;
    rungs = [];
    renderRungs();
    saveToStorage();
}

function showPage(page, button) {
    document.querySelectorAll('.page').forEach((pageElement) => pageElement.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.remove('active'));
    document.getElementById(`${page}Page`).classList.add('active');
    if (button) button.classList.add('active');
    if (page === 'scada') setTimeout(notifyScada, 100);
}

function selectTool(tool, element) {
    document.querySelectorAll('.tool-item').forEach((item) => item.classList.remove('selected'));
    if (element) element.classList.add('selected');
    selectedTool = tool;
}

window.sendArduinoCommand = async function sendArduinoCommand(command) {
    return sendCommand(command);
};

window.addEventListener('message', (event) => {
    if (typeof event.data === 'string' && event.data.startsWith('SCADA_CMD:')) {
        sendCommand(event.data.substring(10));
        return;
    }

    if (event.data && event.data.type === 'sendCommand' && event.data.command) {
        sendCommand(String(event.data.command));
    }
});

document.getElementById('connectBtn').addEventListener('click', connectSerial);
document.addEventListener('click', () => {
    document.getElementById('contextMenu').classList.remove('show');
});

loadFromStorage();
renderRungs();
initStatusPanel();
