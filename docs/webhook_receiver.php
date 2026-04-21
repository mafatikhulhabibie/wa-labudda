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
const WA_GATEWAY_SEND_URL = ''; // Contoh: https://gatewaykamu.com/api/send-message
const WA_GATEWAY_API_KEY = ''; // Kosongkan jika tidak dibutuhkan.

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
$incomingMessage = null;
$sender = null;
$autoReply = null;
$sendAttempted = false;
$sendSuccess = null;
$sendResponse = null;
$notification = 'Webhook received';

// Ambil teks pesan dari beberapa kemungkinan struktur payload.
if (is_array($data)) {
    if (isset($data['message']) && is_string($data['message'])) {
        $incomingMessage = $data['message'];
    } elseif (isset($data['text']) && is_string($data['text'])) {
        $incomingMessage = $data['text'];
    } elseif (isset($data['body']) && is_string($data['body'])) {
        $incomingMessage = $data['body'];
    }

    // Ambil pengirim dari beberapa kemungkinan field payload.
    if (isset($data['from']) && is_string($data['from'])) {
        $sender = $data['from'];
    } elseif (isset($data['sender']) && is_string($data['sender'])) {
        $sender = $data['sender'];
    } elseif (isset($data['phone']) && is_string($data['phone'])) {
        $sender = $data['phone'];
    } elseif (isset($data['number']) && is_string($data['number'])) {
        $sender = $data['number'];
    } elseif (isset($data['remote_jid']) && is_string($data['remote_jid'])) {
        $sender = $data['remote_jid'];
    } elseif (isset($data['chat_id']) && is_string($data['chat_id'])) {
        $sender = $data['chat_id'];
    }
}

// Contoh tanya jawab sederhana: "hai" => "halo".
if ($incomingMessage !== null) {
    $normalized = strtolower(trim($incomingMessage));
    if ($normalized === 'hai') {
        $autoReply = 'halo';
    }
}

// Jika ada auto-reply, kirim ke endpoint WA Gateway.
if ($autoReply !== null) {
    $sendAttempted = true;
    $sendResult = sendWaMessage($sessionId, $sender, $autoReply);
    $sendSuccess = $sendResult['ok'];
    $sendResponse = $sendResult;
}

// Event test dari WA Gateway: tampilkan notifikasi sukses yang jelas.
if (stripos($event, 'test') !== false) {
    $notification = 'Webhook test berhasil';
}

$line = json_encode([
    'received_at' => gmdate('c'),
    'event' => $event,
    'session_id' => $sessionId,
    'sent_at' => $sentAt,
    'sender' => $sender,
    'incoming_message' => $incomingMessage,
    'auto_reply' => $autoReply,
    'send_attempted' => $sendAttempted,
    'send_success' => $sendSuccess,
    'send_response' => $sendResponse,
    'notification' => $notification,
    'data' => $data,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

if ($line !== false) {
    @file_put_contents(LOG_FILE, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}

http_response_code(200);
echo json_encode([
    'ok' => true,
    'message' => $notification,
    'event' => $event,
    'session_id' => $sessionId,
    'sender' => $sender,
    'incoming_message' => $incomingMessage,
    'auto_reply' => $autoReply,
    'send_attempted' => $sendAttempted,
    'send_success' => $sendSuccess,
    'send_response' => $sendResponse,
    'notification' => $notification,
]);

/**
 * Kirim pesan ke WA Gateway.
 *
 * Catatan: isi WA_GATEWAY_SEND_URL sesuai endpoint kirim pesan provider Anda.
 */
function sendWaMessage(string $sessionId, ?string $to, string $message): array
{
    if (WA_GATEWAY_SEND_URL === '') {
        return [
            'ok' => false,
            'error' => 'WA_GATEWAY_SEND_URL belum diisi',
        ];
    }

    if ($to === null || trim($to) === '') {
        return [
            'ok' => false,
            'error' => 'Nomor tujuan/pengirim tidak ditemukan di payload',
        ];
    }

    $body = [
        'session_id' => $sessionId,
        'to' => $to,
        'message' => $message,
    ];

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
    ];
    if (WA_GATEWAY_API_KEY !== '') {
        $headers[] = 'Authorization: Bearer ' . WA_GATEWAY_API_KEY;
    }

    $ch = curl_init(WA_GATEWAY_SEND_URL);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    $result = curl_exec($ch);
    if ($result === false) {
        $error = curl_error($ch);
        curl_close($ch);
        return [
            'ok' => false,
            'error' => 'cURL error: ' . $error,
        ];
    }

    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'ok' => $httpCode >= 200 && $httpCode < 300,
        'http_code' => $httpCode,
        'raw_response' => $result,
    ];
}
