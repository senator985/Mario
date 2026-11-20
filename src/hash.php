<?php
// hash_generator.php

// Initialize variables to store the input string and hash results
$inputString = '';
$md5Hash = '';
$sha1Hash = '';
$sha256Hash = '';

// Check if the form has been submitted
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Sanitize the input string
    $inputString = htmlspecialchars($_POST['input_string'] ?? '');

    // Generate hashes if the input string is not empty
    if (!empty($inputString)) {
        $md5Hash = md5($inputString);
        $sha1Hash = sha1($inputString);
        $sha256Hash = hash('sha256', $inputString);
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hash Generator</title>
    <!-- Tailwind CSS CDN for basic styling -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            font-family: "Inter", sans-serif;
            background-color: #f0f4f8; /* Light blue-gray background */
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            width: 100%;
            text-align: center;
        }
        h1 {
            color: #2c3e50; /* Dark blue-gray */
            margin-bottom: 25px;
            font-weight: 700;
        }
        label {
            display: block;
            text-align: left;
            margin-bottom: 8px;
            color: #34495e; /* Medium blue-gray */
            font-weight: 600;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px;
            margin-bottom: 20px;
            border: 1px solid #cbd5e0; /* Light gray border */
            border-radius: 8px;
            font-size: 1rem;
            box-sizing: border-box;
            transition: border-color 0.3s ease;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: #3b82f6; /* Blue focus border */
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
        }
        button {
            background-color: #3b82f6; /* Blue button */
            color: white;
            padding: 12px 25px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1.1rem;
            font-weight: 600;
            transition: background-color 0.3s ease, transform 0.2s ease;
            box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);
        }
        button:hover {
            background-color: #2563eb; /* Darker blue on hover */
            transform: translateY(-2px);
        }
        .result-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0; /* Lighter gray border */
            text-align: left;
        }
        .hash-output {
            background-color: #f7fafc; /* Very light gray background for hash output */
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            word-break: break-all;
            font-family: 'Courier New', Courier, monospace;
            color: #2d3748; /* Darker text for hashes */
            border: 1px solid #e2e8f0;
        }
        .hash-output strong {
            display: block;
            margin-bottom: 5px;
            color: #4a5568; /* Slightly darker label for hash type */
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="text-3xl">Hash Generator</h1>

        <form method="POST" action="">
            <div class="mb-4">
                <label for="input_string">Enter String:</label>
                <input type="text" id="input_string" name="input_string" 
                       value="<?php echo htmlspecialchars($inputString); ?>" 
                       placeholder="Type your text here..." required
                       class="rounded-lg focus:ring-blue-500 focus:border-blue-500">
            </div>
            <button type="submit" class="rounded-lg">Generate Hashes</button>
        </form>

        <?php if (!empty($inputString)): ?>
            <div class="result-section">
                <h2 class="text-2xl font-semibold mb-4 text-gray-700">Generated Hashes:</h2>
                
                <div class="hash-output">
                    <strong>MD5 Hash:</strong>
                    <span><?php echo $md5Hash; ?></span>
                </div>

                <div class="hash-output">
                    <strong>SHA1 Hash:</strong>
                    <span><?php echo $sha1Hash; ?></span>
                </div>

                <div class="hash-output">
                    <strong>SHA256 Hash:</strong>
                    <span><?php echo $sha256Hash; ?></span>
                </div>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
