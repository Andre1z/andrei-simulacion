// npcWorker.js - Handles NPC behavior in a separate thread

// Import Persona class
importScripts('Persona.js');
importScripts('utils.js');

// Store agents and terrain information
let agents = [];
let terrainLayer = [];
let scaleFactor = 1;

// Handle messages from the main thread
self.onmessage = function(e) {
    const message = e.data;
    
    switch(message.type) {
        case 'init':
            // Initialize agents and terrain
            terrainLayer = message.terrainLayer;
            scaleFactor = message.scaleFactor;
            initializeAgents(message.agentsData);
            break;
            
        case 'update':
            // Update all agents and send their states back
            updateAgents(message.currentTimeSeconds);
            break;
    }
};

// Initialize agents with the provided data
function initializeAgents(agentsData) {
    agents = [];
    
    agentsData.forEach(data => {
        let agent;
        
        if (data.savedState) {
            // Create agent with saved state
            agent = new Persona(
                data.id,
                data.initialPosition,
                data.bedPosition,
                data.workPosition,
                data.foodPosition
            );
            
            // Restore saved properties
            agent.position = data.savedState.position;
            agent.need = data.savedState.need;
            agent.path = data.savedState.path || [];
            agent.target = data.savedState.target;
            agent.wcTimer = data.savedState.wcTimer || 0;
            agent.previousNeed = data.savedState.previousNeed;
        } else {
            // Create new agent
            agent = new Persona(
                data.id,
                data.initialPosition,
                data.bedPosition,
                data.workPosition,
                data.foodPosition
            );
        }
        
        agents.push(agent);
    });
    
    // Send initial state back to main thread
    sendStates();
}

// Update all agents based on the current time
function updateAgents(currentTimeSeconds) {
    if (!agents.length) return;
    
    // Parse the time string to get day of week and hour
    const timeStr = secondsToDateTimeStr(currentTimeSeconds);
    const [year, month, day, dayOfWeek, hours, minutes, seconds] = timeStr.split(':');
    
    agents.forEach(agent => {
        // Update the agent's need based on time
        agent.updateNeed(parseInt(hours), dayOfWeek);
        
        // Move the agent
        agent.move(terrainLayer, scaleFactor);
    });
    
    // Send updated states back to main thread
    sendStates();
}

// Send agent states back to the main thread
function sendStates() {
    const states = agents.map(agent => ({
        id: agent.id,
        position: agent.position,
        need: agent.need,
        path: agent.path,
        target: agent.target,
        wcTimer: agent.wcTimer,
        previousNeed: agent.previousNeed,
        bedPosition: agent.bedPosition,
        workPosition: agent.workPosition,
        foodPosition: agent.foodPosition
    }));
    
    self.postMessage({ states: states });
}
