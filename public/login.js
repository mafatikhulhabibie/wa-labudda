import { withSpinner } from './spinner.js';

const form = document.getElementById('loginForm');
const errEl = document.getElementById('loginErr');
const submitBtn = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.hidden = true;
  const fd = new FormData(form);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');

  await withSpinner(submitBtn, async () => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || 'Gagal masuk';
        errEl.hidden = false;
        return;
      }
      window.location.href = '/';
    } catch {
      errEl.textContent = 'Kesalahan jaringan';
      errEl.hidden = false;
    }
  });
});
