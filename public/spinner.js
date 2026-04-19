/**
 * Menjalankan async work dengan state loading pada tombol (spinner + disabled).
 * @param {HTMLButtonElement | null} button
 * @param {() => Promise<unknown>} fn
 */
export async function withSpinner(button, fn) {
  if (!button) {
    await fn();
    return;
  }
  if (button.dataset.spinnerLock === '1') {
    return;
  }

  const html = button.innerHTML;
  const w = button.offsetWidth;
  button.dataset.spinnerLock = '1';
  button.disabled = true;
  if (w) button.style.minWidth = `${Math.max(w, 72)}px`;
  button.innerHTML =
    '<span class="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em] opacity-90" aria-hidden="true"></span><span class="sr-only">Memuat</span>';

  try {
    await fn();
  } finally {
    delete button.dataset.spinnerLock;
    button.disabled = false;
    button.style.minWidth = '';
    button.innerHTML = html;
  }
}
