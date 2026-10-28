// 🎼 Ton Defteri (v5.12.0): gizli giriş (2 sn basılı), listeler, ekle, sözlerde rozet, senkron
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const TON = process.env.TON ? fs.readFileSync(process.env.TON) : Buffer.from('{"format":1,"items":{}}');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp'; const puts = [];
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || ''; const m = req.method();
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'tonlar.json' && m === 'GET') return acc.includes('raw') ? route.fulfill({ body: TON }) : route.fulfill({ json: { sha: 't1' } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    puts.push([path, req.postData()]); return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  // gizli giriş: 2 sn basılı tut
  const t = await page.locator('.phone-title').boundingBox();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
  await page.waitForTimeout(300);
  console.log('açıldı', await page.locator('.ton-modal').count(), 'satır', await page.locator('.ton-row').count());
  await page.screenshot({ path: O + '/ton1.png' });
  await page.click('.ton-add'); await page.waitForTimeout(200);
  await page.fill('.modal-card input.field >> nth=0', 'Sevmenin Zamanı Yok'); await page.waitForTimeout(150);
  await page.locator('.ton-notes button', { hasText: 'Fa' }).click(); await page.locator('.ton-chips button', { hasText: '♯' }).click();
  await page.locator('.ton-chips button', { hasText: 'Slow' }).first().click();
  await page.screenshot({ path: O + '/ton2.png' });
  await page.click('.mh-save'); await page.waitForTimeout(300);
  console.log('eklendi', await page.evaluate(() => Object.values(window.__md.tonBook.items).filter(x => x.title === 'Sevmenin Zamanı Yok').map(x => x.ton + ' ' + x.tarz + ' ' + (x.p || '-'))));
  // söz var olan satıra dokun → şarkı açılır, rozet
  await page.locator('.ton-row', { hasText: 'Kızılcıklar' }).first().click(); await page.waitForTimeout(900);
  console.log('açık şarkı', await page.evaluate(() => window.__md.current), 'rozet', await page.$$eval('.ton-badge', e => e.map(x => x.textContent)));
  await page.screenshot({ path: O + '/ton3.png' });
  await page.click('#btnSync'); await page.waitForTimeout(2500);
  const tp = puts.find(p => p[0] === 'tonlar.json'); console.log('tonlar.json PUT', !!tp, tp ? Object.keys(JSON.parse(Buffer.from(JSON.parse(tp[1]).content, 'base64').toString()).items).length : 0);
  console.log('ERR', errors); await b.close();
})();
