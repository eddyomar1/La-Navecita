const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
function serviceWorker() {
  const handlers = {};
  const context = vm.createContext({ URL, Request, Response, Headers, Set,
    self: { registration: { scope: 'https://example.com/La-Navecita/' }, addEventListener: (name, fn) => handlers[name] = fn },
    caches: {}, fetch() { throw Error('Unexpected network'); } });
  vm.runInContext(`${worker}\nglobalThis.assets = ASSETS; globalThis.rangeResponse = rangeResponse;`, context);
  return { context, handlers };
}

test('manifest resolves within the GitHub Pages project and supplies install icons', () => {
  for (const field of ['id', 'scope', 'start_url']) assert.equal(new URL(manifest[field], 'https://example.com/La-Navecita/manifest.webmanifest').pathname, '/La-Navecita/');
  assert.equal(manifest.display, 'standalone');
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const png = fs.readFileSync(path.join(root, icon.src));
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16), w); assert.equal(png.readUInt32BE(20), h);
  }
});

test('all precached assets exist and include game, music, boss, beam and local fonts', () => {
  const { context } = serviceWorker();
  const files = Array.from(context.assets, url => new URL(url).pathname.replace('/La-Navecita/', '') || 'index.html');
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const file of ['pwa.js', 'magia.js', 'playsong.ogg', 'marcianito-real-no-fake.gif', 'rayo.png', 'fonts/dm-sans-latin.woff2']) assert.ok(files.includes(file));
  assert.ok(!fs.readFileSync(path.join(root, 'styles.css'), 'utf8').includes('https://fonts.googleapis.com'));
});

test('offline audio supports byte ranges, suffixes and invalid requests', async () => {
  const { context } = serviceWorker();
  const sample = () => new Response('0123456789', { headers: { 'Content-Type': 'audio/ogg' } });
  const partial = await context.rangeResponse(sample(), 'bytes=2-5');
  assert.equal(partial.status, 206); assert.equal(await partial.text(), '2345');
  assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await (await context.rangeResponse(sample(), 'bytes=-3')).text(), '789');
  assert.equal(await (await context.rangeResponse(sample(), 'bytes=8-')).text(), '89');
  for (const range of ['bytes=10-20', 'bytes=4-2', 'bytes=-', 'bytes=0-1,3-4', 'bytes=-0']) assert.equal((await context.rangeResponse(sample(), range)).status, 416);
});

test('service worker ignores other projects, remote URLs, unknown routes and POST', () => {
  const { handlers } = serviceWorker();
  for (const [url, method] of [['https://example.com/other/index.html', 'GET'], ['https://remote.test/La-Navecita/', 'GET'], ['https://example.com/La-Navecita/missing', 'GET'], ['https://example.com/La-Navecita/', 'POST']]) {
    handlers.fetch({ request: new Request(url, { method }), respondWith() { assert.fail('Must not intercept this request'); } });
  }
});

function installUI({ dismissed = false, standalone = false, fullscreen = false } = {}) {
  const elements = new Map(), observers = new Map(), windowEvents = {};
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set(), listeners = {};
      elements.set(id, { open: false, hidden: false, parentElement: null,
        classList: { contains: name => classes.has(name) }, classes, listeners,
        addEventListener: (name, fn) => listeners[name] = fn,
        appendChild(child) { child.parentElement = this; },
        showModal() { this.open = true; }, close() { this.open = false; listeners.close?.(); } });
    }
    return elements.get(id);
  };
  const home = element('body'); element('install-dialog').parentElement = home;
  const reg = { waiting: null, addEventListener() {} };
  const context = vm.createContext({ Event, Date, navigator: { userAgent: '', platform: '', maxTouchPoints: 0,
    serviceWorker: { register: () => Promise.resolve(reg), ready: Promise.resolve(reg), addEventListener() {} } },
    window: { isSecureContext: true, addEventListener: (name, fn) => windowEvents[name] = fn },
    document: { getElementById: element, hidden: false, fullscreenElement: fullscreen ? element('game-panel') : null, addEventListener() {}, dispatchEvent() {} },
    matchMedia: () => ({ matches: standalone, addEventListener() {} }),
    localStorage: { getItem: () => dismissed ? String(Date.now() + 86400000) : null, setItem() {} },
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(target) { observers.set(target, this.fn); } },
    setTimeout() { assert.fail('Installation must not be scheduled by an elapsed-time timer'); } });
  vm.runInContext(fs.readFileSync(path.join(root, 'pwa.js'), 'utf8'), context);
  return { element, emit: (name, event = {}) => windowEvents[name]?.(event), state(name) { const arena = element('arena'); arena.classes.clear(); arena.classes.add(name); observers.get(arena)(); } };
}

