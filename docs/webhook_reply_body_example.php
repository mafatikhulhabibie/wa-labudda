<?php
/**
 * Contoh penerima webhook + balasan langsung lewat body JSON (tanpa POST /api/send).
 *
 * Di server WA Gateway (.env): WEBHOOK_REPLY_FROM_BODY=true
 * Di dashboard device: isi URL ke skrip ini (https://domain-anda/.../webhook_reply_body_example.php)
 *
 * Response HARUS HTTP 200 dan body JSON dengan salah satu string tidak kosong:
 *   "reply", "reply_text", atau "message" (teks balasan ke pengirim).
 */
header('Content-Type: application/json; charset=utf-8');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
	http_response_code(400);
	echo json_encode(['error' => 'invalid json'], JSON_UNESCAPED_UNICODE);
	exit;
}

$event = $data['event'] ?? '';
if ($event !== '' && $event !== 'message.incoming') {
	echo json_encode(['ok' => true, 'skipped' => true], JSON_UNESCAPED_UNICODE);
	exit;
}

$text = trim((string) ($data['message'] ?? ''));
$name = trim((string) ($data['name'] ?? ''));

if ($text !== '') {
	$reply = 'Terima kasih' . ($name !== '' ? ', ' . $name : '') . ". Pesan Anda:\n" . $text;
} else {
	$reply = 'Halo! Silakan ketik pesan Anda.';
}

echo json_encode(['reply' => $reply], JSON_UNESCAPED_UNICODE);
