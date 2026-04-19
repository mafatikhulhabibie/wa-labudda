const SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function assertValidSessionId(raw) {
  if (raw === undefined || raw === null) {
    throw Object.assign(new Error('session_id is required'), { status: 400, expose: true });
  }

  const id = String(raw).trim();
  if (!id || !SESSION_ID_PATTERN.test(id)) {
    throw Object.assign(
      new Error(
        'session_id must be 1–64 chars: start with alphanumeric, then [a-zA-Z0-9_-]',
      ),
      { status: 400, expose: true },
    );
  }

  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw Object.assign(new Error('session_id is invalid'), { status: 400, expose: true });
  }

  return id;
}
