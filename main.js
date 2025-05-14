// main.js

// Canvas and context setup
const backgroundCanvas = document.getElementById('backgroundCanvas');
const backgroundCtx = backgroundCanvas.getContext('2d');
backgroundCtx.imageSmoothingEnabled = false;
const playersCanvas = document.getElementById('playersCanvas');
const playersCtx = playersCanvas.getContext('2d');
const statsDiv = document.getElementById('stats');
const clockDiv = document.getElementById('clock');
const pieChartCanvas = document.getElementById('pieChart');
const pieChartCtx = pieChartCanvas.getContext('2d');

const scaleFactor = 1;
// Ahora numAgents es mutable para poder agregar/eliminar agentes
let numAgents = 100;
let currentTimeSeconds = 0;
const timeStepSeconds = 20;
// Factor para controlar la velocidad del tiempo (1 = normal)
let timeSpeedFactor = 1;
let terrainLayer = [];

// Global variables for state management and NPC workers
let savedStateFromServer = null;
let npcWorkers = [];
// npcStates se mantiene global para conservar el estado de los agentes existentes  
let npcStates = {};

// Global variable to store the agent to follow (0 means no follow)
let followAgentIndex = 0;
let zoomfactor = 4;

// Variable to control simulation state
let simulationRunning = true;

// Listen for changes in the input elements.
document.getElementById('agentSelector').addEventListener('input', (e) => {
    followAgentIndex = parseInt(e.target.value);
});
document.getElementById('zoomfactor').onchange = function(e) {
    zoomfactor = parseInt(e.target.value);
};

// Botón "Detener Simulación" restaurado (como antes)
// Al presionarlo se detiene el game loop.
document.getElementById('stopSimulation').addEventListener('click', () => {
    simulationRunning = false;
});

// Botón "Reanudar Simulación" reanuda el ciclo de simulación si está detenido.
document.getElementById('resumeSimulation').addEventListener('click', () => {
    if (!simulationRunning) {
        simulationRunning = true;
        // Actualizar y redibujar para reiniciar el ciclo.
        update();
        draw();
        updateStats();
        updateClock();
        updatePieChart();
        gameLoop();
    }
});

// NUEVAS FUNCIONALIDADES: AGREGAR/ELIMINAR AGENTES Y CONTROL DE VELOCIDAD DEL TIEMPO

document.getElementById('addAgent').addEventListener('click', () => {
    numAgents++;
    reinitializeAgents();
});

document.getElementById('removeAgent').addEventListener('click', () => {
    if (numAgents > 1) {
        numAgents--;
        reinitializeAgents();
    }
});

// Usamos el evento "input" para actualizar la velocidad de tiempo en tiempo real.
document.getElementById('timeSpeed').addEventListener('input', (e) => {
    timeSpeedFactor = parseFloat(e.target.value);
});

// Función para reinicializar la simulación cuando se cambia el número de agentes.
// Se conserva el estado de los agentes existentes (aquellos con id < numAgents).
function reinitializeAgents() {
    // Si se eliminan agentes, se remueven del npcStates.
    for (let id in npcStates) {
        if (parseInt(id) >= numAgents) {
            delete npcStates[id];
        }
    }
    // Finaliza todos los workers actuales.
    npcWorkers.forEach(worker => worker.terminate());
    npcWorkers = [];
    // Reinicializa la generación de agentes (se conservarán los existentes y se crearán nuevos para los índices nuevos).
    initializeAgents();
    // Actualiza la visualización en #stats.
    updateStats();
}

// Create an Image object for the map
const mapa = new Image();
mapa.src = "casas.png";

// ----------------------
// Server State Functions
// ----------------------

