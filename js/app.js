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
    return Object.assign({ q: '', language: [], sub: [], tags: [], status: [], rating: [], year: [], location: [], fav: false, sort: 'recent', shown: 40 }, over || {});
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
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
    disc: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
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
      ${url ? `<img src="${esc(url)}" alt="${esc(alt || '')}" loading="lazy" decoding="async" draggable="false" onload="this.parentNode.classList.add('loaded')" onerror="this.remove()">` : ''}
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
    S.preorders = d.preorders || [];
    S.aliases = d.aliases || {};
    if (S.crate.order.length !== S.records.length) buildCrateOrder();
  }
  function persist() {
    API.saveCache({ records: S.records, settings: S.settings, exchangeRate: S.rate, history: S.history, priceCursor: S.priceInfo, preorders: S.preorders, aliases: S.aliases });
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
  const pendingPreorders = () => (S.preorders || []).filter((p) => p.status !== '已到貨');
  const daysSince = (d) => { const t = Date.parse(String(d || '').slice(0, 10)); return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000); };
  const distinct = (key) => Array.from(new Set(S.records.map((r) => String(r[key] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  /** 同一張專輯的其他版本：優先用 Discogs master，沒有的話用「藝人＋專輯名」比對 */
  const normKey = (s) => String(s || '').toLowerCase().replace(/[\s\-_.,:;'"「」『』()（）\[\]【】]/g, '');
  function otherVersions(r) {
    return S.records.filter((x) => x.id !== r.id && (
      (r.masterId && x.masterId === r.masterId) ||
      (normKey(x.title) === normKey(r.title) && normKey(x.artist) === normKey(r.artist))));
  }
  function relDays(d) {
    const n = daysSince(d);
    if (n == null) return '';
    return n <= 0 ? '今天' : n === 1 ? '昨天' : n < 30 ? n + ' 天前' : n < 365 ? Math.floor(n / 30) + ' 個月前' : Math.floor(n / 365) + ' 年前';
  }

  // ───────── 膠色：把「Lake Green」「透明」「Yellow & Pink Marbled」轉成唱片的顏色 ─────────
  const VINYL_COLORS = [
    ['liquid', /liquid|液態|液体|液體/i, null],
    ['picture', /picture|圖片膠|圖膠|画膠|畫膠|图片胶/i, null],
    ['clear', /clear|transparent|crystal|透明|水晶/i, 'rgba(225,232,236,.38)'],
    ['lake', /lake green|teal|turquoise|aqua|seafoam|mint|湖水綠|湖水|薄荷|青/i, '#3FB8AF'],
    ['black', /black|黑/i, '#141414'],
    ['white', /white|白/i, '#E9E7E2'],
    ['red', /red|crimson|紅/i, '#B3202A'],
    ['blue', /blue|navy|cobalt|藍/i, '#2456A6'],
    ['green', /green|綠/i, '#2F8F4E'],
    ['yellow', /yellow|mustard|黃/i, '#E8C547'],
    ['pink', /pink|rose|粉/i, '#F2A0B9'],
    ['purple', /purple|violet|lavender|紫/i, '#7B4FA3'],
    ['orange', /orange|橘|橙/i, '#E07A2E'],
    ['gold', /gold|金/i, '#C9A227'],
    ['silver', /silver|grey|gray|銀|灰/i, '#9AA0A6'],
    ['brown', /brown|coffee|咖啡|棕/i, '#7A4E2D'],
    ['bone', /bone|cream|beige|米/i, '#E8DFC8']
  ];
  function vinylLook(r) {
    const txt = String(r.vinylColor || '');
    if (!txt) return { kind: 'black' };
    const hits = [];
    VINYL_COLORS.forEach(([name, re, hex]) => {
      const m = txt.match(re);
      if (m) hits.push({ name: name, hex: hex, at: m.index });
    });
    hits.sort((a, b) => a.at - b.at);
    if (hits.some((h) => h.name === 'picture') && safeUrl(r.coverUrl)) return { kind: 'picture' };
    if (hits.some((h) => h.name === 'liquid')) {
      const tint = hits.find((h) => h.hex && h.hex[0] === '#' && h.name !== 'black');
      return { kind: 'liquid', cols: [tint ? tint.hex : '#46B3C9'] };
    }
    const cols = hits.filter((h) => h.hex && !(h.name === 'green' && hits.some((x) => x.name === 'lake'))).map((h) => h.hex);
    if (!cols.length) return { kind: 'black' };
    const mix = /marble|splatter|swirl|smoke|galaxy|混|潑|大理石/i.test(txt);
    return { kind: cols.length > 1 ? (mix ? 'marble' : 'split') : (cols[0].indexOf('rgba') === 0 ? 'clear' : 'solid'), cols: cols.slice(0, 3) };
  }
  function discStyle(r) {
    const look = vinylLook(r);
    const grooves = 'repeating-radial-gradient(circle, rgba(0,0,0,.16) 0 1px, transparent 1px 3px)';
    const shine = 'conic-gradient(from 30deg, rgba(255,255,255,.0) 0deg, rgba(255,255,255,.18) 40deg, rgba(255,255,255,0) 80deg, rgba(255,255,255,0) 180deg, rgba(255,255,255,.14) 220deg, rgba(255,255,255,0) 260deg)';
    if (look.kind === 'black') return '';
    if (look.kind === 'picture') return `background:${shine},${grooves},url("${encodeURI(r.coverUrl).replace(/"/g, '%22')}") center/cover;`;
    if (look.kind === 'liquid') {
      const t = look.cols[0];
      return `background:${shine},${grooves},radial-gradient(circle at 34% 38%, rgba(255,255,255,.45) 0 3%, transparent 3.6%),radial-gradient(circle at 63% 30%, rgba(255,255,255,.35) 0 2%, transparent 2.6%),radial-gradient(circle at 58% 68%, rgba(255,255,255,.3) 0 2.6%, transparent 3.2%),radial-gradient(circle, ${t}e6 0 40%, ${t}99 62%, ${t}66 100%);--liquid:${t};box-shadow:inset 0 0 0 6px rgba(255,255,255,.18);`;
    }
    if (look.kind === 'clear') return `background:${shine},${grooves},rgba(225,232,236,.38);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);`;
    if (look.kind === 'solid') return `background:${shine},${grooves},${look.cols[0]};`;
    if (look.kind === 'split') return `background:${shine},${grooves},linear-gradient(100deg,${look.cols[0]} 50%,${look.cols[1]} 50%);`;
    const c = look.cols, stops = [];
    for (let i = 0; i < 8; i++) stops.push(`${c[i % c.length]} ${i * 45}deg ${(i + 1) * 45}deg`);
    return `background:${shine},${grooves},conic-gradient(from 12deg, ${stops.join(',')});`;
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
    if (path === '/add') return { name: 'add', params: params };
    if (path === '/stats') return { name: 'stats' };
    if (path === '/tidy') return { name: 'tidy', params: params };
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
        sort: p.get('sort') || 'recent', location: p.getAll('loc')
      });
    }
    if (!$('#sheet').hidden) closeSheet();
    S.prevHash = S.lastHash;
    S.lastHash = location.hash;
    render();
  });

  function render(keepScroll) {
    const r = route();
    $$('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (r.name === 'detail' ? '' : r.name === 'tidy' ? 'stats' : r.name)));
    const view = $('#view');
    view.classList.toggle('flush', r.name === 'detail');
    if (r.name === 'home') renderHome(view);
    else if (r.name === 'all') renderAll(view);
    else if (r.name === 'detail') renderDetail(view, r.id);
    else if (r.name === 'add') renderAdd(view);
    else if (r.name === 'stats') renderStats(view);
    else if (r.name === 'tidy') renderTidy(view, r.params);
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
    const unplayed = recs.slice().sort((a, b) => String(a.lastListened || '').localeCompare(String(b.lastListened || '')) || byRecent(b, a)).slice(0, 12);
    const pre = pendingPreorders().sort((a, b) => String(a.orderDate || a.createdAt).localeCompare(String(b.orderDate || b.createdAt)));

    view.innerHTML = `
      <header class="page-head">
        <div><span class="eyebrow">${recs.length} 張收藏</span><h1>我的唱片櫃</h1></div>
        <a class="icon-btn soft" href="#/all" aria-label="搜尋收藏" style="color:var(--ink)">${I.search}</a>
      </header>
      <section id="crate" class="crate" aria-label="翻唱片箱"></section>
      ${pre.length ? `<a class="pre-banner" href="#/add?tab=pre">
        <span class="pre-count mono">${pre.length}</span>
        <span class="body"><strong>張預訂中</strong><span>最久的「${esc(pre[0].title)}」已經等了 ${daysSince(pre[0].orderDate || pre[0].createdAt) || 0} 天</span></span>
        ${I.next}</a>` : ''}
      ${shelf('最近新增', recent, '#/all?sort=recent')}
      ${shelf('好久沒聽', unplayed, '#/all?sort=listened')}
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
    bindCrateGestures($('#crate'));
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
    // 骨架只建一次；之後翻片只換內容，不替換正在被手指按住的元素（否則連續滑動會失效）
    if (!$('#crate-stage', box)) {
      box.innerHTML = `
        <div class="crate-head"><strong>翻唱片箱</strong><span class="mono" style="font-size:12px" id="crate-pos"></span></div>
        <div class="crate-stage" id="crate-stage">
          <div class="crate-card back2"></div>
          <div class="crate-card back1"></div>
          <div class="crate-card front" id="crate-front"></div>
        </div>
        <div class="crate-info">
          <span class="t" id="crate-t"></span>
          <span class="a" id="crate-a"></span>
          <span class="m" id="crate-m"></span>
        </div>
        <div class="crate-ctrl">
          <button class="icon-btn" data-action="crate-prev" aria-label="上一張">${I.back}</button>
          <a class="btn btn-pull" id="crate-pull" href="#/">抽出來看看</a>
          <button class="icon-btn" data-action="crate-next" aria-label="下一張">${I.next}</button>
        </div>
        <p class="crate-hint">左右滑動翻片・點封面抽出來</p>`;
    }
    $('#crate-pos', box).textContent = `${pos} / ${n}`;
    const cards = [[$('.back2', box), n > 2 ? b2 : null], [$('.back1', box), n > 1 ? b1 : null], [$('#crate-front', box), cur]];
    cards.forEach(([el, rec]) => {
      el.classList.remove('anim');
      el.style.transform = ''; el.style.opacity = '';
      el.hidden = !rec;
      if (rec && el.dataset.rid !== rec.id) {
        el.dataset.rid = rec.id;
        el.innerHTML = coverHTML(rec, '', rec === cur ? rec.title + ' 封面' : '');
      }
    });
    $('#crate-t', box).textContent = cur.title;
    $('#crate-a', box).textContent = cur.artist;
    $('#crate-m', box).textContent = crateMeta(cur);
    $('#crate-pull', box).setAttribute('href', '#/r/' + encodeURIComponent(cur.id));
    [cur, b1, b2].forEach(extractColor);
  }

  let crateTimer = null;
  function crateStep(dir) {
    if (crateTimer) { clearTimeout(crateTimer); crateTimer = null; }
    S.crate.i += dir;
    renderCrate();
  }

  /**
   * 翻唱片箱的手勢。只在首頁渲染時綁一次在 #crate 上（不隨每次翻片重綁），
   * 手機用 touch 事件（可以在水平滑動時阻止頁面捲動），電腦用滑鼠的 pointer 事件。
   * 動畫還沒結束就開始下一次滑動時，會立刻完成上一張，所以可以連續快速翻。
   */
  function bindCrateGestures(box) {
    let g = null; // 進行中的手勢

    function parts() {
      const stage = $('#crate-stage', box);
      return stage ? { stage: stage, front: $('#crate-front', stage), b1: $('.back1', stage), b2: $('.back2', stage) } : null;
    }
    function setBacks(p, P) {
      if (P.b1) P.b1.style.transform = `translate(${-5.1 * p}%, ${9.2 * p}%) scale(${1 + 0.113 * p})`;
      if (P.b2) P.b2.style.transform = `translate(${-5.1 * p}%, ${9.7 * p}%) scale(${1 + 0.128 * p})`;
    }
    function start(x, y, target) {
      if (!target.closest('#crate-stage')) return false;
      if (crateTimer) { clearTimeout(crateTimer); crateTimer = null; crateStep(g && g.dir || 0); }
      const P = parts();
      if (!P) return false;
      [P.front, P.b1, P.b2].forEach((el) => el && el.classList.remove('anim'));
      g = { sx: x, sy: y, t0: performance.now(), dx: 0, mode: null, P: P, dir: 0 };
      return true;
    }
    function move(x, y) {
      if (!g) return false;
      const mx = x - g.sx, my = y - g.sy;
      if (!g.mode) {
        if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) g.mode = 'h';
        else if (Math.abs(my) > 10) g.mode = 'v';
      }
      if (g.mode !== 'h') return false;
      g.dx = mx;
      g.P.front.style.transform = `translateX(${mx}px) rotate(${mx / 18}deg)`;
      setBacks(Math.min(Math.abs(mx) / 160, 1), g.P);
      return true;
    }
    function finish(x, y, cancelled) {
      if (!g) return;
      const G = g; g = null;
      const dt = performance.now() - G.t0;
      if (!cancelled && !G.mode && dt < 350 && Math.abs(x - G.sx) < 6 && Math.abs(y - G.sy) < 6) {
        const cur = crateAt(0);
        if (cur) location.hash = '#/r/' + encodeURIComponent(cur.id);
        return;
      }
      if (G.mode !== 'h') return;
      const v = Math.abs(G.dx) / Math.max(dt, 1);
      if (!cancelled && (Math.abs(G.dx) > 70 || (v > 0.5 && Math.abs(G.dx) > 30))) {
        const dir = G.dx < 0 ? 1 : -1;
        G.P.front.classList.add('anim');
        G.P.front.style.transform = `translateX(${G.dx < 0 ? -420 : 420}px) rotate(${G.dx < 0 ? -18 : 18}deg)`;
        G.P.front.style.opacity = '0';
        g = { dir: dir }; // 讓下一次手勢知道要先完成哪個方向
        crateTimer = setTimeout(() => { crateTimer = null; g = null; crateStep(dir); }, 180);
      } else {
        [G.P.front, G.P.b1, G.P.b2].forEach((el) => el && el.classList.add('anim'));
        G.P.front.style.transform = ''; setBacks(0, G.P);
      }
    }

    // 手機：touch 事件
    box.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      start(t.clientX, t.clientY, e.target);
    }, { passive: true });
    box.addEventListener('touchmove', (e) => {
      if (!g || !g.P) return;
      const t = e.touches[0];
      if (move(t.clientX, t.clientY) && e.cancelable) e.preventDefault(); // 水平滑動時不要捲動頁面
    }, { passive: false });
    box.addEventListener('touchend', (e) => {
      if (!g || !g.P) return;
      const t = e.changedTouches[0];
      const wasTap = !g.mode;
      finish(t.clientX, t.clientY, false);
      if (wasTap && e.cancelable) e.preventDefault(); // 避免再觸發一次 click
    });
    box.addEventListener('touchcancel', () => { if (g && g.P) finish(0, 0, true); });

    // 電腦：滑鼠
    function onMouseMove(e) { if (g && g.P) move(e.clientX, e.clientY); }
    function onMouseUp(e) {
      window.removeEventListener('pointermove', onMouseMove);
      window.removeEventListener('pointerup', onMouseUp);
      if (g && g.P) finish(e.clientX, e.clientY, false);
    }
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (!start(e.clientX, e.clientY, e.target)) return;
      e.preventDefault();
      window.addEventListener('pointermove', onMouseMove);
      window.addEventListener('pointerup', onMouseUp);
    });
  }

  // ───────────────────────── 全部收藏 ─────────────────────────
  const SORTS = {
    recent: ['最近加入', (a, b) => byRecent(a, b)],
    oldest: ['最早加入', (a, b) => byRecent(b, a)],
    year: ['發行年份（新→舊）', (a, b) => String(b.year).localeCompare(String(a.year)) || byRecent(a, b)],
    artist: ['藝人', (a, b) => a.artist.localeCompare(b.artist, 'zh-Hant')],
    purchase: ['購入價（高→低）', (a, b) => (b.purchase || 0) - (a.purchase || 0)],
    market: ['Discogs 最低價（高→低）', (a, b) => (b.marketUSD || 0) - (a.marketUSD || 0)],
    rating: ['星等（高→低）', (a, b) => (b.rating || 0) - (a.rating || 0)],
    listened: ['最久沒聽', (a, b) => String(a.lastListened || '').localeCompare(String(b.lastListened || '')) || byRecent(b, a)],
    plays: ['最常聽', (a, b) => (b.listenCount || 0) - (a.listenCount || 0)],
    location: ['存放位置', (a, b) => String(a.location || '\uffff').localeCompare(String(b.location || '\uffff'), 'zh-Hant') || a.artist.localeCompare(b.artist, 'zh-Hant')]
  };

  function filtered() {
    const L = S.list;
    const q = L.q.trim().toLowerCase();
    const list = S.records.filter((r) => {
      if (q) {
        const hay = [r.title, r.artist, r.label, r.catno, r.barcode, r.tracklist, r.tags.join(' '), r.location, r.purchaseSource, r.vinylColor, r.myNumber].join('\n').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (L.fav && !r.favorite) return false;
      if (L.language.length && L.language.indexOf(r.language) === -1) return false;
      if (L.sub.length && L.sub.indexOf(r.subCategory) === -1) return false;
      if (L.status.length && L.status.indexOf(r.status) === -1) return false;
      if (L.tags.length && !L.tags.some((t) => r.tags.indexOf(t) !== -1)) return false;
      if (L.rating.length && L.rating.indexOf(String(r.rating)) === -1) return false;
      if (L.year.length && L.year.indexOf(r.year) === -1) return false;
      if (L.location.length && L.location.indexOf(r.location || '未設定') === -1) return false;
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
    const anyOn = S.list.fav || ['language', 'sub', 'tags', 'status', 'rating', 'year', 'location'].some((g) => S.list[g].length);
    box.innerHTML = `
      <div class="filter-row">
        <button class="chip ${S.list.fav ? 'on' : ''}" aria-pressed="${S.list.fav}" data-action="filter-fav">${I.heart.replace('<svg', '<svg width="14" height="14" style="fill:currentColor;stroke:none"')}最愛</button>
        ${anyOn ? '<button class="chip" data-action="filter-clear">清除篩選</button>' : ''}
      </div>
      ${chipRow('位置', 'location', S.records.some((r) => r.location) ? distinct('location').concat(S.records.some((r) => !r.location) ? ['未設定'] : []) : [])}
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
        <span class="a">${esc(S.list.sort === 'location' && r.location ? r.location : r.artist + (r.year ? ' · ' + r.year : ''))}</span>
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
        <div class="disc ${vinylLook(r).kind}" aria-hidden="true" style="${discStyle(r)}">${vinylLook(r).kind === 'picture' ? '<span class="pic-hole"></span>' : `<div class="disc-label"><b>${esc(r.title)}</b><i>${esc(r.myNumber ? 'No. ' + r.myNumber : (r.catno || '33⅓ RPM'))}</i><span class="hole"></span></div>`}</div>
        <div class="sleeve">${coverHTML(r, '', r.title + ' 封面')}</div>
      </div>

      <div class="d-title">
        <h1>${esc(r.title)}</h1>
        <span class="artist">${esc(r.artist)}</span>
        ${r.location ? `<a class="loc" href="#/all?loc=${encodeURIComponent(r.location)}">${I.pin}${esc(r.location)}</a>` : `<button class="loc ghost" data-action="edit">${I.pin}設定存放位置</button>`}
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

      <div class="d-listen">
        <button class="btn" data-action="listen">${I.disc}今天聽了</button>
        <span>${r.listenCount ? `上次聽：${esc(relDays(r.lastListened))}<br><span class="mono">共 ${r.listenCount} 次</span>` : '還沒有聆聽紀錄'}</span>
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
          <div><dt>膠色</dt><dd>${dash(r.vinylColor || '')}</dd></div>
        </dl>
      </section>

      <section class="d-sec">
        <h2>我的這張</h2>
        <dl class="info-list">
          <div><dt>我的編號</dt><dd class="mono">${dash(r.myNumber)}</dd></div>
          <div><dt>唱片品相</dt><dd>${dash(gradeLabel(r.mediaGrade))}</dd></div>
          <div><dt>封套品相</dt><dd>${dash(gradeLabel(r.sleeveGrade))}</dd></div>
          <div><dt>購入日期</dt><dd class="mono">${dash(r.purchaseDate)}</dd></div>
          <div><dt>購入通路</dt><dd>${dash(r.purchaseSource)}</dd></div>
          <div><dt>存放位置</dt><dd>${dash(r.location)}</dd></div>
          <div><dt>加入收藏</dt><dd class="mono">${dash(fmtDateTime(r.createdAt))}</dd></div>
        </dl>
      </section>

      ${(() => { const v = otherVersions(r); return v.length ? `<div class="section-head" style="padding-left:20px;padding-right:20px"><h2>你也收藏了其他版本</h2></div>
        <div class="shelf vers" style="padding:0 20px 6px">${v.map((x) => `<a class="shelf-item sm" href="#/r/${encodeURIComponent(x.id)}">${coverHTML(x, 'shadow')}<span class="t">${esc(x.year || '')} ${esc((x.format || '').replace(/^Vinyl\s*/, ''))}</span><span class="a">${esc(x.vinylColor || x.catno || '')}</span></a>`).join('')}</div>` : ''; })()}

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

  const GRADES = [['M', 'Mint 全新未拆'], ['NM', 'Near Mint 近全新'], ['VG+', 'Very Good Plus 輕微使用痕跡'], ['VG', 'Very Good 明顯使用痕跡'], ['G+', 'Good Plus'], ['G', 'Good'], ['F', 'Fair'], ['P', 'Poor']];
  function gradeLabel(g) { const x = GRADES.find((q) => q[0] === g); return x ? x[0] + '（' + x[1] + '）' : (g || ''); }

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
  function datalistHTML(id, values) {
    const uniq = Array.from(new Set(values.map((x) => String(x || '').trim()).filter(Boolean)));
    return `<datalist id="${id}">${uniq.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  }
  function gradeSelectHTML(name, label, value) {
    return `<label class="field"><span>${esc(label)}</span><select name="${name}"><option value="">—</option>
      ${GRADES.map((g) => `<option value="${g[0]}" ${g[0] === value ? 'selected' : ''}>${g[0]}・${esc(g[1])}</option>`).join('')}</select></label>`;
  }
  function bindColorChips(root) {
    $$('[data-color]', root).forEach((b) => b.addEventListener('click', () => {
      const inp = $('[name="vinylColor"]', root);
      const v = b.dataset.color;
      inp.value = inp.value && v !== '黑' ? (inp.value.indexOf(v) === -1 ? inp.value + ' / ' + v : inp.value) : v;
    }));
  }
  function bindTagPicker(root) {
    bindColorChips(root);
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
      <div class="form-box"><h3>我的這張</h3>
        <div class="form-grid">
          ${inputHTML('purchaseDate', '購入日期', r.purchaseDate, { extra: 'type="date"' })}
          ${inputHTML('purchaseSource', '購入通路', r.purchaseSource, { extra: 'list="dl-source" placeholder="例如：誠品、佳佳"' })}
          ${inputHTML('location', '存放位置', r.location, { extra: 'list="dl-location" placeholder="例如：客廳櫃 A-3"' })}
          ${inputHTML('myNumber', '我的編號', r.myNumber, { extra: 'placeholder="例如：0347 / 1000"' })}
          ${gradeSelectHTML('mediaGrade', '唱片品相', r.mediaGrade)}
          ${gradeSelectHTML('sleeveGrade', '封套品相', r.sleeveGrade)}
        </div>
        <div class="field"><span>膠色</span>
          <input name="vinylColor" value="${esc(r.vinylColor)}" placeholder="例如：湖水綠、透明、Yellow & Pink">
          <div class="tag-picker" style="margin-top:4px">${['黑', '透明', '白', '紅', '藍', '湖水綠', '綠', '黃', '粉', '紫', '橘', '金', '大理石', '液態膠', '圖片膠'].map((c) => `<button type="button" class="chip" data-color="${c}">${c}</button>`).join('')}</div>
        </div>
        <input type="hidden" name="masterId" value="${esc(r.masterId)}">
        ${datalistHTML('dl-source', distinct('purchaseSource').concat((S.preorders || []).map((p) => p.source)).concat(['誠品音樂', '佳佳唱片', '蝦皮', 'Discogs', '博客來', '演唱會現場']))}
        ${datalistHTML('dl-location', distinct('location'))}
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
      tracklist: v('tracklist'), discogsNotes: v('discogsNotes'), discogsUrl: v('discogsUrl'), coverUrl: v('coverUrl'),
      purchaseDate: v('purchaseDate'), purchaseSource: v('purchaseSource'), location: v('location'), myNumber: v('myNumber'),
      mediaGrade: v('mediaGrade'), sleeveGrade: v('sleeveGrade'), vinylColor: v('vinylColor'), masterId: v('masterId')
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
    const tabParam = route().params && route().params.get('tab');
    if (tabParam) A.tab = tabParam === 'pre' ? 'pre' : 'new';
    if (A.form) { renderAddForm(view); return; }
    const pend = pendingPreorders().length;
    const tabs = `<div class="seg" role="tablist" aria-label="新增方式">
        <a role="tab" href="#/add?tab=new" class="${A.tab !== 'pre' ? 'on' : ''}" aria-selected="${A.tab !== 'pre'}">新增唱片</a>
        <a role="tab" href="#/add?tab=pre" class="${A.tab === 'pre' ? 'on' : ''}" aria-selected="${A.tab === 'pre'}">預訂中${pend ? ` <span class="mono">${pend}</span>` : ''}</a>
      </div>`;
    if (A.tab === 'pre') { renderPreorders(view, tabs); return; }
    view.innerHTML = `
      <header class="page-head"><div><span class="eyebrow">Discogs 資料庫</span><h1>新增唱片</h1></div></header>
      ${tabs}
      ${A.fromPre ? `<div class="pre-note">正在收進預訂的「${esc(A.fromPre.title)}」— 選好版本後，購入價格與來源會自動帶入。<button class="link-btn" data-action="cancel-pre">取消</button></div>` : ''}
      <form class="add-search" id="add-search">
        <label class="search-bar">${I.search}<span class="sr-only">搜尋</span>
          <input id="add-q" type="search" enterkeyhint="search" placeholder="藝人、專輯或條碼數字" value="${esc(A.query)}" autocomplete="off"></label>
        <button type="button" class="icon-btn" data-action="scan" aria-label="用相機掃條碼">${I.scan}</button>
      </form>
      <p class="add-tip">點右邊的按鈕可以直接用手機相機掃唱片背面的條碼。</p>
      <div id="add-results" class="results">${resultsHTML()}</div>`;
    $('#add-search').addEventListener('submit', (e) => { e.preventDefault(); doSearch($('#add-q').value); });
  }

  // ───────── 預訂清單 ─────────
  function renderPreorders(view, tabs) {
    const pend = pendingPreorders().sort((a, b) => String(a.orderDate || a.createdAt).localeCompare(String(b.orderDate || b.createdAt)));
    const done = (S.preorders || []).filter((p) => p.status === '已到貨').slice(-10).reverse();
    const total = pend.reduce((s, p) => s + (p.price || 0), 0);
    view.innerHTML = `
      <header class="page-head"><div><span class="eyebrow">${pend.length} 張等待中${total ? '・共 ' + fmtNT(total) : ''}</span><h1>新增唱片</h1></div></header>
      ${tabs}
      <div class="pad" style="padding-top:14px"><button class="btn btn-ink btn-block" data-action="pre-new">${I.plus}記一筆預訂</button></div>
      <div class="pre-list">
        ${pend.length ? pend.map((p) => {
          const days = daysSince(p.orderDate || p.createdAt);
          return `<article class="pre-card">
            <div class="pre-main">
              <strong>${esc(p.title)}</strong>
              <span class="muted">${esc(p.artist || '')}</span>
              <span class="pre-meta mono">${esc([p.source, p.price ? fmtNT(p.price) : ''].filter(Boolean).join(' · '))}</span>
              <span class="pre-meta">預訂 ${esc(p.orderDate || String(p.createdAt).slice(0, 10))}・已等 <b>${days || 0}</b> 天${p.expectedDate ? '・預計 ' + esc(p.expectedDate) : ''}</span>
              ${p.note ? `<span class="pre-meta">${esc(p.note)}</span>` : ''}
            </div>
            <div class="pre-actions">
              <button class="btn btn-ink btn-sm" data-action="pre-arrive" data-id="${esc(p.id)}">到貨了</button>
              <button class="icon-btn soft" style="color:var(--ink)" data-action="pre-edit" data-id="${esc(p.id)}" aria-label="編輯預訂">${I.edit}</button>
            </div>
          </article>`;
        }).join('') : '<p class="empty">目前沒有預訂中的唱片。<br>下訂之後記一筆，就不怕忘記。</p>'}
      </div>
      ${done.length ? `<div class="section-head"><h2>最近到貨</h2></div><ul class="pre-done">${done.map((p) => `<li>${p.recordId && S.byId.get(p.recordId) ? `<a href="#/r/${encodeURIComponent(p.recordId)}">${esc(p.title)}</a>` : esc(p.title)}<span class="muted">${esc(p.artist || '')}</span></li>`).join('')}</ul>` : ''}`;
  }

  function openPreorderForm(p) {
    const isNew = !p;
    p = p || { orderDate: new Date().toISOString().slice(0, 10) };
    openSheet(`<h2 id="sheet-title">${isNew ? '記一筆預訂' : '編輯預訂'}</h2>
      <form id="pre-form" style="display:flex;flex-direction:column;gap:12px">
        ${inputHTML('title', '專輯名稱', p.title, { extra: 'required' })}
        ${inputHTML('artist', '藝人', p.artist)}
        <div class="form-grid">
          ${inputHTML('source', '購買來源', p.source, { extra: 'list="dl-pre-source" placeholder="例如：誠品、佳佳"' })}
          ${inputHTML('price', '價格（NT$）', p.price || '', { extra: 'inputmode="decimal"' })}
          ${inputHTML('orderDate', '預訂日期', p.orderDate, { extra: 'type="date"' })}
          ${inputHTML('expectedDate', '預計到貨', p.expectedDate, { extra: 'placeholder="例如：2026 年 12 月"' })}
        </div>
        ${textareaHTML('note', '備註（訂單編號、版本、贈品…）', p.note, 3)}
        ${datalistHTML('dl-pre-source', distinct('purchaseSource').concat((S.preorders || []).map((x) => x.source)).concat(['誠品音樂', '佳佳唱片', '蝦皮', '博客來', '五大唱片', '官方網站']))}
        <div class="form-actions"><button type="button" class="btn btn-outline" data-action="close-sheet">取消</button><button type="submit" class="btn btn-ink" id="pre-save">儲存</button></div>
        ${isNew ? '' : '<button type="button" class="btn btn-danger btn-block" id="pre-del">刪除這筆預訂</button>'}
      </form>`, (root) => {
      const form = $('#pre-form', root);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = (n) => $(`[name="${n}"]`, form).value.trim();
        const data = { title: v('title'), artist: v('artist'), source: v('source'), price: v('price'), orderDate: v('orderDate'), expectedDate: v('expectedDate'), note: v('note') };
        if (!data.title) { toast('專輯名稱不可空白', true); return; }
        const dup = S.records.find((r) => normKey(r.title) === normKey(data.title) && (!data.artist || normKey(r.artist) === normKey(data.artist)));
        if (isNew && dup) {
          closeSheet();
          const ok = await confirmSheet('你已經收藏過這張', `唱片櫃裡已經有「${dup.title}」（${dup.artist}）。確定還要記這筆預訂嗎？`, '還是要記');
          if (!ok) return;
          openPreorderForm(Object.assign({}, data));
          return;
        }
        const btn = $('#pre-save', form); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
        try {
          const saved = isNew ? await API.preorderAdd(data) : await API.preorderUpdate(p.id, data);
          S.preorders = (S.preorders || []).filter((x) => x.id !== saved.id).concat([saved]);
          persist(); closeSheet(); toast(isNew ? '已記下預訂' : '已儲存'); render(true);
        } catch (err) { btn.disabled = false; btn.textContent = '儲存'; handleError(err); }
      });
      const del = $('#pre-del', root);
      if (del) del.addEventListener('click', async () => {
        closeSheet();
        if (!(await confirmSheet('刪除這筆預訂？', `「${p.title}」會從預訂清單移除。`, '刪除', true))) return;
        try { await API.preorderRemove(p.id); S.preorders = S.preorders.filter((x) => x.id !== p.id); persist(); toast('已刪除'); render(true); } catch (err) { handleError(err); }
      });
    });
  }

  function startArrival(p) {
    S.add = { query: [p.artist, p.title].filter(Boolean).join(' '), results: null, form: null, busy: false, tab: 'new', fromPre: p };
    location.hash = '#/add?tab=new';
    setTimeout(() => { if ($('#add-q')) doSearch(S.add.query); }, 30);
  }
  function preorderPrefill() {
    const p = S.add.fromPre;
    if (!p) return {};
    return { purchasePrice: p.price || '', purchase: p.price || '', purchaseSource: p.source || '', purchaseDate: p.orderDate || '' };
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
      }, applyAliases(d), { barcode: d.barcode || (isBarcode ? S.add.query.replace(/\s/g, '') : ''), coverUrl: d.coverUrl || x.cover }, preorderPrefill());
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
      // 是預訂到貨？把那筆預訂標成已到貨
      let pre = S.add.fromPre;
      if (!pre) {
        const match = pendingPreorders().find((p) => normKey(p.title) && (normKey(rec.title).indexOf(normKey(p.title)) !== -1 || normKey(p.title).indexOf(normKey(rec.title)) !== -1));
        if (match && await confirmSheet('這是你預訂的那張嗎？', `預訂清單裡有「${match.title}」${match.artist ? '（' + match.artist + '）' : ''}。要標記為已到貨嗎？`, '標記已到貨')) pre = match;
      }
      if (pre) {
        try {
          const upd = await API.preorderUpdate(pre.id, { status: '已到貨', recordId: res.record.id });
          S.preorders = (S.preorders || []).filter((x) => x.id !== upd.id).concat([upd]);
        } catch (err) { handleError(err); }
      }
      const mv = parseFloat(String(rec.marketValue).replace(/[^0-9.]/g, ''));
      if (!isNaN(mv) && String(rec.marketValue).indexOf('USD') !== -1) (S.history[res.record.id] = []).push({ t: res.record.createdAt, usd: mv });
      persist();
      S.add = { query: '', results: null, form: null, busy: false, tab: 'new' };
      toast(pre ? '預訂到貨，已收進唱片櫃' : '已收進唱片櫃');
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

  // ───────────────────────── 整理寫法 ─────────────────────────
  const TIDY_FIELDS = { artist: '藝人', label: '唱片公司', purchaseSource: '購入通路', location: '存放位置' };
  let s2t = null; // 簡轉繁函式（opencc-js，只在這頁才載入）
  function loadS2T() {
    if (s2t) return Promise.resolve(s2t);
    return new Promise((resolve) => {
      const sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/cn2t.js';
      sc.onload = () => { try { s2t = window.OpenCC.Converter({ from: 'cn', to: 'tw' }); } catch (e) { s2t = (x) => x; } resolve(s2t); };
      sc.onerror = () => { s2t = (x) => x; resolve(s2t); };
      document.head.appendChild(sc);
    });
  }
  function applyAliases(d) {
    const out = Object.assign({}, d);
    Object.keys(TIDY_FIELDS).forEach((f) => { const m = (S.aliases || {})[f] || {}; if (out[f] && m[out[f]]) out[f] = m[out[f]]; });
    return out;
  }
  function tidyKey(v) {
    let k = (s2t || ((x) => x))(String(v || '')).toLowerCase();
    k = k.replace(/(股份)?有限公司|co\.?,?\s*ltd\.?|\bltd\.?|\binc\.?|\blimited\b|&\s*tapes|\band tapes\b|\bcorp(oration)?\.?/g, '');
    return k.replace(/[\s\-_.,:;'"’&()（）\[\]「」『』【】・·]/g, '');
  }
  function tidyIgnored() { return loadJSON('vinyl.tidy.ignore') || []; }

  /** 找出可能是同一個的寫法：規則相同（簡繁、大小寫、空白、公司字尾），或藝人的 Discogs ID 相同 */
  function tidyGroups(field) {
    const counts = {}, ids = {};
    S.records.forEach((r) => {
      const v = String(r[field] || '').trim();
      if (!v) return;
      counts[v] = (counts[v] || 0) + 1;
      if (field === 'artist' && r.artistId) (ids[v] = ids[v] || new Set()).add(r.artistId);
    });
    const vals = Object.keys(counts);
    const parent = {}; vals.forEach((v) => { parent[v] = v; });
    const find = (v) => (parent[v] === v ? v : (parent[v] = find(parent[v])));
    const union = (a, b) => { parent[find(a)] = find(b); };
    const byKey = {}, byId = {};
    vals.forEach((v) => {
      const k = tidyKey(v);
      if (k) { if (byKey[k]) union(v, byKey[k]); else byKey[k] = v; }
      (ids[v] ? Array.from(ids[v]) : []).forEach((id) => { if (byId[id]) union(v, byId[id]); else byId[id] = v; });
    });
    const groups = {};
    vals.forEach((v) => { (groups[find(v)] = groups[find(v)] || []).push(v); });
    const ignored = tidyIgnored();
    return {
      counts: counts,
      groups: Object.values(groups).filter((g) => g.length > 1)
        .map((g) => g.sort((a, b) => counts[b] - counts[a] || ((s2t && s2t(b) === b) - (s2t && s2t(a) === a))))
        .filter((g) => ignored.indexOf(field + ':' + g.slice().sort().join('|')) === -1)
    };
  }

  function renderTidy(view, params) {
    const field = TIDY_FIELDS[params && params.get('f')] ? params.get('f') : 'artist';
    S.tidySel = S.tidySel && S.tidySel.field === field ? S.tidySel : { field: field, set: new Set(), q: '' };
    if (!s2t) {
      view.innerHTML = '<div class="loading" style="padding-top:30vh"><span class="spinner"></span>&nbsp; 準備簡繁對照…</div>';
      loadS2T().then(() => { if (route().name === 'tidy') render(true); });
      return;
    }
    const { counts, groups } = tidyGroups(field);
    const label = TIDY_FIELDS[field];
    const noIds = field === 'artist' && !S.records.some((r) => r.artistId);
    view.innerHTML = `
      <header class="page-head"><div><span class="eyebrow">統一寫法，統計和搜尋才準</span><h1>整理寫法</h1></div>
        <a class="icon-btn soft" href="#/stats" aria-label="回到統計" style="color:var(--ink)">${I.back}</a></header>
      <div class="seg seg4" role="tablist">${Object.keys(TIDY_FIELDS).map((f) => `<a role="tab" href="#/tidy?f=${f}" class="${f === field ? 'on' : ''}" aria-selected="${f === field}">${TIDY_FIELDS[f]}</a>`).join('')}</div>

      <div class="section-head"><h2>可能是同一個</h2></div>
      ${noIds ? '<p class="muted pad" style="margin:-4px 0 10px;font-size:13px">提示：到統計頁按一次「更新全部 Discogs 價格」，就能用 Discogs 藝人編號比對中英文名（例如 Eason Chan／陳奕迅）。</p>' : ''}
      <div class="tidy-groups">
        ${groups.length ? groups.map((g, gi) => `
          <form class="tidy-card" data-group="${gi}">
            <p class="muted" style="margin:0 0 8px;font-size:13px">選一個要保留的寫法：</p>
            ${g.map((v, i) => `<label class="tidy-opt"><input type="radio" name="keep" value="${esc(v)}" ${i === 0 ? 'checked' : ''}><span>${esc(v)}</span><span class="mono muted">${counts[v]} 張</span></label>`).join('')}
            <div class="form-actions" style="padding:10px 0 0">
              <button type="button" class="btn btn-outline btn-sm" data-action="tidy-ignore" data-values="${esc(g.join('\u0001'))}">不是同一個</button>
              <button type="button" class="btn btn-ink btn-sm" data-action="tidy-merge-group" data-values="${esc(g.join('\u0001'))}">合併</button>
            </div>
          </form>`).join('') : `<p class="empty" style="padding:24px">目前沒有發現疑似重複的${esc(label)}寫法。</p>`}
      </div>

      <div class="section-head"><h2>手動合併</h2></div>
      <p class="muted pad" style="margin:-4px 0 10px;font-size:13px">規則抓不到的（例如中英文名），勾選兩個以上再按合併。</p>
      <label class="search-bar">${I.search}<span class="sr-only">搜尋</span><input id="tidy-q" type="search" placeholder="搜尋${esc(label)}" value="${esc(S.tidySel.q)}" autocomplete="off"></label>
      <ul class="tidy-all" id="tidy-all"></ul>
      <div class="tidy-bar" id="tidy-bar" hidden><span id="tidy-bar-n"></span><button class="btn btn-ink btn-sm" data-action="tidy-merge-sel">合併選取的寫法</button></div>`;
    const drawAll = () => {
      const q = S.tidySel.q.trim().toLowerCase();
      const vals = Object.keys(counts).filter((v) => !q || v.toLowerCase().indexOf(q) !== -1 || tidyKey(v).indexOf(tidyKey(q)) !== -1)
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      $('#tidy-all').innerHTML = vals.map((v) => `<li><label><input type="checkbox" data-tidy-val="${esc(v)}" ${S.tidySel.set.has(v) ? 'checked' : ''}><span>${esc(v)}</span><span class="mono muted">${counts[v]}</span></label></li>`).join('') || '<li class="muted" style="padding:12px 0">沒有符合的寫法</li>';
      const n = S.tidySel.set.size;
      $('#tidy-bar').hidden = n < 2;
      $('#tidy-bar-n').textContent = `已選 ${n} 個`;
    };
    drawAll();
    $('#tidy-q').addEventListener('input', debounce((e) => { S.tidySel.q = e.target.value; drawAll(); }, 150));
    $('#tidy-all').addEventListener('change', (e) => {
      const cb = e.target.closest('[data-tidy-val]'); if (!cb) return;
      if (cb.checked) S.tidySel.set.add(cb.dataset.tidyVal); else S.tidySel.set.delete(cb.dataset.tidyVal);
      drawAll();
    });
  }

  async function doRename(field, from, to) {
    try {
      const res = await API.rename(field, from, to);
      S.records.forEach((r) => { if (from.indexOf(String(r[field] || '').trim()) !== -1) r[field] = to; });
      S.aliases = res.aliases || S.aliases;
      persist();
      toast(`已合併為「${to}」，共更新 ${res.changed} 張`);
      if (S.tidySel) S.tidySel.set = new Set();
      render(true);
    } catch (e) { handleError(e); }
  }

  function openMergeSheet(field, values) {
    const counts = {};
    S.records.forEach((r) => { const v = String(r[field] || '').trim(); if (v) counts[v] = (counts[v] || 0) + 1; });
    const sorted = values.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    openSheet(`<h2 id="sheet-title">合併成哪個寫法？</h2>
      <form id="merge-form" style="display:flex;flex-direction:column;gap:6px">
        ${sorted.map((v, i) => `<label class="tidy-opt"><input type="radio" name="keep" value="${esc(v)}" ${i === 0 ? 'checked' : ''}><span>${esc(v)}</span><span class="mono muted">${counts[v] || 0} 張</span></label>`).join('')}
        <label class="tidy-opt"><input type="radio" name="keep" value="__custom"><span>其他寫法：</span></label>
        <input class="tidy-custom" name="custom" placeholder="例如：陳奕迅 Eason Chan">
        <p class="muted" style="font-size:13px;margin:6px 0 0">之後新增唱片時，舊寫法也會自動換成這個。</p>
        <div class="form-actions" style="padding-top:8px"><button type="button" class="btn btn-outline" data-action="close-sheet">取消</button><button class="btn btn-ink" type="submit">合併</button></div>
      </form>`, (root) => {
      const form = $('#merge-form', root);
      $('[name="custom"]', form).addEventListener('focus', () => { $('[value="__custom"]', form).checked = true; });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        let to = $('[name="keep"]:checked', form).value;
        if (to === '__custom') to = $('[name="custom"]', form).value.trim();
        if (!to) { toast('請輸入要保留的寫法', true); return; }
        closeSheet();
        doRename(field, values, to);
      });
    });
  }

  // ───────────────────────── 統計 ─────────────────────────
  function barsHTML(pairs) {
    const max = Math.max.apply(null, pairs.map((p) => p[1]).concat(1));
    return `<div class="bar-list">${pairs.map((p) => `<div class="bar"><span class="name">${esc(p[0])}</span>
      <span class="track"><span class="fill" style="display:block;width:${(p[1] / max * 100).toFixed(1)}%"></span></span><span class="n">${p[1]}</span></div>`).join('')}</div>`;
  }
  /** 直條圖（單一系列）。每根柱子有 data-tip，點或滑過時在上方讀數列顯示數值 */
  function columnChart(data, fmt, readDefault) {
    const W = 340, H = 150, PB = 22, PT = 14;
    const max = Math.max.apply(null, data.map((d) => d.value).concat(1));
    const bw = W / data.length;
    const ticks = [0, max / 2, max];
    return `<div class="chart">
      <p class="chart-readout mono" aria-live="polite">${esc(readDefault)}</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(data.map((d) => d.label + ' ' + fmt(d.value)).join('，'))}">
        ${ticks.map((t) => { const y = PT + (H - PB - PT) * (1 - t / max); return `<line x1="0" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="grid"/>`; }).join('')}
        ${data.map((d, i) => {
          const h = Math.max((H - PB - PT) * d.value / max, d.value ? 2 : 0);
          const x = i * bw + bw * 0.18, w = bw * 0.64, y = H - PB - h, r = Math.min(4, w / 2, h);
          const path = h ? `M${x},${H - PB} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H - PB} Z` : '';
          const tip = `${d.label}：${fmt(d.value)}${d.sub ? '（' + d.sub + '）' : ''}`;
          return `<g class="col" data-tip="${esc(tip)}" tabindex="0"><rect x="${i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>${path ? `<path d="${path}"/>` : ''}
            ${i % 2 === data.length % 2 || data.length <= 6 ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(d.short || d.label)}</text>` : ''}<title>${esc(tip)}</title></g>`;
        }).join('')}
      </svg></div>`;
  }
  /** 折線圖（單一系列，累積張數） */
  function lineChart(data, fmt, readDefault) {
    const W = 340, H = 150, PB = 22, PT = 14, PX = 6;
    const max = Math.max.apply(null, data.map((d) => d.value).concat(1));
    const x = (i) => PX + (data.length > 1 ? i / (data.length - 1) : 0.5) * (W - 2 * PX);
    const y = (v) => PT + (H - PB - PT) * (1 - v / max);
    const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
    const last = data.length - 1;
    const step = Math.max(1, Math.ceil(data.length / 6));
    return `<div class="chart">
      <p class="chart-readout mono" aria-live="polite">${esc(readDefault)}</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('收藏累積：' + data.map((d) => d.label + ' ' + fmt(d.value)).join('，'))}">
        ${[0, max / 2, max].map((t) => `<line x1="0" x2="${W}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"/>`).join('')}
        <polyline points="${pts}" class="line"/>
        <circle cx="${x(last)}" cy="${y(data[last].value)}" r="4.5" class="dot"/>
        ${data.map((d, i) => `<g class="col" data-tip="${esc(d.label + '：累積 ' + fmt(d.value))}"><rect x="${x(i) - (W / data.length) / 2}" y="0" width="${W / data.length}" height="${H}" fill="transparent"/>
          ${i % step === 0 || i === last ? `<text x="${Math.min(Math.max(x(i), 14), W - 14)}" y="${H - 6}" text-anchor="middle">${esc(d.short)}</text>` : ''}<title>${esc(d.label + '：累積 ' + fmt(d.value))}</title></g>`).join('')}
      </svg></div>`;
  }
  function monthSeries(n) {
    const out = [], now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    return out;
  }
  const monthOf = (r) => String(r.purchaseDate || r.createdAt || '').slice(0, 7);

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
    // 每月花費（依購入日期，沒有就用加入收藏的時間）
    const last12 = monthSeries(12);
    const spendData = last12.map((m) => {
      const rs = R.filter((r) => monthOf(r) === m);
      return { label: m, short: String(Number(m.slice(5))) + '月', value: rs.reduce((t, r) => t + (r.purchase || 0), 0), sub: rs.length + ' 張' };
    });
    const spend12 = spendData.reduce((t, d) => t + d.value, 0);
    // 收藏累積成長
    const allMonths = R.map(monthOf).filter(Boolean).sort();
    let growth = [];
    if (allMonths.length) {
      const first = allMonths[0], span = monthSeries(240).filter((m) => m >= first);
      let acc = 0;
      growth = span.map((m) => { acc += allMonths.filter((x) => x === m).length; return { label: m, short: m.slice(2, 4) + '/' + m.slice(5), value: acc }; });
    }
    const listens = R.reduce((t, r) => t + (r.listenCount || 0), 0);
    const topPlayed = R.filter((r) => r.listenCount).sort((a, b) => b.listenCount - a.listenCount).slice(0, 5);
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

      <div class="section-head"><h2>每月花費</h2></div>
      <div class="card">${columnChart(spendData, (v) => fmtNT(v), '近 12 個月共 ' + fmtNT(spend12) + '・點柱子看各月')}
        <p class="muted" style="margin:6px 0 0;font-size:12px">依「購入日期」計算，沒填的用加入收藏的時間。</p></div>
      ${growth.length > 1 ? `<div class="section-head"><h2>收藏成長</h2></div><div class="card">${lineChart(growth, (v) => v + ' 張', '目前 ' + R.length + ' 張')}</div>` : ''}
      <div class="section-head"><h2>聆聽</h2></div>
      <div class="card">${topPlayed.length ? `<p class="mono" style="margin:0 0 6px">共聽了 ${listens} 次</p><ol class="rank">${topPlayed.map((r) => rankItem(r, r.listenCount + ' 次')).join('')}</ol>` : '<p class="muted" style="margin:0">還沒有聆聽紀錄。在唱片詳情按「今天聽了」就會開始累積。</p>'}</div>
      <div class="section-head"><h2>語系</h2></div><div class="card">${barsHTML(countBy((r) => r.language))}</div>
      <div class="section-head"><h2>最常收藏的藝人</h2><a href="#/tidy">整理寫法</a></div><div class="card">${barsHTML(countBy((r) => r.artist).slice(0, 8))}</div>
      ${R.some((r) => r.purchaseSource) ? `<div class="section-head"><h2>購入通路</h2></div><div class="card">${barsHTML(countBy((r) => r.purchaseSource).slice(0, 8))}</div>` : ''}
      ${R.some((r) => r.location) ? `<div class="section-head"><h2>存放位置</h2></div><div class="card">${barsHTML(countBy((r) => r.location || '未設定'))}</div>` : ''}
      ${topValue.length ? `<div class="section-head"><h2>最低價最高的唱片</h2></div><div class="card"><ol class="rank">${topValue.map((r) => rankItem(r, fmtUSD(r.marketUSD))).join('')}</ol></div>` : ''}
      ${topGain.length ? `<div class="section-head"><h2>漲最多（相對購入價）</h2></div><div class="card"><ol class="rank">${topGain.map((x) => rankItem(x[0], (x[1] >= 0 ? '+' : '−') + Math.abs(x[1] * 100).toFixed(0) + '%')).join('')}</ol></div>` : ''}
      <div class="section-head"><h2>狀態</h2></div><div class="card">${barsHTML(countBy((r) => r.status))}</div>

      <div class="pad" style="padding-top:32px;display:flex;flex-direction:column;gap:10px">
        <a class="btn btn-outline btn-block" href="#/tidy">整理藝人、唱片公司的寫法</a>
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

  // 圖表讀數：點或滑過柱子／月份時，在圖表上方顯示數值
  function showTip(g) {
    const chart = g.closest('.chart');
    if (!chart) return;
    $$('.col.on', chart).forEach((x) => x.classList.remove('on'));
    g.classList.add('on');
    $('.chart-readout', chart).textContent = g.dataset.tip;
  }
  document.addEventListener('pointerover', (e) => { const g = e.target.closest && e.target.closest('.chart .col'); if (g) showTip(g); });
  document.addEventListener('focusin', (e) => { const g = e.target.closest && e.target.closest('.chart .col'); if (g) showTip(g); });

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
        S.add.form = Object.assign({ id: 'new', title: S.add.fromPre ? S.add.fromPre.title : '', artist: S.add.fromPre ? S.add.fromPre.artist : '', tags: [], rating: 0, favorite: false, status: S.settings.status[0] || '', language: S.settings.language[0] || '', subCategory: S.settings.sub[0] || '', barcode: /^\d{8,14}$/.test(S.add.query) ? S.add.query : '' }, preorderPrefill());
        render(); break;
      case 'add-back': S.add.form = null; render(); break;
      case 'update-prices': updateAllPrices(); break;
      case 'pre-new': openPreorderForm(null); break;
      case 'tidy-merge-group': {
        const field = (route().params && route().params.get('f')) || 'artist';
        const vals = el.dataset.values.split('\u0001');
        const keep = $('[name="keep"]:checked', el.closest('form')).value;
        if (await confirmSheet('確定合併？', `${vals.filter((v) => v !== keep).map((v) => '「' + v + '」').join('、')} 會全部改成「${keep}」。`, '合併')) doRename(TIDY_FIELDS[field] ? field : 'artist', vals, keep);
        break;
      }
      case 'tidy-ignore': {
        const field = (route().params && route().params.get('f')) || 'artist';
        const ig = tidyIgnored(); ig.push(field + ':' + el.dataset.values.split('\u0001').sort().join('|'));
        saveJSON('vinyl.tidy.ignore', ig); toast('好，之後不再提示這組'); render(true);
        break;
      }
      case 'tidy-merge-sel': openMergeSheet(S.tidySel.field, Array.from(S.tidySel.set)); break;
      case 'pre-edit': openPreorderForm((S.preorders || []).find((x) => x.id === el.dataset.id)); break;
      case 'pre-arrive': { const p = (S.preorders || []).find((x) => x.id === el.dataset.id); if (p) startArrival(p); break; }
      case 'cancel-pre': S.add.fromPre = null; render(true); break;
      case 'listen':
        if (!rec) break;
        el.disabled = true;
        try { const saved = await API.listen(rec.id); upsert(saved); toast('記下了，祝聆聽愉快'); render(true); }
        catch (err) { handleError(err); el.disabled = false; }
        break;
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
