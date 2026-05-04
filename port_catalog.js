const PortCatalog = (() => {
    const digitalInputs = [
        { code: 'D1', label: 'D1', description: 'Entrada digital 1 - borne fisico D1' },
        { code: 'D2', label: 'D2', description: 'Entrada digital 2 - borne fisico D2' },
        { code: 'D3', label: 'D3', description: 'Entrada digital 3 - borne fisico D3' },
        { code: 'D4', label: 'D4', description: 'Entrada digital 4 - borne fisico D4' },
        { code: 'D5', label: 'D5', description: 'Entrada digital 5 - borne fisico D5' },
        { code: 'D6', label: 'D6', description: 'Entrada digital 6 - borne fisico D6' }
    ];

    const outputStates = [
        { code: 'A0', label: 'A01 / A0', description: 'Saida digital auxiliar 1 - borne fisico A0' },
        { code: 'A1', label: 'A02 / A1', description: 'Saida digital auxiliar 2 - borne fisico A1' },
        { code: 'D11', label: 'D11', description: 'Saida digital 1 - borne fisico D11' },
        { code: 'D12', label: 'D12', description: 'Saida digital 2 - borne fisico D12' },
        { code: 'D13', label: 'D13', description: 'Saida digital 3 - borne fisico D13' }
    ];

    const coilOutputs = [
        { code: 'A0', label: 'A01 / A0', description: 'Bobina de saida auxiliar 1 - borne fisico A0' },
        { code: 'A1', label: 'A02 / A1', description: 'Bobina de saida auxiliar 2 - borne fisico A1' },
        { code: 'D11', label: 'D11', description: 'Bobina de saida digital 1 - borne fisico D11' },
        { code: 'D12', label: 'D12', description: 'Bobina de saida digital 2 - borne fisico D12' },
        { code: 'D13', label: 'D13', description: 'Bobina de saida digital 3 - borne fisico D13' }
    ];

    const pwmOutputs = [
        { code: 'D9', label: 'D9', description: 'Saida PWM 1 - borne fisico D9' },
        { code: 'D10', label: 'D10', description: 'Saida PWM 2 - borne fisico D10' }
    ];

    const analogInputs = [
        { code: 'A2', label: 'A2', description: 'Entrada analogica 1 - borne fisico A2' },
        { code: 'A3', label: 'A3', description: 'Entrada analogica 2 - borne fisico A3' }
    ];

    const virtuals = Array.from({ length: 10 }, (_, index) => ({
        code: `V${index + 1}`,
        label: `V${index + 1}`,
        description: `Variavel virtual ${index + 1}`
    }));

    const timers = Array.from({ length: 5 }, (_, index) => ({
        code: `T${index + 1}`,
        label: `T${index + 1}`,
        description: `Temporizador ${index + 1}`
    }));

    const counters = Array.from({ length: 5 }, (_, index) => ({
        code: `C${index + 1}`,
        label: `C${index + 1}`,
        description: `Contador ${index + 1}`
    }));

    const sensorSlots = [
        { code: 'S1', label: 'S1', description: 'Sensor 1 - DHT22 reservado no pino D7' },
        { code: 'S2', label: 'S2', description: 'Sensor 2 - DS18B20 reservado no pino D8' },
        { code: 'S3', label: 'S3', description: 'Sensor 3 - reserva futura' },
        { code: 'S4', label: 'S4', description: 'Sensor 4 - reserva futura' },
        { code: 'S5', label: 'S5', description: 'Sensor 5 - reserva futura' },
        { code: 'S6', label: 'S6', description: 'Sensor 6 - reserva futura' },
        { code: 'S7', label: 'S7', description: 'Sensor 7 - reserva futura' },
        { code: 'S8', label: 'S8', description: 'Sensor 8 - reserva futura' }
    ];

    const sensorReadings = [
        { code: 'S1T', label: 'S1 Temperatura', description: 'DHT22 no D7 - temperatura' },
        { code: 'S1H', label: 'S1 Umidade', description: 'DHT22 no D7 - umidade' },
        { code: 'S2T', label: 'S2 Temperatura', description: 'DS18B20 no D8 - temperatura' },
        { code: 'S3T', label: 'S3 Temperatura', description: 'Sensor futuro - leitura 1' },
        { code: 'S3H', label: 'S3 Umidade', description: 'Sensor futuro - leitura 2' },
        { code: 'S4T', label: 'S4 Temperatura', description: 'Sensor futuro - leitura 1' },
        { code: 'S4H', label: 'S4 Umidade', description: 'Sensor futuro - leitura 2' },
        { code: 'S5T', label: 'S5 Temperatura', description: 'Sensor futuro - leitura 1' },
        { code: 'S5H', label: 'S5 Umidade', description: 'Sensor futuro - leitura 2' },
        { code: 'S6T', label: 'S6 Temperatura', description: 'Sensor futuro - leitura 1' },
        { code: 'S6H', label: 'S6 Umidade', description: 'Sensor futuro - leitura 2' },
        { code: 'S7T', label: 'S7 Temperatura', description: 'Sensor futuro - leitura 1' },
        { code: 'S7H', label: 'S7 Umidade', description: 'Sensor futuro - leitura 2' },
        { code: 'S8T', label: 'S8 Temperatura', description: 'Sensor futuro - leitura 1' },
        { code: 'S8H', label: 'S8 Umidade', description: 'Sensor futuro - leitura 2' }
    ];

    const statusOutputs = [...coilOutputs, ...pwmOutputs];
    const ladderConditionPorts = [...digitalInputs, ...outputStates, ...sensorSlots];
    const scadaDisplayVariables = [
        ...virtuals,
        ...digitalInputs,
        ...sensorSlots,
        ...statusOutputs,
        ...analogInputs,
        ...sensorReadings,
        ...timers,
        ...counters
    ];

    const lookupMap = new Map();

    [
        ...digitalInputs,
        ...outputStates,
        ...coilOutputs,
        ...pwmOutputs,
        ...analogInputs,
        ...virtuals,
        ...timers,
        ...counters,
        ...sensorSlots,
        ...sensorReadings
    ].forEach((item) => {
        lookupMap.set(item.code, item);
    });

    function getByCode(code) {
        return lookupMap.get(code) || { code, label: code, description: code };
    }

    function optionText(item) {
        return `${item.label} - ${item.description}`;
    }

    function populateSelect(selectElement, items, selectedValue = '') {
        selectElement.innerHTML = items.map((item) => {
            const selected = item.code === selectedValue ? ' selected' : '';
            return `<option value="${item.code}"${selected}>${optionText(item)}</option>`;
        }).join('');
    }

    return {
        digitalInputs,
        outputStates,
        coilOutputs,
        pwmOutputs,
        analogInputs,
        virtuals,
        timers,
        counters,
        sensorSlots,
        sensorReadings,
        statusOutputs,
        ladderConditionPorts,
        scadaDisplayVariables,
        getByCode,
        optionText,
        populateSelect
    };
})();
