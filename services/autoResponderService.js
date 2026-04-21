import { summarizeMessagesUpsert } from '../utils/waUpsertSummary.js';
import {
  getAutoReplyConfigBySessionId,
  listAutoReplyRulesByDeviceId,
} from '../repositories/autoReplyRepository.js';
import { logger } from '../utils/logger.js';
import { dispatchDeviceWebhook } from './webhookDispatcher.js';

const REPLY_COOLDOWN_MS = 15_000;
const MAX_SEEN_MESSAGE_IDS = 5_000;

/** @type {Map<string, number>} */
const lastReplyAtByChat = new Map();
/** @type {Map<string, number>} */
const seenMessageIds = new Map();

function gcSeenMessages(nowTs) {
  if (seenMessageIds.size <= MAX_SEEN_MESSAGE_IDS) return;
  for (const [key, ts] of seenMessageIds) {
    if (nowTs - ts > 10 * 60_000) {
      seenMessageIds.delete(key);
    }
    if (seenMessageIds.size <= MAX_SEEN_MESSAGE_IDS) break;
  }
}

/**
 * @param {string} incomingText
 * @param {{ match_type: 'exact'|'contains'|'starts_with'|'regex', keyword: string, reply_text: string, case_sensitive: boolean, enabled: boolean }} rule
 */
function isRuleMatch(incomingText, rule) {
  if (!rule.enabled) return false;
  const needle = String(rule.keyword || '').trim();
  if (!needle) return false;

  const text = rule.case_sensitive ? incomingText : incomingText.toLowerCase();
  const target = rule.case_sensitive ? needle : needle.toLowerCase();

  if (rule.match_type === 'exact') return text === target;
  if (rule.match_type === 'starts_with') return text.startsWith(target);
  if (rule.match_type === 'regex') {
    try {
      const re = new RegExp(needle, rule.case_sensitive ? '' : 'i');
      return re.test(incomingText);
    } catch {
      return false;
    }
  }
  return text.includes(target);
}

/**
 * @param {{
 *   sessionId: string
 *   payload: any
 *   sendTextToJid: (sessionId: string, jid: string, text: string) => Promise<unknown>
 * }} args
 */
export async function processIncomingAutoReply({ sessionId, payload, sendTextToJid }) {
  const cfg = await getAutoReplyConfigBySessionId(sessionId);
  if (!cfg || !cfg.enabled) return;

  const rules = await listAutoReplyRulesByDeviceId(Number(cfg.device_id));
  if (!rules.length) return;

  const items = summarizeMessagesUpsert(sessionId, payload);
  if (!items.length) return;

  const nowTs = Date.now();
  gcSeenMessages(nowTs);

  for (const item of items) {
    if (!item || item.from_me) continue;
    if (!item.chat_jid || item.chat_jid === 'status@broadcast') continue;
    if (String(item.chat_jid).endsWith('@g.us')) continue;
    const text = String(item.text || '').trim();
    if (!text) continue;

    const dedupeKey = `${sessionId}:${item.message_id}`;
    if (seenMessageIds.has(dedupeKey)) continue;
    seenMessageIds.set(dedupeKey, nowTs);

    const cooldownKey = `${sessionId}:${item.chat_jid}`;
    const last = lastReplyAtByChat.get(cooldownKey) || 0;
    if (nowTs - last < REPLY_COOLDOWN_MS) continue;

    const matched = rules.find((r) => isRuleMatch(text, r));
    const fallbackReply = String(cfg.default_reply_text || '').trim();
    const replyText = matched
      ? String(matched.reply_text || '').trim()
      : fallbackReply;
    if (!replyText) continue;

    try {
      await sendTextToJid(sessionId, item.chat_jid, replyText);
      lastReplyAtByChat.set(cooldownKey, nowTs);
      await dispatchDeviceWebhook(sessionId, 'message.autoreply.sent', {
        trigger_message_id: item.message_id,
        chat_jid: item.chat_jid,
        matched_rule_id: matched?.id || null,
        used_default_reply: !matched,
      }).catch(() => {});
    } catch (err) {
      logger.warn(
        { err, sessionId, chat_jid: item.chat_jid, rule_id: matched?.id || null },
        'auto responder send failed',
      );
    }
  }
}

