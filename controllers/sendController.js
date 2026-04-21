import { assertValidSessionId } from '../utils/sessionId.js';
import { recordSendActivity } from '../repositories/sendActivityRepository.js';
import { dispatchDeviceWebhook } from '../services/webhookDispatcher.js';
import { whatsappManager } from '../services/whatsappManager.js';

/**
 * Build a Fonnte-like success envelope while preserving legacy `success`.
 * @param {Record<string, unknown>} data
 */
function sendOk(data = {}) {
  return {
    success: true,
    status: true,
    message: 'queued',
    ...data,
  };
}

/**
 * @param {{
 *   sessionId: string
 *   number: unknown
 *   message: unknown
 *   reqDevice?: { user_id?: number | string } | undefined
 * }} payload
 */
async function sendTextAndTrack({ sessionId, number, message, reqDevice }) {
  const result = await whatsappManager.sendMessage(sessionId, number, message);
  await dispatchDeviceWebhook(sessionId, 'message.outgoing', {
    number: String(number || ''),
    has_media: false,
    message: String(message || ''),
    filename: '',
    extension: '',
    mimetype: '',
    url: '',
  }).catch(() => {});
  if (reqDevice) {
    await recordSendActivity(Number(reqDevice.user_id), sessionId).catch(() => {});
  }
  return result;
}

/**
 * POST /api/send
 *
 * JSON: { session_id, number, message } — teks biasa.
 * Multipart: fields session_id, number, message (caption opsional), media_type (image|document, opsional),
 * file (satu berkas). media_type default: image jika MIME image/*, selain itu document.
 */
export async function sendController(req, res) {
  if (req.file) {
    const sessionId = assertValidSessionId(req.body.session_id ?? req.device?.session_id);
    const number = req.body.number;
    const caption = req.body.message ?? '';
    let kind = String(req.body.media_type || '').toLowerCase();
    if (kind !== 'image' && kind !== 'document') {
      kind = req.file.mimetype.startsWith('image/') ? 'image' : 'document';
    }

    await whatsappManager.sendMediaAttachment(sessionId, number, {
      kind,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      fileName: req.file.originalname,
      caption,
    });
    await dispatchDeviceWebhook(sessionId, 'message.outgoing', {
      number: String(number || ''),
      has_media: true,
      media_type: kind,
      message: String(caption || ''),
      filename: req.file.originalname || '',
      extension: String(req.file.originalname || '').split('.').pop() || '',
      mimetype: req.file.mimetype || '',
      url: '',
    }).catch(() => {});
    if (req.device) {
      await recordSendActivity(Number(req.device.user_id), sessionId).catch(() => {});
    }
    return res.json(
      sendOk({
        detail: {
          session_id: sessionId,
          number: String(number || ''),
          has_media: true,
          media_type: kind,
        },
      }),
    );
  }

  const { session_id, number, message } = req.body ?? {};
  const sessionId = assertValidSessionId(session_id ?? req.device?.session_id);
  const result = await sendTextAndTrack({ sessionId, number, message, reqDevice: req.device });
  return res.json(
    sendOk({
      detail: {
        session_id: sessionId,
        number: String(number || ''),
        has_media: false,
        message: String(message || ''),
        message_id: result?.key?.id || null,
      },
    }),
  );
}

/**
 * POST /api/send-bulk
 *
 * JSON:
 * {
 *   "session_id": "sales-01",
 *   "numbers": ["628123...", "628456..."],
 *   "message": "Halo"
 * }
 */
export async function sendBulkController(req, res) {
  const { session_id, numbers, message } = req.body ?? {};
  const sessionId = assertValidSessionId(session_id ?? req.device?.session_id);

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw Object.assign(new Error('numbers must be a non-empty array'), { status: 400, expose: true });
  }
  if (message === undefined || message === null || String(message).trim() === '') {
    throw Object.assign(new Error('message is required'), { status: 400, expose: true });
  }

  const normalized = numbers
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    throw Object.assign(new Error('numbers must contain at least one valid value'), {
      status: 400,
      expose: true,
    });
  }

  const results = [];
  for (const number of normalized) {
    try {
      const out = await sendTextAndTrack({
        sessionId,
        number,
        message,
        reqDevice: req.device,
      });
      results.push({
        number,
        status: true,
        message: 'queued',
        message_id: out?.key?.id || null,
      });
    } catch (err) {
      results.push({
        number,
        status: false,
        message: err?.message || 'Failed to queue message',
        code: err?.status || 500,
      });
    }
  }

  const success = results.filter((item) => item.status).length;
  const failed = results.length - success;
  return res.json(
    sendOk({
      detail: {
        session_id: sessionId,
        total: results.length,
        success,
        failed,
        results,
      },
    }),
  );
}
