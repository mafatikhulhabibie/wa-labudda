/**
 * Normalize user input to WhatsApp JID (digits@s.whatsapp.net).
 * @param {string} raw
 * @returns {{ jid: string, digits: string }}
 */
export function toWhatsAppJid(raw) {
  if (typeof raw !== 'string') {
    throw new TypeError('number must be a string');
  }

  let digits = raw.replace(/\D/g, '');

  if (!digits) {
    throw new Error('Invalid phone number');
  }

  // Common ID local form: 08xxxxxxxx -> 628xxxxxxxx
  if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  }

  // If user omitted country code for ID-length local numbers, keep digits as-is;
  // WhatsApp expects full international format without +.

  const jid = `${digits}@s.whatsapp.net`;
  return { jid, digits };
}
