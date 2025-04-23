function heuristic(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function aStar(terrainLayer, start, goal, scaleFactor) {
    const openList = [];
    const cameFrom = {};
    const gScore = { [start.join(',')]: 0 };
    const fScore = { [start.join(',')]: heuristic(start, goal) };
    const directions = [
        [0, scaleFactor],
        [0, -scaleFactor],
        [scaleFactor, 0],
        [-scaleFactor, 0]
    ];

    openList.push([fScore[start.join(',')], start]);

    while (openList.length > 0) {
        openList.sort((a, b) => a[0] - b[0]);
        let [, current] = openList.shift();

        if (current[0] === goal[0] && current[1] === goal[1]) {
            const path = [];
            while (cameFrom[current.join(',')]) {
                path.push(current);
                current = cameFrom[current.join(',')].split(',').map(Number);
            }
            return path.reverse();
        }

        for (const direction of directions) {
            const neighbor = [current[0] + direction[0], current[1] + direction[1]];
            if (neighbor[0] >= 0 && neighbor[0] < terrainLayer.length && neighbor[1] >= 0 && neighbor[1] < terrainLayer[0].length) {
                const currentColor = terrainLayer[neighbor[0]][neighbor[1]];
                if (currentColor === 'green' || currentColor === 'yellow' || currentColor === 'blue' || currentColor === 'red' || currentColor === 'cyan' || currentColor === 'gray' || currentColor === 'dark_green') {
                    const tentativeGScore = gScore[current.join(',')] + 1;
                    const neighborKey = neighbor.join(',');
                    if (!(neighborKey in gScore) || tentativeGScore < gScore[neighborKey]) {
                        cameFrom[neighborKey] = current.join(',');
                        gScore[neighborKey] = tentativeGScore;
                        fScore[neighborKey] = tentativeGScore + heuristic(neighbor, goal);
                        openList.push([fScore[neighborKey], neighbor]);
                    }
                }
            }
        }
    }
    return [];
}
function secondsToDateTimeStr(seconds) {
    const days = Math.floor(seconds / 86400);
    const years = 2025 + Math.floor(days / (12 * 31));
    const months = Math.floor((days / 31) % 12) + 1;
    const dayOfMonth = (days % 31) + 1;
    const dayOfWeek = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"][days % 7];
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${years}:${months.toString().padStart(2, '0')}:${dayOfMonth.toString().padStart(2, '0')}:${dayOfWeek}:${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
