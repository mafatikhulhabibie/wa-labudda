import { readFile } from 'node:fs/promises';
import { assertValidSessionId } from '../utils/sessionId.js';
import { whatsappManager } from '../services/whatsappManager.js';

/**
 * GET /api/session/qr/:session_id
 * Query: mode=png|base64 (default png file)
 */
export async function getSessionQrController(req, res) {
  const sessionId = assertValidSessionId(req.params.session_id);
  if (!whatsappManager.isSessionLoaded(sessionId)) {
    return res.status(503).json({
      error:
        'WhatsApp runtime is not active for this device. Call POST /api/devices/:session_id/connect first.',
    });
  }
  const absPath = whatsappManager.getQrAbsolutePath(sessionId);
  const mode = String(req.query.mode || req.query.format || 'png').toLowerCase();

  try {
    const buf = await readFile(absPath);

    if (mode === 'base64') {
      return res.json({
        success: true,
        mimeType: 'image/png',
        base64: buf.toString('base64'),
      });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buf);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return res.status(404).json({ error: 'QR not available yet' });
    }

    throw err;
  }
}

/**
 * GET /api/session/status/:session_id
 */
export async function getSessionStatusController(req, res) {
  const sessionId = assertValidSessionId(req.params.session_id);
  return res.json(whatsappManager.getPublicStatusIfLoaded(sessionId));
}
