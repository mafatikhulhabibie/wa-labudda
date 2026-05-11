<?php
defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Contoh Webhook untuk WA Gateway — pengganti flow Fonnte.
 *
 * WAJIB isi salah satu: WA_BEARER_JWT (disarankan) ATAU WA_USER_API_KEY.
 * - User API key = dari dashboard tab Users (bukan "API key" per device — itu akan 403 di /api/send).
 * - Hanya satu header auth yang dikirim (JWT diprioritaskan), agar tidak bentrok pengecekan di server.
 *
 * Set WA_DEBUG = true sementara untuk melihat hasil /api/send di response JSON (non-produksi).
 * Set WA_WEBHOOK_TRACE = true + log_threshold debug: bukti webhook sampai ke PHP (bukan tbl_search_logs).
 *
 * Catatan: tbl_search_logs hanya diisi jika customer aktif cocok nomor DAN ada baris teks part;
 * tidak ada insert jika hanya “tidak terdaftar” atau pesan tanpa baris kode.
 *
 * Cek kalau WA tidak balas: field `wa_reply_ok` di JSON response (false = kirim gagal),
 * plus `application/logs/log-YYYY-MM-DD.php`, atau WA_DEBUG untuk `wa_send_last`.
 */
class Webhook extends CI_Controller
{
	/** Basis URL WA Gateway (tanpa slash akhir) */
	private const WA_BASE_URL = 'https://wa.javadev.my.id';

	/**
	 * User API key (dashboard → Users) — bukan kunci device.
	 * Kosongkan jika pakai WA_BEARER_JWT saja.
	 */
	private const WA_USER_API_KEY = '';

	/** JWT login user (cookie value wg_session atau Bearer token) — kosongkan jika pakai USER API key */
	private const WA_BEARER_JWT = '';

	/** true = sertakan info debug kirim WA di JSON response (matikan di production) */
	private const WA_DEBUG = false;

	/**
	 * true = tulis ke log CI (perlu log_threshold memuat level yang dipakai, biasanya 4 = all)
	 * setiap hit webhook yang lolos JSON — bukti WA→PHP masuk, terpisah dari tbl_search_logs.
	 */
	private const WA_WEBHOOK_TRACE = false;

	private $searchLogAvailabilityChecked = false;

	/** @var array{ok:bool,http?:int,body?:string,curl_error?:string,payload?:array}|null */
	private $lastWaSendResult = null;

	/** Ringkasan tiap request: ada berapa kali /api/send, semuanya sukses? */
	/** @var array{attempted:int,ok:bool} */
	private $waSendReport = ['attempted' => 0, 'ok' => true];

	public function __construct()
	{
		parent::__construct();
	}

	/**
	 * @param array<string,mixed> $payload
	 */
	private function outJson(array $payload, $httpCode = null)
	{
		if ($httpCode !== null) {
			http_response_code((int) $httpCode);
		}
		if ($this->waSendReport['attempted'] > 0) {
			$payload['wa_reply_ok'] = $this->waSendReport['ok'];
			if (!$this->waSendReport['ok']) {
				$payload['wa_reply_hint'] = 'Lihat application/logs (wa_gateway), auth user API key/JWT, session_id device.';
				$last = $this->lastWaSendResult;
				if (is_array($last) && !empty($last['http'])) {
					$payload['wa_http_status'] = $last['http'];
				}
				if (is_array($last) && !empty($last['curl_error'])) {
					$payload['wa_curl_error'] = $last['curl_error'];
				}
			}
		}
		if (self::WA_DEBUG) {
			$payload['wa_send_last'] = $this->lastWaSendResult;
			$payload['wa_send_report'] = $this->waSendReport;
		}
		echo json_encode($payload, JSON_UNESCAPED_UNICODE);
	}

	/** Panggil sendWaServer dan catat untuk wa_reply_ok di response. */
	private function trySendWa($sessionId, $senderRaw, $messageText)
	{
		$this->waSendReport['attempted']++;
		if (!$this->sendWaServer($sessionId, $senderRaw, $messageText)) {
			$this->waSendReport['ok'] = false;
		}
	}

