<?php
header("Content-Type: application/json");

// Define the JSON file that will store our state.
$dataFile = "npc_state.json";

// Determine the request method.
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // Read the incoming JSON from the request body.
    $inputData = file_get_contents("php://input");
    $npcData = json_decode($inputData, true);
    
    if ($npcData === null) {
        echo json_encode([
            "status" => "error",
            "message" => "Invalid JSON"
        ]);
        exit;
    }
    
    // Save the data to the file in a pretty JSON format.
    if (file_put_contents($dataFile, json_encode($npcData, JSON_PRETTY_PRINT))) {
        echo json_encode([
            "status" => "success",
            "message" => "Data saved successfully."
        ]);
    } else {
        echo json_encode([
            "status" => "error",
            "message" => "Could not write to file."
        ]);
    }
    
} elseif ($method === 'GET') {
    // Read and return the saved JSON data.
    if (file_exists($dataFile)) {
        $jsonData = file_get_contents($dataFile);
        echo $jsonData;
    } else {
        echo json_encode([
            "status" => "error",
            "message" => "No data found."
        ]);
    }
} else {
    // Method not allowed.
    echo json_encode([
        "status" => "error",
        "message" => "Method not allowed."
    ]);
}
?>

