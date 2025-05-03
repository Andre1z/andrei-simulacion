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
const numAgents = 100;
let currentTimeSeconds = 0;
const timeStepSeconds = 20;
let terrainLayer = [];

let savedStateFromServer = null;
let npcWorkers = [];
let npcStates = {};

let followAgentIndex = 0;
let zoomfactor = 4;

let simulationRunning = true;

// Listen for input changes
document.getElementById('agentSelector').addEventListener('input', (e) => {
    followAgentIndex = parseInt(e.target.value);
});
document.getElementById('zoomfactor').onchange = function(e){
    zoomfactor = parseInt(e.target.value);
}

// Stop and resume button listeners
document.getElementById('stopSimulation').addEventListener('click', () => {
    simulationRunning = false;
});
document.getElementById('resumeSimulation').addEventListener('click', () => {
    simulationRunning = true;
    requestAnimationFrame(gameLoop);
});

const mapa = new Image();
mapa.src = "casas.png";

function loadStateFromServer() {
    return fetch('npc_endpoint.php')
        .then(response => response.json())
        .then(data => {
            if (data.npcStates && data.currentTimeSeconds !== undefined) {
                savedStateFromServer = data;
                npcStates = data.npcStates;
                currentTimeSeconds = data.currentTimeSeconds;
                console.log('Loaded state from server:', data);
            } else {
                console.log('No saved state on server; starting fresh.');
            }
        })
        .catch(error => {
            console.error('Error loading state:', error);
        });
}

function saveStateToServer() {
    const stateToSave = {
        currentTimeSeconds: currentTimeSeconds,
        npcStates: npcStates
    };
    fetch('npc_endpoint.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stateToSave)
    })
    .then(response => response.json())
    .catch(error => console.error('Error saving state:', error));
}

mapa.onload = function() {
    backgroundCanvas.width = mapa.width;
    backgroundCanvas.height = mapa.height;
    playersCanvas.width = mapa.width;
    playersCanvas.height = mapa.height;

    backgroundCtx.drawImage(mapa, 0, 0);

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

    loadStateFromServer().then(() => {
        initializeAgents();
        gameLoop();
    });
};

function initializeAgents() {
    const numCores = navigator.hardwareConcurrency || 4;
    const agentsPerWorker = Math.ceil(numAgents / numCores);

    const walkablePositions = [], bedPositions = [], workPositions = [], foodPositions = [];

    for (let y = 0; y < terrainLayer.length; y++) {
        for (let x = 0; x < terrainLayer[y].length; x++) {
            const color = terrainLayer[y][x];
            if (color === 'green') walkablePositions.push([y, x]);
            if (color === 'blue') bedPositions.push([y, x]);
            if (color === 'gray') workPositions.push([y, x]);
            if (color === 'yellow') foodPositions.push([y, x]);
        }
    }

    if (!walkablePositions.length || !bedPositions.length || !workPositions.length || !foodPositions.length) {
        console.error("One or more terrain positions arrays are empty.");
        return;
    }

    npcWorkers = [];
    const savedStates = savedStateFromServer?.npcStates || {};
    npcStates = savedStates;

    let allAgentsData = [];
    for (let i = 0; i < numAgents; i++) {
        let savedAgent = savedStates[i];
        allAgentsData.push({
            id: i,
            initialPosition: savedAgent?.position || walkablePositions[Math.floor(Math.random() * walkablePositions.length)],
            bedPosition: savedAgent?.bedPosition || bedPositions[Math.floor(Math.random() * bedPositions.length)],
            workPosition: savedAgent?.workPosition || workPositions[Math.floor(Math.random() * workPositions.length)],
            foodPosition: savedAgent?.foodPosition || foodPositions[Math.floor(Math.random() * foodPositions.length)],
            savedState: savedAgent
        });
    }

    for (let w = 0; w < numCores; w++) {
        const start = w * agentsPerWorker;
        if (start >= numAgents) break;
        const end = Math.min(start + agentsPerWorker, numAgents);
        const worker = new Worker('npcWorker.js');
        const agentsDataForWorker = allAgentsData.slice(start, end);

        worker.postMessage({
            type: 'init',
            agentsData: agentsDataForWorker,
            terrainLayer,
            scaleFactor
        });

        worker.onmessage = (e) => {
            e.data.states?.forEach(state => {
                npcStates[state.id] = state;
            });
        };

        npcWorkers.push(worker);
    }
}

