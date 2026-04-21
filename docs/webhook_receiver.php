<?php
declare(strict_types=1);

/**
 * Minimal webhook receiver for WA Gateway.
 *
 * - Accepts POST JSON
 * - Extracts simple fields: device, sender, name, message, url, filename
 * - Optional auto reply by keyword
 * - Appends each event as JSON line to webhook-events.log
 */

const LOG_FILE = __DIR__ . '/webhook-events.log';
const AUTO_REPLY_ENABLED = true;
const AUTO_REPLY_FALLBACK = 'Halo, pesan Anda sudah kami terima.';
const WA_API_SEND_URL = 'http://127.0.0.1:3000/api/send';
const WA_API_BEARER_TOKEN = '';
const WA_API_USER_KEY = '';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['ok' => true, 'message' => 'webhook receiver active']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'empty body']);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid json']);
    exit;
}

$event = asString($payload['event'] ?? null) ?? 'unknown';
$sessionId = asString($payload['session_id'] ?? null) ?? 'unknown';
$data = is_array($payload['data'] ?? null) ? $payload['data'] : [];

$summary0 = (isset($data['summary'][0]) && is_array($data['summary'][0])) ? $data['summary'][0] : [];
$message0 = (isset($data['messages'][0]) && is_array($data['messages'][0])) ? $data['messages'][0] : [];

$device = asString($payload['device'] ?? null)
    ?? asString($data['device'] ?? null)
    ?? ($sessionId !== 'unknown' ? $sessionId : null);

$sender = asString($payload['sender'] ?? null)
    ?? asString($data['sender'] ?? null)
    ?? asString($data['number'] ?? null)
    ?? asString($summary0['chat_jid'] ?? null)
    ?? asString($message0['participant'] ?? null)
    ?? asString($message0['remoteJid'] ?? null);

$name = asString($payload['name'] ?? null)
    ?? asString($data['name'] ?? null)
    ?? asString($message0['pushName'] ?? null)
    ?? '';

$message = asString($payload['message'] ?? null)
    ?? asString($data['message'] ?? null)
    ?? asString($data['text'] ?? null)
    ?? asString($summary0['text'] ?? null)
    ?? asString($message0['text'] ?? null)
    ?? '';

$url = asString($payload['url'] ?? null)
    ?? asString($data['url'] ?? null)
    ?? asString($message0['url'] ?? null)
    ?? '';

$filename = asString($payload['filename'] ?? null)
    ?? asString($data['filename'] ?? null)
    ?? asString($message0['filename'] ?? null)
    ?? '';

$log = [
    'received_at' => gmdate('c'),
    'event' => $event,
    'session_id' => $sessionId,
    'device' => $device,
    'sender' => $sender,
    'name' => $name,
    'message' => $message,
    'url' => $url,
    'filename' => $filename,
    'auto_reply' => null,
    'auto_reply_result' => null,
    'raw' => $payload,
];

if (AUTO_REPLY_ENABLED && $event === 'message.incoming' && $sender !== null && $sender !== '') {
    $replyText = matchAutoReply($message);
    $send = sendAutoReply($device, $sender, $replyText);
    $log['auto_reply'] = $replyText;
    $log['auto_reply_result'] = $send;
}

$line = json_encode($log, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($line !== false) {
    @file_put_contents(LOG_FILE, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}

echo json_encode([
    'ok' => true,
    'event' => $event,
    'device' => $device,
    'sender' => $sender,
    'name' => $name,
    'message' => $message,
    'url' => $url,
    'filename' => $filename,
]);

function asString(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $v = trim($value);
    return $v === '' ? null : $v;
}

function matchAutoReply(string $message): string
{
    $text = strtolower(trim($message));
    if ($text === '') {
        return AUTO_REPLY_FALLBACK;
    }
    if (str_contains($text, 'harga')) {
        return 'Untuk info harga, silakan kirim nama produk yang ingin ditanyakan.';
    }
    if (str_contains($text, 'jam buka') || str_contains($text, 'open')) {
        return 'Jam operasional kami: Senin - Sabtu, 09:00 - 17:00.';
    }
    if ($text === 'hai' || $text === 'halo') {
        return 'Halo, ada yang bisa kami bantu?';
    }
    return AUTO_REPLY_FALLBACK;
}

function sendAutoReply(?string $sessionId, string $number, string $replyText): array
{
    if (WA_API_SEND_URL === '') {
        return ['ok' => false, 'error' => 'WA_API_SEND_URL kosong'];
    }
    if ($sessionId === null || $sessionId === '') {
        return ['ok' => false, 'error' => 'device/session_id tidak ditemukan'];
    }

    $body = json_encode([
        'session_id' => $sessionId,
        'number' => normalizeNumber($number),
        'message' => $replyText,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if ($body === false) {
        return ['ok' => false, 'error' => 'gagal encode json'];
    }

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
    ];
    if (WA_API_BEARER_TOKEN !== '') {
        $headers[] = 'Authorization: Bearer ' . WA_API_BEARER_TOKEN;
    }
    if (WA_API_USER_KEY !== '') {
        $headers[] = 'x-api-key: ' . WA_API_USER_KEY;
    }

    $ch = curl_init(WA_API_SEND_URL);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        return ['ok' => false, 'error' => 'curl: ' . $err];
    }
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'ok' => $code >= 200 && $code < 300,
        'http_code' => $code,
        'raw' => $raw,
    ];
}

function normalizeNumber(string $sender): string
{
    $left = explode(':', $sender)[0] ?? '';
    $jid = explode('@', $left)[0] ?? '';
    return preg_replace('/\D+/', '', $jid) ?? '';
}
