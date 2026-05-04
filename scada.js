let writer = null;
let scadaItems = [];
let currentValues = {};
let editMode = false;
let selectedItem = null;
let draggedItem = null;
let dragOffset = { x: 0, y: 0 };

function buildVariableGroups() {
    return [
        {
            label: '━━━ VARIAVEIS VIRTUAIS (BOTOES CONTROLAM) ━━━',
            items: PortCatalog.virtuals
        },
        {
            label: '━━━ ENTRADAS DIGITAIS ━━━',
            items: PortCatalog.digitalInputs
        },
        {
            label: '━━━ SENSORES ONLINE ━━━',
            items: PortCatalog.sensorSlots
        },
        {
            label: '━━━ SAIDAS DIGITAIS E PWM ━━━',
            items: PortCatalog.statusOutputs
        },
        {
            label: '━━━ ENTRADAS ANALOGICAS ━━━',
            items: PortCatalog.analogInputs
        },
        {
            label: '━━━ LEITURAS DOS SENSORES ━━━',
            items: PortCatalog.sensorReadings
        },
        {
            label: '━━━ TEMPORIZADORES ━━━',
            items: PortCatalog.timers
        },
        {
            label: '━━━ CONTADORES ━━━',
            items: PortCatalog.counters
        }
    ];
}

function populateVariableSelect(selectElement, selectedValue = '') {
    const groups = buildVariableGroups();
    selectElement.innerHTML = groups.map((group) => {
        const options = group.items.map((item) => {
            const selected = item.code === selectedValue ? ' selected' : '';
            return `<option value="${item.code}"${selected}>${item.label} - ${item.description}</option>`;
        }).join('');
        return `<optgroup label="${group.label}">${options}</optgroup>`;
    }).join('');
}

function loadItems() {
    const saved = localStorage.getItem('scadaItems');
    if (!saved) {
        scadaItems = [];
        return;
    }

    try {
        scadaItems = JSON.parse(saved);
    } catch (error) {
        scadaItems = [];
    }
}

function saveItems() {
    localStorage.setItem('scadaItems', JSON.stringify(scadaItems));
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function adjustColor(color, amount) {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

async function sendCommand(command) {
    try {
        // Primeiro tenta acessar diretamente o parent
        if (window.parent && window.parent !== window) {
            // Tenta usar sendArduinoCommand se existir
            if (typeof window.parent.sendArduinoCommand === 'function') {
                await window.parent.sendArduinoCommand(command);
                return true;
            }
            
            // Tenta usar serialPort diretamente se existir
            if (window.parent.serialPort && window.parent.serialPort.writer) {
                const encoder = new TextEncoder();
                await window.parent.serialPort.writer.write(encoder.encode(command + '\n'));
                return true;
            }
            
            // Fallback para postMessage
            window.parent.postMessage({ type: 'sendCommand', command }, '*');
            return true;
        }
    } catch (error) {
        // Tenta postMessage mesmo com erro
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'sendCommand', command }, '*');
                return true;
            }
        } catch (postError) {
            return false;
        }
        
        return false;
    }

    return false;
}

function setConnected() {
    document.getElementById('testBtn').style.display = 'inline-block';
    document.getElementById('statusText').textContent = 'Conectado';
    document.getElementById('statusBadge').classList.add('connected');
}

function checkParentConnection() {
    try {
        if (window.parent && window.parent !== window && window.parent.serialPort) {
            writer = window.parent.serialPort.writer;
            setConnected();
            return true;
        }
    } catch (error) {
        return false;
    }
    return false;
}

async function testConnection() {
    const success = await sendCommand('STATUS');
    alert(success ? 'Conexao OK.' : 'Falha na conexao.');
}