// Load state from the server (GET request)
function loadStateFromServer() {
    return fetch('npc_endpoint.php')
        .then(response => response.json())
        .then(data => {
            if (data.npcStates && data.currentTimeSeconds !== undefined) {
                savedStateFromServer = data;
                // Se cargan los estados guardados solo si npcStates está vacío.
                if (!Object.keys(npcStates).length) {
                    npcStates = data.npcStates;
                    currentTimeSeconds = data.currentTimeSeconds;
                }
                console.log('Loaded state from server:', data);
            } else {
                console.log('No saved state on server; starting fresh.');
            }
        })
        .catch(error => {
            console.error('Error loading state:', error);
        });
}

// Save state to the server (POST request)
function saveStateToServer() {
    if (!simulationRunning) return;
    const stateToSave = {
        currentTimeSeconds: currentTimeSeconds,
        npcStates: npcStates
    };
    fetch('npc_endpoint.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(stateToSave)
    })
    .catch(error => console.error('Error saving state:', error));
}

// ----------------------
// Map and Terrain Setup
// ----------------------

// Once the map image loads, set up canvas dimensions and build the terrain matrix.
mapa.onload = function() {
    backgroundCanvas.width = mapa.width;
    backgroundCanvas.height = mapa.height;
    playersCanvas.width = mapa.width;
    playersCanvas.height = mapa.height;
    
    // Initially draw the map image on the background canvas.
    backgroundCtx.drawImage(mapa, 0, 0);
    
    // Build the terrainLayer matrix from the image data.
    const imageData = backgroundCtx.getImageData(0, 0, mapa.width, mapa.height).data;
    terrainLayer = [];
    for (let y = 0; y < mapa.height; y++) {
        const row = [];
        for (let x = 0; x < mapa.width; x++) {
            const index = (y * mapa.width + x) * 4;
            const r = imageData[index];
            const g = imageData[index + 1];
            const b = imageData[index + 2];
            let color = 'unknown';
            if (r === 0 && g === 255 && b === 0) color = 'green';
            if (r === 255 && g === 0 && b === 255) color = 'magenta';
            if (r === 0 && g === 255 && b === 255) color = 'yellow';
            if (r === 255 && g === 0 && b === 0) color = 'blue';
            if (r === 0 && g === 0 && b === 255) color = 'red';
            if (r === 255 && g === 255 && b === 0) color = 'cyan';
            if (r === 127 && g === 127 && b === 127) color = 'gray';
            if (r === 0 && g === 200 && b === 0) color = 'dark_green';
            row.push(color);
        }
        terrainLayer.push(row);
    }
    console.log("Terrain layer built:", terrainLayer);

    // Load any saved state from the server, then initialize agents and start the game loop.
    loadStateFromServer().then(() => {
        initializeAgents();
        gameLoop();
    });
};

