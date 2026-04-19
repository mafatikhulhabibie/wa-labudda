/**

 * Combobox pencarian (vanilla) — cocok untuk device & kontak.

 * @param {HTMLElement} container

 * @param {{

 *   placeholder?: string

 *   searchPlaceholder?: string

 *   getItems: () => Promise<Array<{ value: string, label: string, meta?: string }>>

 *   onSelect?: (item: { value: string, label: string, meta?: string }) => void

 *   autoSelectFirst?: boolean

 * }} options

 */

export function mountCombobox(container, options) {

  const {

    placeholder = 'Pilih…',

    searchPlaceholder = 'Cari…',

    getItems,

    onSelect = () => {},

    autoSelectFirst = false,

  } = options;



  /** @type {Array<{ value: string, label: string, meta?: string }>} */

  let items = [];

  /** @type {{ value: string, label: string, meta?: string } | null} */

  let selected = null;

  let open = false;

  let hi = -1;

  /** Mencegah "click-through": setelah pilih opsi, mouseup/click tidak membuka lagi trigger di bawahnya. */

  let suppressTriggerClickUntil = 0;

  /** @type {null | (() => void)} */

  let tearDownFloating = null;



  const root = document.createElement('div');

  root.className = 'relative w-full max-w-full';



  const trigger = document.createElement('button');

  trigger.type = 'button';

  trigger.className =

    'group flex min-h-[2.75rem] w-full max-w-full cursor-pointer items-center gap-3 rounded-lg border border-white/[0.14] bg-white/[0.04] px-3.5 py-2 text-left text-sm text-wg-text shadow-sm outline-none transition-colors hover:border-white/[0.2] hover:bg-white/[0.06] focus-visible:border-sky-500/50 focus-visible:ring-[3px] focus-visible:ring-sky-500/15 aria-expanded:border-sky-500/45 aria-expanded:bg-black/50 aria-expanded:ring-2 aria-expanded:ring-sky-500/25';

  trigger.setAttribute('aria-haspopup', 'listbox');

  trigger.setAttribute('aria-expanded', 'false');



  const valueEl = document.createElement('span');

  valueEl.className = 'min-w-0 flex-1 truncate';



  const caret = document.createElement('span');

  caret.className =

    'pointer-events-none flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.04] text-wg-muted transition-transform duration-200 group-aria-expanded:rotate-180';

  caret.setAttribute('aria-hidden', 'true');

  caret.innerHTML =

    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';



  trigger.append(valueEl, caret);



  const panel = document.createElement('div');

  panel.className =

    'flex max-h-[min(360px,55vh)] flex-col overflow-hidden rounded-lg border border-white/15 bg-[#0f141c] shadow-[0_20px_50px_rgba(0,0,0,0.55)] ring-1 ring-black/50 backdrop-blur-xl';

  panel.hidden = true;

  panel.setAttribute('role', 'listbox');



  const searchWrap = document.createElement('div');

  searchWrap.className = 'border-b border-white/[0.1] bg-black/30 px-2 pb-2 pt-2';

  const search = document.createElement('input');

  search.type = 'text';

  search.className =

    'm-0 box-border w-full rounded-lg border border-white/[0.12] bg-black/45 px-3 py-2.5 text-sm text-wg-text outline-none placeholder:text-wg-muted/75 focus:border-sky-500/45 focus:ring-2 focus:ring-sky-500/20';

  search.placeholder = searchPlaceholder;

  search.autocomplete = 'off';

  searchWrap.appendChild(search);



  const list = document.createElement('ul');

  list.className = 'm-0 max-h-64 list-none space-y-0.5 overflow-y-auto overflow-x-hidden p-2';

  const liBase =

    'cursor-pointer rounded-md border border-transparent px-3 py-2.5 text-left text-sm text-wg-text transition-colors hover:bg-white/[0.07]';

  const liHi =

    'cursor-pointer rounded-md border border-sky-400/50 bg-sky-600 px-3 py-2.5 text-left text-sm text-white shadow-md ring-1 ring-sky-300/40';



  panel.append(searchWrap, list);

  root.append(trigger, panel);

  container.appendChild(root);



  function renderTrigger() {

    if (selected && (selected.label || selected.value)) {

      valueEl.textContent = selected.label || selected.value;

      valueEl.className = 'min-w-0 flex-1 truncate text-wg-text';

    } else {

      valueEl.textContent = placeholder;

      valueEl.className = 'min-w-0 flex-1 truncate text-wg-muted';

    }

  }



  function filterItems() {

    const q = search.value.trim().toLowerCase();

    if (!q) return items;

    return items.filter((i) => {

      const hay = `${i.label} ${i.meta || ''} ${i.value}`.toLowerCase();

      return hay.includes(q);

    });

  }



  function optionRows() {

    return [...list.querySelectorAll('[role="option"]:not([data-combo-empty])')];

  }



  function paintOptionHighlights() {

    const els = optionRows();

    els.forEach((el, i) => {

      const on = i === hi;

      el.className = on ? liHi : liBase;

      const lab = el.querySelector('[data-combo-label]');

      const meta = el.querySelector('[data-combo-meta]');

      if (lab) {

        lab.className = on

          ? 'truncate text-sm font-semibold text-white'

          : 'truncate text-sm font-semibold text-wg-text';

      }

      if (meta) {

        meta.className = on ? 'mt-0.5 truncate text-xs text-sky-100' : 'mt-0.5 truncate text-xs text-wg-muted';

      }

    });

  }



  function renderList() {

    const rows = filterItems();

    list.innerHTML = '';

    hi = rows.length ? 0 : -1;

    rows.forEach((item, idx) => {

      const li = document.createElement('li');

      li.className = liBase;

      li.setAttribute('role', 'option');

      li.dataset.value = item.value;

      li.dataset.rowIndex = String(idx);

      const lab = document.createElement('div');

      lab.setAttribute('data-combo-label', '1');

      lab.className = 'truncate text-sm font-semibold text-wg-text';

      lab.textContent = item.label || item.value || '—';

      li.appendChild(lab);

      if (item.meta) {

        const meta = document.createElement('div');

        meta.setAttribute('data-combo-meta', '1');

        meta.className = 'mt-0.5 truncate text-xs text-wg-muted';

        meta.textContent = item.meta;

        li.appendChild(meta);

      }

      li.addEventListener('mousedown', (e) => {

        e.preventDefault();

        pickByRowIndex(li.dataset.rowIndex);

      });

      list.appendChild(li);

    });

    paintOptionHighlights();

    if (!rows.length) {

      const li = document.createElement('li');

      li.className = 'cursor-default px-3 py-3 text-center text-sm text-wg-muted';

      li.setAttribute('role', 'option');

      li.dataset.comboEmpty = '1';

      li.textContent = 'Tidak ada hasil';

      list.appendChild(li);

    }

  }



  function highlight(newHi) {

    const rows = filterItems();

    if (!rows.length) return;

    hi = ((newHi % rows.length) + rows.length) % rows.length;

    paintOptionHighlights();

  }



  function pickByRowIndex(rawIndex) {

    const idx = Number(rawIndex);

    if (!Number.isInteger(idx) || idx < 0) return;

    const rows = filterItems();

    const item = rows[idx];

    if (!item) return;

    pick(item);

  }



  function pick(item) {

    selected = item;

    renderTrigger();

    setOpen(false);

    suppressTriggerClickUntil = Date.now() + 400;

    onSelect(item);

  }



  function syncPanelToTrigger() {

    if (!open) return;

    const r = trigger.getBoundingClientRect();

    const gap = 6;

    const room = window.innerHeight - r.bottom - gap - 12;

    const maxH = Math.min(320, Math.max(0, room));

    panel.style.position = 'fixed';

    panel.style.left = `${r.left}px`;

    panel.style.width = `${r.width}px`;

    panel.style.top = `${r.bottom + gap}px`;

    panel.style.right = 'auto';

    panel.style.maxHeight = maxH > 0 ? `${maxH}px` : 'min(320px, 40vh)';

    panel.style.zIndex = '4000';

    panel.style.boxSizing = 'border-box';

  }



  function startFloatingPanel() {

    if (tearDownFloating) return;

    document.body.appendChild(panel);

    const onScrollOrResize = () => syncPanelToTrigger();

    window.addEventListener('scroll', onScrollOrResize, true);

    window.addEventListener('resize', onScrollOrResize);

    tearDownFloating = () => {

      window.removeEventListener('scroll', onScrollOrResize, true);

      window.removeEventListener('resize', onScrollOrResize);

      panel.style.cssText = '';

      root.appendChild(panel);

      tearDownFloating = null;

    };

    syncPanelToTrigger();

  }



  function stopFloatingPanel() {

    if (tearDownFloating) tearDownFloating();

  }



  function setOpen(v) {

    open = v;

    trigger.setAttribute('aria-expanded', v ? 'true' : 'false');

    if (v) {

      search.value = '';

      renderList();

      startFloatingPanel();

      panel.hidden = false;

      requestAnimationFrame(() => {

        syncPanelToTrigger();

        search.focus();

      });

    } else {

      panel.hidden = true;

      stopFloatingPanel();

    }

  }



  /** @param {Event} e */

  function pointerInsideCombo(e) {

    const t = e.target;

    if (t instanceof Node && (root.contains(t) || panel.contains(t))) return true;

    if (typeof e.composedPath === 'function') {

      const path = e.composedPath();

      if (path.some((n) => n === root || n === panel)) return true;

    }

    const x = e.clientX;

    const y = e.clientY;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

    const hit = (el) => {

      const r = el.getBoundingClientRect();

      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

    };

    return hit(trigger) || hit(panel);

  }



  /** @param {Event} e */

  function onOutsidePointerDown(e) {

    if (!open) return;

    if (pointerInsideCombo(e)) return;

    setOpen(false);

  }



  trigger.addEventListener('click', (e) => {

    if (Date.now() < suppressTriggerClickUntil) {

      e.preventDefault();

      e.stopPropagation();

      return;

    }

    setOpen(!open);

    if (open) renderList();

  });



  list.addEventListener('pointerup', (e) => {

    const el = e.target instanceof Element ? e.target.closest('li[role="option"]') : null;

    if (!el || el.dataset.comboEmpty === '1') return;

    e.preventDefault();

    pickByRowIndex(el.dataset.rowIndex);

  });



  list.addEventListener('click', (e) => {

    const el = e.target instanceof Element ? e.target.closest('li[role="option"]') : null;

    if (!el || el.dataset.comboEmpty === '1') return;

    e.preventDefault();

    pickByRowIndex(el.dataset.rowIndex);

  });



  search.addEventListener('input', () => {

    renderList();

  });



  search.addEventListener('keydown', (e) => {

    const rows = filterItems();

    if (e.key === 'ArrowDown') {

      e.preventDefault();

      highlight(hi + 1);

    } else if (e.key === 'ArrowUp') {

      e.preventDefault();

      highlight(hi - 1);

    } else if (e.key === 'Enter') {

      e.preventDefault();

      if (hi >= 0 && rows[hi]) pick(rows[hi]);

    } else if (e.key === 'Escape') {

      e.preventDefault();

      setOpen(false);

      trigger.focus();

    }

  });



  trigger.addEventListener('keydown', (e) => {

    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {

      e.preventDefault();

      if (!open) setOpen(true);

    }

  });



  document.addEventListener('mousedown', onOutsidePointerDown, true);

  document.addEventListener('pointerdown', onOutsidePointerDown, true);

  document.addEventListener('click', onOutsidePointerDown, true);



  renderTrigger();



  return {

    async refresh() {

      items = await getItems();

      if (autoSelectFirst && items.length && (!selected || !items.some((i) => i.value === selected.value))) {

        selected = items[0];

      }

      if (selected && !items.some((i) => i.value === selected.value)) {

        selected = items.length && autoSelectFirst ? items[0] : null;

      }

      renderTrigger();

      if (open) {

        renderList();

        syncPanelToTrigger();

      }

    },

    getValue() {

      return selected?.value ?? '';

    },

    close() {

      setOpen(false);

    },

    /** @param {string} value */

    setValue(value) {

      const it = items.find((i) => i.value === value);

      selected = it || (value ? { value, label: value, meta: '' } : null);

      renderTrigger();

    },

    destroy() {

      document.removeEventListener('mousedown', onOutsidePointerDown, true);

      document.removeEventListener('pointerdown', onOutsidePointerDown, true);

      document.removeEventListener('click', onOutsidePointerDown, true);

      stopFloatingPanel();

      root.remove();

    },

  };

}

