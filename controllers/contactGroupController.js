import {
  deleteGroup,
  findGroupByIdForUser,
  insertGroup,
  listGroupsByUserId,
  updateGroupName,
} from '../repositories/contactGroupRepository.js';

/**
 * GET /api/contact-groups
 */
export async function listContactGroupsController(req, res) {
  const groups = await listGroupsByUserId(req.user.id);
  return res.json({ groups });
}

/**
 * POST /api/contact-groups
 */
export async function createContactGroupController(req, res) {
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 1 || name.length > 100) {
    return res.status(400).json({ error: 'name must be 1–100 characters' });
  }
  try {
    const id = await insertGroup(req.user.id, name);
    return res.status(201).json({ success: true, id, name });
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Nama grup sudah ada' });
    }
    throw e;
  }
}

/**
 * PATCH /api/contact-groups/:id
 */
export async function updateContactGroupController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const row = await findGroupByIdForUser(id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'Group not found' });
  }
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 1 || name.length > 100) {
    return res.status(400).json({ error: 'name must be 1–100 characters' });
  }
  try {
    await updateGroupName(id, req.user.id, name);
    return res.json({ success: true, id, name });
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Nama grup sudah ada' });
    }
    throw e;
  }
}

/**
 * DELETE /api/contact-groups/:id
 */
export async function deleteContactGroupController(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const row = await findGroupByIdForUser(id, req.user.id);
  if (!row) {
    return res.status(404).json({ error: 'Group not found' });
  }
  await deleteGroup(id, req.user.id);
  return res.json({ success: true, deleted: true, id });
}
