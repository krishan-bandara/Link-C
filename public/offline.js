// Read-only offline viewer. The service worker serves offline.html (this script) when a page cannot be loaded.
// It shows the chat list and the last messages saved in IndexedDB by src/lib/offline (same database and store names).
// Privacy: it only opens while the person was active in the last IDLE_MS (the same rule as the app's idle logout);
// after that it wipes the saved data and locks. All text is inserted with textContent, never as HTML.
(function () {
  'use strict';
  var DB_NAME = 'linkc-offline';
  var IDLE_MS = 60000; // keep in sync with IDLE_MS in src/lib/idle.ts
  var MAX_AGE_MS = 14 * 24 * 3600 * 1000; // keep in sync with CACHE_MAX_AGE_MS in src/lib/offline/logic.ts
  var ACTIVE_KEY = 'lc-last-active'; // written by IdleGuard while the app is used
  var STORES = ['meta', 'convs', 'msgs', 'outbox'];
  var app = document.getElementById('app');
  var locked = false;

  function lastActive() {
    try { return Number(localStorage.getItem(ACTIVE_KEY)) || 0; } catch (e) { return 0; }
  }
  function touch() {
    if (locked) return;
    try { localStorage.setItem(ACTIVE_KEY, String(Date.now())); } catch (e) { /* private mode */ }
  }

  function openDb() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME); } catch (e) { return resolve(null); }
      var fresh = false;
      req.onupgradeneeded = function () { fresh = true; req.transaction.abort(); }; // no database yet: nothing saved
      req.onsuccess = function () { resolve(fresh ? null : req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }
  function read(db, store, key) {
    return new Promise(function (resolve) {
      try {
        var os = db.transaction(store, 'readonly').objectStore(store);
        var r = key === undefined ? os.getAll() : os.get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function wipe(db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORES, 'readwrite');
        STORES.forEach(function (s) { tx.objectStore(s).clear(); });
        tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clear() { while (app.firstChild) app.removeChild(app.firstChild); }
  function notice() { return el('p', 'notice', 'You are offline. Showing saved messages.'); }

  function empty(title, body) {
    clear();
    app.appendChild(el('p', 'notice', 'You are offline.'));
    var box = el('div', 'empty');
    box.appendChild(el('h2', null, title));
    box.appendChild(el('p', null, body));
    var b = el('button', null, 'Try again');
    b.addEventListener('click', function () { location.replace('/'); });
    box.appendChild(b);
    app.appendChild(box);
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function dayLabel(iso) {
    var d = new Date(iso);
    var t = new Date(), y = new Date();
    y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function preview(c) {
    if (c.lastType === 'media') return c.lastBody === 'Photo' || c.lastBody === 'Video' || c.lastBody === 'Voice message' || c.lastBody === 'Snap' ? c.lastBody : 'Photo or video';
    if (c.lastType === 'sticker') return 'Sticker';
    return c.lastBody || 'No messages yet';
  }
  function fresh(rec, user) {
    return rec && rec.userId === user && typeof rec.savedAt === 'number' && Date.now() - rec.savedAt <= MAX_AGE_MS;
  }

  function showList(convs, outboxCount) {
    clear();
    app.appendChild(notice());
    var head = el('header');
    head.appendChild(el('h1', null, 'Chats'));
    var retry = el('button', null, 'Try again');
    retry.addEventListener('click', function () { location.replace('/'); });
    head.appendChild(retry);
    app.appendChild(head);
    var main = el('main');
    if (!convs.length) {
      var e = el('div', 'empty');
      e.appendChild(el('h2', null, 'Nothing saved yet'));
      e.appendChild(el('p', null, 'Open your chats while online and they will be available here for a short time.'));
      main.appendChild(e);
    }
    convs.forEach(function (c) {
      var a = el('a', 'row');
      a.href = '/c/' + encodeURIComponent(c.id);
      a.appendChild(el('b', null, c.otherName || 'Chat'));
      a.appendChild(el('span', null, (c.lastMine ? 'You: ' : '') + preview(c)));
      main.appendChild(a);
    });
    app.appendChild(main);
    if (outboxCount) app.appendChild(el('p', 'foot', outboxCount + ' message' + (outboxCount > 1 ? 's' : '') + ' waiting to be sent. Open the app when you are online.'));
  }

  function showChat(conv, user, msgs, pending) {
    clear();
    app.appendChild(notice());
    var head = el('header');
    var back = el('a', null, 'Back');
    back.href = '/chats';
    head.appendChild(back);
    head.appendChild(el('h1', null, conv ? conv.otherName || 'Chat' : 'Chat'));
    app.appendChild(head);
    var main = el('main');
    var list = el('div', 'msgs');
    var lastDay = '';
    if (!msgs.length && !pending.length) list.appendChild(el('p', 'empty', 'No saved messages for this chat.'));
    msgs.forEach(function (m) {
      var day = new Date(m.created_at).toDateString();
      if (day !== lastDay) { lastDay = day; list.appendChild(el('div', 'day', dayLabel(m.created_at))); }
      if (m.type === 'system') { list.appendChild(el('div', 'sys', m.body)); return; }
      var mine = m.sender_id === user;
      var b = el('div', 'b' + (mine ? ' me' : ''));
      if (m.type === 'media') { b.className += ' na'; b.appendChild(document.createTextNode('Photo or video (not available offline)')); }
      else if (m.type === 'sticker') { b.className += ' na'; b.appendChild(document.createTextNode('Sticker')); }
      else b.appendChild(document.createTextNode(m.body));
      b.appendChild(el('small', null, fmtTime(m.created_at)));
      list.appendChild(b);
    });
    pending.forEach(function (p) {
      var failed = p.status === 'failed';
      var b = el('div', 'b me pend' + (failed ? ' fail' : ''));
      b.appendChild(document.createTextNode(p.body));
      b.appendChild(el('small', null, fmtTime(new Date(p.createdAt).toISOString()) + (failed ? '  Not sent' : '  Waiting to send')));
      list.appendChild(b);
    });
    main.appendChild(list);
    app.appendChild(main);
    app.appendChild(el('p', 'foot', 'Read only. Messages you write in the app are sent when you are back online.'));
    main.scrollTop = main.scrollHeight;
  }

  var current = null;
  function render() {
    if (locked) return;
    openDb().then(function (db) {
      if (!db) return empty('Nothing saved', 'Connect to the internet and sign in to see your chats.');
      read(db, 'meta', 'user').then(function (user) {
        if (!user) return empty('Nothing saved', 'Connect to the internet and sign in to see your chats.');
        return read(db, 'convs', 'all').then(function (rec) {
          var convs = fresh(rec, user) ? rec.items || [] : [];
          return read(db, 'outbox').then(function (out) {
            var mine = (out || []).filter(function (o) { return o.userId === user; });
            var m = /^\/c\/([^/]+)/.exec(location.pathname);
            if (!m) return showList(convs, mine.length);
            var id = decodeURIComponent(m[1]);
            var conv = convs.filter(function (c) { return c.id === id; })[0] || null;
            return read(db, 'msgs', id).then(function (mrec) {
              var msgs = fresh(mrec, user) ? mrec.messages || [] : [];
              var pend = mine.filter(function (o) { return o.conversationId === id; }).sort(function (a, b) { return a.createdAt - b.createdAt || a.seq - b.seq; });
              showChat(conv, user, msgs, pend);
            });
          });
        });
      });
      current = db;
    });
  }

  // Idle rule: no activity for IDLE_MS = signed out. Wipe the saved data and lock.
  function lock() {
    if (locked) return;
    locked = true;
    var done = function () { empty('Locked', 'You were inactive, so saved messages were removed from this device. Connect to the internet and sign in again.'); };
    (current ? Promise.resolve(current) : openDb()).then(function (db) { return db ? wipe(db) : null; }).then(done, done);
  }
  function check() {
    if (!locked && Date.now() - lastActive() >= IDLE_MS) lock();
  }

  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'click'].forEach(function (t) {
    window.addEventListener(t, touch, { passive: true, capture: true });
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 1000);
  window.addEventListener('online', function () { location.replace(location.pathname.indexOf('/c/') === 0 ? location.pathname : '/'); });

  // opening this page requires recent activity in the app
  if (Date.now() - lastActive() >= IDLE_MS) lock();
  else render();
})();
