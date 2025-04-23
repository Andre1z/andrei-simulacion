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

// Global variables for state management and NPC workers
let savedStateFromServer = null;
let npcWorkers = [];
let npcStates = {};

// Global variable to store the agent to follow (0 means no follow)
let followAgentIndex = 0;
let zoomfactor = 4;

// Listen for changes in the input element.
document.getElementById('agentSelector').addEventListener('input', (e) => {
    followAgentIndex = parseInt(e.target.value);
});
document.getElementById('zoomfactor').onchange = function(e){
	zoomfactor = parseInt(e.target.value);
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

// Save state to the server (POST request)
function saveStateToServer() {
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
        .then(response => response.json())
        .then(function(data) {
            // Uncomment to log successful save
            // console.log('Saved state:', data);
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
    // Determine number of workers based on available cores (with a fallback value).
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

    // Check that the required position arrays have data.
    if (!walkablePositions.length || !bedPositions.length || !workPositions.length || !foodPositions.length) {
        console.error("One or more terrain positions arrays are empty. Check your map image and color detection.");
        return;
    }

    npcWorkers = [];
    // Use saved state if available.
    const savedStates = (savedStateFromServer && savedStateFromServer.npcStates) ? savedStateFromServer.npcStates : {};
    npcStates = savedStates ? savedStates : {};

    // Build a complete list of agent initialization data.
    let allAgentsData = [];
    for (let i = 0; i < numAgents; i++) {
        let initData;
        if (savedStates && savedStates[i]) {
            const savedAgent = savedStates[i];
            initData = {
                id: i,
                initialPosition: savedAgent.position,
                bedPosition: savedAgent.bedPosition || bedPositions[Math.floor(Math.random() * bedPositions.length)],
                workPosition: savedAgent.workPosition || workPositions[Math.floor(Math.random() * workPositions.length)],
                foodPosition: savedAgent.foodPosition || foodPositions[Math.floor(Math.random() * foodPositions.length)],
                savedState: savedAgent
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

    // Partition the agents among the available workers.
    for (let w = 0; w < numCores; w++) {
        const start = w * agentsPerWorker;
        if (start >= numAgents) break; // Only create a worker if there are agents to process.
        const end = Math.min(start + agentsPerWorker, numAgents);
        console.log(`Initializing worker ${w}: Agents ${start} to ${end - 1}`);
        const agentsDataForWorker = allAgentsData.slice(start, end);
        if (agentsDataForWorker.length === 0) {
            console.log(`Worker ${w} has no agents, skipping.`);
            continue;
        }
        const worker = new Worker('npcWorker.js');
        
        // Send initial data to each worker.
        worker.postMessage({
            type: 'init',
            agentsData: agentsDataForWorker,
            terrainLayer: terrainLayer,
            scaleFactor: scaleFactor
        });

        // Update the global npcStates when a worker returns its data.
        worker.onmessage = function(e) {
            const statesArray = e.data.states;
            if (statesArray && statesArray.length) {
                statesArray.forEach(state => {
                    npcStates[state.id] = state;
                });
                // Debug log to check received states.
                //console.log(`Worker updated states:`, statesArray);
            }
        };

        npcWorkers.push(worker);
    }
}

// ----------------------
// Update, Draw and Loop
// ----------------------

// Broadcast update message to all workers.
function update() {
    npcWorkers.forEach(worker => {
        worker.postMessage({ type: 'update', currentTimeSeconds: currentTimeSeconds });
    });
    currentTimeSeconds = (currentTimeSeconds + timeStepSeconds) % (12 * 31 * 86400);
}

// Draw function updates both background and players canvases.
function draw() {
    // --- Draw Background Canvas ---
    backgroundCtx.setTransform(1, 0, 0, 1, 0, 0);
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);

    if (followAgentIndex === 0) {
        // No following; draw map normally.
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
            // Fallback to normal drawing if the selected agent is not found.
            Object.values(npcStates).forEach(state => {
                playersCtx.fillStyle = 'black';
                playersCtx.fillRect(state.position[1] * scaleFactor, state.position[0] * scaleFactor, scaleFactor, scaleFactor);
            });
        }
    }
}

// Clear the NPC canvas periodically to reduce trail buildup.
setInterval(() => {
    playersCtx.fillStyle = "rgba(255,255,255,0.1)";
    playersCtx.fillRect(0, 0, playersCanvas.width, playersCanvas.height);
}, 1000);

// Update statistics display.
function updateStats() {
    let statsHTML = '';
    Object.values(npcStates).forEach(state => {
        statsHTML += `Agente ${state.id}: Pos (${state.position[1]},${state.position[0]}), Necesidad: ${state.need}<br>`;
    });
    statsDiv.innerHTML = statsHTML;
}

// Update clock display using the secondsToDateTimeStr function from utils.js.
function updateClock() {
    const dateTimeStr = secondsToDateTimeStr(currentTimeSeconds);
    clockDiv.innerHTML = `Fecha y Hora: ${dateTimeStr}`;
}

// Update pie chart displaying the distribution of NPC needs.
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
function gameLoop() {
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

// Save the simulation state to the server every second.
setInterval(saveStateToServer, 1000);