// ----------------------
// Agent Initialization
// ----------------------
function initializeAgents() {
    // Determine number of workers based on available cores (with a fallback).
    const numCores = navigator.hardwareConcurrency || 4;
    const agentsPerWorker = Math.ceil(numAgents / numCores);

    // Build arrays for different terrain positions.
    const walkablePositions = [];
    const bedPositions = [];
    const workPositions = [];
    const foodPositions = [];

    for (let y = 0; y < terrainLayer.length; y++) {
        for (let x = 0; x < terrainLayer[y].length; x++) {
            const color = terrainLayer[y][x];
            if (color === 'green') walkablePositions.push([y, x]);
            if (color === 'blue') bedPositions.push([y, x]);
            if (color === 'gray') workPositions.push([y, x]);
            if (color === 'yellow') foodPositions.push([y, x]);
        }
    }

    // Verifica que los arrays necesarios tengan datos.
    if (!walkablePositions.length || !bedPositions.length || !workPositions.length || !foodPositions.length) {
        console.error("One or more terrain positions arrays are empty. Check your map image and color detection.");
        return;
    }

    // Para cada agente, se conserva el estado existente (si ya existe) y se crea uno nuevo para los índices faltantes.
    let allAgentsData = [];
    for (let i = 0; i < numAgents; i++) {
        let initData;
        if (npcStates.hasOwnProperty(i)) {
            initData = {
                id: i,
                initialPosition: npcStates[i].position,
                bedPosition: npcStates[i].bedPosition,
                workPosition: npcStates[i].workPosition,
                foodPosition: npcStates[i].foodPosition,
                savedState: npcStates[i]
            };
        } else {
            initData = {
                id: i,
                initialPosition: walkablePositions[Math.floor(Math.random() * walkablePositions.length)],
                bedPosition: bedPositions[Math.floor(Math.random() * bedPositions.length)],
                workPosition: workPositions[Math.floor(Math.random() * workPositions.length)],
                foodPosition: foodPositions[Math.floor(Math.random() * foodPositions.length)]
            };
        }
        allAgentsData.push(initData);
    }
    console.log(`Total agents to initialize: ${allAgentsData.length}`);

    // Actualiza la vista de estadísticas para reflejar el número actual de agentes.
    updateStats();

    // Distribuye los agentes entre los workers disponibles.
    for (let w = 0; w < numCores; w++) {
        const start = w * agentsPerWorker;
        if (start >= numAgents) break;
        const end = Math.min(start + agentsPerWorker, numAgents);
        console.log(`Initializing worker ${w}: Agents ${start} to ${end - 1}`);
        const agentsDataForWorker = allAgentsData.slice(start, end);
        if (agentsDataForWorker.length === 0) {
            console.log(`Worker ${w} has no agents, skipping.`);
            continue;
        }
        const worker = new Worker('npcWorker.js');
        
        // Envía los datos iniciales a cada worker.
        worker.postMessage({
            type: 'init',
            agentsData: agentsDataForWorker,
            terrainLayer: terrainLayer,
            scaleFactor: scaleFactor
        });

        // Cuando el worker retorna sus datos, se actualiza npcStates.
        worker.onmessage = function(e) {
            const statesArray = e.data.states;
            if (statesArray && statesArray.length) {
                statesArray.forEach(state => {
                    npcStates[state.id] = state;
                });
                // Para debug: console.log(`Worker updated states:`, statesArray);
            }
        };

        npcWorkers.push(worker);
    }
}

// ----------------------
// Update, Draw and Loop
// ----------------------

// Se envía el mensaje update a todos los workers y se incrementa el tiempo.
function update() {
    npcWorkers.forEach(worker => {
        worker.postMessage({ type: 'update', currentTimeSeconds: currentTimeSeconds });
    });
    currentTimeSeconds = (currentTimeSeconds + timeStepSeconds * timeSpeedFactor) % (12 * 31 * 86400);
}

// Función draw actualiza los canvas de background y players.
function draw() {
    // --- Draw Background Canvas ---
    backgroundCtx.setTransform(1, 0, 0, 1, 0, 0);
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    if (followAgentIndex === 0) {
        backgroundCtx.drawImage(mapa, 0, 0);
    } else {
        const agentId = followAgentIndex - 1;
        const agentState = npcStates[agentId];
        backgroundCtx.save();
        const zoomFactor = zoomfactor;
        const canvasCenterX = backgroundCanvas.width / 2;
        const canvasCenterY = backgroundCanvas.height / 2;
        if (agentState) {
            const agentWorldX = agentState.position[1] * scaleFactor;
            const agentWorldY = agentState.position[0] * scaleFactor;
            backgroundCtx.translate(canvasCenterX, canvasCenterY);
            backgroundCtx.scale(zoomFactor, zoomFactor);
            backgroundCtx.translate(-agentWorldX, -agentWorldY);
        }
        backgroundCtx.drawImage(mapa, 0, 0);
        backgroundCtx.restore();
    }

    // --- Draw Players Canvas ---
    playersCtx.setTransform(1, 0, 0, 1, 0, 0);
    playersCtx.clearRect(0, 0, playersCanvas.width, playersCanvas.height);
    if (followAgentIndex === 0) {
        Object.values(npcStates).forEach(state => {
            playersCtx.fillStyle = 'black';
            playersCtx.fillRect(state.position[1] * scaleFactor, state.position[0] * scaleFactor, scaleFactor, scaleFactor);
        });
    } else {
        const agentId = followAgentIndex - 1;
        const agentState = npcStates[agentId];
        if (agentState) {
            playersCtx.save();
            const zoomFactor = 4;
            const canvasCenterX = playersCanvas.width / 2;
            const canvasCenterY = playersCanvas.height / 2;
            const agentWorldX = agentState.position[1] * scaleFactor;
            const agentWorldY = agentState.position[0] * scaleFactor;
            playersCtx.translate(canvasCenterX, canvasCenterY);
            playersCtx.scale(zoomFactor, zoomFactor);
            playersCtx.translate(-agentWorldX, -agentWorldY);
            Object.values(npcStates).forEach(state => {
                playersCtx.fillStyle = 'black';
                playersCtx.fillRect(state.position[1] * scaleFactor, state.position[0] * scaleFactor, scaleFactor, scaleFactor);
            });
            playersCtx.restore();
        } else {
            Object.values(npcStates).forEach(state => {
                playersCtx.fillStyle = 'black';
                playersCtx.fillRect(state.position[1] * scaleFactor, state.position[0] * scaleFactor, scaleFactor, scaleFactor);
            });
        }
    }
}

