'use strict';
// Google Drive sync for Kanbi Cards, as a thin layer over drive.js (same method as the other nimble apps).
// The app keeps its boards in localStorage keys that start with "kanbi_" (except the theme and the sign-in profile).
// That whole set is the synced document: {v:1, ls:{key: value}}. This file never touches the app's own code:
//   - writes to those keys (through localStorage.setItem/removeItem) mark the document as changed → Drive.change()
//   - on sign-in, Drive's copy is written back into localStorage and the page reloads once so the app re-reads it
(function () {
  var SKIP = { kanbi_theme: 1, kanbi_user: 1 };
  var LINK = 'kanbi-linked';                       // which Google account this device's boards are linked to
  var RELOAD = 'kanbi-sync-reloaded';
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  var live = false;                                // true once Drive.load() succeeded and the document is being synced
  var state = 'local';                             // local | syncing | synced | pending | offline | conflict | signedout

  function isData(k) { return typeof k === 'string' && k.indexOf('kanbi_') === 0 && !SKIP[k]; }
  function dataKeys() { var o = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (isData(k)) o.push(k); } return o; }
  function read() {
    var ls = {};
    dataKeys().forEach(function (k) { try { ls[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { ls[k] = localStorage.getItem(k); } });
    return { v: 1, ls: ls };
  }
  function same(a, b) { return JSON.stringify(a.ls) === JSON.stringify(b.ls); }
  function isEmptyVal(v) {
    if (v == null || v === '') return true;
    if (Array.isArray(v)) return v.every(isEmptyVal);
    if (typeof v === 'object') return Object.keys(v).every(function (k) { return isEmptyVal(v[k]); });
    return false;
  }
  function hasBoards(doc) { return Object.keys(doc.ls).some(function (k) { return k !== 'kanbi_resets' && !isEmptyVal(doc.ls[k]); }); }

  function write(doc) {                            // Drive's copy becomes this device's copy
    dataKeys().forEach(function (k) { if (!(k in doc.ls)) rawRemove.call(localStorage, k); });
    Object.keys(doc.ls).forEach(function (k) { if (isData(k)) rawSet.call(localStorage, k, JSON.stringify(doc.ls[k])); });
  }

  // changes made by the app: Drive.change after a short pause
  var t = null;
  function changed() { if (!live) return; clearTimeout(t); t = setTimeout(function () { window.Drive.change(read()); }, 200); }
  Storage.prototype.setItem = function (k, v) { rawSet.apply(this, arguments); if (this === localStorage && isData(k)) changed(); };
  Storage.prototype.removeItem = function (k) { rawRemove.apply(this, arguments); if (this === localStorage && isData(k)) changed(); };

  // what the header shows
  var LABEL = { local: 'saved on this device', signedout: 'saved on this device', syncing: 'syncing…', synced: 'saved to Drive', pending: 'saving…', offline: 'saved on this device', conflict: 'changed elsewhere' };
  var TITLE = {
    local: 'Your boards are saved in this browser. Sign in with Google to keep them in your own Google Drive.',
    synced: 'Your boards are saved in your own Google Drive and on this device.',
    pending: 'Saving to your Google Drive…', syncing: 'Talking to your Google Drive…',
    offline: 'Could not reach Google Drive. Your boards are safe on this device and will sync when it is back.',
    conflict: 'The boards changed on another device.'
  };
  window.kanbiSync = {
    state: function () { return state; },
    label: function () { return LABEL[state] || LABEL.local; },
    title: function () { return TITLE[state] || TITLE.local; },
    enabled: false
  };
  function paint() {
    var chip = document.getElementById('sync-chip');
    if (chip) {
      chip.textContent = LABEL[state] || LABEL.local; chip.title = TITLE[state] || TITLE.local;
      chip.classList.remove('chip--ok', 'chip--info');
      if (state === 'synced' || state === 'local' || state === 'signedout') chip.classList.add('chip--ok'); else if (state === 'syncing' || state === 'pending') chip.classList.add('chip--info');   // offline / conflict keep the default (warn) tone
    }
    var line = document.getElementById('user-sync-line');
    if (line) line.textContent = LABEL[state] || LABEL.local;
  }
  window.kanbiSync.paint = paint;

  function ask(message, yes, no) {
    var ui = window.NimbleUI;
    if (ui && ui.confirm) return ui.confirm({ title: message.title, message: message.text, confirmLabel: yes, cancelLabel: no });
    return Promise.resolve(window.confirm(message.title + '\n\n' + message.text));
  }
  function reloadOnce() { try { if (sessionStorage.getItem(RELOAD)) return; sessionStorage.setItem(RELOAD, '1'); } catch (e) {} location.reload(); }

  function onStatus(s, text) {
    if (s === 'synced') state = 'synced';
    else if (s === 'syncing') state = 'syncing';
    else if (s === 'pending') state = 'pending';
    else if (s === 'conflict') state = 'conflict';
    else if (s === 'signedout') state = 'signedout';
    else state = 'offline';
    paint();
    if (s === 'conflict') {
      ask({ title: 'Your boards changed on another device', text: 'Keep what is on this device, or load the copy from your Google Drive?' }, 'Keep this device', 'Load Drive copy').then(function (keep) {
        if (keep) return window.Drive.resolve(true);
        return window.Drive.resolve(false).then(function (d) { if (d && d.ls) { write(d); reloadOnce(); } });
      });
    }
  }

  function boot() {
    var D = window.Drive; if (!D) return;
    D.onStatus(onStatus);
    fetch('/api/config').then(function (r) { return r.ok ? r.json() : { signIn: false }; }).catch(function () { return { signIn: false }; }).then(function (cfg) {
      window.kanbiSync.enabled = !!cfg.signIn;
      if (!cfg.signIn) return;
      D.load().then(function (remote) {
        var u = D.user(), sub = u && (u.sub || u.email), local = read();
        // the app's own sign-in profile follows the Google account
        try { rawSet.call(localStorage, 'kanbi_user', JSON.stringify({ email: u.email, name: u.name || u.email.split('@')[0], picture: u.picture || null, provider: 'google' })); } catch (e) {}
        var linked = localStorage.getItem(LINK) === sub;
        var go = Promise.resolve();
        if (!remote || !remote.ls) {
          live = true; if (hasBoards(local)) D.change(local);   // first time: this device's boards become the Drive copy
        } else if (linked || !hasBoards(local) || same(local, remote)) {
          live = true; if (!same(local, remote)) { write(remote); rawSet.call(localStorage, LINK, sub); reloadOnce(); return; }
        } else {
          go = ask({ title: 'Use the boards from your Google Drive?', text: 'Your Drive already has Kanbi boards and this device has different ones. Loading Drive\'s replaces what is on this device; keeping this device\'s replaces what is in Drive.' }, 'Load Drive boards', 'Keep this device').then(function (useDrive) {
            live = true;
            if (useDrive) { write(remote); rawSet.call(localStorage, LINK, sub); reloadOnce(); } else { D.change(local); }
          });
        }
        rawSet.call(localStorage, LINK, sub);
        try { sessionStorage.removeItem(RELOAD); } catch (e) {}
        return go.then(paintAuth);
      }).catch(function (e) { state = e && e.auth ? 'signedout' : 'offline'; paint(); });
    });
  }
  function paintAuth() { try { if (typeof user !== 'undefined') { var raw = localStorage.getItem('kanbi_user'); if (raw) user = JSON.parse(raw); } if (typeof renderAuth === 'function') renderAuth(); } catch (e) {} paint(); }

  // sign-in goes through Google's authorization-code flow on this site (a refresh token in an httpOnly cookie)
  window.kanbiSignIn = function () { location.href = '/auth/login'; };
  window.kanbiSignOut = function () {
    return (window.Drive ? window.Drive.signOut() : Promise.resolve()).catch(function () {}).then(function () { live = false; rawRemove.call(localStorage, LINK); state = 'local'; paint(); });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
