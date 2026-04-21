import {
  createAutoReplyRule,
  deleteAutoReplyRule,
  ensureAutoReplySettings,
  findAutoReplyRuleById,
  getAutoReplyConfigBySessionId,
  listAutoReplyRulesByDeviceId,
  updateAutoReplyRule,
  upsertAutoReplySettings,
} from '../repositories/autoReplyRepository.js';

const ALLOWED_MATCH_TYPES = new Set(['exact', 'contains', 'starts_with', 'regex']);

function parseRuleInput(body = {}) {
  const matchType = String(body.match_type || 'contains')
    .trim()
    .toLowerCase();
  const keyword = String(body.keyword || '').trim();
  const replyText = String(body.reply_text || '').trim();
  const caseSensitive = Boolean(body.case_sensitive);
  const priorityRaw = body.priority;
  const enabled = body.enabled !== false;
  const priority = Number.isFinite(Number(priorityRaw)) ? Number(priorityRaw) : 100;

  if (!ALLOWED_MATCH_TYPES.has(matchType)) {
    const err = new Error('match_type must be one of exact|contains|starts_with|regex');
    err.status = 400;
    throw err;
  }
  if (!keyword) {
    const err = new Error('keyword is required');
    err.status = 400;
    throw err;
  }
  if (keyword.length > 300) {
    const err = new Error('keyword max length is 300');
    err.status = 400;
    throw err;
  }
  if (!replyText) {
    const err = new Error('reply_text is required');
    err.status = 400;
    throw err;
  }
  if (replyText.length > 4000) {
    const err = new Error('reply_text max length is 4000');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(priority) || priority < 0 || priority > 9999) {
    const err = new Error('priority must be an integer between 0 and 9999');
    err.status = 400;
    throw err;
  }

  return {
    match_type: matchType,
    keyword,
    reply_text: replyText,
    case_sensitive: caseSensitive,
    priority,
    enabled,
  };
}

/**
 * Split multiline keywords (1 line = 1 keyword).
 * @param {string} raw
 */
function splitKeywords(raw) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(lines)];
}

/**
 * GET /api/autoresponder/:session_id
 */
export async function getAutoReplyController(req, res) {
  await ensureAutoReplySettings(Number(req.device.id));
  const cfg = await getAutoReplyConfigBySessionId(req.device.session_id);
  const rules = await listAutoReplyRulesByDeviceId(Number(req.device.id));
  return res.json({
    session_id: req.device.session_id,
    enabled: Boolean(cfg?.enabled),
    default_reply_text: String(cfg?.default_reply_text || ''),
    rules,
  });
}

/**
 * PUT /api/autoresponder/:session_id
 * Body: { enabled: boolean, default_reply_text?: string }
 */
export async function updateAutoReplyController(req, res) {
  const enabled = req.body?.enabled === true;
  const defaultReplyText = String(req.body?.default_reply_text || '').trim();
  if (defaultReplyText.length > 4000) {
    return res.status(400).json({ error: 'default_reply_text max length is 4000' });
  }
  await upsertAutoReplySettings(Number(req.device.id), enabled, defaultReplyText);
  return res.json({
    success: true,
    session_id: req.device.session_id,
    enabled,
    default_reply_text: defaultReplyText,
  });
}

/**
 * POST /api/autoresponder/:session_id/rules
 */
export async function createAutoReplyRuleController(req, res) {
  const input = parseRuleInput(req.body || {});
  const keywords = splitKeywords(input.keyword);
  if (keywords.length <= 1) {
    const id = await createAutoReplyRule(Number(req.device.id), input);
    const created = await findAutoReplyRuleById(Number(req.device.id), id);
    return res.status(201).json({ success: true, rule: created });
  }

  const createdRules = [];
  for (const keyword of keywords) {
    const id = await createAutoReplyRule(Number(req.device.id), { ...input, keyword });
    const created = await findAutoReplyRuleById(Number(req.device.id), id);
    if (created) createdRules.push(created);
  }
  return res.status(201).json({ success: true, created_count: createdRules.length, rules: createdRules });
}

/**
 * PATCH /api/autoresponder/:session_id/rules/:id
 */
export async function updateAutoReplyRuleController(req, res) {
  const ruleId = Number(req.params.id);
  if (!Number.isInteger(ruleId) || ruleId <= 0) {
    return res.status(400).json({ error: 'Invalid rule id' });
  }
  const exists = await findAutoReplyRuleById(Number(req.device.id), ruleId);
  if (!exists) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  const input = parseRuleInput(req.body || {});
  await updateAutoReplyRule(Number(req.device.id), ruleId, input);
  const updated = await findAutoReplyRuleById(Number(req.device.id), ruleId);
  return res.json({ success: true, rule: updated });
}

/**
 * DELETE /api/autoresponder/:session_id/rules/:id
 */
export async function deleteAutoReplyRuleController(req, res) {
  const ruleId = Number(req.params.id);
  if (!Number.isInteger(ruleId) || ruleId <= 0) {
    return res.status(400).json({ error: 'Invalid rule id' });
  }
  const ok = await deleteAutoReplyRule(Number(req.device.id), ruleId);
  if (!ok) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  return res.json({ success: true, deleted: true });
}