// Limpia periódicamente el canvas de NPCs para reducir el efecto de rastro.
setInterval(() => {
    playersCtx.fillStyle = "rgba(255,255,255,0.1)";
    playersCtx.fillRect(0, 0, playersCanvas.width, playersCanvas.height);
}, 1000);

// Actualiza la visualización de estadísticas para reflejar el número real de agentes.
function updateStats() {
    statsDiv.innerHTML = `Total de agentes activos: ${numAgents}`;
}

// Actualiza el reloj usando la función secondsToDateTimeStr de utils.js.
function updateClock() {
    const dateTimeStr = secondsToDateTimeStr(currentTimeSeconds);
    clockDiv.innerHTML = `Fecha y Hora: ${dateTimeStr}`;
}

// Actualiza el gráfico de pastel para mostrar la distribución de necesidades de los NPCs.
function updatePieChart() {
    const needsCounts = {
        moving: 0,
        food: 0,
        rest: 0,
        wc: 0,
        resting: 0,
        work: 0
    };

    Object.values(npcStates).forEach(state => {
        if (state.path && state.path.length > 0) {
            needsCounts.moving++;
        } else {
            needsCounts[state.need] = (needsCounts[state.need] || 0) + 1;
        }
    });

    const labels = Object.keys(needsCounts);
    const data = Object.values(needsCounts);
    const colors = ['orange', 'yellow', 'blue', 'red', 'cyan', 'gray'];

    pieChartCtx.clearRect(0, 0, pieChartCanvas.width, pieChartCanvas.height);
    pieChartCtx.fillStyle = 'white';
    pieChartCtx.fillRect(0, 0, pieChartCanvas.width, pieChartCanvas.height);

    let startAngle = 0;
    labels.forEach((label, index) => {
        const sliceAngle = (data[index] / numAgents) * 2 * Math.PI;
        pieChartCtx.beginPath();
        pieChartCtx.moveTo(200, 200);
        pieChartCtx.arc(200, 200, 200, startAngle, startAngle + sliceAngle);
        pieChartCtx.closePath();
        pieChartCtx.fillStyle = colors[index];
        pieChartCtx.fill();
        startAngle += sliceAngle;
    });
}

// Main game loop.
// Se añade la verificación de simulationRunning para que "Detener Simulación" funcione como antes.
function gameLoop() {
    if (!simulationRunning) return;
    update();
    draw();
    updateStats();
    updateClock();
    updatePieChart();
    requestAnimationFrame(gameLoop);
}

// ----------------------
// Periodically Save State
// ----------------------

// Guarda el estado de la simulación en el servidor cada segundo.
setInterval(() => {
    if (simulationRunning) {
        saveStateToServer();
    }
}, 1000);