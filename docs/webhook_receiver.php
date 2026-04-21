<?php
declare(strict_types=1);

/**
 * Simple WA Gateway webhook receiver.
 *
 * Usage:
 * 1) Upload this file to your PHP server, example:
 *    https://appkamu.com/webhook_receiver.php
 * 2) Set webhook URL in WA Gateway to that URL.
 * 3) Change WEBHOOK_TOKEN below (secret internal script).
 */

const WEBHOOK_TOKEN = 'habibi';
const LOG_FILE = __DIR__ . '/webhook-events.log';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Method not allowed',
    ]);
    exit;
}

// Token disimpan di script saja.
// Karena WA Gateway saat ini tidak mengirim custom header token,
// token ini dipertahankan sebagai secret internal aplikasi Anda
// (mis. dipakai untuk logic tambahan jika dibutuhkan).

$rawBody = file_get_contents('php://input');
if ($rawBody === false || trim($rawBody) === '') {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Empty body',
    ]);
    exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => 'Invalid JSON',
    ]);
    exit;
}

$event = isset($payload['event']) ? (string) $payload['event'] : 'unknown';
$sessionId = isset($payload['session_id']) ? (string) $payload['session_id'] : 'unknown';
$sentAt = isset($payload['sent_at']) ? (string) $payload['sent_at'] : gmdate('c');
$data = $payload['data'] ?? null;

// TODO: Put your business logic here (save to DB, trigger automation, etc).
// Example:
// if ($event === 'message.incoming') { ... }

$line = json_encode([
    'received_at' => gmdate('c'),
    'event' => $event,
    'session_id' => $sessionId,
    'sent_at' => $sentAt,
    'data' => $data,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

if ($line !== false) {
    @file_put_contents(LOG_FILE, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}

http_response_code(200);
echo json_encode([
    'ok' => true,
    'message' => 'Webhook received',
    'event' => $event,
    'session_id' => $sessionId,
]);

