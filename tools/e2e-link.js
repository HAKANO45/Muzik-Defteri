// 🔗 Ortak Sahne (v5.5.0): iki cihaz (iPhone + iPad), ntfy.sh taklit edilir
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp';
const posts = [];           // ntfy'ye giden mesajlar
const pending = { a: [], b: [] };
async function mk(b, name, dev) {
  const ctx = await b.newContext(dev); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || ''; const m = req.method();
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'sahne.json' && m === 'GET') return acc.includes('raw') ? route.fulfill({ body: JSON.stringify({ oda: 'TESTODA12345' }) }) : route.fulfill({ json: { sha: 's1' } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.route('https://ntfy.sh/**', async route => {
    const req = route.request();
    if (req.method() === 'POST') { posts.push({ from: name, url: req.url(), body: req.postData() }); for (const k of Object.keys(pending)) if (k !== name) pending[k].push(req.postData()); return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: {} }); }
    // SSE: bekleyen mesajları bir kere ver, sonra kapat (EventSource yeniden bağlanır)
    const msgs = pending[name].splice(0);
    const body = msgs.map(m => 'event: message\ndata: ' + JSON.stringify({ event: 'message', message: m }) + '\n\n').join('') || ': ping\n\n';
    return route.fulfill({ headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: 'retry: 300\n\n' + body });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  return { page, errors };
}
(async () => {
  const b = await chromium.launch();
  const A = await mk(b, 'a', { ...devices['iPhone 13'] });
  const B = await mk(b, 'b', { ...devices['iPad Pro 11 landscape'] });
  // A: Ortak Sahne aç
  await A.page.click('#btnLink'); await A.page.waitForTimeout(500);
  await A.page.fill('.modal-card input.field >> nth=0', 'Eylem');
  await A.page.screenshot({ path: O + '/l1.png' });
  await A.page.click('.link-big'); await A.page.waitForTimeout(800);
  await B.page.click('#btnLink'); await B.page.waitForTimeout(500);
  await B.page.fill('.modal-card input.field >> nth=0', 'Hakan');
  await B.page.click('.link-big'); await B.page.waitForTimeout(800);
  // A şarkı açar → B'de açılmalı
  await A.page.locator('.item', { hasText: 'KINA' }).first().click(); await A.page.waitForTimeout(500);
  await A.page.locator('#list .item[data-p]').first().click(); await A.page.waitForTimeout(1500);
  const a1 = await A.page.evaluate(() => window.__md.current);
  await B.page.waitForTimeout(1500);
  const b1 = await B.page.evaluate(() => window.__md.current);
  console.log('A açtı', a1, '→ B', b1, b1 === a1 ? 'OK' : 'HATA');
  await A.page.screenshot({ path: O + '/l2.png' }); await B.page.screenshot({ path: O + '/l3.png' });
  // B ileri → A
  await B.page.locator('.item', { hasText: 'KINA' }).first().click(); await B.page.waitForTimeout(500);
  await B.page.locator('#list .item[data-p]').nth(1).click(); await B.page.waitForTimeout(1500);
  const b2 = await B.page.evaluate(() => window.__md.current); await A.page.waitForTimeout(1500);
  const a2 = await A.page.evaluate(() => window.__md.current);
  console.log('B açtı', b2, '→ A', a2, a2 === b2 ? 'OK' : 'HATA');
  await A.page.screenshot({ path: O + '/l4.png' });
  console.log('POST sayısı', posts.length, posts.map(p => p.from + ':' + p.url.split('/').pop()));
  console.log('ERR', A.errors, B.errors); await b.close();
})();
