import { withSpinner } from './spinner.js';

const $ = (id) => document.getElementById(id);

function iconSvg(kind) {
  const base = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  if (kind === 'send') return `<svg ${base}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
  if (kind === 'add') return `<svg ${base}><path d="M12 5v14M5 12h14"/></svg>`;
  if (kind === 'edit') return `<svg ${base}><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z"/></svg>`;
  if (kind === 'delete') return `<svg ${base}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`;
  if (kind === 'reload') return `<svg ${base}><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
  if (kind === 'logout') return `<svg ${base}><path d="m9 21-7-9 7-9"/><path d="M2 12h14"/><path d="M23 3v18"/></svg>`;
  if (kind === 'user') return `<svg ${base}><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`;
  if (kind === 'docs') return `<svg ${base}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`;
  if (kind === 'chat') return `<svg ${base}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 1 1 18-4Z"/></svg>`;
  if (kind === 'api') return `<svg ${base}><path d="M8 10h8M8 14h5"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>`;
  if (kind === 'device') return `<svg ${base}><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></svg>`;
  if (kind === 'contacts') return `<svg ${base}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
  if (kind === 'profile') return `<svg ${base}><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>`;
  return `<svg ${base}><circle cx="12" cy="12" r="9"/></svg>`;
}

function inferIconKind(text) {
  const t = text.toLowerCase();
  if (t.includes('kirim') || t.includes('send') || t.includes('hubungkan')) return 'send';
  if (t.includes('tambah') || t.includes('buat') || t.includes('generate') || t.includes('baru')) return 'add';
  if (t.includes('edit') || t.includes('simpan') || t.includes('ubah')) return 'edit';
  if (t.includes('hapus') || t.includes('delete')) return 'delete';
  if (t.includes('reload') || t.includes('muat')) return 'reload';
  if (t.includes('keluar') || t.includes('logout')) return 'logout';
  if (t.includes('chat')) return 'chat';
  if (t.includes('api') || t.includes('/health') || t.includes('dokumen')) return 'api';
  if (t.includes('device')) return 'device';
  if (t.includes('kontak')) return 'contacts';
  if (t.includes('profil')) return 'profile';
  if (t.includes('user') || t.includes('pengguna')) return 'user';
  if (t.includes('docs') || t.includes('dokumentasi')) return 'docs';
  return 'default';
}

function decorateIcons(root = document) {
  const nodes = root.querySelectorAll('button, .nav-tab, header a');
  nodes.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.iconized === '1') return;
    const label = (el.textContent || '').trim();
    if (!label) return;
    const kind = inferIconKind(label);
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.className = 'inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-90';
    icon.innerHTML = iconSvg(kind);
    el.classList.add('inline-flex', 'items-center', 'gap-2');
    el.prepend(icon);
    el.dataset.iconized = '1';
  });
}

function setupAutoIconDecorator() {
  decorateIcons();
  const obs = new MutationObserver((muts) => {
    for (const mut of muts) {
      for (const n of mut.addedNodes) {
        if (n instanceof HTMLElement) decorateIcons(n);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

/** @type {{ id: number, email: string, role: string } | null} */
let currentUser = null;
let qrPoll = null;
let qrSession = null;

/** Mencegah `hashchange` memanggil ulang sinkronisasi saat kita yang mengubah hash. */
let syncingHash = false;

const DASH_ROUTE_TABS = new Set(['devices', 'send', 'contacts', 'docs', 'users', 'profile', 'webhooks']);

/** @type {HTMLSelectElement | null} */
let sendDeviceSelect = null;
/** @type {HTMLSelectElement | null} */
let sendContactSelect = null;

/** @type {Array<{ id: number, name: string }>} */
let groupsCache = [];
/** @type {Array<{ id: number, display_name: string, phone: string, group_id: number | null, group_name?: string | null }>} */
let contactsCache = [];
/** @type {HTMLSelectElement | null} */
let modalContactGroupCombo = null;
/** @type {HTMLSelectElement | null} */
let comboContactGroupFilter = null;
/** @type {number | null} Baris grup yang sedang diedit inline di modal Kelola grup */
let modalGroupEditingId = null;
/** @type {'contacts' | 'groups'} */
let contactSubtab = 'contacts';
let webhookUiBound = false;
const panelHideTimers = new WeakMap();

function hasSelect2() {
  return Boolean(window.jQuery?.fn?.select2);
}

function initAllSelect2IfNeeded(scope = document) {
  if (!hasSelect2()) return;
  const jq = window.jQuery;
  const selects = scope.querySelectorAll('select');
  selects.forEach((el) => {
    if (!(el instanceof HTMLSelectElement)) return;
    if (el.dataset.select2Init === '1') return;
    const placeholder = el.dataset.s2Placeholder || '';
    jq(el).select2({
      width: '100%',
      placeholder,
      minimumResultsForSearch: 0,
      dropdownAutoWidth: false,
    });
    el.dataset.select2Init = '1';
  });
}

function initSendSelect2IfNeeded() {
  sendDeviceSelect = $('selectSendDevice');
  sendContactSelect = $('selectSendContact');
  initAllSelect2IfNeeded();
  if (!hasSelect2()) return;
  const jq = window.jQuery;
  if (sendContactSelect && sendContactSelect.dataset.select2BindPhone !== '1') {
    jq(sendContactSelect).on('change', () => {
      if (sendContactSelect?.value) $('sendPhone').value = sendContactSelect.value;
    });
    sendContactSelect.dataset.select2BindPhone = '1';
  }
}

function setSendSelectOptions(select, items, fallbackValue = '') {
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    if (item.meta) opt.dataset.meta = item.meta;
    select.appendChild(opt);
  }
  const values = new Set(items.map((x) => x.value));
  if (values.has(prev)) select.value = prev;
  else if (values.has(fallbackValue)) select.value = fallbackValue;
  else if (items.length) select.value = items[0].value;
  else select.value = '';
}

function closeSendSelect2Dropdowns() {
  if (!hasSelect2()) return;
  const jq = window.jQuery;
  document.querySelectorAll('select[data-select2-init="1"]').forEach((el) => {
    jq(el).select2('close');
  });
}

function getSendDeviceValue() {
  return sendDeviceSelect?.value ?? '';
}

async function refreshSendCombos() {
  initSendSelect2IfNeeded();
  if (!sendDeviceSelect || !sendContactSelect) return;
  try {
    const [{ devices }, { contacts }] = await Promise.all([apiJson('/devices'), apiJson('/contacts')]);
    setSendSelectOptions(
      sendDeviceSelect,
      devices.map((x) => ({
        value: x.session_id,
        label: `${x.label || x.session_id}${x.status ? ` (${x.status})` : ''}`,
      })),
      '',
    );
    const contactItems = [{ value: '', label: 'Tanpa kontak (isi nomor di bawah)' }];
    for (const c of contacts) {
      const meta = [c.group_name, c.phone].filter(Boolean).join(' · ');
      contactItems.push({ value: c.phone, label: meta ? `${c.display_name} — ${meta}` : c.display_name });
    }
    setSendSelectOptions(sendContactSelect, contactItems, '');
    if (hasSelect2()) {
      const jq = window.jQuery;
      jq(sendDeviceSelect).trigger('change.select2');
      jq(sendContactSelect).trigger('change.select2');
    }
  } catch {
    /* */
  }
}

async function loadWebhookBySelectedDevice() {
  const sid = $('webhookDevice')?.value || '';
  if (!sid) return;
  const out = await apiJson(`/webhooks/${encodeURIComponent(sid)}`);
  const hook = out.webhook;
  $('webhookUrl').value = hook?.url || '';
  $('webhookEnabled').checked = hook ? Boolean(hook.enabled) : true;
}

async function loadWebhookDevices() {
  const sel = $('webhookDevice');
  if (!sel) return;
  const { devices } = await apiJson('/devices');
  const prev = sel.value;
  sel.innerHTML = '';
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.session_id;
    opt.textContent = d.label ? `${d.label} (${d.session_id})` : d.session_id;
    sel.appendChild(opt);
  }
  if (!devices.length) {
    $('webhookUrl').value = '';
    $('webhookEnabled').checked = true;
    return;
  }
  sel.value = devices.some((d) => d.session_id === prev) ? prev : devices[0].session_id;
  if (hasSelect2()) window.jQuery(sel).trigger('change.select2');
  await loadWebhookBySelectedDevice();
}

function bindWebhookUiEvents() {
  if (webhookUiBound) return;
  webhookUiBound = true;

  $('webhookDevice')?.addEventListener('change', () => {
    void loadWebhookBySelectedDevice();
  });

  $('btnWebhookSave')?.addEventListener('click', () => {
    const sid = $('webhookDevice')?.value || '';
    const url = $('webhookUrl')?.value?.trim() || '';
    const enabled = Boolean($('webhookEnabled')?.checked);
    if (!sid || !url) {
      toast('Pilih device dan isi URL webhook.', 'error');
      return;
    }
    void withSpinner($('btnWebhookSave'), async () => {
      try {
        await apiJson(`/webhooks/${encodeURIComponent(sid)}`, {
          method: 'PUT',
          body: JSON.stringify({ url, enabled }),
        });
        toast('Webhook tersimpan.', 'ok');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Gagal menyimpan webhook', 'error');
      }
    });
  });

  $('btnWebhookTest')?.addEventListener('click', () => {
    const sid = $('webhookDevice')?.value || '';
    if (!sid) return;
    void withSpinner($('btnWebhookTest'), async () => {
      try {
        await apiJson(`/webhooks/${encodeURIComponent(sid)}/test`, { method: 'POST' });
        toast('Test webhook dikirim.', 'ok');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Gagal test webhook', 'error');
      }
    });
  });

  $('btnWebhookDelete')?.addEventListener('click', async () => {
    const sid = $('webhookDevice')?.value || '';
    if (!sid) return;
    if (!(await askConfirm(`Hapus webhook untuk device "${sid}"?`, { title: 'Hapus webhook' }))) return;
    void withSpinner($('btnWebhookDelete'), async () => {
      try {
        await apiJson(`/webhooks/${encodeURIComponent(sid)}`, { method: 'DELETE' });
        $('webhookUrl').value = '';
        $('webhookEnabled').checked = true;
        toast('Webhook dihapus.', 'ok');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Gagal menghapus webhook', 'error');
      }
    });
  });
}

async function openWebhookForSession(sessionId) {
  await showTab('webhooks');
  setDashboardHashFromState('webhooks', false);
  bindWebhookUiEvents();
  await loadWebhookDevices();
  const sel = $('webhookDevice');
  if (!sel) return;
  sel.value = sessionId;
  if (hasSelect2()) window.jQuery(sel).trigger('change.select2');
  await loadWebhookBySelectedDevice();
}

function toast(text, type = 'info') {
  const el = document.createElement('div');
  const base =
    'pointer-events-auto cursor-pointer rounded-xl border px-4 py-3.5 text-sm shadow-wg backdrop-blur-md animate-toast-in border-white/12 bg-[rgba(22,30,42,0.95)]';
  const err = type === 'error' ? ' border-red-400/40' : '';
  const ok = type === 'ok' ? ' border-emerald-400/40' : '';
  el.className = base + err + ok;
  el.textContent = text;
  $('toasts').appendChild(el);
  const t = setTimeout(() => el.remove(), 5000);
  el.addEventListener('click', () => {
    clearTimeout(t);
    el.remove();
  });
}

/**
 * @param {string} text
 * @param {{ title?: string, yesText?: string, noText?: string }} [opts]
 * @returns {Promise<boolean>}
 */
function askConfirm(text, opts = {}) {
  const modal = $('confirmModal');
  const titleEl = $('confirmModalTitle');
  const textEl = $('confirmModalText');
  const yesBtn = $('btnConfirmYes');
  const noBtn = $('btnConfirmNo');
  if (!modal || !titleEl || !textEl || !yesBtn || !noBtn) {
    return Promise.resolve(window.confirm(text));
  }

  titleEl.textContent = opts.title || 'Konfirmasi';
  textEl.textContent = text;
  yesBtn.textContent = opts.yesText || 'Ya, lanjutkan';
  noBtn.textContent = opts.noText || 'Batal';

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  return new Promise((resolve) => {
    const cleanup = () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onEsc);
    };
    const onYes = () => {
      cleanup();
      resolve(true);
    };
    const onNo = () => {
      cleanup();
      resolve(false);
    };
    const onBackdrop = (e) => {
      if (e.target === modal) onNo();
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') onNo();
    };
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onEsc);
    noBtn.focus();
  });
}

async function apiJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base = data.error || res.statusText || 'Request failed';
    const meth = String(options.method || 'GET').toUpperCase();
    throw new Error(`${base} (${meth} /api${path})`);
  }
  return data;
}

/**
 * @param {Response} res
 * @param {string} method
 * @param {string} path
 */
async function parseApiResponse(res, method, path) {
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base = data.error || res.statusText || 'Request failed';
    throw new Error(`${base} (${method} /api${path})`);
  }
  return data;
}

async function fetchQrBlob(sessionId) {
  const res = await fetch(`/api/session/qr/${encodeURIComponent(sessionId)}`, {
    credentials: 'include',
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  if (res.status === 404) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || 'QR belum siap');
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText);
  }
  return res.blob();
}

function stopQrPoll() {
  if (qrPoll) {
    clearInterval(qrPoll);
    qrPoll = null;
  }
  qrSession = null;
}

/**
 * Transisi halus antar tab-panel (fade + slide ringan).
 * @param {string} activePanel
 */
function animateTabPanels(activePanel) {
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach((panel) => {
    if (!(panel instanceof HTMLElement)) return;
    panel.classList.add('transition-all', 'duration-200', 'ease-out');
    const isActive = panel.dataset.panel === activePanel;

    const prevTimer = panelHideTimers.get(panel);
    if (prevTimer) {
      clearTimeout(prevTimer);
      panelHideTimers.delete(panel);
    }

    if (isActive) {
      panel.classList.remove('hidden', 'pointer-events-none');
      panel.classList.add('opacity-0', 'translate-y-1');
      requestAnimationFrame(() => {
        panel.classList.remove('opacity-0', 'translate-y-1');
        panel.classList.add('opacity-100', 'translate-y-0');
      });
    } else {
      panel.classList.remove('opacity-100', 'translate-y-0');
      panel.classList.add('opacity-0', 'translate-y-1', 'pointer-events-none');
      const t = setTimeout(() => {
        panel.classList.add('hidden');
        panelHideTimers.delete(panel);
      }, 200);
      panelHideTimers.set(panel, t);
    }
  });
}

/**
 * @param {string} name
 * @param {HTMLButtonElement | undefined} tabBtn
 */
async function showTab(name, tabBtn) {
  initAllSelect2IfNeeded();
  closeSendSelect2Dropdowns();

  document.querySelectorAll('.nav-tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.className =
      'nav-tab rounded-lg border-0 px-3.5 py-2 text-sm font-semibold transition-colors cursor-pointer ' +
      (on ? 'bg-white/[0.07] text-wg-text' : 'bg-transparent text-wg-muted hover:text-wg-text');
  });
  animateTabPanels(name);
  stopQrPoll();

  if (name === 'send') {
    await refreshSendCombos();
  }

  if (name === 'contacts') {
    const btn = tabBtn || document.querySelector('.nav-tab[data-tab="contacts"]');
    await withSpinner(btn, async () => {
      try {
        await loadContactPage();
        switchContactsSubtab(contactSubtab);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Gagal memuat kontak', 'error');
      }
    });
  }

  if (name === 'docs') {
    const btn = tabBtn || document.querySelector('.nav-tab[data-tab="docs"]');
    await withSpinner(btn, async () => {
      try {
        await loadDocs();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Gagal memuat dokumentasi', 'error');
      }
    });
  }

  if (name === 'users' && currentUser?.role === 'admin') {
    const btn = tabBtn || document.querySelector('.nav-tab[data-tab="users"]');
    await withSpinner(btn, async () => {
      try {
        await loadUsersPanel();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Gagal memuat data pengguna', 'error');
      }
    });
  }

  if (name === 'profile') {
    $('profileFullName').value = currentUser?.full_name || '';
    $('profileEmail').value = currentUser?.email || '';
  }

  if (name === 'webhooks') {
    bindWebhookUiEvents();
    const btn = tabBtn || document.querySelector('.nav-tab[data-tab="webhooks"]');
    await withSpinner(btn, async () => {
      await loadWebhookDevices();
    });
  }
}

/** @returns {{ tab: string, addDevice: boolean }} */
function parseDashboardRoute() {
  let frag = (location.hash || '').replace(/^#/, '').trim();
  if (!frag || frag === '/') frag = '/devices';
  if (!frag.startsWith('/')) frag = `/${frag}`;
  const parts = frag.split('/').filter(Boolean);
  const firstRaw = parts[0] || 'devices';
  const first = firstRaw === 'admin' ? 'users' : firstRaw;
  const tab = DASH_ROUTE_TABS.has(first) ? first : 'devices';
  const addDevice = tab === 'devices' && (parts[1] === 'add' || parts[1] === 'new');
  return { tab, addDevice };
}

function setDashboardHashFromState(tab, addDevice) {
  const path = tab === 'devices' && addDevice ? '#/devices/add' : `#/${tab}`;
  if (location.hash === path) return;
  syncingHash = true;
  location.hash = path;
  syncingHash = false;
}

