import { assertValidSessionId } from '../utils/sessionId.js';
import { recordSendActivity } from '../repositories/sendActivityRepository.js';
import { dispatchDeviceWebhook } from '../services/webhookDispatcher.js';
import { whatsappManager } from '../services/whatsappManager.js';

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
    }).catch(() => {});
    if (req.device) {
      await recordSendActivity(Number(req.device.user_id), sessionId).catch(() => {});
    }
    return res.json({ success: true });
  }

  const { session_id, number, message } = req.body ?? {};
  const sessionId = assertValidSessionId(session_id ?? req.device?.session_id);

  await whatsappManager.sendMessage(sessionId, number, message);
  await dispatchDeviceWebhook(sessionId, 'message.outgoing', {
    number: String(number || ''),
    has_media: false,
    message: String(message || ''),
  }).catch(() => {});
  if (req.device) {
    await recordSendActivity(Number(req.device.user_id), sessionId).catch(() => {});
  }
  return res.json({ success: true });
}
