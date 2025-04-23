class Persona {
    constructor(id, initialPosition, bedPosition, workPosition, foodPosition) {
        this.id = id;
        this.position = initialPosition;
        this.bedPosition = bedPosition;
        this.workPosition = workPosition;
        this.foodPosition = foodPosition;
        this.need = this.getRandomNeed();
        this.path = [];
        this.target = null;
        this.wcTimer = 0;
        this.previousNeed = null;
    }

    getRandomNeed() {
        const needs = ["food", "rest", "wc", "resting", "work"];
        return needs[Math.floor(Math.random() * needs.length)];
    }

    updateNeed(currentHour, dayOfWeek) {
        if ((currentHour >= 22 || currentHour < 8)) {
            this.need = "rest";
        } else if (currentHour >= 8 && currentHour < 9) {
            this.need = "food";
        } else if (currentHour >= 9 && currentHour < 13) {
            this.need = dayOfWeek === "Saturday" || dayOfWeek === "Sunday" ? "resting" : "work";
        } else if (currentHour >= 13 && currentHour < 14) {
            this.need = "food";
        } else if (currentHour >= 14 && currentHour < 20) {
            this.need = "resting";
        } else if (currentHour >= 20 && currentHour < 21) {
            this.need = "food";
        } else if (currentHour >= 21 && currentHour < 22) {
            this.need = "resting";
        }

        if (Math.random() < 0.05 && this.need !== "rest") {
            this.need = "wc";
        }
    }

    move(terrainLayer, scaleFactor) {
        if (this.wcTimer > 0) {
            this.wcTimer -= 1;
            if (this.wcTimer <= 0) {
                this.need = this.previousNeed;
            }
            return;
        }

        // Determinar el objetivo basado en la necesidad actual
        if (this.need === "rest") {
            this.target = this.bedPosition;
        } else if (this.need === "work") {
            this.target = this.workPosition;
        } else if (this.need === "food") {
            this.target = this.foodPosition;
        } else if (this.need === "wc") {
            // Encontrar el WC más cercano
            const wcPositions = [];
            for (let y = 0; y < terrainLayer.length; y++) {
                for (let x = 0; x < terrainLayer[y].length; x++) {
                    if (terrainLayer[y][x] === 'red') {
                        wcPositions.push([y, x]);
                    }
                }
            }
            if (wcPositions.length > 0) {
                wcPositions.sort((a, b) => heuristic(this.position, a) - heuristic(this.position, b));
                this.target = wcPositions[0];
            }
        } else {
            // Resting
            const restingPositions = [];
            for (let y = 0; y < terrainLayer.length; y++) {
                for (let x = 0; x < terrainLayer[y].length; x++) {
                    if (terrainLayer[y][x] === 'cyan' || terrainLayer[y][x] === 'dark_green') {
                        restingPositions.push([y, x]);
                    }
                }
            }
            if (restingPositions.length > 0) {
                restingPositions.sort((a, b) => heuristic(this.position, a) - heuristic(this.position, b));
                this.target = restingPositions[0];
            }
        }

        if (this.path.length === 0 || !this.target) {
            this.path = aStar(terrainLayer, this.position, this.target, scaleFactor);
        }

        if (this.path.length > 0) {
            this.position = this.path.shift();
        }

        if (this.need === "wc" && this.position === this.target) {
            this.wcTimer = 60;
            this.previousNeed = this.need;
        }
    }
}