async function syncDashboardFromHash() {
  if (syncingHash) return;
  if (location.hash === '#/admin') {
    syncingHash = true;
    history.replaceState(null, '', '#/users');
    syncingHash = false;
  }
  let { tab, addDevice } = parseDashboardRoute();
  if (tab === 'users' && currentUser?.role !== 'admin') {
    tab = 'devices';
    addDevice = false;
    setDashboardHashFromState('devices', false);
  }
  const tabBtn = /** @type {HTMLButtonElement | undefined} */ (
    document.querySelector(`.nav-tab[data-tab="${tab}"]`) ?? undefined
  );
  await showTab(tab, tabBtn);
  if (tab === 'devices') {
    if (addDevice) await openAddDevicePanel({ skipUrl: true, skipShowTab: true });
    else closeAddDevicePanel({ skipUrl: true });
  } else {
    closeAddDevicePanel({ skipUrl: true });
  }
}

async function loadDocs() {
  const res = await fetch('/api/docs', { credentials: 'include' });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const text = await res.text();
  $('docContent').textContent = text;
}

async function loadDevices() {
  const { devices } = await apiJson('/devices');
  const tbody = $('deviceTableBody');
  tbody.innerHTML = '';
  $('deviceEmpty').hidden = devices.length > 0;
  $('deviceTable').hidden = devices.length === 0;

  for (const d of devices) {
    const connected = d.status === 'connected';
    const primaryAct = connected ? 'stop' : 'connect';
    const primaryLabel = connected ? 'Stopped' : 'Hubungkan';
    const tr = document.createElement('tr');
    const st = String(d.status).toLowerCase();
    const pillCls =
      st === 'connected'
        ? 'inline-block rounded-md px-2 py-0.5 text-[0.72rem] font-semibold uppercase text-emerald-300 bg-emerald-500/10'
        : st === 'connecting'
          ? 'inline-block rounded-md px-2 py-0.5 text-[0.72rem] font-semibold uppercase text-amber-400 bg-amber-400/10'
          : 'inline-block rounded-md px-2 py-0.5 text-[0.72rem] font-semibold uppercase text-wg-muted bg-white/[0.06]';
    tr.innerHTML = `
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left"><code class="font-mono text-[0.85em]">${escapeHtml(d.session_id)}</code></td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${escapeHtml(d.label || '—')}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left"><span class="${pillCls}">${escapeHtml(d.status)}</span></td>
      <td class="border-b border-white/[0.08] px-3 py-2.5">
        <div class="flex flex-wrap gap-1.5 whitespace-nowrap">
        <button type="button" class="rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-wg-muted transition hover:border-white/[0.10] hover:bg-white/[0.07] hover:text-wg-text active:scale-[0.98] disabled:opacity-45" data-act="${primaryAct}" data-sid="${escapeHtml(d.session_id)}">${primaryLabel}</button>
        ${
          connected
            ? ''
            : `<button type="button" class="rounded-xl border border-dashed border-white/20 bg-transparent px-3 py-2 text-xs font-semibold text-wg-muted transition hover:border-solid hover:text-wg-text" data-act="qr" data-sid="${escapeHtml(d.session_id)}">QR</button>`
        }
        <button type="button" class="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-45" data-act="del" data-sid="${escapeHtml(d.session_id)}">Hapus</button>
        <button type="button" class="rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-wg-muted transition hover:border-white/[0.10] hover:bg-white/[0.07] hover:text-wg-text active:scale-[0.98] disabled:opacity-45" data-act="webhook" data-sid="${escapeHtml(d.session_id)}">Webhook</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sid = btn.getAttribute('data-sid');
      const act = btn.getAttribute('data-act');
      if (act === 'connect') {
        void withSpinner(btn, async () => {
          try {
            await connectDevice(sid);
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal', 'error');
          }
        });
      }
      if (act === 'stop') {
        if (
          !(await askConfirm('Hentikan sesi WhatsApp di server? (data login tetap ada, bisa Hubungkan lagi.)', {
            title: 'Hentikan sesi',
          }))
        )
          return;
        void withSpinner(btn, async () => {
          try {
            await stopDeviceRuntime(sid);
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal', 'error');
          }
        });
      }
      if (act === 'qr') {
        void withSpinner(btn, async () => {
          try {
            await openQrModal(sid);
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal', 'error');
          }
        });
      }
      if (act === 'del') {
        if (
          !(await askConfirm(`Hapus device "${sid}"? Sesi dan data autentikasi di server akan dihapus.`, {
            title: 'Hapus device',
          }))
        )
          return;
        void withSpinner(btn, async () => {
          try {
            await deleteDeviceApi(sid);
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal', 'error');
          }
        });
      }
      if (act === 'webhook') {
        void withSpinner(btn, async () => {
          try {
            await openWebhookForSession(sid);
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal membuka webhook', 'error');
          }
        });
      }
    });
  });

  await refreshSendCombos();
}

async function fetchContactsData() {
  const [{ groups }, { contacts }] = await Promise.all([
    apiJson('/contact-groups'),
    apiJson('/contacts'),
  ]);
  groupsCache = Array.isArray(groups) ? groups : [];
  contactsCache = Array.isArray(contacts) ? contacts : [];
}

function closeContactModal() {
  const m = $('inlineContactPanel');
  if (m) m.hidden = true;
  modalContactGroupCombo = $('selectModalContactGroup');
}

function closeGroupsModal() {
  modalGroupEditingId = null;
}

/** @param {'contacts' | 'groups'} tab */
function switchContactsSubtab(tab) {
  contactSubtab = tab;
  const contactsWrap = $('contactSubtabContacts');
  const groupsWrap = $('contactSubtabGroups');
  const contactForm = $('inlineContactPanel');
  const contactsTable = $('contactsTableWrap');
  if (contactsWrap) contactsWrap.hidden = tab !== 'contacts';
  if (groupsWrap) groupsWrap.hidden = tab !== 'groups';
  if (contactForm) contactForm.hidden = tab !== 'contacts' || contactForm.hidden;
  if (contactsTable) contactsTable.hidden = tab !== 'contacts';

  document.querySelectorAll('[data-contact-subtab]').forEach((btn) => {
    const on = btn.getAttribute('data-contact-subtab') === tab;
    btn.className =
      'rounded-lg border-0 px-3.5 py-2 text-sm font-semibold transition-colors ' +
      (on ? 'bg-white/[0.07] text-wg-text' : 'bg-transparent text-wg-muted hover:text-wg-text');
  });
}

function closeQrPanel() {
  const p = $('qrPanel');
  if (p) p.hidden = true;
  stopQrPoll();
  const img = $('qrModalImg');
  if (img?.dataset.url) {
    URL.revokeObjectURL(img.dataset.url);
    delete img.dataset.url;
  }
  if ($('qrModalWait')) $('qrModalWait').textContent = 'Memuat QR…';
  if ($('qrModalImg')) $('qrModalImg').hidden = true;
}

/** Tutup panel inline + combobox terbuka — setelah login / BFCache / sebelum logout. */
function resetDashboardUi() {
  closeContactModal();
  closeGroupsModal();
  closeAddDevicePanel({ skipUrl: true });
  closeQrPanel();
  closeSendSelect2Dropdowns();
}

/** @param {unknown} raw */
function slugifySessionId(raw) {
  return String(raw)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

const SESSION_ID_CLIENT_OK = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * @param {{ skipUrl?: boolean }} [opts]
 * skipUrl: jangan ubah hash (reset BFCache, sinkron dari URL, dll.)
 */
function closeAddDevicePanel(opts = {}) {
  const p = $('addDevicePanel');
  if (p) p.hidden = true;
  if (!opts.skipUrl) {
    const { addDevice } = parseDashboardRoute();
    if (addDevice) setDashboardHashFromState('devices', false);
  }
}

/**
 * @param {{ skipUrl?: boolean, skipShowTab?: boolean }} [opts]
 */
async function openAddDevicePanel(opts = {}) {
  if (!opts.skipShowTab) await showTab('devices');
  closeQrPanel();
  const p = $('addDevicePanel');
  if (!p) return;
  $('modalNewLabel').value = '';
  $('newSessionId').value = '';
  p.hidden = false;
  requestAnimationFrame(() => $('modalNewLabel')?.focus());
  requestAnimationFrame(() => p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  if (!opts.skipUrl) setDashboardHashFromState('devices', true);
}

async function mountContactGroupFilterCombo() {
  const el = $('selectContactGroupFilter');
  if (!el) return;

  comboContactGroupFilter = /** @type {HTMLSelectElement} */ (el);
  const prev = comboContactGroupFilter.value ?? '';
  comboContactGroupFilter.innerHTML = '';
  [
    { value: '', label: 'Semua kontak' },
    { value: '__none__', label: 'Tanpa grup' },
    ...groupsCache.map((g) => ({ value: String(g.id), label: g.name })),
  ].forEach((x) => {
    const opt = document.createElement('option');
    opt.value = x.value;
    opt.textContent = x.label;
    comboContactGroupFilter.appendChild(opt);
  });
  const valid =
    prev === '' ||
    prev === '__none__' ||
    groupsCache.some((x) => String(x.id) === prev);
  comboContactGroupFilter.value = valid ? prev : '';
  if (comboContactGroupFilter.dataset.boundChange !== '1') {
    comboContactGroupFilter.addEventListener('change', () => renderContactsTable());
    comboContactGroupFilter.dataset.boundChange = '1';
  }
  initAllSelect2IfNeeded();
  if (hasSelect2()) window.jQuery(comboContactGroupFilter).trigger('change.select2');
}

function renderContactsTable() {
  const cb = $('contactsBody');
  const empty = $('contactsEmpty');
  if (!cb || !empty) return;

  const raw = comboContactGroupFilter?.value ?? '';
  let rows = contactsCache;
  if (raw === '__none__') {
    rows = contactsCache.filter((c) => c.group_id == null);
  } else if (raw !== '' && raw !== undefined) {
    rows = contactsCache.filter((c) => String(c.group_id) === String(raw));
  }

  const q = ($('contactSearch')?.value ?? '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((c) => {
      const name = String(c.display_name || '').toLowerCase();
      const phone = String(c.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }

  cb.innerHTML = '';
  empty.hidden = rows.length > 0;
  if (contactsCache.length === 0) {
    empty.textContent = 'Belum ada kontak.';
  } else if (!rows.length) {
    empty.textContent =
      q || (raw !== '' && raw !== undefined)
        ? 'Tidak ada kontak yang cocok dengan filter grup atau pencarian.'
        : 'Tidak ada kontak untuk filter ini.';
  } else {
    empty.textContent = '';
  }

  for (const c of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${escapeHtml(c.display_name)}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left"><code class="font-mono text-[0.85em]">${escapeHtml(c.phone)}</code></td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${escapeHtml(c.group_name || '—')}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5">
        <div class="flex flex-wrap gap-1.5 whitespace-nowrap">
        <button type="button" class="rounded-xl border border-dashed border-white/20 bg-transparent px-3 py-2 text-xs font-semibold text-wg-muted transition hover:border-solid hover:text-wg-text" data-edit-contact="${c.id}">Edit</button>
        <button type="button" class="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20" data-del-contact="${c.id}">Hapus</button>
        </div>
      </td>`;
    cb.appendChild(tr);
  }

  cb.querySelectorAll('button[data-edit-contact]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-edit-contact'));
      const c = contactsCache.find((x) => x.id === id);
      if (c) void openContactModal(c);
    });
  });

  cb.querySelectorAll('button[data-del-contact]').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-del-contact');
      if (!(await askConfirm('Hapus kontak ini?', { title: 'Hapus kontak' }))) return;
      void withSpinner(b, async () => {
        try {
          await apiJson(`/contacts/${id}`, { method: 'DELETE' });
          toast('Kontak dihapus.', 'ok');
          await loadContactPage();
          await refreshSendCombos();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Gagal', 'error');
        }
      });
    });
  });
}

