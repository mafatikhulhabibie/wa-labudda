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
const WA_GATEWAY_SEND_URL = 'https://api.fonnte.com/send';
const WA_GATEWAY_API_KEY = ''; // Isi dengan token device Fonnte Anda.

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'message' => 'Webhook aktif',
    ]);
    exit;
}
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
$replyBlockReason = null;
$device = isset($payload['device']) ? (string) $payload['device'] : null;

// Format utama Fonnte: field di root payload.
if (isset($payload['message']) && is_string($payload['message'])) {
    $incomingMessage = $payload['message'];
}
if (isset($payload['sender']) && is_string($payload['sender'])) {
    $sender = $payload['sender'];
}
if (isset($payload['device']) && is_string($payload['device']) && $sessionId === 'unknown') {
    $sessionId = $payload['device'];
}
if ($event === 'unknown' && isset($payload['type']) && is_string($payload['type'])) {
    $event = (string) $payload['type'];
}

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

    // Format payload lain: data.messages[0]
    if (isset($data['messages']) && is_array($data['messages']) && isset($data['messages'][0]) && is_array($data['messages'][0])) {
        $firstMessage = $data['messages'][0];

        if ($sender === null) {
            if (isset($firstMessage['remoteJid']) && is_string($firstMessage['remoteJid'])) {
                $sender = $firstMessage['remoteJid'];
            } elseif (isset($firstMessage['remote_jid']) && is_string($firstMessage['remote_jid'])) {
                $sender = $firstMessage['remote_jid'];
            }
        }

        if ($incomingMessage === null && isset($firstMessage['message']) && is_array($firstMessage['message'])) {
            $msg = $firstMessage['message'];
            if (isset($msg['conversation']) && is_string($msg['conversation'])) {
                $incomingMessage = $msg['conversation'];
            } elseif (isset($msg['extendedTextMessage']['text']) && is_string($msg['extendedTextMessage']['text'])) {
                $incomingMessage = $msg['extendedTextMessage']['text'];
            } elseif (isset($msg['imageMessage']['caption']) && is_string($msg['imageMessage']['caption'])) {
                $incomingMessage = $msg['imageMessage']['caption'];
            }
        }
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
    if (WA_GATEWAY_SEND_URL === '') {
        $replyBlockReason = 'WA_GATEWAY_SEND_URL kosong';
    } elseif ($sender === null || trim($sender) === '') {
        $replyBlockReason = 'Nomor tujuan tidak ditemukan di payload';
    }

    $sendAttempted = true;
    $sendResult = sendWaMessage($sessionId, $sender, $autoReply);
    $sendSuccess = $sendResult['ok'];
    $sendResponse = $sendResult;
}

// Event test dari WA Gateway: tampilkan notifikasi sukses yang jelas.
if (stripos($event, 'test') !== false) {
    $notification = 'Webhook test berhasil';
} elseif ($incomingMessage === null && $event === 'message.incoming') {
    $notification = 'Webhook masuk, tapi payload tidak memuat isi pesan';
    if ($replyBlockReason === null) {
        $replyBlockReason = 'Tidak bisa cocokkan keyword "hai" karena teks tidak ada';
    }
} elseif ($incomingMessage === null && isset($payload['message']) === false) {
    $notification = 'Webhook masuk, tapi pesan tidak ditemukan di payload';
    if ($replyBlockReason === null) {
        $replyBlockReason = 'Field message tidak ada pada payload Fonnte';
    }
}

$line = json_encode([
    'received_at' => gmdate('c'),
    'event' => $event,
    'session_id' => $sessionId,
    'sent_at' => $sentAt,
    'device' => $device,
    'sender' => $sender,
    'incoming_message' => $incomingMessage,
    'auto_reply' => $autoReply,
    'send_attempted' => $sendAttempted,
    'send_success' => $sendSuccess,
    'send_response' => $sendResponse,
    'reply_block_reason' => $replyBlockReason,
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
    'device' => $device,
    'sender' => $sender,
    'incoming_message' => $incomingMessage,
    'auto_reply' => $autoReply,
    'send_attempted' => $sendAttempted,
    'send_success' => $sendSuccess,
    'send_response' => $sendResponse,
    'reply_block_reason' => $replyBlockReason,
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
        // Fonnte expects form-data with target/message.
        'target' => $to,
        'message' => $message,
    ];
    if ($sessionId !== 'unknown' && trim($sessionId) !== '') {
        $body['device'] = $sessionId;
    }

    $headers = ['Accept: application/json'];
    if (WA_GATEWAY_API_KEY !== '') {
        $headers[] = 'Authorization: ' . WA_GATEWAY_API_KEY;
    }

    $ch = curl_init(WA_GATEWAY_SEND_URL);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);

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