async function toggleButton(variable, item, buttonElement) {
    if (!variable.startsWith('V')) {
        alert('Somente variaveis virtuais podem ser controladas pelo SCADA.');
        return;
    }

    const currentState = buttonElement.classList.contains('active');
    const newValue = currentState ? 0 : 1;

    if (newValue === 1) {
        buttonElement.classList.add('active');
        buttonElement.textContent = 'ON';
        buttonElement.style.background = `linear-gradient(135deg, ${item.colorOn}, ${adjustColor(item.colorOn, -30)})`;
    } else {
        buttonElement.classList.remove('active');
        buttonElement.textContent = 'OFF';
        buttonElement.style.background = `linear-gradient(135deg, ${item.colorOff}, ${adjustColor(item.colorOff, -30)})`;
    }

    const command = `SET${variable}=${newValue}`;
    await sendCommand(command);
}

async function setButton(variable, value) {
    if (!variable.startsWith('V')) return;
    
    const command = `SET${variable}=${value}`;
    await sendCommand(command);
}

function renderItems() {
    const canvas = document.getElementById('scadaCanvas');
    canvas.innerHTML = '';

    scadaItems.forEach((item, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = `scada-item${editMode ? ' edit-mode' : ''}`;
        wrapper.id = `item-${index}`;
        wrapper.style.left = `${item.x}px`;
        wrapper.style.top = `${item.y}px`;
        wrapper.setAttribute('data-index', index);
        wrapper.title = PortCatalog.getByCode(item.variable).description;

        let content = '';

        if (item.type === 'btn-toggle') {
            content = `<div class="btn-toggle" style="background: linear-gradient(135deg, ${item.colorOff}, ${adjustColor(item.colorOff, -30)})">OFF</div>`;
        } else if (item.type === 'btn-momentary') {
            content = '<div class="btn-momentary">PRESS</div>';
        } else if (item.type === 'display-led') {
            content = '<div class="display-led"><div class="led-inner"></div></div>';
        } else if (item.type === 'display-gauge') {
            const circumference = 2 * Math.PI * 80;
            content = `
                <div class="display-gauge">
                    <svg class="gauge-svg" viewBox="0 0 200 200">
                        <circle class="gauge-bg" cx="100" cy="100" r="80"></circle>
                        <circle class="gauge-fill" cx="100" cy="100" r="80" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"></circle>
                    </svg>
                    <div class="gauge-value">0</div>
                    <div class="gauge-label">${item.variable}</div>
                    <div class="gauge-minmax"><span>Min: ${item.minValue}</span><span>Max: ${item.maxValue}</span></div>
                </div>
            `;
        } else if (item.type === 'display-bar') {
            content = `
                <div class="display-bar">
                    <div class="bar-value">0</div>
                    <div class="bar-fill" style="height: 0%"></div>
                    <div class="bar-minmax">${item.minValue} - ${item.maxValue}</div>
                </div>
            `;
        } else if (item.type === 'display-text') {
            content = `
                <div class="display-text">
                    <div class="label">${item.variable}</div>
                    <div class="value">0</div>
                </div>
            `;
        }

        wrapper.innerHTML = `${content}<div class="item-label">${item.name}</div>`;

        if (item.type === 'btn-toggle') {
            wrapper.querySelector('.btn-toggle').addEventListener('click', (event) => {
                event.stopPropagation();
                if (!editMode) toggleButton(item.variable, item, event.currentTarget);
            });
        }

        if (item.type === 'btn-momentary') {
            const button = wrapper.querySelector('.btn-momentary');
            button.addEventListener('mousedown', (event) => {
                event.stopPropagation();
                if (editMode) return;
                setButton(item.variable, 1);
                button.classList.add('active');
            });
            button.addEventListener('mouseup', () => {
                setButton(item.variable, 0);
                button.classList.remove('active');
            });
            button.addEventListener('mouseleave', () => {
                setButton(item.variable, 0);
                button.classList.remove('active');
            });
        }

        if (editMode) wrapper.addEventListener('mousedown', startDrag);
        wrapper.addEventListener('contextmenu', showContextMenu);
        canvas.appendChild(wrapper);
    });

    updateDisplay();
}