/** @param {unknown} initialGroupId */
function mountModalContactGroupCombo(initialGroupId) {
  const el = $('selectModalContactGroup');
  if (!el) return;
  modalContactGroupCombo = /** @type {HTMLSelectElement} */ (el);
  modalContactGroupCombo.innerHTML = '';
  [{ value: '', label: 'Tanpa grup' }, ...groupsCache.map((g) => ({ value: String(g.id), label: g.name }))].forEach(
    (x) => {
      const opt = document.createElement('option');
      opt.value = x.value;
      opt.textContent = x.label;
      modalContactGroupCombo.appendChild(opt);
    },
  );
  const v =
    initialGroupId === null || initialGroupId === undefined || initialGroupId === ''
      ? ''
      : String(initialGroupId);
  modalContactGroupCombo.value = v;
  initAllSelect2IfNeeded();
  if (hasSelect2()) window.jQuery(modalContactGroupCombo).trigger('change.select2');
}

/** @param {{ id: number, display_name: string, phone: string, group_id: number | null } | null} contact */
async function openContactModal(contact) {
  await showTab('contacts');
  switchContactsSubtab('contacts');
  const modal = $('inlineContactPanel');
  if (!modal) return;
  modal.hidden = false;
  $('contactModalTitle').textContent = contact ? 'Edit kontak' : 'Tambah kontak';
  $('modalContactId').value = contact ? String(contact.id) : '';
  $('modalContactName').value = contact ? contact.display_name : '';
  $('modalContactPhone').value = contact ? contact.phone : '';
  mountModalContactGroupCombo(contact?.group_id != null ? contact.group_id : '');
  requestAnimationFrame(() => modal.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function renderModalGroupsTable() {
  const gb = $('modalGroupsBody');
  const empty = $('groupsModalEmpty');
  if (!gb || !empty) return;
  gb.innerHTML = '';
  empty.hidden = groupsCache.length > 0;

  if (modalGroupEditingId != null && !groupsCache.some((x) => x.id === modalGroupEditingId)) {
    modalGroupEditingId = null;
  }

  for (const g of groupsCache) {
    const tr = document.createElement('tr');
    if (g.id === modalGroupEditingId) {
      const tdName = document.createElement('td');
      tdName.className = 'border-b border-white/[0.08] px-3 py-2.5 text-left';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className =
        'box-border w-full max-w-full rounded-xl border border-white/10 bg-black/35 px-3.5 py-2.5 text-sm text-wg-text outline-none transition focus:border-wg-accent/55 focus:ring-[3px] focus:ring-wg-accent/10';
      inp.maxLength = 100;
      inp.value = g.name;
      inp.autocomplete = 'off';
      inp.setAttribute('data-inline-edit', String(g.id));
      tdName.appendChild(inp);

      const tdAct = document.createElement('td');
      tdAct.className = 'border-b border-white/[0.08] px-3 py-2.5';
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-wrap gap-1.5 whitespace-nowrap';
      const btnSave = document.createElement('button');
      btnSave.type = 'button';
      btnSave.className =
        'rounded-xl border-0 bg-gradient-to-b from-wg-accent to-wg-accent-dim px-3 py-2 text-xs font-semibold text-[#041208] transition hover:brightness-110';
      btnSave.textContent = 'Simpan';
      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className =
        'rounded-xl border border-dashed border-white/20 bg-transparent px-3 py-2 text-xs font-semibold text-wg-muted transition hover:border-solid hover:text-wg-text';
      btnCancel.textContent = 'Batal';

      const save = () => {
        const name = inp.value.trim();
        if (!name) {
          toast('Nama tidak boleh kosong.', 'error');
          return;
        }
        void withSpinner(btnSave, async () => {
          try {
            await apiJson(`/contact-groups/${g.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ name }),
            });
            toast('Grup diperbarui.', 'ok');
            modalGroupEditingId = null;
            await loadContactPage();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Gagal', 'error');
          }
        });
      };

      btnSave.addEventListener('click', save);
      btnCancel.addEventListener('click', () => {
        modalGroupEditingId = null;
        renderModalGroupsTable();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          modalGroupEditingId = null;
          renderModalGroupsTable();
        }
      });

      wrap.append(btnSave, btnCancel);
      tdAct.appendChild(wrap);
      tr.append(tdName, tdAct);
    } else {
      tr.innerHTML = `
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${escapeHtml(g.name)}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5">
        <div class="flex flex-wrap gap-1.5 whitespace-nowrap">
        <button type="button" class="rounded-xl border border-dashed border-white/20 bg-transparent px-3 py-2 text-xs font-semibold text-wg-muted transition hover:border-solid hover:text-wg-text" data-edit-group="${g.id}">Edit</button>
        <button type="button" class="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20" data-del-group="${g.id}">Hapus</button>
        </div>
      </td>`;
    }
    gb.appendChild(tr);
  }

  gb.querySelectorAll('button[data-edit-group]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-edit-group'));
      modalGroupEditingId = id;
      renderModalGroupsTable();
      const inp = gb.querySelector(`input[data-inline-edit="${id}"]`);
      requestAnimationFrame(() => inp?.focus());
    });
  });

  gb.querySelectorAll('button[data-del-group]').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-del-group');
      if (
        !(await askConfirm('Hapus grup? Kontak di grup ini jadi tanpa grup.', {
          title: 'Hapus grup',
        }))
      )
        return;
      void withSpinner(b, async () => {
        try {
          await apiJson(`/contact-groups/${id}`, { method: 'DELETE' });
          toast('Grup dihapus.', 'ok');
          await loadContactPage();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Gagal', 'error');
        }
      });
    });
  });
}

async function loadContactPage() {
  await fetchContactsData();
  await mountContactGroupFilterCombo();
  renderContactsTable();
  renderModalGroupsTable();
  await refreshSendCombos();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function connectDevice(sessionId) {
  await apiJson(`/devices/${encodeURIComponent(sessionId)}/connect`, { method: 'POST' });
  toast('Runtime WhatsApp dimulai.', 'ok');
  await loadDevices();
}

async function stopDeviceRuntime(sessionId) {
  await apiJson(`/devices/${encodeURIComponent(sessionId)}/disconnect`, { method: 'POST' });
  toast('Sesi dihentikan.', 'ok');
  await loadDevices();
}

async function deleteDeviceApi(sessionId) {
  await apiJson(`/devices/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  toast('Device dihapus.', 'ok');
  await loadDevices();
}

async function openQrModal(sessionId) {
  await showTab('devices');
  closeAddDevicePanel();
  stopQrPoll();
  qrSession = sessionId;
  const panel = $('qrPanel');
  if (panel) panel.hidden = false;
  $('qrModalTitle').textContent = `QR — ${sessionId}`;
  $('qrModalImg').hidden = true;
  $('qrModalWait').hidden = false;
  $('qrModalWait').textContent = 'Memuat QR…';
  requestAnimationFrame(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));

  const tick = async () => {
    try {
      const blob = await fetchQrBlob(sessionId);
      const url = URL.createObjectURL(blob);
      const img = $('qrModalImg');
      if (!img) return;
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      img.dataset.url = url;
      img.src = url;
      img.hidden = false;
      $('qrModalWait').hidden = true;
    } catch {
      $('qrModalWait').textContent = 'Menunggu QR… (pastikan device sudah dihubungkan)';
    }
    try {
      const st = await apiJson(`/session/status/${encodeURIComponent(sessionId)}`);
      if (st.status === 'connected') {
        stopQrPoll();
        toast('Perangkat terhubung.', 'ok');
        const p = $('qrPanel');
        if (p) p.hidden = true;
        await loadDevices();
      }
    } catch {
      /* ignore */
    }
  };

  await tick();
  qrPoll = setInterval(tick, 2500);
}

/** Format tanggal/waktu untuk tabel Users (timezone browser). */
function formatUserDateTime(isoOrDate) {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

async function loadUsersPanel() {
  const { users } = await apiJson('/admin/users');
  const ub = $('usersBody');
  if (!ub) return;
  ub.innerHTML = '';
  for (const u of users) {
    const tr = document.createElement('tr');
    const keyCell = u.api_key_configured
      ? `<code class="text-[0.85em]">${escapeHtml(u.api_key_prefix || '')}…</code>`
      : '—';
    const lastLogin = formatUserDateTime(u.last_login_at);
    const devices = Number(u.device_count ?? 0);
    const today = Number(u.messages_sent_today ?? 0);
    const d7 = Number(u.messages_sent_7d ?? 0);
    tr.innerHTML = `
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left tabular-nums">${u.id}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${escapeHtml(u.full_name || '—')}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${escapeHtml(u.email)}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${escapeHtml(u.role)}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left tabular-nums">${devices}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left text-sm text-wg-muted">${lastLogin}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left tabular-nums">${today}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left tabular-nums text-wg-muted">${d7}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5 text-left">${keyCell}</td>
      <td class="border-b border-white/[0.08] px-3 py-2.5">
        <div class="flex flex-wrap gap-1.5 whitespace-nowrap">
        <button type="button" class="rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-wg-muted transition hover:border-white/[0.10] hover:bg-white/[0.07] hover:text-wg-text disabled:opacity-45" data-reg="${u.id}">API key baru</button>
        <button type="button" class="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-45" data-del-user="${u.id}" ${u.id === currentUser?.id ? 'disabled' : ''}>Hapus</button>
        </div>
      </td>`;
    ub.appendChild(tr);
  }
  ub.querySelectorAll('button[data-reg]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-reg');
      void withSpinner(b, async () => {
        try {
          const out = await apiJson(`/admin/users/${id}/api-key`, { method: 'POST' });
          prompt('API key baru (simpan sekarang):', out.api_key);
          await loadUsersPanel();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Gagal', 'error');
        }
      });
    });
  });
  ub.querySelectorAll('button[data-del-user]').forEach((b) => {
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-del-user');
      if (!(await askConfirm(`Hapus pengguna #${id}?`, { title: 'Hapus pengguna' }))) return;
      void withSpinner(b, async () => {
        try {
          await apiJson(`/admin/users/${id}`, { method: 'DELETE' });
          toast('Pengguna dihapus.', 'ok');
          await loadUsersPanel();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Gagal', 'error');
        }
      });
    });
  });
}

document.querySelectorAll('.nav-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    void (async () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      closeAddDevicePanel({ skipUrl: true });
      await showTab(tab, btn);
      setDashboardHashFromState(tab, false);
    })();
  });
});

