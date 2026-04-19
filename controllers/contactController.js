import { findGroupByIdForUser } from '../repositories/contactGroupRepository.js';
import {
  deleteContact,
  findContactByIdForUser,
  insertContact,
  listContactsByUserId,
  updateContact,
} from '../repositories/contactRepository.js';
import { digitsOnly, validateContactPhoneDigits } from '../utils/phoneDigits.js';

/**
 * GET /api/contacts?group_id=
 */
export async function listContactsController(req, res) {
  const raw = req.query.group_id;
  let groupId = null;
  if (raw !== undefined && raw !== '' && raw !== 'null') {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return res.status(400).json({ error: 'Invalid group_id' });
    }
    groupId = n;
  }
  const contacts = await listContactsByUserId(req.user.id, groupId);
  return res.json({ contacts });
}

/**
 * POST /api/contacts
 */
export async function createContactController(req, res) {
  const display_name = String(req.body?.display_name ?? '').trim();
  const phoneRaw = req.body?.phone;
  const phone = digitsOnly(phoneRaw);
  const err = validateContactPhoneDigits(phone);
  if (err) {
    return res.status(400).json({ error: err });
  }
  if (display_name.length < 1 || display_name.length > 150) {
    return res.status(400).json({ error: 'display_name must be 1–150 characters' });
  }

  let group_id = null;
  if (req.body?.group_id !== undefined && req.body?.group_id !== null && req.body?.group_id !== '') {
    const gid = Number(req.body.group_id);
    if (!Number.isFinite(gid)) {
      return res.status(400).json({ error: 'Invalid group_id' });
    }
    const g = await findGroupByIdForUser(gid, req.user.id);
    if (!g) {
      return res.status(400).json({ error: 'Group not found' });
    }
    group_id = gid;
  }

  try {
    const id = await insertContact(req.user.id, display_name, phone, group_id);
    return res.status(201).json({ success: true, id, display_name, phone, group_id });
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Kontak dengan nomor ini sudah ada' });
    }
    throw e;
  }
}

/**
 * PATCH /api/contacts/:id
 */
export async function updateContactController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const row = await findContactByIdForUser(id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const patch = {};
  if (req.body?.display_name !== undefined) {
    const display_name = String(req.body.display_name).trim();
    if (display_name.length < 1 || display_name.length > 150) {
      return res.status(400).json({ error: 'display_name must be 1–150 characters' });
    }
    patch.display_name = display_name;
  }
  if (req.body?.phone !== undefined) {
    const phone = digitsOnly(req.body.phone);
    const perr = validateContactPhoneDigits(phone);
    if (perr) {
      return res.status(400).json({ error: perr });
    }
    patch.phone = phone;
  }
  if (req.body?.group_id !== undefined) {
    if (req.body.group_id === null || req.body.group_id === '') {
      patch.group_id = null;
    } else {
      const gid = Number(req.body.group_id);
      if (!Number.isFinite(gid)) {
        return res.status(400).json({ error: 'Invalid group_id' });
      }
      const g = await findGroupByIdForUser(gid, req.user.id);
      if (!g) {
        return res.status(400).json({ error: 'Group not found' });
      }
      patch.group_id = gid;
    }
  }

  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    await updateContact(id, req.user.id, patch);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Kontak dengan nomor ini sudah ada' });
    }
    throw e;
  }
  return res.json({ success: true, id });
}

/**
 * DELETE /api/contacts/:id
 */
export async function deleteContactController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const row = await findContactByIdForUser(id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  await deleteContact(id, req.user.id);
  return res.json({ success: true, deleted: true, id });
}
