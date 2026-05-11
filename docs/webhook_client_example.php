<?php
declare(strict_types=1);

/**
 * Contoh webhook PHP untuk ditanam di URL client (hosting PHP terpisah).
 *
 * Alur:
 * 1) User chat "halo" ke WhatsApp device Anda
 * 2) WA Gateway POST JSON ke URL ini
 * 3) Script mendeteksi keyword, lalu kirim balasan "Hai" via POST /api/send
 *
 * Setup:
 * - Upload file ini ke hosting client, mis. https://client.com/wa-webhook.php
 * - Isi konstanta di bawah (URL gateway + x-api-key user)
 * - Di dashboard WA Gateway: Webhook device → isi URL di atas
 */

// === Konfigurasi (wajib diisi) =============================================
/** Base URL WA Gateway Anda (tanpa slash di akhir), contoh: https://wa.perusahaan.com */
const WA_GATEWAY_BASE = 'https://ganti-dengan-domain-anda.com';

/**
 * API key user (bukan device key). Generate dari admin / dashboard.
 * Header: x-api-key
 */
const WA_USER_API_KEY = 'wg_ganti_dengan_key_anda';

/**
 * Opsional: paksa balasan selalu dari session ini. Kosong = pakai session dari payload webhook.
 * Contoh: 'sales-01'
 */
const FORCE_SESSION_ID = '';

// === Aturan balasan (contoh: chat "halo" → jawab "Hai") ====================
/** Keyword pemicu (dibandingkan lowercase, trim) */
const TRIGGER_KEYWORD = 'halo';

/** Teks balasan yang dikirim ke WhatsApp */
const REPLY_TEXT = 'Hai';

// === Log (opsional) ========================================================
const LOG_FILE = __DIR__ . '/wa-webhook-client.log';

// ===========================================================================

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode([
        'ok' => true,
        'hint' => 'Webhook siap. Pasang URL ini di WA Gateway → Webhook device.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'empty body'], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid json'], JSON_UNESCAPED_UNICODE);
    exit;
}

$event = strval($payload['event'] ?? 'unknown');
$data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
$primary = (isset($data['primary']) && is_array($data['primary'])) ? $data['primary'] : [];
$summary0 = (isset($data['summary'][0]) && is_array($data['summary'][0])) ? $data['summary'][0] : [];
$message0 = (isset($data['messages'][0]) && is_array($data['messages'][0])) ? $data['messages'][0] : [];

$sessionFromPayload = strval($payload['session_id'] ?? '');
$device = strval($payload['device'] ?? '');
$sessionId = FORCE_SESSION_ID !== ''
    ? FORCE_SESSION_ID
    : ($device !== '' ? $device : ($sessionFromPayload !== '' ? $sessionFromPayload : ''));

[$fromLoopJid, $fromLoopText] = pickFirstIncomingFromMessages($data);

$sender = strval($payload['sender'] ?? '')
    ?: strval($primary['participant'] ?? $primary['remote_jid'] ?? '')
    ?: strval($data['sender'] ?? $data['number'] ?? '')
    ?: strval($summary0['chat_jid'] ?? '')
    ?: strval($message0['participant'] ?? $message0['remoteJid'] ?? '')
    ?: strval($fromLoopJid);

$incomingText = strval($payload['message'] ?? '')
    ?: strval($primary['text'] ?? '')
    ?: strval($data['message'] ?? $data['text'] ?? '')
    ?: strval($summary0['text'] ?? '')
    ?: strval($message0['text'] ?? '')
    ?: strval($fromLoopText);

$out = [
    'ok' => true,
    'event' => $event,
    'session_id' => $sessionId,
    'sender' => $sender,
    'incoming' => $incomingText,
    'replied' => false,
    'send_result' => null,
];

// Hanya proses pesan masuk + ada teks + ada session + ada penerima
if ($event !== 'message.incoming') {
    webhookLog($out);
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

$normalized = mb_strtolower(trim($incomingText), 'UTF-8');
$trigger = mb_strtolower(trim(TRIGGER_KEYWORD), 'UTF-8');
if ($trigger === '' || $normalized === '' || !str_contains($normalized, $trigger)) {
    webhookLog($out);
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($sessionId === '' || WA_USER_API_KEY === '' || WA_USER_API_KEY === 'wg_ganti_dengan_key_anda') {
    $out['ok'] = false;
    $out['error'] = 'FORCE_SESSION_ID atau WA_USER_API_KEY belum diisi';
    webhookLog($out);
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

$number = normalizeWaNumber($sender);
if ($number === '') {
    $out['ok'] = false;
    $out['error'] = 'tidak bisa ambil nomor dari sender';
    webhookLog($out);
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

$sendUrl = rtrim(WA_GATEWAY_BASE, '/') . '/api/send';
$body = json_encode([
    'session_id' => $sessionId,
    'number' => $number,
    'message' => REPLY_TEXT,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$ch = curl_init($sendUrl);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json',
        'x-api-key: ' . WA_USER_API_KEY,
    ],
    CURLOPT_POSTFIELDS => $body,
]);

$response = curl_exec($ch);
$errno = curl_errno($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$out['replied'] = true;
$out['reply_text'] = REPLY_TEXT;
$out['send_result'] = [
    'http_code' => $httpCode,
    'curl_errno' => $errno,
    'body' => $response !== false ? $response : null,
];
$out['ok'] = $errno === 0 && $httpCode >= 200 && $httpCode < 300;

webhookLog($out);
echo json_encode($out, JSON_UNESCAPED_UNICODE);

/**
 * @param array<string, mixed> $row
 */
function webhookLog(array $row): void
{
    $line = json_encode(['at' => gmdate('c')] + $row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line !== false) {
        @file_put_contents(LOG_FILE, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function normalizeWaNumber(string $sender): string
{
    $left = explode(':', $sender, 2)[0] ?? '';
    $beforeAt = explode('@', $left, 2)[0] ?? '';
    return preg_replace('/\D+/', '', $beforeAt) ?? '';
}

/**
 * Fallback jika gateway belum kirim `primary`: cari pesan pertama yang bukan fromMe.
 *
 * @return array{0: string, 1: string} [jid untuk reply target, teks]
 */
function pickFirstIncomingFromMessages(array $data): array
{
    $msgs = $data['messages'] ?? null;
    if (!is_array($msgs)) {
        return ['', ''];
    }
    foreach ($msgs as $m) {
        if (!is_array($m)) {
            continue;
        }
        if (!empty($m['fromMe'])) {
            continue;
        }
        $jid = strval($m['remoteJid'] ?? $m['remote_jid'] ?? '');
        if ($jid === '' || $jid === 'status@broadcast') {
            continue;
        }
        $participant = strval($m['participant'] ?? '');
        $target = $participant !== '' ? $participant : $jid;
        $text = strval($m['text'] ?? '');

        return [$target, $text];
    }

    return ['', ''];
}