test('installation is suggested after the first finished game, never at launch or pause', async () => {
  const ui = installUI(), dialog = ui.element('install-dialog');
  await new Promise(setImmediate); // Offline readiness must not trigger a suggestion.
  assert.equal(dialog.open, false);
  ui.state('playing'); assert.equal(dialog.open, false);
  ui.state('paused'); assert.equal(dialog.open, false);
  ui.state('playing'); ui.state('ended'); assert.equal(dialog.open, true);
  dialog.close();
  ui.state('playing'); ui.state('ended'); assert.equal(dialog.open, false);
});

test('first-game suggestion respects dismissal and installed app state', async () => {
  for (const options of [{ dismissed: true }, { standalone: true }]) {
    const ui = installUI(options);
    await new Promise(setImmediate);
    ui.state('playing'); ui.state('ended');
    assert.equal(ui.element('install-dialog').open, false);
  }
});

test('first-game popup is visible inside fullscreen and manual installation stays available', async () => {
  const ui = installUI({ fullscreen: true });
  await new Promise(setImmediate);
  ui.state('playing'); ui.state('ended');
  assert.equal(ui.element('install-dialog').open, true);
  assert.equal(ui.element('install-dialog').parentElement, ui.element('game-panel'));
  const manual = installUI({ dismissed: true });
  manual.element('install-open').listeners.click();
  assert.equal(manual.element('install-dialog').open, true);
});


test('accepting the suggestion opens the native prompt once and waits for appinstalled', async () => {
  const ui = installUI(); let calls = 0, resolveChoice;
  ui.emit('beforeinstallprompt', { preventDefault() {}, prompt() { calls++; return Promise.resolve(); }, userChoice: new Promise(resolve => resolveChoice = resolve) });
  ui.state('ended');
  const button = ui.element('install-confirm'), dialog = ui.element('install-dialog');
  const pending = button.listeners.click();
  assert.equal(calls, 1); // Must occur in the click handler, not after an await.
  await button.listeners.click(); assert.equal(calls, 1);
  resolveChoice({ outcome: 'accepted' }); await pending;
  assert.equal(dialog.open, true);
  assert.equal(button.textContent, 'Instalación solicitada…');
  assert.equal(ui.element('install-open').hidden, false);
  ui.emit('appinstalled');
  assert.equal(dialog.open, false);
  assert.equal(ui.element('install-open').hidden, true);
});

test('without native install support, accepting shows instructions instead of closing', async () => {
  const ui = installUI(); ui.state('ended');
  await ui.element('install-confirm').listeners.click();
  assert.equal(ui.element('install-dialog').open, true);
  assert.equal(ui.element('install-instructions').hidden, false);
  assert.equal(ui.element('install-open').hidden, false);
});

test('native dismissal and errors leave installation available and explain next steps', async () => {
  for (const failure of [false, true]) {
    const ui = installUI();
    ui.emit('beforeinstallprompt', { preventDefault() {}, prompt: () => failure ? Promise.reject(Error('Unavailable')) : Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    ui.state('ended'); await ui.element('install-confirm').listeners.click();
    assert.equal(ui.element('install-dialog').open, true);
    assert.equal(ui.element('install-confirm').disabled, false);
    assert.equal(ui.element('install-instructions').hidden, false);
    assert.equal(ui.element('install-open').hidden, false);
  }
});
