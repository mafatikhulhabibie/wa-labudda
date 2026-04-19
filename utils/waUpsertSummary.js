/**
 * Ringkas pesan dari Baileys `messages.upsert` untuk UI / WebSocket.
 * @param {string} sessionId
 * @param {any} payload
 * @returns {Array<{
 *   type: 'message'
 *   session_id: string
 *   chat_jid: string
 *   message_id: string
 *   from_me: boolean
 *   participant_jid: string | null
 *   text: string
 *   ts: number
 * }>}
 */
export function summarizeMessagesUpsert(sessionId, payload) {
  const out = [];
  const type = payload?.type;
  if (type !== 'notify' && type !== 'append') {
    return out;
  }

  const messages = payload?.messages;
  if (!Array.isArray(messages)) {
    return out;
  }

  for (const m of messages) {
    if (!m?.key) continue;
    const remoteJid = m.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') continue;

    const msg = m.message;
    if (!msg) continue;

    const text = extractDisplayText(msg);
    if (!text) continue;

    const fromMe = Boolean(m.key.fromMe);
    const participant = m.key.participant || null;
    const ts = Number(m.messageTimestamp) || Math.floor(Date.now() / 1000);
    const messageId = m.key.id || String(ts);

    out.push({
      type: 'message',
      session_id: sessionId,
      chat_jid: remoteJid,
      message_id: messageId,
      from_me: fromMe,
      participant_jid: participant,
      text,
      ts,
    });
  }

  return out;
}

/** @param {any} msg */
function extractDisplayText(msg) {
  if (!msg) return '';
  if (msg.conversation) return String(msg.conversation);
  if (msg.extendedTextMessage?.text) return String(msg.extendedTextMessage.text);
  if (msg.imageMessage?.caption) return String(msg.imageMessage.caption);
  if (msg.videoMessage?.caption) return String(msg.videoMessage.caption);
  if (msg.documentMessage?.caption) return String(msg.documentMessage.caption);
  if (msg.imageMessage) return '[Gambar]';
  if (msg.videoMessage) return '[Video]';
  if (msg.audioMessage) return '[Audio]';
  if (msg.documentMessage) return '[Dokumen]';
  if (msg.stickerMessage) return '[Stiker]';
  if (msg.contactMessage) return '[Kontak]';
  if (msg.locationMessage) return '[Lokasi]';
  if (msg.pollCreationMessage || msg.pollUpdateMessage) return '[Polling]';
  return '';
}
