'use strict';
// Sign-in session + safe Drive sync for ONE JSON document kept in the user's private app folder.
//
// Rules this module keeps (see docs/ARCHITECTURE.md):
//   1. Never save after a failed or ambiguous load (the app stays read-only until `load()` succeeded).
//   2. If Drive's copy is newer than the one we loaded, do NOT overwrite it silently: report a conflict.
//   3. Edits made offline stay marked as unsaved and are retried (backoff) and on `online`.
//   4. The local cache is keyed by the Google account, so another account never inherits this one's data.
(function () {
  var API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';
  var FILE = 'data.json';
  var APP = (document.querySelector('meta[name="app-id"]') || {}).content || 'app';

  var user = null, token = null, tokenExp = 0, fileId = null, modified = null;
  var ready = false, dirty = false, saving = false, doc = null, timer = null, retry = 0, statusCb = function () {};

  function status(state, text) { statusCb(state, text); }

  // ── session (the refresh token lives in an httpOnly cookie; the server hands out 1-hour access tokens) ──
  function session() {
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    return fetch('/auth/refresh', { method: 'POST' }).then(function (r) {
      if (r.status === 401) { token = null; return Promise.reject(Object.assign(new Error('signed out'), { auth: true })); }
      if (!r.ok) return Promise.reject(new Error('session ' + r.status));
      return r.json();
    }).then(function (b) { token = b.access_token; tokenExp = Date.now() + b.expires_in * 1000; user = b.user; return token; });
  }
  function dfetch(url, opts) {
    return session().then(function (t) {
      opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {});
      return fetch(url, opts);
    });
  }

  // ── local cache, per account ──
  function key() { return APP + ':' + ((user && (user.sub || user.email)) || ''); }
  function cacheGet() { try { return JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { return null; } }
  function cacheSet(d) { try { localStorage.setItem(key(), JSON.stringify({ doc: d, dirty: dirty })); } catch (e) { /* storage full or blocked: Drive is the source of truth */ } }

  // ── load ──
  function find() {
    var q = encodeURIComponent("name='" + FILE + "' and 'appDataFolder' in parents and trashed=false");
    return dfetch(API + '/files?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc').then(function (r) {
      if (!r.ok) throw new Error('find ' + r.status);
      return r.json();
    }).then(function (b) { return (b.files || [])[0] || null; });
  }
  function load() {
    ready = false; status('syncing', 'Loading…');
    return session().then(find).then(function (f) {
      if (!f) { fileId = null; modified = null; return null; }
      fileId = f.id; modified = f.modifiedTime;
      return dfetch(API + '/files/' + f.id + '?alt=media').then(function (r) {
        if (!r.ok) throw new Error('read ' + r.status);
        return r.json();
      });
    }).then(function (remote) {
      var c = cacheGet();
      // unsaved local edits from an earlier visit win over an older Drive copy; otherwise Drive wins
      doc = c && c.dirty && c.doc ? c.doc : remote;
      dirty = !!(c && c.dirty);
      ready = true;
      status(dirty ? 'pending' : 'synced', dirty ? 'Unsaved changes' : 'Saved to Drive');
      if (dirty) schedule();
      return doc;
    }).catch(function (e) {
      ready = false;                                   // rule 1: stay read-only, never save over an unknown state
      status(e.auth ? 'signedout' : 'error', e.auth ? 'Signed out' : 'Couldn’t load from Drive');
      throw e;
    });
  }

  // ── save ──
  function write() {
    var body = JSON.stringify(doc);
    var check = fileId ? dfetch(API + '/files/' + fileId + '?fields=modifiedTime').then(function (r) {
      if (r.status === 404) { fileId = null; return null; }
      if (!r.ok) throw new Error('check ' + r.status);
      return r.json();
    }) : Promise.resolve(null);
    return check.then(function (m) {
      if (m && modified && Date.parse(m.modifiedTime) > Date.parse(modified)) throw Object.assign(new Error('conflict'), { conflict: true });   // rule 2
      if (fileId) return dfetch(UP + '/files/' + fileId + '?uploadType=media&fields=id,modifiedTime', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body });
      var b = 'b' + Date.now();
      var multi = ['--' + b, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name: FILE, parents: ['appDataFolder'] }), '--' + b, 'Content-Type: application/json', '', body, '--' + b + '--'].join('\r\n');
      return dfetch(UP + '/files?uploadType=multipart&fields=id,modifiedTime', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multi });
    }).then(function (r) {
      if (!r.ok) throw new Error('save ' + r.status);
      return r.json();
    }).then(function (res) {
      fileId = res.id; modified = res.modifiedTime;
      if (JSON.stringify(doc) === body) dirty = false;   // edits made mid-save stay dirty
    });
  }
  function flush() {
    if (!ready || saving || !dirty) return;
    saving = true; clearTimeout(timer); timer = null; status('syncing', 'Saving…');
    write().then(function () {
      retry = 0; cacheSet(doc); status(dirty ? 'pending' : 'synced', dirty ? 'Unsaved changes' : 'Saved to Drive');
      if (dirty) schedule();
    }).catch(function (e) {
      if (e.conflict) { status('conflict', 'Changed elsewhere'); return; }                  // wait for the user's choice
      if (e.auth) { status('signedout', 'Signed out'); return; }
      retry = Math.min((retry || 2000) * 2, 60000);                                         // rule 3
      timer = setTimeout(function () { timer = null; flush(); }, retry);
      status('error', navigator.onLine ? 'Save failed — retrying…' : 'Offline — saved on this device');
    }).then(function () { saving = false; });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { timer = null; flush(); }, 800); }

  // The app calls this after every change to its document.
  function change(next) {
    doc = next; dirty = true; cacheSet(doc);
    status('pending', 'Unsaved changes');
    if (ready) schedule();
  }
  // After a conflict: keep what is on screen (overwrite Drive) or take Drive's copy.
  function resolve(keepMine) {
    if (!keepMine) { dirty = false; cacheSet(null); return load(); }
    modified = null; flush(); return Promise.resolve(doc);
  }

  window.addEventListener('online', function () { if (dirty) flush(); });

  window.Drive = {
    load: load, change: change, resolve: resolve,
    user: function () { return user; },
    session: session,
    onStatus: function (cb) { statusCb = cb; },
    signOut: function () { return fetch('/auth/logout', { method: 'POST' }).then(function () { token = null; user = null; }); }
  };
})();
