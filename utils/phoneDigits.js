/**
 * @param {unknown} raw
 * @returns {string} digits only
 */
export function digitsOnly(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * @param {string} digits
 * @returns {string | null} error message or null if ok
 */
export function validateContactPhoneDigits(digits) {
  if (!digits) return 'Nomor wajib diisi';
  if (digits.length < 8 || digits.length > 15) return 'Nomor harus 8–15 digit';
  return null;
}
