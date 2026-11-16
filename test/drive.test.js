// public/js/drive.js runs in a vm against a fake Drive + fake /auth/refresh: the sync safety rules, without Google.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = fs.readFileSync(path.join(__dirname, '..', 'drive.js'), 'utf8');
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

function setup({ user = { sub: 'u1', email: 'a@b.c' }, files = [], storage = {} } = {}) {
  const st = { files: files.map(f => ({ ...f })), log: [], fail: null, clock: 1000, refreshStatus: 200, listeners: {}, statuses: [] };
  const drive = {
    list: () => st.files.filter(f => f.trashed !== true),
    handle(method, url, opts) {
      const u = new URL(url, 'http://app.test');
      if (u.pathname === '/auth/refresh') return st.refreshStatus === 200 ? { status: 200, body: { access_token: 'AT', expires_in: 3600, user } } : { status: st.refreshStatus, body: {} };
      if (st.fail) { const f = st.fail; return typeof f === 'function' ? f(method, url) : { status: f, body: {} }; }
      const m = u.pathname.match(/\/files\/([^/]+)$/);
      if (u.pathname.endsWith('/files') && method === 'GET') return { status: 200, body: { files: drive.list().map(f => ({ id: f.id, modifiedTime: new Date(f.t).toISOString() })) } };
      if (m && method === 'GET' && u.searchParams.get('alt') === 'media') { const f = st.files.find(x => x.id === m[1]); return f ? { status: 200, body: f.doc } : { status: 404, body: {} }; }
      if (m && method === 'GET') { const f = st.files.find(x => x.id === m[1]); return f ? { status: 200, body: { modifiedTime: new Date(f.t).toISOString() } } : { status: 404, body: {} }; }
      if (m && method === 'PATCH') { const f = st.files.find(x => x.id === m[1]); st.log.push('PATCH'); f.doc = JSON.parse(opts.body); f.t = ++st.clock; return { status: 200, body: { id: f.id, modifiedTime: new Date(f.t).toISOString() } }; }
      if (u.pathname.endsWith('/files') && method === 'POST') { st.log.push('POST'); const doc = JSON.parse(opts.body.split('\r\n').slice(-2)[0]); const f = { id: 'F' + (st.files.length + 1), doc, t: ++st.clock }; st.files.push(f); return { status: 200, body: { id: f.id, modifiedTime: new Date(f.t).toISOString() } }; }
      return { status: 404, body: {} };
    }
  };
  const ctx = {
    console, setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; },   // retries must not keep the test process alive
    clearTimeout, Date, JSON, Promise, Object, Array, Error, encodeURIComponent, URL, URLSearchParams,
    navigator: { onLine: true },
    document: { querySelector: () => ({ content: 'testapp' }) },
    localStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
    addEventListener: (ev, fn) => { (st.listeners[ev] = st.listeners[ev] || []).push(fn); },
    fetch: async (url, opts = {}) => { const r = drive.handle(opts.method || 'GET', url, opts); return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body }; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  ctx.Drive.onStatus((s, t) => st.statuses.push(s));
  return { Drive: ctx.Drive, st, storage, ctx };
}

test('first run: no file yet, the first edit creates it in the app folder', async () => {
  const { Drive, st } = setup();
  assert.equal(await Drive.load(), null);
  Drive.change({ notes: [{ id: 1, text: 'a' }] });
  await tick(1000);
  assert.deepEqual(st.log, ['POST']);
  assert.deepEqual(st.files[0].doc, { notes: [{ id: 1, text: 'a' }] });
  assert.equal(st.statuses.at(-1), 'synced');
});

test('rule 1: after a failed load nothing is ever saved over Drive', async () => {
  const { Drive, st } = setup({ files: [{ id: 'F1', doc: { notes: ['keep'] }, t: 1 }] });
  st.fail = 500;
  await assert.rejects(Drive.load());
  st.fail = null;
  Drive.change({ notes: [] });
  await tick(1000);
  assert.deepEqual(st.log, [], 'no write after a failed load');
  assert.deepEqual(st.files[0].doc, { notes: ['keep'] });
  assert.equal(st.statuses.includes('error'), true);
});

test('rule 2: a newer copy on Drive is a conflict, not silently overwritten; "keep mine" then overwrites', async () => {
  const { Drive, st } = setup({ files: [{ id: 'F1', doc: { notes: ['v1'] }, t: 1 }] });
  await Drive.load();
  st.files[0].doc = { notes: ['from another device'] }; st.files[0].t = 99;   // changed elsewhere
  Drive.change({ notes: ['mine'] });
  await tick(1000);
  assert.deepEqual(st.log, [], 'no write while in conflict');
  assert.equal(st.statuses.at(-1), 'conflict');
  await Drive.resolve(true);
  await tick(50);
  assert.deepEqual(st.log, ['PATCH']);
  assert.deepEqual(st.files[0].doc, { notes: ['mine'] });
});

test('rule 2b: "load the newer copy" drops local edits and takes Drive\'s', async () => {
  const { Drive, st } = setup({ files: [{ id: 'F1', doc: { notes: ['v1'] }, t: 1 }] });
  await Drive.load();
  st.files[0].doc = { notes: ['theirs'] }; st.files[0].t = 99;
  Drive.change({ notes: ['mine'] });
  await tick(1000);
  const d = await Drive.resolve(false);
  assert.deepEqual(d, { notes: ['theirs'] });
  assert.deepEqual(st.log, []);
});

test('rule 3: a failed save keeps the edit, retries, and eventually saves', async () => {
  const { Drive, st } = setup({ files: [{ id: 'F1', doc: { notes: [] }, t: 1 }] });
  await Drive.load();
  st.fail = 503;
  Drive.change({ notes: ['x'] });
  await tick(1000);
  assert.equal(st.statuses.at(-1), 'error');
  assert.deepEqual(st.log, []);
  st.fail = null;
  st.listeners.online.forEach(fn => fn());      // back online: flush at once
  await tick(100);
  assert.deepEqual(st.log, ['PATCH']);
  assert.deepEqual(st.files[0].doc, { notes: ['x'] });
});

test('rule 4: the local cache is per account: another account never inherits unsaved data', async () => {
  const storage = {};
  const a = setup({ user: { sub: 'A', email: 'a@x' }, files: [{ id: 'F1', doc: { notes: ['a-drive'] }, t: 1 }], storage });
  await a.Drive.load();
  a.st.fail = 503;
  a.Drive.change({ notes: ['a-unsaved'] });                 // offline edit, stays in A's cache
  await tick(900);
  const b = setup({ user: { sub: 'B', email: 'b@x' }, files: [{ id: 'F9', doc: { notes: ['b-drive'] }, t: 1 }], storage });
  assert.deepEqual(await b.Drive.load(), { notes: ['b-drive'] }, 'B sees only B\'s Drive data');
  const a2 = setup({ user: { sub: 'A', email: 'a@x' }, files: [{ id: 'F1', doc: { notes: ['a-drive'] }, t: 1 }], storage });
  assert.deepEqual(await a2.Drive.load(), { notes: ['a-unsaved'] }, 'A gets their unsaved edit back');
});

test('signed out: a 401 from the session endpoint is reported, nothing is saved', async () => {
  const { Drive, st } = setup();
  st.refreshStatus = 401;
  await assert.rejects(Drive.load());
  assert.equal(st.statuses.at(-1), 'signedout');
});