function update() {
    if (!simulationRunning) return;
    npcWorkers.forEach(worker => {
        worker.postMessage({ type: 'update', currentTimeSeconds });
    });
    currentTimeSeconds = (currentTimeSeconds + timeStepSeconds) % (12 * 31 * 86400);
}

function draw() {
    backgroundCtx.setTransform(1, 0, 0, 1, 0, 0);
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    if (followAgentIndex === 0) {
        backgroundCtx.drawImage(mapa, 0, 0);
    } else {
        const agentId = followAgentIndex - 1;
        const agentState = npcStates[agentId];
        backgroundCtx.save();
        const canvasCenterX = backgroundCanvas.width / 2;
        const canvasCenterY = backgroundCanvas.height / 2;
        if (agentState) {
            const agentWorldX = agentState.position[1] * scaleFactor;
            const agentWorldY = agentState.position[0] * scaleFactor;
            backgroundCtx.translate(canvasCenterX, canvasCenterY);
            backgroundCtx.scale(zoomfactor, zoomfactor);
            backgroundCtx.translate(-agentWorldX, -agentWorldY);
        }
        backgroundCtx.drawImage(mapa, 0, 0);
        backgroundCtx.restore();
    }

    playersCtx.setTransform(1, 0, 0, 1, 0, 0);
    playersCtx.clearRect(0, 0, playersCanvas.width, playersCanvas.height);

    if (followAgentIndex === 0) {
        Object.values(npcStates).forEach(state => {
            playersCtx.fillStyle = 'black';
            playersCtx.fillRect(state.position[1], state.position[0], 1, 1);
        });
    } else {
        const agentId = followAgentIndex - 1;
        const agentState = npcStates[agentId];
        if (agentState) {
            playersCtx.save();
            const canvasCenterX = playersCanvas.width / 2;
            const canvasCenterY = playersCanvas.height / 2;
            const agentWorldX = agentState.position[1] * scaleFactor;
            const agentWorldY = agentState.position[0] * scaleFactor;
            playersCtx.translate(canvasCenterX, canvasCenterY);
            playersCtx.scale(zoomfactor, zoomfactor);
            playersCtx.translate(-agentWorldX, -agentWorldY);
            Object.values(npcStates).forEach(state => {
                playersCtx.fillStyle = 'black';
                playersCtx.fillRect(state.position[1], state.position[0], 1, 1);
            });
            playersCtx.restore();
        }
    }
}

setInterval(() => {
    playersCtx.fillStyle = "rgba(255,255,255,0.1)";
    playersCtx.fillRect(0, 0, playersCanvas.width, playersCanvas.height);
}, 1000);

function updateStats() {
    let totalAgents = Object.keys(npcStates).length;
    statsDiv.innerHTML = `Total de agentes activos: ${totalAgents}`;
}

function updateClock() {
    const dateTimeStr = secondsToDateTimeStr(currentTimeSeconds);
    clockDiv.innerHTML = `Fecha y Hora: ${dateTimeStr}`;
}

function updatePieChart() {
    const needsCounts = { moving: 0, food: 0, rest: 0, wc: 0, resting: 0, work: 0 };
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

function gameLoop() {
    if (!simulationRunning) return;
    update();
    draw();
    updateStats();
    updateClock();
    updatePieChart();
    requestAnimationFrame(gameLoop);
}

setInterval(saveStateToServer, 1000);