	public function index()
	{
		header('Content-Type: application/json; charset=utf-8');

		$json = file_get_contents('php://input');
		$data = json_decode($json, true);
		if (!is_array($data)) {
			$this->outJson(['status' => false, 'message' => 'invalid json'], 400);
			return;
		}

		$device = $data['device'] ?? '';
		$sender = $data['sender'] ?? '';
		$message = strtoupper((string) ($data['message'] ?? ''));
		$member = $data['member'] ?? '';
		$name = $data['name'] ?? '';
		$location = $data['location'] ?? '';
		$url = $data['url'] ?? '';
		$filename = $data['filename'] ?? '';
		$extension = $data['extension'] ?? '';

		// Hanya proses pesan masuk (abaikan message.outgoing, webhook.test, dll.)
		$event = $data['event'] ?? '';
		if ($event !== '' && $event !== 'message.incoming') {
			$this->outJson(['status' => true, 'skipped' => true, 'event' => $event]);
			return;
		}

		if (trim((string) $device) === '' || trim((string) $sender) === '') {
			$this->outJson(['status' => false, 'message' => 'device atau sender kosong (cek payload webhook)'], 400);
			return;
		}

		if (self::WA_WEBHOOK_TRACE) {
			log_message(
				'debug',
				'wa_webhook_trace: ' . json_encode([
					'event' => $event,
					'device' => $device,
					'sender' => $sender,
					'message_len' => strlen((string) ($data['message'] ?? '')),
				], JSON_UNESCAPED_UNICODE),
			);
		}

		$this->waSendReport = ['attempted' => 0, 'ok' => true];

		$customer = $this->findActiveCustomerBySender($sender);
		if (!$customer) {
			$psn1 = '*NEW SERDANG MOTOR*

Nomor whatsapp kamu tidak terdatar (non-aktif) di database kami.

Silahkan hubungi admin untuk aktivasi kembali.
';
			$this->trySendWa($device, $sender, $psn1);
			$this->outJson(['status' => false, 'message' => 'Customer tidak ada/tidak aktif']);
			return;
		}

		// ================= FITUR RESET STOK =================
		if (strpos($message, 'RSTDBSTOK') !== false) {

			$this->db->where('stok !=', 0);
			$this->db->update('mst_spareparts', [
				'diskon' => 0,
				'stok' => 0,
				'updated_at' => date('Y-m-d H:i:s'),
			]);

			$psn = '*NEW SERDANG MOTOR*

Reset stok berhasil dilakukan.
Semua stok yang sebelumnya tersedia sudah di-set menjadi 0.';

			$this->trySendWa($device, $sender, $psn);

			$this->outJson([
				'status' => true,
				'message' => 'Reset stok berhasil',
			]);
			return;
		}

		$data_cek = explode(PHP_EOL, $message);

		$psn1 = '*NEW SERDANG MOTOR*

';
		$resultRows = array();
		if (count($data_cek) > 0) {
			foreach ($data_cek as $row) {
				$row = trim((string) $row);
				if ($row === '') {
					continue;
				}

				$cek_part = $this->db->get_where('mst_spareparts', array('kode_part' => $row));
				$discLine = '*-*';
				$subsLine = '*-*';
				if ($cek_part->num_rows() > 0) {
					$part = $cek_part->row();
					if ((int) $part->is_active === 0) {
						$panu = '*' . $row . '*';
						$pana = '*N/A*';
						$ct = '*N/A*';
						$pl = '*N/A*';
						$st = '*N/A*';
						$discLine = '*-*';
						$subsLine = '*-*';
						$availabilityStatus = 'NOT AVAILABLE';
					} else {
						$panu = '*' . $part->kode_part . '*';
						$pana = '*' . $part->nama_part . '*';
						$ct = '*' . $part->kategori . '*';
						$hargaDasar = (float) $part->harga;
						$diskonPct = isset($part->diskon) ? (float) $part->diskon : 0.0;
						$pl = '*Rp. ' . number_format($hargaDasar, 0, ',', '.') . '*';
						$discLine = $diskonPct > 0 && $diskonPct <= 100
							? '*' . rtrim(rtrim(number_format($diskonPct, 2, ',', '.'), '0'), ',') . '%*'
							: '*-*';
						$stokQty = (int) $part->stok;
						$st = '*' . number_format($stokQty, 0, ',', '.') . '*';
						$subRaw = isset($part->substitusi) ? trim((string) $part->substitusi) : '';
						$subsLine = $subRaw !== '' ? '*' . str_replace(["\r", "\n"], ' ', $subRaw) . '*' : '*-*';
						$availabilityStatus = $stokQty > 0 ? 'AVAILABLE' : 'NOT AVAILABLE';
					}
				} else {
					$panu = '*' . $row . '*';
					$pana = '*N/A*';
					$ct = '*N/A*';
					$pl = '*N/A*';
					$st = '*N/A*';
					$discLine = '*-*';
					$subsLine = '*-*';
					$availabilityStatus = 'NOT AVAILABLE';
				}

				$hasil_row = trim((string) $pana, '*');

				$this->ensureSearchLogAvailabilityColumn();
				$this->db->insert('tbl_search_logs', [
					'customer_id' => (int) $customer->id,
					'keyword' => $row,
					'hasil' => $hasil_row,
					'availability_status' => $availabilityStatus,
				]);

				$rowMessage = 'Part Number : ' . $panu . '
Part Name : ' . $pana . '
Category : ' . $ct . '
Price List : ' . $pl . '
Disc : ' . $discLine . '
Stock : ' . $st . '
Subs : ' . $subsLine;
				$resultRows[] = $rowMessage;

				$psn1 .= $rowMessage . '

';
			}
		} else {
			$psn1 .= 'Format pengecekan part:
KODEPART1

Contoh:
SP003

Keterangan:
- Maksimal pengecekan part 10 baris (10 kode part).
';
		}

		if (count($resultRows) > 10) {
			$firstBatch = array_slice($resultRows, 0, 10);
			$secondBatch = array_slice($resultRows, 10);

			$messageFirst = '*NEW SERDANG MOTOR*

' . implode("\n\n", $firstBatch) . '

Data yang dicek lebih dari 10 baris.
Hasil lanjutan dikirim di pesan kedua.';
			$this->trySendWa($device, $sender, $messageFirst);

			$messageSecond = '*NEW SERDANG MOTOR*

' . implode("\n\n", $secondBatch);
			$this->trySendWa($device, $sender, $messageSecond);
			$this->outJson(['status' => true, 'split' => true]);
			return;
		}

		$this->trySendWa($device, $sender, $psn1);
		$this->outJson(['status' => true]);
	}