function updateDisplay() {
    scadaItems.forEach((item, index) => {
        const element = document.getElementById(`item-${index}`);
        if (!element) return;
        if (item.type === 'btn-toggle' || item.type === 'btn-momentary') return;

        const rawValue = currentValues[item.variable];
        const numericValue = rawValue !== undefined ? Number(rawValue) : 0;
        const displayValue = rawValue !== undefined ? rawValue : 0;

        if (item.type === 'display-led') {
            const led = element.querySelector('.led-inner');
            element.classList.remove('active', 'warning');
            if (numericValue === 0) {
                led.style.background = 'radial-gradient(circle at 35% 35%, #ff4444, #880000)';
                led.style.boxShadow = '0 0 30px rgba(255, 68, 68, 0.7)';
            } else if (numericValue === 1) {
                element.classList.add('active');
            } else {
                element.classList.add('warning');
            }
        } else if (item.type === 'display-gauge') {
            const valueElement = element.querySelector('.gauge-value');
            const fillElement = element.querySelector('.gauge-fill');
            valueElement.textContent = displayValue;
            const percent = Math.max(0, Math.min(100, ((numericValue - item.minValue) / Math.max(1, item.maxValue - item.minValue)) * 100));
            const circumference = 2 * Math.PI * 80;
            fillElement.style.strokeDashoffset = circumference - (percent / 100) * circumference;
            if (percent > 80) {
                fillElement.style.stroke = '#ff0044';
                valueElement.style.color = '#ff0044';
            } else if (percent > 60) {
                fillElement.style.stroke = '#ff8800';
                valueElement.style.color = '#ff8800';
            } else {
                fillElement.style.stroke = '#00ff88';
                valueElement.style.color = '#00ff88';
            }
        } else if (item.type === 'display-bar') {
            const fill = element.querySelector('.bar-fill');
            const valueElement = element.querySelector('.bar-value');
            const percent = Math.max(0, Math.min(100, ((numericValue - item.minValue) / Math.max(1, item.maxValue - item.minValue)) * 100));
            valueElement.textContent = displayValue;
            fill.style.height = `${percent}%`;
            fill.classList.remove('warning', 'danger');
            if (percent > 80) {
                fill.classList.add('danger');
                valueElement.style.color = '#ff0044';
            } else if (percent > 60) {
                fill.classList.add('warning');
                valueElement.style.color = '#ff8800';
            } else {
                valueElement.style.color = '#00ff88';
            }
        } else if (item.type === 'display-text') {
            const valueElement = element.querySelector('.value');
            valueElement.textContent = displayValue;
            if (numericValue === 0) valueElement.style.color = '#ff0044';
            else if (numericValue === 1) valueElement.style.color = '#00ff88';
            else valueElement.style.color = '#ff8800';
        }
    });
}

function startDrag(event) {
    if (!editMode) return;
    event.preventDefault();
    draggedItem = event.currentTarget;
    const rect = draggedItem.getBoundingClientRect();
    dragOffset.x = event.clientX - rect.left;
    dragOffset.y = event.clientY - rect.top;
    draggedItem.classList.add('selected');
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
}

