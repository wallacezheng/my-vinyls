/* My Vinyls v2 — 後端 API 呼叫 */
(function () {
  const TOKEN_KEY = 'vinyl.token';
  const CACHE_KEY = 'vinyl.cache';

  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) { /* 私密瀏覽等情況忽略 */ }
  }
  function load(key, parse) {
    try {
      const v = localStorage.getItem(key);
      return v && parse ? JSON.parse(v) : v;
    } catch (e) { return null; }
  }

  class AuthError extends Error {}

  async function call(action, params) {
    const url = (window.VINYL_CONFIG || {}).API_URL;
    if (!url || url.indexOf('請換成') !== -1) throw new Error('尚未設定 API 網址（js/config.js）');
    const body = Object.assign({ action: action, token: load(TOKEN_KEY) || '' }, params || {});
    let res;
    try {
      // text/plain 是「簡單請求」，不會觸發 CORS 預檢，Apps Script 才收得到
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    } catch (e) {
      throw new Error('連不上伺服器，請檢查網路');
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('伺服器回應格式錯誤（是否已部署成「任何人」可存取？）'); }
    if (!data.ok) {
      if (data.error === 'AUTH') { store(TOKEN_KEY, null); throw new AuthError(data.message || '請重新登入'); }
      throw new Error(data.error || '發生未知錯誤');
    }
    return data.data;
  }

  window.VinylAPI = {
    AuthError: AuthError,
    hasToken: () => !!load(TOKEN_KEY),
    async login(passcode) {
      const r = await call('login', { passcode: passcode });
      store(TOKEN_KEY, r.token);
      return r;
    },
    async logout() {
      try { await call('logout'); } catch (e) { /* 無論如何都清掉本機 */ }
      store(TOKEN_KEY, null);
      store(CACHE_KEY, null);
    },
    cached: () => load(CACHE_KEY, true),
    async bootstrap() {
      const d = await call('bootstrap');
      store(CACHE_KEY, d);
      return d;
    },
    saveCache: (d) => store(CACHE_KEY, d),
    search: (query) => call('search', { query: query }),
    release: (releaseId) => call('release', { releaseId: releaseId }),
    appleMusic: (artist, title) => call('appleMusic', { artist: artist, title: title }),
    add: (record, force) => call('add', { record: record, force: !!force }),
    update: (id, updates) => call('update', { id: id, updates: updates }),
    remove: (id) => call('remove', { id: id }),
    priceBatch: (reset) => call('priceBatch', { reset: !!reset }),
    listen: (id) => call('listen', { id: id }),
    preorderAdd: (p) => call('preorderAdd', { preorder: p }),
    preorderUpdate: (id, updates) => call('preorderUpdate', { id: id, updates: updates }),
    preorderRemove: (id) => call('preorderRemove', { id: id }),
    rename: (field, from, to) => call('rename', { field: field, from: from, to: to }),
    bulkUpdate: (items) => call('bulkUpdate', { items: items }),
    mailScan: (days) => call('mailScan', { days: days }),
    mailUpdate: (id, updates) => call('mailUpdate', { id: id, updates: updates }),
    parseImage: (image, mime) => call('parseImage', { image: image, mime: mime }),
    parseText: (text) => call('parseText', { text: text })
  };
})();
