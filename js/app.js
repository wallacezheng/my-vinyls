/* My Vinyls v2 — 前端主程式（設計方向 C「翻唱片箱」） */
(function () {
  'use strict';
  const API = window.VinylAPI;

  // ───────────────────────── 狀態 ─────────────────────────
  const S = {
    records: [],
    byId: new Map(),
    settings: { language: [], sub: [], tags: [], status: [] },
    rate: 32,
    history: {},
    priceInfo: null,
    colors: loadJSON('vinyl.colors') || {},
    crate: { order: [], i: 0 },
    list: freshList(),
    add: { query: '', results: null, form: null, busy: false },
    scroll: {},
    lastHash: location.hash,
    prevHash: ''
  };

  function freshList(over) {
    return Object.assign({ q: '', language: [], sub: [], tags: [], status: [], rating: [], year: [], fav: false, sort: 'recent', shown: 40 }, over || {});
  }

  // ───────────────────────── 工具 ─────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function safeUrl(u) {
    const s = String(u || '').trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } }

  const fmtNT = (n) => 'NT$' + Math.round(n).toLocaleString('en-US');
  const fmtUSD = (n) => 'US$' + Number(n).toFixed(2);
  const fmtDateTime = (s) => String(s || '').replace('T', ' ').slice(0, 16);
  const debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; };

  let toastTimer;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 4200 : 2600);
  }

  function handleError(err) {
    console.error(err);
    if (err instanceof API.AuthError) { showLogin(err.message); return; }
    toast(err.message || String(err), true);
  }

  const I = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M14 9v6M17 9v6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M8 5v14l11-7z"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>'
  };

  // ───────────────────────── 顏色（封面取色 / 備用色盤） ─────────────────────────
  const PALETTE = ['#B23A48', '#E9C46A', '#A8DADC', '#264653', '#E76F51', '#1D3557', '#6B8F71', '#2B2B2B', '#F2A7B6', '#3D405B', '#C9A227', '#7B5EA7'];

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
    }
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }

  function colorsFor(rec) {
    const bg = S.colors[rec.id] || PALETTE[hashStr(rec.id || rec.title || '') % PALETTE.length];
    const dark = luminance(bg) > 0.4;
    const ink = dark ? '#17150F' : '#FFF6F2';
    const [h, s, l] = rgbToHsl.apply(null, hexToRgb(bg));
    const label = hslToHex((h + 0.12) % 1, Math.min(0.75, s + 0.25), l > 0.5 ? 0.38 : 0.72);
    return {
      bg: bg, ink: ink, line: dark ? 'rgba(23,21,15,.22)' : 'rgba(255,246,242,.3)',
      label: label, labelInk: luminance(label) > 0.4 ? '#17150F' : '#FFF6F2'
    };
  }
  function colorVars(rec) {
    const c = colorsFor(rec);
    return `--c-bg:${c.bg};--c-ink:${c.ink};--c-line:${c.line};--c-label:${c.label};--c-label-ink:${c.labelInk}`;
  }
  function applyColorVars(el, rec) {
    const c = colorsFor(rec);
    el.style.setProperty('--c-bg', c.bg); el.style.setProperty('--c-ink', c.ink); el.style.setProperty('--c-line', c.line);
    el.style.setProperty('--c-label', c.label); el.style.setProperty('--c-label-ink', c.labelInk);
  }

  const extracting = new Set();
  function extractColor(rec) {
    if (!rec || !rec.coverUrl || S.colors[rec.id] || extracting.has(rec.id)) return;
    extracting.add(rec.id);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = 24;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        const px = ctx.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, w = 0, ar = 0, ag = 0, ab = 0;
        for (let i = 0; i < px.length; i += 4) {
          const [, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
          ar += px[i]; ag += px[i + 1]; ab += px[i + 2];
          if (s > 0.25 && l > 0.15 && l < 0.85) { const k = s; r += px[i] * k; g += px[i + 1] * k; b += px[i + 2] * k; w += k; }
        }
        const n = px.length / 4;
        let hex = w > n * 0.08 ? rgbToHex(r / w, g / w, b / w) : rgbToHex(ar / n, ag / n, ab / n);
        let [h, s, l] = rgbToHsl.apply(null, hexToRgb(hex));
        l = Math.max(0.26, Math.min(0.66, l)); s = Math.min(s, 0.7);
        hex = hslToHex(h, s, l);
        S.colors[rec.id] = hex;
        saveJSON('vinyl.colors', S.colors);
        $$(`[data-cid="${CSS.escape(rec.id)}"]`).forEach((el) => applyColorVars(el, rec));
      } catch (e) { /* 圖片不允許跨網域讀取：維持備用色 */ }
    };
    img.src = rec.coverUrl;
  }

  /** 沒有封面圖時的替代色：比主色深或淺一階，才不會和背景融在一起 */
  function sleeveColors(rec) {
    const bg = colorsFor(rec).bg;
    const [h, s, l] = rgbToHsl.apply(null, hexToRgb(bg));
    const shade = hslToHex(h, s, l > 0.5 ? l - 0.22 : l + 0.2);
    return { bg: shade, ink: luminance(shade) > 0.4 ? '#17150F' : '#FFF6F2' };
  }

  function coverHTML(rec, extra, alt) {
    const c = sleeveColors(rec);
    const url = safeUrl(rec.coverUrl);
    return `<div class="cover ${extra || ''}" style="--c:${c.bg};--ci:${c.ink}">
      <span class="cover-fallback">${esc(rec.title || '未命名')}</span>
      ${url ? `<img src="${esc(url)}" alt="${esc(alt || '')}" loading="lazy" decoding="async" onload="this.parentNode.classList.add('loaded')" onerror="this.remove()">` : ''}
    </div>`;
  }

  // ───────────────────────── 資料 ─────────────────────────
  function hydrate(d) {
    S.records = d.records || [];
    S.byId = new Map(S.records.map((r) => [r.id, r]));
    S.settings = d.settings || S.settings;
    S.rate = d.exchangeRate || S.rate;
    S.history = d.history || {};
    S.priceInfo = d.priceCursor || null;
    if (S.crate.order.length !== S.records.length) buildCrateOrder();
  }
  function persist() {
    API.saveCache({ records: S.records, settings: S.settings, exchangeRate: S.rate, history: S.history, priceCursor: S.priceInfo });
  }
  function upsert(rec) {
    const i = S.records.findIndex((r) => r.id === rec.id);
    if (i === -1) { S.records.push(rec); S.crate.order.push(rec.id); } else S.records[i] = rec;
    S.byId.set(rec.id, rec);
    persist();
  }
  function removeLocal(id) {
    S.records = S.records.filter((r) => r.id !== id);
    S.byId.delete(id);
    S.crate.order = S.crate.order.filter((x) => x !== id);
    persist();
  }
  const byRecent = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

  function buildCrateOrder() {
    // 每天換一次順序：同一天打開看到的箱子順序一樣
    let seed = hashStr(new Date().toISOString().slice(0, 10));
    const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ids = S.records.map((r) => r.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    S.crate.order = ids; S.crate.i = 0;
  }

  async function refresh(silent) {
    try {
      const d = await API.bootstrap();
      hydrate(d);
      if (!silent) render();
      else if (!$('#sheet').hidden || /^#\/add/.test(location.hash)) { /* 正在編輯，不打斷 */ }
      else render(true);
    } catch (e) { handleError(e); }
  }

  // ───────────────────────── 登入 ─────────────────────────
  function showLogin(msg) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-error').textContent = msg || '';
    setTimeout(() => $('#login-pass').focus(), 50);
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    $('#login-error').textContent = '';
    try {
      await API.login($('#login-pass').value);
      $('#login-pass').value = '';
      const d = await API.bootstrap();
      hydrate(d);
      $('#login').hidden = true;
      $('#app').hidden = false;
      render();
    } catch (err) {
      $('#login-error').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = '開啟';
    }
  });

  // ───────────────────────── 路由 ─────────────────────────
  function route() {
    const h = location.hash || '#/';
    const [path, qs] = h.slice(1).split('?');
    const params = new URLSearchParams(qs || '');
    const m = path.match(/^\/r\/(.+)$/);
    if (m) return { name: 'detail', id: decodeURIComponent(m[1]) };
    if (path === '/all') return { name: 'all', params: params };
    if (path === '/add') return { name: 'add' };
    if (path === '/stats') return { name: 'stats' };
    return { name: 'home' };
  }

  window.addEventListener('scroll', () => { S.scroll[location.hash || '#/'] = window.scrollY; }, { passive: true });
  window.addEventListener('hashchange', () => {
    const r = route();
    if (r.name === 'all' && r.params.toString()) {
      // 從首頁的語系/標籤磚進來：套用新的篩選
      const p = r.params;
      S.list = freshList({
        language: p.getAll('lang'), tags: p.getAll('tag'), fav: p.get('fav') === '1',
        sort: p.get('sort') || 'recent'
      });
    }
    if (!$('#sheet').hidden) closeSheet();
    S.prevHash = S.lastHash;
    S.lastHash = location.hash;
    render();
  });

  function render(keepScroll) {
    const r = route();
    $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (r.name === 'detail' ? '' : r.name)));
    const view = $('#view');
    view.classList.toggle('flush', r.name === 'detail');
    if (r.name === 'home') renderHome(view);
    else if (r.name === 'all') renderAll(view);
    else if (r.name === 'detail') renderDetail(view, r.id);
    else if (r.name === 'add') renderAdd(view);
    else if (r.name === 'stats') renderStats(view);
    if (!keepScroll) window.scrollTo(0, S.scroll[location.hash || '#/'] || 0);
  }

  // ───────────────────────── 首頁 ─────────────────────────
  function shelfItem(rec, small) {
    return `<a class="shelf-item ${small ? 'sm' : ''}" href="#/r/${encodeURIComponent(rec.id)}">
      ${coverHTML(rec, 'shadow')}
      <span class="t">${esc(rec.title)}</span><span class="a">${esc(rec.artist)}</span>
    </a>`;
  }
  function shelf(title, recs, link, small) {
    if (!recs.length) return '';
    return `<div class="section-head"><h2>${esc(title)}</h2>${link ? `<a href="${link}">查看全部</a>` : ''}</div>
      <div class="shelf">${recs.map((r) => shelfItem(r, small)).join('')}</div>`;
  }

  function renderHome(view) {
    const recs = S.records;
    if (!recs.length) {
      view.innerHTML = `<div class="page-head"><div><span class="eyebrow">0 張收藏</span><h1>我的唱片櫃</h1></div></div>
        <div class="empty"><p>唱片櫃還是空的。</p><a class="btn btn-ink" href="#/add">${I.scan}新增第一張唱片</a></div>`;
      return;
    }
    const recent = recs.slice().sort(byRecent).slice(0, 12);
    const favs = recs.filter((r) => r.favorite).sort(byRecent).slice(0, 12);
    const tagCounts = S.settings.tags.map((t) => [t, recs.filter((r) => r.tags.indexOf(t) !== -1)]).filter((x) => x[1].length >= 2)
      .sort((a, b) => b[1].length - a[1].length).slice(0, 2);
    const langs = S.settings.language.map((l) => [l, recs.filter((r) => r.language === l).length]);

    view.innerHTML = `
      <header class="page-head">
        <div><span class="eyebrow">${recs.length} 張收藏</span><h1>我的唱片櫃</h1></div>
        <a class="icon-btn soft" href="#/all" aria-label="搜尋收藏" style="color:var(--ink)">${I.search}</a>
      </header>
      <section id="crate" class="crate" aria-label="翻唱片箱"></section>
      ${shelf('最近新增', recent, '#/all?sort=recent')}
      ${shelf('我的最愛', favs, '#/all?fav=1')}
      ${tagCounts.map((x) => shelf('# ' + x[0], x[1].sort(byRecent).slice(0, 12), '#/all?tag=' + encodeURIComponent(x[0]), true)).join('')}
      <div class="section-head"><h2>依語系瀏覽</h2></div>
      <div class="tiles">
        ${langs.map((x, i) => {
          const bg = PALETTE[[0, 3, 1, 6, 7, 5][i % 6]];
          return `<a class="tile" href="#/all?lang=${encodeURIComponent(x[0])}" style="--c:${bg};--ci:${luminance(bg) > 0.4 ? '#17150F' : '#FFF6F2'}">${esc(x[0])}<small>${x[1]}</small></a>`;
        }).join('')}
        <a class="tile outline" href="#/all?fav=1">我的最愛<small>${recs.filter((r) => r.favorite).length}</small></a>
      </div>`;
    renderCrate();
    recent.concat(favs).forEach(extractColor);
  }

  // ───────── 翻唱片箱（可滑動） ─────────
  function crateAt(offset) {
    const n = S.crate.order.length;
    if (!n) return null;
    const idx = (((S.crate.i + offset) % n) + n) % n;
    return S.byId.get(S.crate.order[idx]);
  }
  function crateMeta(r) {
    return [r.year, (r.label || '').split(',')[0]].filter(Boolean).join(' · ');
  }

  function renderCrate() {
    const box = $('#crate');
    if (!box) return;
    const cur = crateAt(0), b1 = crateAt(1), b2 = crateAt(2);
    if (!cur) { box.hidden = true; return; }
    const n = S.crate.order.length;
    const pos = ((S.crate.i % n) + n) % n + 1;
    box.dataset.cid = cur.id;
    applyColorVars(box, cur);
    box.innerHTML = `
      <div class="crate-head"><strong>翻唱片箱</strong><span class="mono" style="font-size:12px">${pos} / ${n}</span></div>
      <div class="crate-stage" id="crate-stage">
        ${n > 2 ? `<div class="crate-card back2">${coverHTML(b2)}</div>` : ''}
        ${n > 1 ? `<div class="crate-card back1">${coverHTML(b1)}</div>` : ''}
        <div class="crate-card front" id="crate-front">${coverHTML(cur, '', cur.title + ' 封面')}</div>
      </div>
      <div class="crate-info">
        <span class="t">${esc(cur.title)}</span>
        <span class="a">${esc(cur.artist)}</span>
        <span class="m">${esc(crateMeta(cur))}</span>
      </div>
      <div class="crate-ctrl">
        <button class="icon-btn" data-action="crate-prev" aria-label="上一張">${I.back}</button>
        <a class="btn btn-pull" href="#/r/${encodeURIComponent(cur.id)}">抽出來看看</a>
        <button class="icon-btn" data-action="crate-next" aria-label="下一張">${I.next}</button>
      </div>
      <p class="crate-hint">左右滑動翻片・點封面抽出來</p>`;
    [cur, b1, b2].forEach(extractColor);
    bindCrateSwipe($('#crate-stage'));
  }

  function crateStep(dir) {
    S.crate.i += dir;
    renderCrate();
  }

  function bindCrateSwipe(stage) {
    if (!stage) return;
    const front = $('#crate-front', stage);
    const b1 = $('.back1', stage), b2 = $('.back2', stage);
    let sx = 0, sy = 0, t0 = 0, dx = 0, mode = null, pid = null;

    function setBacks(p) {
      if (b1) b1.style.transform = `translate(${-5.1 * p}%, ${9.2 * p}%) scale(${1 + 0.113 * p})`;
      if (b2) b2.style.transform = `translate(${-5.1 * p}%, ${9.7 * p}%) scale(${1 + 0.128 * p})`;
    }
    function reset(animate) {
      [front, b1, b2].forEach((el) => { if (el) { el.classList.toggle('anim', !!animate); } });
      front.style.transform = ''; setBacks(0);
    }

    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      sx = e.clientX; sy = e.clientY; t0 = performance.now(); dx = 0; mode = null; pid = e.pointerId;
      [front, b1, b2].forEach((el) => el && el.classList.remove('anim'));
    });
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const mx = e.clientX - sx, my = e.clientY - sy;
      if (!mode) {
        if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) { mode = 'h'; try { stage.setPointerCapture(pid); } catch (er) { /* 忽略 */ } }
        else if (Math.abs(my) > 10) { mode = 'v'; }
      }
      if (mode !== 'h') return;
      dx = mx;
      front.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      setBacks(Math.min(Math.abs(dx) / 160, 1));
    });
    function end(e) {
      if (e.pointerId !== pid) return;
      pid = null;
      const dt = performance.now() - t0;
      if (!mode && dt < 350 && Math.abs(e.clientX - sx) < 6 && Math.abs(e.clientY - sy) < 6) {
        const cur = crateAt(0);
        if (cur) location.hash = '#/r/' + encodeURIComponent(cur.id);
        return;
      }
      if (mode !== 'h') return;
      const v = Math.abs(dx) / Math.max(dt, 1);
      if (Math.abs(dx) > 80 || (v > 0.6 && Math.abs(dx) > 40)) {
        const dir = dx < 0 ? 1 : -1;
        front.classList.add('anim');
        front.style.transform = `translateX(${dx < 0 ? -420 : 420}px) rotate(${dx < 0 ? -18 : 18}deg)`;
        front.style.opacity = '0';
        setTimeout(() => crateStep(dir), 200);
      } else {
        reset(true);
      }
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) { pid = null; reset(true); } });
  }

  // ───────────────────────── 全部收藏 ─────────────────────────
  const SORTS = {
    recent: ['最近加入', (a, b) => byRecent(a, b)],
    oldest: ['最早加入', (a, b) => byRecent(b, a)],
    year: ['發行年份（新→舊）', (a, b) => String(b.year).localeCompare(String(a.year)) || byRecent(a, b)],
    artist: ['藝人', (a, b) => a.artist.localeCompare(b.artist, 'zh-Hant')],
    purchase: ['購入價（高→低）', (a, b) => (b.purchase || 0) - (a.purchase || 0)],
    market: ['Discogs 最低價（高→低）', (a, b) => (b.marketUSD || 0) - (a.marketUSD || 0)],
    rating: ['星等（高→低）', (a, b) => (b.rating || 0) - (a.rating || 0)]
  };

  function filtered() {
    const L = S.list;
    const q = L.q.trim().toLowerCase();
    const list = S.records.filter((r) => {
      if (q) {
        const hay = [r.title, r.artist, r.label, r.catno, r.barcode, r.tracklist, r.tags.join(' ')].join('\n').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (L.fav && !r.favorite) return false;
      if (L.language.length && L.language.indexOf(r.language) === -1) return false;
      if (L.sub.length && L.sub.indexOf(r.subCategory) === -1) return false;
      if (L.status.length && L.status.indexOf(r.status) === -1) return false;
      if (L.tags.length && !L.tags.some((t) => r.tags.indexOf(t) !== -1)) return false;
      if (L.rating.length && L.rating.indexOf(String(r.rating)) === -1) return false;
      if (L.year.length && L.year.indexOf(r.year) === -1) return false;
      return true;
    });
    return list.sort((SORTS[L.sort] || SORTS.recent)[1]);
  }

  function chipRow(label, group, values, display) {
    if (!values.length) return '';
    return `<div class="filter-row" role="group" aria-label="${esc(label)}"><span class="label">${esc(label)}</span>
      ${values.map((v) => {
        const on = S.list[group].indexOf(String(v)) !== -1;
        return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-action="filter" data-group="${group}" data-value="${esc(v)}">${esc(display ? display(v) : v)}</button>`;
      }).join('')}</div>`;
  }

  function renderAll(view) {
    const years = Array.from(new Set(S.records.map((r) => r.year).filter(Boolean))).sort().reverse();
    view.innerHTML = `
      <header class="page-head"><div><span class="eyebrow">${S.records.length} 張收藏</span><h1>全部收藏</h1></div></header>
      <label class="search-bar">${I.search}
        <span class="sr-only">搜尋</span>
        <input id="list-q" type="search" placeholder="專輯、藝人、歌名、編號" value="${esc(S.list.q)}" autocomplete="off">
      </label>
      <div class="filter-groups" id="filter-groups"></div>
      <div class="list-meta">
        <span id="list-count"></span>
        <label><span class="sr-only">排序</span>
          <select id="list-sort">${Object.keys(SORTS).map((k) => `<option value="${k}" ${S.list.sort === k ? 'selected' : ''}>${SORTS[k][0]}</option>`).join('')}</select>
        </label>
      </div>
      <div id="list-results"></div>`;
    S._years = years;
    renderFilters();
    renderResults();
    $('#list-q').addEventListener('input', debounce((e) => { S.list.q = e.target.value; S.list.shown = 40; renderResults(); }, 180));
    $('#list-sort').addEventListener('change', (e) => { S.list.sort = e.target.value; renderResults(); });
  }

  function renderFilters() {
    const box = $('#filter-groups');
    if (!box) return;
    const st = S.settings;
    const anyOn = S.list.fav || ['language', 'sub', 'tags', 'status', 'rating', 'year'].some((g) => S.list[g].length);
    box.innerHTML = `
      <div class="filter-row">
        <button class="chip ${S.list.fav ? 'on' : ''}" aria-pressed="${S.list.fav}" data-action="filter-fav">${I.heart.replace('<svg', '<svg width="14" height="14" style="fill:currentColor;stroke:none"')}最愛</button>
        ${anyOn ? '<button class="chip" data-action="filter-clear">清除篩選</button>' : ''}
      </div>
      ${chipRow('語系', 'language', st.language)}
      ${chipRow('分類', 'sub', st.sub)}
      ${chipRow('標籤', 'tags', st.tags)}
      ${chipRow('狀態', 'status', st.status)}
      ${chipRow('星等', 'rating', ['5', '4', '3', '2', '1'], (v) => '★ ' + v)}
      ${chipRow('年份', 'year', S._years || [])}`;
  }

  function renderResults() {
    const box = $('#list-results');
    if (!box) return;
    const list = filtered();
    $('#list-count').textContent = `${list.length} 張`;
    if (!list.length) { box.innerHTML = '<p class="empty">找不到符合條件的唱片。</p>'; return; }
    const shown = list.slice(0, S.list.shown);
    box.innerHTML = `<div class="grid">${shown.map((r) => `
      <a class="grid-item" href="#/r/${encodeURIComponent(r.id)}">
        ${coverHTML(r, 'shadow')}
        ${r.favorite ? `<span class="fav" aria-label="最愛">${I.heart}</span>` : ''}
        <span class="t">${esc(r.title)}</span>
        <span class="a">${esc(r.artist)}${r.year ? ' · ' + esc(r.year) : ''}</span>
      </a>`).join('')}</div>
      ${list.length > shown.length ? `<div class="more"><button class="btn btn-outline btn-sm" data-action="more">再顯示 ${Math.min(40, list.length - shown.length)} 張</button></div>` : ''}`;
  }

  // ───────────────────────── 唱片詳情 ─────────────────────────
  function parseTracks(text) {
    const groups = [];
    String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((line) => {
      const m = line.match(/^(\S+)\s+-\s+(.*)$/);
      const pos = m ? m[1] : '';
      const title = m ? m[2] : line;
      const sideM = pos.match(/^([A-Za-z]+)\d/) || pos.match(/^([A-Za-z])$/);
      const side = sideM ? sideM[1].toUpperCase() : '全部';
      let g = groups.find((x) => x.side === side);
      if (!g) { g = { side: side, tracks: [] }; groups.push(g); }
      g.tracks.push({ pos: pos, title: title });
    });
    return groups;
  }

  function priceSeries(rec) {
    const pts = (S.history[rec.id] || []).slice();
    if (rec.marketUSD != null && (!pts.length || pts[pts.length - 1].usd !== rec.marketUSD)) {
      pts.push({ t: new Date().toISOString().slice(0, 19), usd: rec.marketUSD });
    }
    return pts;
  }

  function chartSVG(pts) {
    const W = 320, H = 64, P = 6;
    const ts = pts.map((p) => Date.parse(p.t) || 0);
    const t0 = Math.min.apply(null, ts), t1 = Math.max.apply(null, ts);
    const vs = pts.map((p) => p.usd);
    const v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs);
    const x = (i) => P + (t1 > t0 ? (ts[i] - t0) / (t1 - t0) : i / Math.max(pts.length - 1, 1)) * (W - 2 * P);
    const y = (v) => (v1 > v0 ? H - P - (v - v0) / (v1 - v0) * (H - 2 * P) : H / 2);
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.usd).toFixed(1)}`).join(' ');
    const last = pts.length - 1;
    return `<svg class="price-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
        aria-label="Discogs 最低價由 ${fmtUSD(pts[0].usd)} 變為 ${fmtUSD(pts[last].usd)}">
      <line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="currentColor" stroke-opacity=".3" stroke-width="1"/>
      <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      ${pts.length < 25 ? pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.usd)}" r="${i === last ? 5 : 3}" fill="${i === last ? 'var(--c-label)' : 'currentColor'}" stroke="currentColor" stroke-width="${i === last ? 2 : 0}" vector-effect="non-scaling-stroke"/>`).join('') : ''}
    </svg>`;
  }

  function renderDetail(view, id) {
    const r = S.byId.get(id);
    if (!r) {
      view.innerHTML = `<div class="empty" style="padding-top:120px"><p>找不到這張唱片，可能已經被刪除。</p><a class="btn btn-ink" href="#/all">回到全部收藏</a></div>`;
      return;
    }
    S.detailSide = S.detailSide && S.detailSide.id === id ? S.detailSide : { id: id, side: null };
    const groups = parseTracks(r.tracklist);
    const side = S.detailSide.side && groups.some((g) => g.side === S.detailSide.side) ? S.detailSide.side : (groups[0] && groups[0].side);
    const cur = groups.find((g) => g.side === side);

    const pts = priceSeries(r);
    let priceWide;
    if (pts.length >= 2) {
      const ch = (pts[pts.length - 1].usd - pts[0].usd) / pts[0].usd * 100;
      priceWide = `<div class="row"><strong style="font-size:13px">價格紀錄</strong><span class="mono" style="font-size:12px">${ch >= 0 ? '+' : ''}${ch.toFixed(1)}% 自 ${esc(pts[0].t.slice(0, 10))}</span></div>
        ${chartSVG(pts)}
        <div class="row mono" style="font-size:11px"><span>${esc(pts[0].t.slice(5, 10))} · ${fmtUSD(pts[0].usd)}</span><span>現在 · ${fmtUSD(pts[pts.length - 1].usd)}</span></div>`;
    } else {
      priceWide = `<div class="row"><strong style="font-size:13px">價格紀錄</strong><span style="font-size:12px">${pts.length ? '目前只有一筆紀錄' : '尚無價格紀錄'}</span></div>`;
    }
    let pl = '需要購入價格與 Discogs 價格';
    if (r.purchase && r.marketUSD != null) {
      const diff = r.marketUSD * S.rate - r.purchase;
      pl = `<span class="mono" style="font-weight:500">${diff >= 0 ? '+' : '−'}${fmtNT(Math.abs(diff))}（${diff >= 0 ? '+' : '−'}${Math.abs(diff / r.purchase * 100).toFixed(1)}%）</span>`;
    }

    const am = safeUrl(r.appleMusicUrl), dg = safeUrl(r.discogsUrl);
    const dash = (v) => (v === '' || v == null ? '—' : esc(v));
    const notes = String(r.discogsNotes || '');
    const longNotes = notes.length > 280 || notes.split('\n').length > 8;

    view.innerHTML = `
    <article class="detail" data-cid="${esc(r.id)}" style="${colorVars(r)}">
     <div class="detail-inner">
      <div class="d-top">
        <button class="icon-btn" data-action="back" aria-label="返回">${I.back}</button>
        <div class="grp">
          <button class="icon-btn ${r.favorite ? 'on' : ''}" data-action="fav" aria-pressed="${r.favorite}" aria-label="${r.favorite ? '取消最愛' : '加入最愛'}">${I.heart}</button>
          <button class="icon-btn" data-action="edit" aria-label="編輯">${I.edit}</button>
        </div>
      </div>

      <div class="d-hero">
        <div class="disc" aria-hidden="true"><div class="disc-label"><b>${esc(r.title)}</b><i>${esc(r.catno || '33⅓ RPM')}</i><span class="hole"></span></div></div>
        <div class="sleeve">${coverHTML(r, '', r.title + ' 封面')}</div>
      </div>

      <div class="d-title">
        <h1>${esc(r.title)}</h1>
        <span class="artist">${esc(r.artist)}</span>
      </div>

      <div class="stars" role="group" aria-label="星等評分">
        ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= r.rating ? 'on' : ''}" data-action="rate" data-value="${n}" aria-label="${n} 顆星" aria-pressed="${n <= r.rating}">${I.star}</button>`).join('')}
        <span class="txt">${r.rating ? r.rating + ' / 5' : '點星星評分'}</span>
      </div>

      <div class="tags">
        ${[r.language, r.subCategory].filter(Boolean).length ? `<span class="tag solid">${esc([r.language, r.subCategory].filter(Boolean).join(' · '))}</span>` : ''}
        ${r.tags.map((t) => `<span class="tag"># ${esc(t)}</span>`).join('')}
        ${r.status ? `<span class="tag dark">${esc(r.status)}</span>` : ''}
      </div>

      <div class="d-actions">
        ${am ? `<a class="btn primary" href="${esc(am)}" target="_blank" rel="noopener">${I.play}Apple Music</a>`
             : `<button class="btn primary" data-action="find-am">${I.search}找 Apple Music</button>`}
        ${dg ? `<a class="btn ghost" href="${esc(dg)}" target="_blank" rel="noopener">Discogs${I.ext}</a>` : '<span class="btn ghost disabled">Discogs</span>'}
      </div>

      <button class="d-review" data-action="edit-review">
        <strong>我的聽感</strong>
        <p>${r.review ? esc(r.review) : '還沒寫下聽感 — 點這裡記錄第一次放上唱盤的感覺。'}</p>
      </button>

      <section class="d-sec">
        <div class="d-sec-head"><h2>曲目</h2>
          ${groups.length > 1 ? `<div class="side-tabs" role="tablist" aria-label="唱片面">${groups.map((g) => `<button role="tab" class="${g.side === side ? 'on' : ''}" aria-selected="${g.side === side}" data-action="side" data-value="${esc(g.side)}">${esc(g.side)}</button>`).join('')}</div>` : ''}
        </div>
        ${cur ? `<ol class="tracks">${cur.tracks.map((t) => `<li><span>${esc(t.pos)}</span><span>${esc(t.title)}</span></li>`).join('')}</ol>` : '<p class="notes">沒有曲目資料</p>'}
      </section>

      <section class="d-sec">
        <div class="d-sec-head"><h2>價格</h2>
          ${r.releaseId ? `<button class="icon-btn" data-action="refresh-price" aria-label="重新抓取 Discogs 價格">${I.refresh}</button>` : ''}
        </div>
        <div class="price-grid">
          <div class="price-card fill"><span class="k">購入價格</span><span class="v">${r.purchase ? fmtNT(r.purchase) : '—'}</span></div>
          <div class="price-card"><span class="k">Discogs 最低價</span>${r.marketUSD != null ? `<span class="v">${fmtUSD(r.marketUSD)}</span>` : '<span class="v txt">目前無人掛賣</span>'}</div>
          <div class="price-card wide">${priceWide}
            <div class="row sep"><span>帳面盈虧（匯率 ${S.rate.toFixed(2)}）</span>${pl}</div>
          </div>
        </div>
      </section>

      <section class="d-sec">
        <h2>發行資訊</h2>
        <dl class="info-list">
          <div><dt>唱片公司</dt><dd>${dash(r.label)}</dd></div>
          <div><dt>商品編號</dt><dd class="mono">${dash(r.catno)}</dd></div>
          <div><dt>條碼</dt><dd class="mono">${dash(r.barcode)}</dd></div>
          <div><dt>介質</dt><dd>${dash(r.format)}</dd></div>
          <div><dt>發行日期</dt><dd class="mono">${dash(r.released)}</dd></div>
          <div><dt>加入收藏</dt><dd class="mono">${dash(fmtDateTime(r.createdAt))}</dd></div>
        </dl>
      </section>

      ${notes ? `<section class="d-sec" style="padding-bottom:8px">
        <h2>Discogs 筆記</h2>
        <p class="notes ${longNotes ? 'clamp' : ''}" id="notes">${esc(notes)}</p>
        ${longNotes ? '<button class="link-btn" data-action="expand-notes">展開全文</button>' : ''}
      </section>` : ''}
     </div>
    </article>`;
    extractColor(r);
  }

  async function updateField(id, updates, msg) {
    const before = S.byId.get(id);
    const optimistic = Object.assign({}, before, updates);
    if ('tags' in updates) optimistic.tags = updates.tags;
    upsert(optimistic);
    render(true);
    try {
      const saved = await API.update(id, updates);
      upsert(saved);
      if (msg) toast(msg);
      render(true);
    } catch (e) {
      upsert(before); render(true); handleError(e);
    }
  }

  // ───────────────────────── 編輯抽屜 ─────────────────────────
  function openSheet(html, onMount) {
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    if (onMount) onMount($('#sheet-body'));
    const panel = $('.sheet-panel');
    panel.setAttribute('tabindex', '-1');
    panel.scrollTop = 0;
    setTimeout(() => panel.focus({ preventScroll: true }), 60);
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    document.body.style.overflow = '';
    $('#sheet-body').innerHTML = '';
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  });

  function confirmSheet(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      openSheet(`<h2 id="sheet-title">${esc(title)}</h2><p>${esc(text)}</p>
        <div class="form-actions" style="padding-top:12px">
          <button class="btn btn-outline" data-r="0">取消</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-ink'}" data-r="1">${esc(okLabel)}</button>
        </div>`, (root) => {
        $$('[data-r]', root).forEach((b) => b.addEventListener('click', () => { const ok = b.dataset.r === '1'; closeSheet(); resolve(ok); }));
        $('.sheet-backdrop').addEventListener('click', () => resolve(false), { once: true });
      });
    });
  }

  function selectHTML(name, label, options, value) {
    const opts = options.slice();
    if (value && opts.indexOf(value) === -1) opts.unshift(value);
    return `<label class="field"><span>${esc(label)}</span><select name="${name}">
      <option value="">—</option>${opts.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  }
  function inputHTML(name, label, value, attrs) {
    return `<label class="field ${attrs && attrs.cls || ''}"><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" ${attrs && attrs.extra || ''}></label>`;
  }
  function textareaHTML(name, label, value, rows) {
    return `<label class="field"><span>${esc(label)}</span><textarea name="${name}" rows="${rows || 4}">${esc(value)}</textarea></label>`;
  }
  function tagPickerHTML(selected) {
    const all = S.settings.tags.slice();
    selected.forEach((t) => { if (all.indexOf(t) === -1) all.push(t); });
    return `<div class="field"><span>自訂標籤</span><div class="tag-picker">${all.map((t) => {
      const on = selected.indexOf(t) !== -1;
      return `<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-tag="${esc(t)}">${esc(t)}</button>`;
    }).join('')}</div></div>`;
  }
  function bindTagPicker(root) {
    $$('[data-tag]', root).forEach((b) => b.addEventListener('click', () => {
      const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    }));
  }
  function readTags(root) { return $$('[data-tag].on', root).map((b) => b.dataset.tag); }

  /** 新增與編輯共用的完整欄位表單 */
  function recordFormHTML(r) {
    return `
      <div class="form-box"><h3>基本資料</h3>
        ${inputHTML('title', '專輯名稱', r.title, { extra: 'required' })}
        ${inputHTML('artist', '藝人', r.artist)}
        <div class="form-grid">
          ${selectHTML('language', '語系', S.settings.language, r.language)}
          ${selectHTML('subCategory', '次分類', S.settings.sub, r.subCategory)}
        </div>
        ${tagPickerHTML(r.tags || [])}
      </div>
      <div class="form-box"><h3>收藏與評價</h3>
        <div class="form-grid">
          ${selectHTML('status', '狀態', S.settings.status, r.status)}
          ${inputHTML('purchasePrice', '購入價格（NT$）', r.purchase || r.purchasePrice || '', { extra: 'inputmode="decimal"' })}
          ${selectHTML('rating', '星等', ['5', '4', '3', '2', '1'], r.rating ? String(r.rating) : '')}
          <label class="field"><span>我的最愛</span><select name="favorite"><option value="">否</option><option value="1" ${r.favorite ? 'selected' : ''}>是</option></select></label>
        </div>
        ${textareaHTML('review', '我的聽感', r.review, 3)}
        ${inputHTML('appleMusicUrl', 'Apple Music 連結', r.appleMusicUrl, { extra: 'inputmode="url"' })}
      </div>
      <div class="form-box"><h3>發行資訊</h3>
        ${inputHTML('label', '唱片公司', r.label)}
        <div class="form-grid">
          ${inputHTML('catno', '商品編號', r.catno)}
          ${inputHTML('barcode', '條碼', r.barcode, { extra: 'inputmode="numeric"' })}
        </div>
        ${inputHTML('format', '介質', r.format)}
        ${inputHTML('released', '發行日期', r.released)}
        ${textareaHTML('tracklist', '曲目（每行一首：A1 - 歌名）', r.tracklist, 8)}
        ${textareaHTML('discogsNotes', 'Discogs 筆記', r.discogsNotes, 4)}
        ${inputHTML('discogsUrl', 'Discogs 網址', r.discogsUrl, { extra: 'inputmode="url"' })}
        ${inputHTML('coverUrl', '封面圖片網址', r.coverUrl, { extra: 'inputmode="url"' })}
      </div>`;
  }
  function readRecordForm(root) {
    const v = (n) => { const el = $(`[name="${n}"]`, root); return el ? el.value.trim() : ''; };
    return {
      title: v('title'), artist: v('artist'), language: v('language'), subCategory: v('subCategory'),
      tags: readTags(root), status: v('status'), purchasePrice: v('purchasePrice'),
      rating: v('rating'), favorite: v('favorite') === '1', review: v('review'), appleMusicUrl: v('appleMusicUrl'),
      label: v('label'), catno: v('catno'), barcode: v('barcode'), format: v('format'), released: v('released'),
      tracklist: v('tracklist'), discogsNotes: v('discogsNotes'), discogsUrl: v('discogsUrl'), coverUrl: v('coverUrl')
    };
  }

  function openEdit(r) {
    openSheet(`<h2 id="sheet-title">編輯唱片</h2>
      <form id="edit-form" class="form" style="padding:0">
        ${recordFormHTML(r)}
        <div class="form-actions">
          <button type="button" class="btn btn-outline" data-action="close-sheet">取消</button>
          <button type="submit" class="btn btn-ink" id="edit-save">儲存</button>
        </div>
        <button type="button" class="btn btn-danger btn-block" id="edit-delete">刪除這張唱片</button>
      </form>`, (root) => {
      bindTagPicker(root);
      $('#edit-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const updates = readRecordForm(root);
        if (!updates.title) { toast('專輯名稱不可空白', true); return; }
        const btn = $('#edit-save', root); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
        try {
          const saved = await API.update(r.id, updates);
          upsert(saved); closeSheet(); toast('已儲存'); render(true);
        } catch (err) { btn.disabled = false; btn.textContent = '儲存'; handleError(err); }
      });
      $('#edit-delete', root).addEventListener('click', async () => {
        closeSheet();
        const ok = await confirmSheet('刪除這張唱片？', `「${r.title}」會從收藏移除（價格紀錄會保留）。這個動作無法復原。`, '刪除', true);
        if (!ok) return;
        try { await API.remove(r.id); removeLocal(r.id); toast('已刪除'); location.hash = '#/all'; } catch (err) { handleError(err); }
      });
    });
  }

  function openReview(r) {
    openSheet(`<h2 id="sheet-title">我的聽感</h2>
      <form id="review-form" style="display:flex;flex-direction:column;gap:14px">
        <label class="field"><span class="sr-only">聽感</span><textarea name="review" rows="7" placeholder="音質、壓片、第一次聽的感覺…">${esc(r.review)}</textarea></label>
        <div class="form-actions"><button type="button" class="btn btn-outline" data-action="close-sheet">取消</button><button class="btn btn-ink" type="submit">儲存</button></div>
      </form>`, (root) => {
      $('#review-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        const review = $('[name="review"]', root).value.trim();
        closeSheet();
        updateField(r.id, { review: review }, '已儲存聽感');
      });
    });
  }

  // ───────────────────────── 新增 ─────────────────────────
  function renderAdd(view) {
    const A = S.add;
    if (A.form) { renderAddForm(view); return; }
    view.innerHTML = `
      <header class="page-head"><div><span class="eyebrow">Discogs 資料庫</span><h1>新增唱片</h1></div></header>
      <form class="add-search" id="add-search">
        <label class="search-bar">${I.search}<span class="sr-only">搜尋</span>
          <input id="add-q" type="search" enterkeyhint="search" placeholder="藝人、專輯或條碼數字" value="${esc(A.query)}" autocomplete="off"></label>
        <button type="button" class="icon-btn" data-action="scan" aria-label="用相機掃條碼">${I.scan}</button>
      </form>
      <p class="add-tip">點右邊的按鈕可以直接用手機相機掃唱片背面的條碼。</p>
      <div id="add-results" class="results">${resultsHTML()}</div>`;
    $('#add-search').addEventListener('submit', (e) => { e.preventDefault(); doSearch($('#add-q').value); });
  }

  function resultsHTML() {
    const A = S.add;
    if (A.busy) return '<div class="loading"><span class="spinner"></span></div>';
    if (A.results == null) return '';
    if (!A.results.length) {
      return `<div class="empty"><p>Discogs 找不到相關唱片。</p><button class="btn btn-outline" data-action="manual">手動輸入資料</button></div>`;
    }
    return `<p class="muted" style="margin:0;font-size:13px">找到 ${A.results.length} 個版本，點選你手上的那一張：</p>
      ${A.results.map((x, i) => `
      <button class="result" data-action="pick" data-index="${i}">
        ${coverHTML({ id: x.id, title: x.title, coverUrl: x.thumb })}
        <span class="body">
          ${x.owned ? '<span class="badge">已收藏</span>' : ''}
          <span class="t">${esc(x.title)}</span>
          <span class="m">${esc([x.year, x.country, x.label, x.catno].filter(Boolean).join(' · '))}</span>
          <span class="m">${esc(x.format)}</span>
        </span>
      </button>`).join('')}
      <button class="btn btn-outline btn-sm" style="align-self:center;margin-top:8px" data-action="manual">都不是，手動輸入</button>`;
  }

  async function doSearch(q) {
    q = String(q || '').trim();
    if (!q) { toast('請輸入藝人、專輯或條碼', true); return; }
    S.add.query = q; S.add.busy = true; S.add.results = null;
    $('#add-results').innerHTML = resultsHTML();
    try { S.add.results = await API.search(q); } catch (e) { S.add.results = null; handleError(e); }
    S.add.busy = false;
    if (route().name === 'add' && !S.add.form) $('#add-results').innerHTML = resultsHTML();
  }

  async function pickResult(i) {
    const x = S.add.results[i];
    $('#add-results').innerHTML = '<div class="loading"><span class="spinner"></span>&nbsp; 抓取曲目與發行資訊…</div>';
    try {
      const d = await API.release(x.id);
      const isBarcode = /^\d{8,14}$/.test(S.add.query.replace(/\s/g, ''));
      S.add.form = Object.assign({
        id: 'new', tags: [], rating: 0, favorite: false, review: '', status: S.settings.status[0] || '',
        language: S.settings.language[0] || '', subCategory: S.settings.sub[0] || '', appleMusicUrl: '', purchase: ''
      }, d, { barcode: d.barcode || (isBarcode ? S.add.query.replace(/\s/g, '') : ''), coverUrl: d.coverUrl || x.cover });
      render();
      API.appleMusic(d.artist, d.title).then((url) => {
        if (!url || !S.add.form || S.add.form.releaseId !== d.releaseId) return;
        S.add.form.appleMusicUrl = url;
        const el = $('[name="appleMusicUrl"]');
        if (el && !el.value) el.value = url;
      }).catch(() => { /* 找不到就算了 */ });
    } catch (e) {
      $('#add-results').innerHTML = resultsHTML();
      handleError(e);
    }
  }

  function renderAddForm(view) {
    const f = S.add.form;
    view.innerHTML = `
      <header class="page-head"><div><span class="eyebrow">確認資料</span><h1>新增唱片</h1></div>
        <button class="icon-btn soft" data-action="add-back" aria-label="回到搜尋結果" style="color:var(--ink)">${I.back}</button></header>
      <form id="add-form" class="form">
        <div class="form-head">
          ${coverHTML({ id: f.releaseId || 'new', title: f.title, coverUrl: f.coverUrl }, 'shadow')}
          <div style="min-width:0">
            <strong style="font-size:18px;display:block">${esc(f.title || '手動輸入')}</strong>
            <span class="muted">${esc(f.artist || '')}</span>
            ${f.marketValue ? `<p class="mono" style="margin:6px 0 0;font-size:12px">Discogs 最低價：${esc(f.marketValue)}</p>` : ''}
          </div>
        </div>
        ${recordFormHTML(f)}
        <div class="form-actions">
          <button type="button" class="btn btn-outline" data-action="add-back">返回</button>
          <button type="submit" class="btn btn-ink" id="add-save">收進唱片櫃</button>
        </div>
      </form>`;
    const root = $('#add-form');
    bindTagPicker(root);
    root.addEventListener('submit', (e) => { e.preventDefault(); saveNew(root, false); });
  }

  async function saveNew(root, force) {
    const rec = Object.assign(readRecordForm(root), { marketValue: S.add.form.marketValue || '' });
    if (!rec.title) { toast('專輯名稱不可空白', true); return; }
    const btn = $('#add-save'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const res = await API.add(rec, force);
      if (res.duplicate) {
        btn.disabled = false; btn.textContent = '收進唱片櫃';
        const ok = await confirmSheet('已經收藏過了', `你的唱片櫃裡已經有「${res.existing.title}」（${res.existing.artist}）同一個版本。還是要再收一張嗎？`, '再收一張');
        if (ok) saveNew(root, true);
        return;
      }
      upsert(res.record);
      const mv = parseFloat(String(rec.marketValue).replace(/[^0-9.]/g, ''));
      if (!isNaN(mv) && String(rec.marketValue).indexOf('USD') !== -1) (S.history[res.record.id] = []).push({ t: res.record.createdAt, usd: mv });
      persist();
      S.add = { query: '', results: null, form: null, busy: false };
      toast('已收進唱片櫃');
      location.hash = '#/r/' + encodeURIComponent(res.record.id);
    } catch (e) {
      btn.disabled = false; btn.textContent = '收進唱片櫃';
      handleError(e);
    }
  }

  // ───────── 條碼掃描（html5-qrcode，iPhone / Android 都可用） ─────────
  let scanner = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Html5Qrcode) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('掃描元件載入失敗'));
      document.head.appendChild(s);
    });
  }
  async function openScanner() {
    const box = $('#scanner'), msg = $('#scanner-msg');
    box.hidden = false; msg.textContent = '啟動相機中…';
    try {
      await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
      const F = window.Html5QrcodeSupportedFormats;
      scanner = new window.Html5Qrcode('scanner-region', {
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false
      });
      const w = Math.min(window.innerWidth - 48, 340);
      await scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: w, height: Math.round(w * 0.45) } }, (text) => {
        const code = String(text).replace(/\D/g, '');
        if (code.length < 8) return;
        if (navigator.vibrate) navigator.vibrate(60);
        closeScanner();
        if (route().name !== 'add') location.hash = '#/add';
        S.add.form = null;
        setTimeout(() => { const q = $('#add-q'); if (q) q.value = code; doSearch(code); }, 50);
      }, () => { /* 每一幀沒掃到都會呼叫，忽略 */ });
      msg.textContent = '把條碼放進框框裡，會自動辨識';
    } catch (e) {
      msg.textContent = /Permission|NotAllowed/i.test(String(e)) ? '沒有相機權限：請到瀏覽器設定允許此網站使用相機。' : '無法啟動相機：' + (e.message || e);
    }
  }
  async function closeScanner() {
    $('#scanner').hidden = true;
    if (scanner) { try { await scanner.stop(); scanner.clear(); } catch (e) { /* 忽略 */ } scanner = null; }
  }

  // ───────────────────────── 統計 ─────────────────────────
  function barsHTML(pairs) {
    const max = Math.max.apply(null, pairs.map((p) => p[1]).concat(1));
    return `<div class="bar-list">${pairs.map((p) => `<div class="bar"><span class="name">${esc(p[0])}</span>
      <span class="track"><span class="fill" style="display:block;width:${(p[1] / max * 100).toFixed(1)}%"></span></span><span class="n">${p[1]}</span></div>`).join('')}</div>`;
  }
  function countBy(fn) {
    const m = {};
    S.records.forEach((r) => { const k = fn(r); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map((k) => [k, m[k]]).sort((a, b) => b[1] - a[1]);
  }

  function renderStats(view) {
    const R = S.records;
    const spent = R.reduce((s, r) => s + (r.purchase || 0), 0);
    const comp = R.filter((r) => r.purchase && r.marketUSD != null);
    const cost = comp.reduce((s, r) => s + r.purchase, 0);
    const mkt = comp.reduce((s, r) => s + r.marketUSD * S.rate, 0);
    const pl = mkt - cost;
    const months = {};
    R.forEach((r) => { const m = String(r.createdAt).slice(0, 7); if (m) months[m] = (months[m] || 0) + 1; });
    const monthPairs = Object.keys(months).sort().slice(-12).map((m) => [m, months[m]]);
    const topValue = R.filter((r) => r.marketUSD != null).sort((a, b) => b.marketUSD - a.marketUSD).slice(0, 5);
    const topGain = comp.map((r) => [r, (r.marketUSD * S.rate - r.purchase) / r.purchase]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const pi = S.priceInfo || {};

    const rankItem = (r, v) => `<li><a href="#/r/${encodeURIComponent(r.id)}">${coverHTML(r)}<span class="body"><span class="t" style="display:block">${esc(r.title)}</span><span class="a">${esc(r.artist)}</span></span><span class="v">${v}</span></a></li>`;

    view.innerHTML = `
      <header class="page-head"><div><span class="eyebrow">匯率 1 USD = ${S.rate.toFixed(2)} TWD</span><h1>收藏統計</h1></div></header>
      <section class="stat-hero">
        <div><div class="k">典藏</div><div class="v">${R.length}<span style="font-size:14px"> 張</span></div></div>
        <div><div class="k">總投入</div><div class="v">${fmtNT(spent)}</div></div>
        <div class="wide" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">
          <div><div class="k">有 Discogs 價格的 ${comp.length} 張・成本</div><div class="v" style="font-size:18px">${fmtNT(cost)}</div></div>
          <div><div class="k">換算目前最低價</div><div class="v" style="font-size:18px">${fmtNT(mkt)}</div></div>
          <div style="grid-column:span 2"><div class="k">帳面盈虧</div>
            <div class="v ${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : '−'}${fmtNT(Math.abs(pl))} <span style="font-size:15px">(${pl >= 0 ? '+' : '−'}${cost ? Math.abs(pl / cost * 100).toFixed(1) : '0.0'}%)</span></div></div>
        </div>
      </section>
      <p class="muted pad" style="font-size:12px;margin:8px 0 0">Discogs 最低價是市集上目前最便宜的掛單，不等於成交價，僅供參考。</p>

      <div class="section-head"><h2>價格更新</h2></div>
      <div class="card">
        <p style="margin:0">上次完整更新：<span class="mono">${esc(pi.lastFinished || '尚無紀錄')}</span></p>
        <p class="muted" style="margin:4px 0 12px;font-size:13px">每月 1 號會自動更新並寄信給你。也可以現在手動更新（約每張 1 秒）。</p>
        <button class="btn btn-ink btn-block" data-action="update-prices" id="price-btn">${I.refresh}更新全部 Discogs 價格</button>
        <div class="progress" id="price-progress" hidden><div></div></div>
        <p class="mono" id="price-text" style="margin:8px 0 0;font-size:12px"></p>
      </div>

      <div class="section-head"><h2>語系</h2></div><div class="card">${barsHTML(countBy((r) => r.language))}</div>
      <div class="section-head"><h2>最常收藏的藝人</h2></div><div class="card">${barsHTML(countBy((r) => r.artist).slice(0, 8))}</div>
      <div class="section-head"><h2>每月新增</h2></div><div class="card">${barsHTML(monthPairs)}</div>
      ${topValue.length ? `<div class="section-head"><h2>最低價最高的唱片</h2></div><div class="card"><ol class="rank">${topValue.map((r) => rankItem(r, fmtUSD(r.marketUSD))).join('')}</ol></div>` : ''}
      ${topGain.length ? `<div class="section-head"><h2>漲最多（相對購入價）</h2></div><div class="card"><ol class="rank">${topGain.map((x) => rankItem(x[0], (x[1] >= 0 ? '+' : '−') + Math.abs(x[1] * 100).toFixed(0) + '%')).join('')}</ol></div>` : ''}
      <div class="section-head"><h2>狀態</h2></div><div class="card">${barsHTML(countBy((r) => r.status))}</div>

      <div class="pad" style="padding-top:32px;display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-outline btn-block" data-action="reload">重新載入資料</button>
        <button class="btn btn-danger btn-block" data-action="logout">登出</button>
      </div>`;
  }

  async function updateAllPrices() {
    const btn = $('#price-btn'), bar = $('#price-progress'), txt = $('#price-text');
    btn.disabled = true; bar.hidden = false;
    let first = true, guard = 0;
    try {
      for (;;) {
        const r = await API.priceBatch(first);
        first = false;
        const pct = r.total ? r.cursor / r.total * 100 : 100;
        if ($('#price-progress')) { $('#price-progress div').style.width = pct.toFixed(0) + '%'; $('#price-text').textContent = `${r.cursor} / ${r.total}・${r.updated} 張有變動`; }
        if (r.done) break;
        if (++guard > 200) throw new Error('更新中斷，請稍後再試');
      }
      toast('價格更新完成');
      await refresh(true);
    } catch (e) {
      handleError(e);
      if (txt) txt.textContent = '中斷了；再按一次會從頭開始。';
    } finally {
      if ($('#price-btn')) $('#price-btn').disabled = false;
    }
  }

  // ───────────────────────── 事件委派 ─────────────────────────
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const r = route();
    const rec = r.name === 'detail' ? S.byId.get(r.id) : null;

    switch (a) {
      case 'close-sheet': closeSheet(); break;
      case 'crate-prev': crateStep(-1); break;
      case 'crate-next': crateStep(1); break;
      case 'filter': {
        const g = el.dataset.group, v = el.dataset.value, arr = S.list[g];
        const i = arr.indexOf(v); if (i === -1) arr.push(v); else arr.splice(i, 1);
        S.list.shown = 40; renderFilters(); renderResults(); break;
      }
      case 'filter-fav': S.list.fav = !S.list.fav; S.list.shown = 40; renderFilters(); renderResults(); break;
      case 'filter-clear': S.list = freshList({ q: S.list.q, sort: S.list.sort }); renderFilters(); renderResults(); break;
      case 'more': S.list.shown += 40; renderResults(); break;
      case 'back':
        if (S.prevHash && S.prevHash !== location.hash) history.back();
        else location.hash = '#/';
        break;
      case 'fav': if (rec) updateField(rec.id, { favorite: !rec.favorite }, !rec.favorite ? '已加入最愛' : '已取消最愛'); break;
      case 'rate': if (rec) { const n = Number(el.dataset.value); updateField(rec.id, { rating: n === rec.rating ? '' : n }); } break;
      case 'edit': if (rec) openEdit(rec); break;
      case 'edit-review': if (rec) openReview(rec); break;
      case 'side': S.detailSide = { id: rec.id, side: el.dataset.value }; render(true); break;
      case 'expand-notes': $('#notes').classList.remove('clamp'); el.remove(); break;
      case 'find-am':
        if (!rec) break;
        el.disabled = true; el.innerHTML = '<span class="spinner"></span>';
        try {
          const url = await API.appleMusic(rec.artist, rec.title);
          if (url) updateField(rec.id, { appleMusicUrl: url }, '找到 Apple Music 連結');
          else { toast('Apple Music 找不到這張專輯，可以在編輯裡手動貼上', true); render(true); }
        } catch (err) { handleError(err); render(true); }
        break;
      case 'refresh-price':
        if (!rec) break;
        el.disabled = true; el.innerHTML = '<span class="spinner"></span>';
        try {
          const d = await API.release(rec.releaseId);
          const saved = await API.update(rec.id, { marketValue: d.marketValue });
          if (saved.marketUSD != null && saved.marketUSD !== rec.marketUSD) (S.history[rec.id] = S.history[rec.id] || []).push({ t: new Date().toISOString().slice(0, 19), usd: saved.marketUSD });
          upsert(saved); toast('價格已更新'); render(true);
        } catch (err) { handleError(err); render(true); }
        break;
      case 'scan': openScanner(); break;
      case 'close-scanner': closeScanner(); break;
      case 'pick': pickResult(Number(el.dataset.index)); break;
      case 'manual':
        S.add.form = { id: 'new', title: '', artist: '', tags: [], rating: 0, favorite: false, status: S.settings.status[0] || '', language: S.settings.language[0] || '', subCategory: S.settings.sub[0] || '', barcode: /^\d{8,14}$/.test(S.add.query) ? S.add.query : '' };
        render(); break;
      case 'add-back': S.add.form = null; render(); break;
      case 'update-prices': updateAllPrices(); break;
      case 'reload': toast('重新載入中…'); refresh(true).then(() => toast('資料已更新')); break;
      case 'logout': {
        const ok = await confirmSheet('登出？', '登出後，這台裝置需要重新輸入密碼才能看收藏。', '登出', true);
        if (ok) { await API.logout(); S.records = []; showLogin(); }
        break;
      }
    }
  });

  // ───────────────────────── 啟動 ─────────────────────────
  function start() {
    if (!API.hasToken()) { showLogin(); return; }
    $('#login').hidden = true;
    $('#app').hidden = false;
    const cached = API.cached();
    if (cached && cached.records) {
      hydrate(cached);
      render();
      refresh(true);
    } else {
      $('#view').innerHTML = '<div class="loading" style="padding-top:40vh"><span class="spinner"></span></div>';
      refresh(false);
    }
  }
  start();
})();
