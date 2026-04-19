const $ = (id) => document.getElementById(id);

async function apiJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, { credentials: 'include', ...options, headers });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/** @type {{ devices: any[], activeSession: string, ws: WebSocket | null, chats: Map<string, any>, activeChat: string | null }} */
const S = {
  devices: [],
  activeSession: '',
  ws: null,
  chats: new Map(),
  activeChat: null,
};

const WA_PILL_IDLE =
  'inline-flex shrink-0 items-center rounded-md bg-white/[0.06] px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide whitespace-nowrap text-wa-muted';
const WA_PILL_OK =
  'inline-flex shrink-0 items-center rounded-md bg-[rgba(0,168,132,0.2)] px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide whitespace-nowrap text-emerald-200';
const WA_PILL_BAD =
  'inline-flex shrink-0 items-center rounded-md bg-red-500/15 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide whitespace-nowrap text-red-200/95';

function jidLabel(jid) {
  if (!jid) return '';
  if (jid.endsWith('@g.us')) return `Grup · ${jid.split('@')[0].slice(0, 12)}…`;
  if (jid.endsWith('@s.whatsapp.net')) {
    const d = jid.replace('@s.whatsapp.net', '');
    if (d.length > 10) return `${d.slice(0, 4)}…${d.slice(-4)}`;
    return d;
  }
  return jid.slice(0, 20);
}

function jidInitials(jid) {
  const t = jidLabel(jid).replace(/\D/g, '');
  if (t.length >= 2) return t.slice(-2);
  return jidLabel(jid).slice(0, 2).toUpperCase();
}

function jidToNumber(jid) {
  if (jid && jid.endsWith('@s.whatsapp.net')) {
    return jid.replace('@s.whatsapp.net', '');
  }
  return null;
}

function isGroupJid(jid) {
  return Boolean(jid && jid.endsWith('@g.us'));
}

