// Yeni şarkı akışı testi (v4.2): Sanatçı/Şarkı adı, İnternette ara, Panodan yapıştır, taslak geri yükleme, GitHub'a gönderim.
// Kullanım: python3 -m http.server 8765 &  ->  node tools/e2e-newsong.js ipad|desk   (sözler uydurma metindir)
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const dev = process.argv[2] || 'ipad';  // iPhone sadece görüntüleme — yeni şarkı iPad/Windows/Mac'te
const puts = [];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...(dev === 'ipad' ? devices['iPad (gen 7)'] : { viewport: { width: 1366, height: 860 } }), permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const acc = req.headers()['accept'] || '';
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'programlar.json' && req.method() === 'GET') return route.fulfill({ status: 404, json: {} });
    if (req.method() === 'PUT') puts.push({ path, text: Buffer.from(JSON.parse(req.postData()).content, 'base64').toString('utf8') });
    return route.fulfill({ json: { content: { sha: 'x' + puts.length } } });
  });
  await ctx.route('https://www.google.com/**', r => r.fulfill({ body: 'google' }));
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'HAKANO45', repo: '-Muzik-Defteri-Repertuar', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 });
  await page.waitForTimeout(2800);
  console.log('head:', await page.locator('#sideHead').innerText(), 'items:', await page.locator('#list .item').count(), 'editor:', await page.isVisible('#editor'), 'layout:', await page.getAttribute('#layout','class'));
    await page.locator('.item', { hasText: 'Pop' }).first().click();
  await page.click('button[title="Yeni şarkı"]');
  await page.fill('#editor input[placeholder="Sanatçı"]', 'Deneme Sanatçı');
  await page.fill('#editor input[placeholder="Şarkı adı"]', 'Deneme Şarkı');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('text=İnternette ara')]);
  console.log('popup url:', decodeURIComponent(popup.url())); await popup.close();
  // taslak: uygulama kapanıp açılırsa
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  console.log('draft restored:', await page.isVisible('#editor'), await page.inputValue('#editor input[placeholder="Şarkı adı"]'));
  await page.evaluate(() => navigator.clipboard.writeText('Birinci satır uydurma   \r\n \r\n\r\n\r\nİkinci satır uydurma​\r\nÜçüncü satır'));
  await page.click('text=Panodan yapıştır'); await page.waitForTimeout(200);
  console.log('textarea:', JSON.stringify(await page.inputValue('#editor textarea')));
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + dev + '-newsong.png' });
  await page.click('#editor >> text=Kaydet');
  await page.waitForTimeout(3500);
  console.log('PUTs:', puts.map(p => p.path));
  console.log('current:', await page.evaluate(() => window.__md.current), 'draft left:', await page.evaluate(() => localStorage.getItem('md.draft')));
  console.log('ERR', errors); await browser.close();
})();