document.querySelectorAll('[data-menu-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    void (async () => {
      const tab = btn.getAttribute('data-menu-tab');
      if (!tab) return;
      closeAddDevicePanel({ skipUrl: true });
      await showTab(tab);
      setDashboardHashFromState(tab, false);
      const details = btn.closest('details');
      if (details) details.removeAttribute('open');
    })();
  });
});

$('btnWebhookBack')?.addEventListener('click', () => {
  void (async () => {
    await showTab('devices');
    setDashboardHashFromState('devices', false);
  })();
});

$('btnReloadDevices').addEventListener('click', () => {
  const b = $('btnReloadDevices');
  void withSpinner(b, async () => {
    try {
      await loadDevices();
      toast('Daftar device diperbarui.', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
});

$('modalNewLabel')?.addEventListener('input', () => {
  $('newSessionId').value = slugifySessionId($('modalNewLabel').value);
});

$('btnOpenAddDevice')?.addEventListener('click', () => void openAddDevicePanel());

$('btnCloseAddDevicePanel')?.addEventListener('click', () => closeAddDevicePanel());
$('btnCancelAddDevice')?.addEventListener('click', () => closeAddDevicePanel());

$('btnAddDevice').addEventListener('click', () => {
  const b = $('btnAddDevice');
  const labelText = $('modalNewLabel').value.trim();
  const session_id = slugifySessionId(labelText);
  const label = labelText || null;
  if (!labelText) {
    toast('Isi label (nama tampilan).', 'error');
    return;
  }
  if (!session_id || !SESSION_ID_CLIENT_OK.test(session_id)) {
    toast('Session ID tidak bisa dibuat dari label ini. Gunakan huruf atau angka.', 'error');
    return;
  }
  void withSpinner(b, async () => {
    try {
      await apiJson('/devices', {
        method: 'POST',
        body: JSON.stringify({ session_id, label }),
      });
      toast('Device ditambahkan.', 'ok');
      $('modalNewLabel').value = '';
      $('newSessionId').value = '';
      closeAddDevicePanel();
      await loadDevices();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});

$('btnSend').addEventListener('click', () => {
  const b = $('btnSend');
  const message = $('sendMessage').value.trim();
  const fileInput = $('sendAttachment');
  const file = fileInput?.files?.[0] ?? null;

  void withSpinner(b, async () => {
    try {
      await refreshSendCombos();
      const session_id = getSendDeviceValue();
      const number = $('sendPhone').value.replace(/\D/g, '');

      if (!session_id || !number) {
        toast('Lengkapi device dan nomor tujuan.', 'error');
        return;
      }
      if (!file && !message) {
        toast('Isi pesan teks atau pilih lampiran (gambar/dokumen).', 'error');
        return;
      }

      if (file) {
        const fd = new FormData();
        fd.append('session_id', session_id);
        fd.append('number', number);
        fd.append('message', message);
        const kind = file.type.startsWith('image/') ? 'image' : 'document';
        fd.append('media_type', kind);
        fd.append('file', file);
        const res = await fetch('/api/send', { method: 'POST', credentials: 'include', body: fd });
        await parseApiResponse(res, 'POST', '/send');
        fileInput.value = '';
      } else {
        await apiJson('/send', {
          method: 'POST',
          body: JSON.stringify({ session_id, number, message }),
        });
      }
      toast('Pesan masuk antrean.', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});

$('btnLogout').addEventListener('click', () => {
  const b = $('btnLogout');
  void withSpinner(b, async () => {
    try {
      await apiJson('/auth/logout', { method: 'POST' });
    } catch {
      /* */
    }
    resetDashboardUi();
    window.location.href = '/login.html';
  });
});

$('btnCreateUser').addEventListener('click', () => {
  const b = $('btnCreateUser');
  const full_name = $('admFullName').value.trim();
  const email = $('admEmail').value.trim();
  const password = $('admPassword').value;
  const role = $('admRole').value;
  const generate_api_key = $('admGenKey').checked;
  if (!full_name || !email || !password) {
    toast('Nama, email, dan password wajib.', 'error');
    return;
  }
  void withSpinner(b, async () => {
    try {
      const out = await apiJson('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ full_name, email, password, role, generate_api_key }),
      });
      toast('Pengguna dibuat.', 'ok');
      if (out.api_key) {
        prompt('API key (simpan sekarang):', out.api_key);
      }
      $('admFullName').value = '';
      $('admEmail').value = '';
      $('admPassword').value = '';
      await loadUsersPanel();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});

$('btnUpdateProfile')?.addEventListener('click', () => {
  const b = $('btnUpdateProfile');
  const full_name = $('profileFullName')?.value?.trim() || '';
  const email = $('profileEmail')?.value?.trim() || '';
  if (!full_name || !email) {
    toast('Nama dan email wajib diisi.', 'error');
    return;
  }
  void withSpinner(b, async () => {
    try {
      const out = await apiJson('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name, email }),
      });
      currentUser = { ...currentUser, ...out.user };
      $('profileFullName').value = out.user.full_name || '';
      $('userEmail').textContent = out.user.full_name
        ? `${out.user.full_name} (${out.user.email})`
        : out.user.email;
      $('profileEmail').value = out.user.email;
      toast('Profil diperbarui.', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});

$('btnUpdatePassword')?.addEventListener('click', () => {
  const b = $('btnUpdatePassword');
  const current_password = $('profileCurrentPassword')?.value || '';
  const new_password = $('profileNewPassword')?.value || '';
  if (!current_password || !new_password) {
    toast('Isi password lama dan baru.', 'error');
    return;
  }
  void withSpinner(b, async () => {
    try {
      await apiJson('/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ current_password, new_password }),
      });
      $('profileCurrentPassword').value = '';
      $('profileNewPassword').value = '';
      toast('Password diperbarui.', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});


$('btnReloadContacts').addEventListener('click', () => {
  const b = $('btnReloadContacts');
  void withSpinner(b, async () => {
    try {
      await loadContactPage();
      toast('Kontak diperbarui.', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});

$('contactSearch')?.addEventListener('input', () => {
  renderContactsTable();
});

$('btnOpenAddContact')?.addEventListener('click', () => {
  void openContactModal(null);
});

document.querySelectorAll('[data-contact-subtab]').forEach((el) => {
  el.addEventListener('click', () => {
    const tab = el.getAttribute('data-contact-subtab');
    if (tab !== 'contacts' && tab !== 'groups') return;
    if (tab === 'groups') closeContactModal();
    switchContactsSubtab(tab);
  });
});

$('btnModalContactSave')?.addEventListener('click', () => {
  const b = $('btnModalContactSave');
  const id = $('modalContactId').value.trim();
  const display_name = $('modalContactName').value.trim();
  const phone = $('modalContactPhone').value.replace(/\D/g, '');
  const gidRaw = modalContactGroupCombo?.value ?? '';
  if (!display_name) {
    toast('Isi nama kontak.', 'error');
    return;
  }
  if (!phone || phone.length < 8) {
    toast('Nomor tidak valid (min. 8 digit).', 'error');
    return;
  }
  void withSpinner(b, async () => {
    try {
      if (id) {
        const body = { display_name, phone, group_id: gidRaw ? Number(gidRaw) : null };
        await apiJson(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('Kontak diperbarui.', 'ok');
      } else {
        const body = { display_name, phone };
        if (gidRaw) body.group_id = Number(gidRaw);
        await apiJson('/contacts', { method: 'POST', body: JSON.stringify(body) });
        toast('Kontak ditambahkan.', 'ok');
      }
      closeContactModal();
      await loadContactPage();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});

$('btnModalAddGroup')?.addEventListener('click', () => {
  const b = $('btnModalAddGroup');
  const name = $('modalNewGroupName').value.trim();
  if (!name) {
    toast('Isi nama grup.', 'error');
    return;
  }
  void withSpinner(b, async () => {
    try {
      await apiJson('/contact-groups', { method: 'POST', body: JSON.stringify({ name }) });
      toast('Grup ditambahkan.', 'ok');
      $('modalNewGroupName').value = '';
      await loadContactPage();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  });
});

document.querySelectorAll('[data-close-contact]').forEach((el) => {
  el.addEventListener('click', () => closeContactModal());
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const p = $('addDevicePanel');
  if (!p || p.hidden) return;
  closeAddDevicePanel();
  e.preventDefault();
});

document.querySelectorAll('[data-close-qr]').forEach((el) => {
  el.addEventListener('click', () => closeQrPanel());
});

async function boot() {
  resetDashboardUi();
  setupAutoIconDecorator();
  try {
    initAllSelect2IfNeeded();
    const { user } = await apiJson('/auth/me');
    currentUser = user;
    $('userEmail').textContent = user.full_name ? `${user.full_name} (${user.email})` : user.email;
    $('userRole').textContent = user.role;
    if (user.role !== 'admin') $('nav-users').hidden = true;
    await loadDevices();
    if (!location.hash || location.hash === '#') {
      syncingHash = true;
      history.replaceState(null, '', '#/devices');
      if (!location.hash || location.hash === '#') location.hash = '#/devices';
      syncingHash = false;
    }
    await syncDashboardFromHash();
  } catch {
    window.location.href = '/login.html';
  }
}

window.addEventListener('hashchange', () => {
  if (syncingHash) return;
  void syncDashboardFromHash();
});

window.addEventListener('pageshow', (ev) => {
  if (ev.persisted) {
    resetDashboardUi();
    void syncDashboardFromHash();
  }
});

void boot();