	/**
	 * Kirim teks lewat WA Gateway — ganti sendFonnte.
	 *
	 * @return bool true jika HTTP 2xx dan tidak ada curl error
	 */
	private function sendWaServer($sessionId, $senderRaw, $messageText)
	{
		$base = rtrim(self::WA_BASE_URL, '/');
		$apiKey = trim(self::WA_USER_API_KEY);
		$jwt = trim(self::WA_BEARER_JWT);

		$fail = function (array $meta) use ($sessionId, $senderRaw, $messageText) {
			$meta['request'] = [
				'session_id' => (string) $sessionId,
				'sender_raw' => (string) $senderRaw,
				'message_len' => strlen((string) $messageText),
			];
			$this->lastWaSendResult = array_merge(['ok' => false], $meta);
			log_message('error', 'wa_gateway: ' . json_encode($this->lastWaSendResult, JSON_UNESCAPED_UNICODE));
			return false;
		};

		if ($base === '') {
			return $fail(['step' => 'WA_BASE_URL kosong']);
		}
		if ($apiKey === '' && $jwt === '') {
			return $fail(['step' => 'isi WA_USER_API_KEY (user!) atau WA_BEARER_JWT']);
		}

		$candidates = $this->buildPhoneCandidates($senderRaw);
		$number = $candidates[0] ?? preg_replace('/\D/', '', (string) $senderRaw);
		if ($number === '') {
			return $fail(['step' => 'nomor kosong setelah normalisasi']);
		}

		$payload = [
			'session_id' => (string) $sessionId,
			'number' => $number,
			'message' => (string) $messageText,
		];

		// Pilih SATU metode auth: server memproses x-api-key dulu; kunci device + JWT sekaligus bisa salah.
		$headers = ['Content-Type: application/json'];
		if ($jwt !== '') {
			$headers[] = 'Authorization: Bearer ' . $jwt;
		} elseif ($apiKey !== '') {
			$headers[] = 'x-api-key: ' . $apiKey;
		}

		$ch = curl_init($base . '/api/send');
		curl_setopt_array($ch, [
			CURLOPT_POST => true,
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_HTTPHEADER => $headers,
			CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
			CURLOPT_TIMEOUT => 45,
			CURLOPT_CONNECTTIMEOUT => 15,
		]);
		$response = curl_exec($ch);
		$curlErr = curl_error($ch);
		$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
		curl_close($ch);

		$ok = $curlErr === '' && $code >= 200 && $code < 300;
		$this->lastWaSendResult = [
			'ok' => $ok,
			'http' => $code,
			'curl_error' => $curlErr,
			'body' => is_string($response) ? substr($response, 0, 2000) : '',
			'request' => [
				'session_id' => (string) $sessionId,
				'number' => $number,
				'message_len' => strlen((string) $messageText),
			],
		];

		if (!$ok) {
			log_message('error', 'wa_gateway send gagal: ' . json_encode($this->lastWaSendResult, JSON_UNESCAPED_UNICODE));
		}

		return $ok;
	}

	private function findActiveCustomerBySender($sender)
	{
		$candidates = $this->buildPhoneCandidates($sender);
		if (empty($candidates)) {
			return null;
		}

		return $this->db
			->where_in('no_hp', $candidates)
			->where('is_active', 1)
			->limit(1)
			->get('mst_customers')
			->row();
	}

	private function buildPhoneCandidates($sender)
	{
		$raw = preg_replace('/[^0-9]/', '', (string) $sender);
		if ($raw === '') {
			return [];
		}

		$candidates = [$raw];
		if (substr($raw, 0, 2) === '62') {
			$candidates[] = '0' . substr($raw, 2);
		} elseif (substr($raw, 0, 1) === '0') {
			$candidates[] = '62' . substr($raw, 1);
		}

		return array_values(array_unique($candidates));
	}

	private function ensureSearchLogAvailabilityColumn()
	{
		if ($this->searchLogAvailabilityChecked) {
			return;
		}
		$this->searchLogAvailabilityChecked = true;

		if ($this->db->field_exists('availability_status', 'tbl_search_logs')) {
			return;
		}

		try {
			$this->db->query("ALTER TABLE `tbl_search_logs` ADD COLUMN `availability_status` VARCHAR(20) NULL AFTER `hasil`");
		} catch (\Throwable $e) {
		} catch (\Exception $e) {
		}
	}
}