function drag(event) {
    if (!draggedItem) return;
    const canvas = document.getElementById('scadaCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    const x = Math.max(0, event.clientX - canvasRect.left - dragOffset.x);
    const y = Math.max(0, event.clientY - canvasRect.top - dragOffset.y);
    draggedItem.style.left = `${x}px`;
    draggedItem.style.top = `${y}px`;
}

function stopDrag() {
    if (!draggedItem) return;
    const index = parseInt(draggedItem.getAttribute('data-index'), 10);
    scadaItems[index].x = parseInt(draggedItem.style.left, 10);
    scadaItems[index].y = parseInt(draggedItem.style.top, 10);
    draggedItem.classList.remove('selected');
    draggedItem = null;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    saveItems();
}

function showContextMenu(event) {
    event.preventDefault();
    selectedItem = parseInt(event.currentTarget.getAttribute('data-index'), 10);
    const menu = document.getElementById('contextMenu');
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.classList.add('show');
}

function editItemContext() {
    const item = scadaItems[selectedItem];
    document.getElementById('editName').value = item.name;
    populateVariableSelect(document.getElementById('editVariable'), item.variable);
    document.getElementById('editColorOff').value = item.colorOff || '#ff0044';
    document.getElementById('editColorOn').value = item.colorOn || '#00ff88';
    document.getElementById('editMinValue').value = item.minValue || 0;
    document.getElementById('editMaxValue').value = item.maxValue || 1023;
    document.getElementById('editModal').classList.add('show');
}

function duplicateItemContext() {
    const clone = { ...scadaItems[selectedItem] };
    clone.x += 50;
    clone.y += 50;
    scadaItems.push(clone);
    saveItems();
    renderItems();
}

function deleteItemContext() {
    if (!confirm('Excluir este elemento?')) return;
    scadaItems.splice(selectedItem, 1);
    saveItems();
    renderItems();
}

function addItem() {
    const type = document.getElementById('itemType').value;
    const name = document.getElementById('itemName').value.trim();
    const variable = document.getElementById('itemVariable').value;
    const colorOff = document.getElementById('colorOff').value;
    const colorOn = document.getElementById('colorOn').value;
    const minValue = parseFloat(document.getElementById('minValue').value) || 0;
    const maxValue = parseFloat(document.getElementById('maxValue').value) || 1023;

    if (!name) {
        alert('Digite um nome.');
        return;
    }

    scadaItems.push({
        type,
        name,
        variable,
        colorOff,
        colorOn,
        minValue,
        maxValue,
        x: 100 + (scadaItems.length * 20),
        y: 100 + (scadaItems.length * 20)
    });

    saveItems();
    renderItems();
    closeModal('addModal');
    document.getElementById('itemName').value = '';
}

function saveEdit() {
    const item = scadaItems[selectedItem];
    item.name = document.getElementById('editName').value.trim();
    item.variable = document.getElementById('editVariable').value;
    item.colorOff = document.getElementById('editColorOff').value;
    item.colorOn = document.getElementById('editColorOn').value;
    item.minValue = parseFloat(document.getElementById('editMinValue').value) || 0;
    item.maxValue = parseFloat(document.getElementById('editMaxValue').value) || 1023;
    saveItems();
    renderItems();
    closeModal('editModal');
}

function deleteItem() {
    if (!confirm('Excluir este elemento?')) return;
    scadaItems.splice(selectedItem, 1);
    saveItems();
    renderItems();
    closeModal('editModal');
}

window.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'serialPort' && event.data.hasConnection) {
        try {
            if (window.parent && window.parent.serialPort) {
                writer = window.parent.serialPort.writer;
            }
        } catch (error) {
            writer = null;
        }
        setConnected();
    }

    if (event.data.type === 'statusUpdate') {
        currentValues = event.data.values || {};
        updateDisplay();
    }
});

document.getElementById('editBtn').addEventListener('click', () => {
    editMode = !editMode;
    document.getElementById('editIndicator').classList.toggle('show', editMode);
    document.getElementById('editBtn').classList.toggle('active', editMode);
    renderItems();
});

document.getElementById('addBtn').addEventListener('click', () => {
    document.getElementById('addModal').classList.add('show');
});

document.getElementById('itemType').addEventListener('change', (event) => {
    const type = event.target.value;
    const isButton = type.startsWith('btn-');
    const isGauge = type === 'display-gauge' || type === 'display-bar';
    document.getElementById('colorRow').style.display = isButton ? 'grid' : 'none';
    document.getElementById('minmaxRow').style.display = isGauge ? 'grid' : 'none';
});

document.addEventListener('click', () => {
    document.getElementById('contextMenu').classList.remove('show');
});

populateVariableSelect(document.getElementById('itemVariable'), 'V1');
populateVariableSelect(document.getElementById('editVariable'), 'V1');
loadItems();
renderItems();
setTimeout(checkParentConnection, 300);
setTimeout(checkParentConnection, 1000);
setTimeout(checkParentConnection, 2000);