function formatClock(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(ts) {
  return new Date(ts * 1000).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ensureChat(jid) {
  if (!S.chats.has(jid)) {
    S.chats.set(jid, {
      jid,
      title: jidLabel(jid),
      messages: [],
      lastTs: 0,
      preview: '',
    });
  }
  return S.chats.get(jid);
}

function mergeIncoming(ev) {
  const chat = ensureChat(ev.chat_jid);
  const msgKey = String(ev.message_id || '');
  if (msgKey && chat.messages.some((m) => m.msgKey === msgKey)) {
    return;
  }
  chat.messages.push({
    id: `${ev.message_id}-${ev.ts}`,
    msgKey,
    from_me: ev.from_me,
    text: ev.text,
    ts: ev.ts,
  });
  chat.lastTs = ev.ts;
  chat.preview = ev.text;
  if (!ev.from_me) {
    chat.title = jidLabel(ev.chat_jid);
  }
}

function disconnectWs() {
  if (S.ws) {
    try {
      S.ws.close();
    } catch {
      /* */
    }
    S.ws = null;
  }
}

function connectWs() {
  disconnectWs();
  if (!S.activeSession) return;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws/inbox`);
  S.ws = ws;

  $('waConn').textContent = 'Menyambung…';
  $('waConn').className = WA_PILL_IDLE;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'subscribe', session_ids: [S.activeSession] }));
  };

  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === 'subscribed') {
      $('waConn').textContent = 'Realtime';
      $('waConn').className = WA_PILL_OK;
      return;
    }
    if (msg.type === 'hello') return;
    if (msg.type === 'error') {
      $('waConn').textContent = msg.error || 'Error';
      $('waConn').className = WA_PILL_BAD;
      return;
    }
    if (msg.type === 'message' && msg.session_id === S.activeSession) {
      mergeIncoming(msg);
      renderChatList();
      if (S.activeChat === msg.chat_jid) {
        renderMessages();
      }
    }
  };

  ws.onclose = () => {
    $('waConn').textContent = 'Terputus';
    $('waConn').className = WA_PILL_BAD;
  };

  ws.onerror = () => {
    $('waConn').textContent = 'Error';
    $('waConn').className = WA_PILL_BAD;
  };
}

function renderChatList() {
  const q = ($('waSearchChat').value || '').trim().toLowerCase();
  const list = $('waChatList');
  list.innerHTML = '';

  const rows = [...S.chats.entries()]
    .map(([jid, c]) => ({ jid, ...c }))
    .sort((a, b) => b.lastTs - a.lastTs);

  for (const row of rows) {
    if (q && !`${row.title} ${row.preview}`.toLowerCase().includes(q)) continue;

    const el = document.createElement('div');
    el.className =
      'flex cursor-pointer gap-3 border-b border-[rgba(134,150,160,0.12)] px-3 py-2.5 transition-colors hover:bg-wa-panel-hover' +
      (S.activeChat === row.jid ? ' bg-wa-panel-hover' : '');
    el.innerHTML = `
      <div class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#6b7b8c] text-xs font-semibold text-white">${escapeHtml(jidInitials(row.jid))}</div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[0.95rem] font-medium text-[#e9edef]">${escapeHtml(row.title)}</div>
        <div class="truncate text-[0.78rem] text-wa-muted">${escapeHtml(row.preview || ' ')}</div>
      </div>
      <div class="shrink-0 self-start text-[0.72rem] text-wa-muted">${row.lastTs ? formatClock(row.lastTs) : ''}</div>`;
    el.addEventListener('click', () => {
      S.activeChat = row.jid;
      const app = document.getElementById('waApp');
      if (app) app.dataset.state = 'chat';
      renderChatList();
      renderMainHead();
      renderMessages();
    });
    list.appendChild(el);
  }

  if (!list.children.length) {
    const empty = document.createElement('div');
    empty.className =
      'flex min-h-[120px] items-center justify-center px-4 py-6 text-center text-sm leading-relaxed text-wa-muted';
    empty.textContent = 'Belum ada percakapan. Pesan masuk akan muncul di sini.';
    list.appendChild(empty);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMainHead() {
  const head = $('waMainHead');
  const title = $('waHeadTitle');
  const sub = $('waHeadSub');
  const av = $('waHeadAvatar');
  if (!S.activeChat) {
    title.textContent = 'Pilih chat';
    sub.textContent = '';
    av.textContent = '?';
    $('waSendHint').hidden = true;
    return;
  }
  const chat = S.chats.get(S.activeChat);
  title.textContent = chat?.title || jidLabel(S.activeChat);
  sub.textContent = S.activeChat;
  av.textContent = jidInitials(S.activeChat);
  $('waSendHint').hidden = !isGroupJid(S.activeChat);
}

function renderMessages() {
  const box = $('waMessages');
  box.innerHTML = '';
  if (!S.activeChat) {
    const e = document.createElement('div');
    e.className =
      'flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-wa-muted';
    e.textContent = 'Pilih percakapan di kiri untuk mulai.';
    box.appendChild(e);
    return;
  }
  const chat = S.chats.get(S.activeChat);
  if (!chat?.messages.length) {
    const e = document.createElement('div');
    e.className =
      'flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-wa-muted';
    e.textContent = 'Belum ada pesan di chat ini.';
    box.appendChild(e);
    return;
  }

  let lastDay = '';
  for (const m of chat.messages) {
    const day = formatDay(m.ts);
    if (day !== lastDay) {
      lastDay = day;
      const sep = document.createElement('div');
      sep.className = 'my-3 text-center text-[0.72rem] font-medium text-wa-muted';
      sep.textContent = day;
      box.appendChild(sep);
    }
    const row = document.createElement('div');
    row.className = `flex w-full ${m.from_me ? 'justify-end' : 'justify-start'}`;
    const bubbleIn =
      'max-w-[min(520px,85%)] rounded-lg rounded-tl-sm bg-wa-panel px-2.5 py-1.5 text-[0.92rem] leading-snug text-[#e9edef] shadow-wa-msg';
    const bubbleOut =
      'max-w-[min(520px,85%)] rounded-lg rounded-tr-sm bg-[#005c4b] px-2.5 py-1.5 text-[0.92rem] leading-snug text-[#e7ffdb] shadow-wa-msg';
    const metaIn = 'mt-1 flex justify-end text-[0.65rem] text-wa-muted';
    const metaOut = 'mt-1 flex justify-end text-[0.65rem] text-[#e7ffdb]/55';
    row.innerHTML = `
      <div class="${m.from_me ? bubbleOut : bubbleIn}">
        <div>${escapeHtml(m.text)}</div>
        <div class="${m.from_me ? metaOut : metaIn}"><span>${formatClock(m.ts)}</span></div>
      </div>`;
    box.appendChild(row);
  }
  box.scrollTop = box.scrollHeight;
}

async function refreshSessionStatus() {
  if (!S.activeSession) return;
  try {
    const st = await apiJson(`/session/status/${encodeURIComponent(S.activeSession)}`);
    const pill = $('waConn');
    if (st.status === 'connected') {
      pill.textContent = S.ws?.readyState === 1 ? 'Realtime' : st.status;
      pill.className = WA_PILL_OK;
    } else {
      pill.textContent = st.status;
      pill.className = WA_PILL_BAD;
    }
  } catch {
    $('waConn').textContent = 'error';
    $('waConn').className = WA_PILL_BAD;
  }
}

async function boot() {
  try {
    await apiJson('/auth/me');
  } catch {
    window.location.href = '/login.html';
    return;
  }

  const { devices } = await apiJson('/devices');
  S.devices = devices;
  const sel = $('waSession');
  sel.innerHTML = '';
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.session_id;
    opt.textContent = `${d.label || d.session_id} (${d.status})`;
    sel.appendChild(opt);
  }

  if (!devices.length) {
    $('waBoot').innerHTML =
      '<p class="max-w-sm px-4 text-center text-wa-muted">Belum ada device. <a class="font-medium text-sky-400 underline decoration-sky-400/40 underline-offset-2 transition hover:text-sky-300" href="/">Tambah di dashboard</a></p>';
    return;
  }

  S.activeSession = devices[0].session_id;
  sel.value = S.activeSession;

  $('waBoot').hidden = true;
  $('waApp').hidden = false;

  const backList = $('waBackList');
  backList.addEventListener('click', () => {
    const app = document.getElementById('waApp');
    if (app) app.dataset.state = 'list';
  });

  sel.addEventListener('change', async () => {
    S.activeSession = sel.value;
    S.chats.clear();
    S.activeChat = null;
    renderChatList();
    renderMainHead();
    renderMessages();
    connectWs();
    await refreshSessionStatus();
  });

  $('waSearchChat').addEventListener('input', () => renderChatList());

  $('waBtnSend').addEventListener('click', () => void sendDraft());
  $('waMsgInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendDraft();
    }
  });

  renderChatList();
  renderMainHead();
  renderMessages();
  connectWs();
  await refreshSessionStatus();
  setInterval(refreshSessionStatus, 8000);
}

async function sendDraft() {
  const input = $('waMsgInput');
  const text = input.value.trim();
  if (!text || !S.activeSession || !S.activeChat) return;
  if (isGroupJid(S.activeChat)) {
    return;
  }
  const num = jidToNumber(S.activeChat);
  if (!num) return;

  const btn = $('waBtnSend');
  btn.disabled = true;
  try {
    await apiJson('/send', {
      method: 'POST',
      body: JSON.stringify({ session_id: S.activeSession, number: num, message: text }),
    });
    input.value = '';
    mergeIncoming({
      chat_jid: S.activeChat,
      message_id: `local-${Date.now()}`,
      from_me: true,
      text,
      ts: Math.floor(Date.now() / 1000),
      session_id: S.activeSession,
    });
    renderChatList();
    renderMessages();
  } catch (e) {
    alert(e.message || 'Gagal kirim');
  } finally {
    btn.disabled = false;
  }
}

void boot();
