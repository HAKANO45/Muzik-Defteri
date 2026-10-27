// Uçtan uca test: GitHub API taklit edilir, gerçek paket kullanılır.
// Kullanım: python3 -m http.server 8765 &  ->  node tools/e2e-test.js desk|phone
// Ortam: BUNDLE=<repertuar.json.gz yolu>  OUT=<ekran görüntüsü klasörü>
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const puts = []; let programs = null;
// iPhone dikeyde (≤600px) düğmeler ⋯ alt sayfasında, diğer ekranlarda üst araç çubuğunda
async function songAction(page, label) {
  if (await page.isVisible('#phoneBar')) { await page.click('#phoneBar .pb-btn[title="Diğer"]'); await page.click(`.sheet-act:has-text("${label}")`); }
  else await page.click(`#songToolbar button[title="${label}"]`);
}
async function back(page){ if (await page.isVisible('#btnBack')) await page.click('#btnBack'); }
const shot = process.argv[2] || 'desk';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(shot === 'phone' ? { ...devices['iPhone 13'] } : { viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const accept = req.headers()['accept'] || '';
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (url.pathname === '/repos/HAKANO45/-Muzik-Defteri-Repertuar') return route.fulfill({ json: { private: true, permissions: { push: true }, default_branch: 'main' } });
    if (req.method() === 'GET' && path === 'bundle/repertuar.json.gz') {
      if (accept.includes('raw')) return route.fulfill({ body: BUNDLE, contentType: 'application/octet-stream' });
      return route.fulfill({ json: { sha: bsha } });
    }
    if (req.method() === 'GET' && path === 'programlar.json') {
      if (!programs) return route.fulfill({ status: 404, json: { message: 'Not Found' } });
      if (accept.includes('raw')) return route.fulfill({ body: programs });
      return route.fulfill({ json: { sha: 'p1' } });
    }
    if (req.method() === 'PUT') { const b = JSON.parse(req.postData()); puts.push({ path, sha: b.sha, len: Buffer.from(b.content, 'base64').length, content: Buffer.from(b.content, 'base64') }); if (path === 'programlar.json') programs = Buffer.from(b.content, 'base64'); return route.fulfill({ json: { content: { sha: 'new' + puts.length } } }); }
    if (req.method() === 'DELETE') { puts.push({ path, del: true }); return route.fulfill({ json: {} }); }
    route.fulfill({ status: 404, json: { message: 'nope ' + path } });
  });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.setItem('md.lang','tr')); await page.reload();
  await page.waitForTimeout(800);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-0-welcome.png' });
  // iPhone: token ayarlardan kaydedilince kapat/aç sonrası korunmalı.
  // Test sırasında gerçek API çağrısını önlemek için owner boş bırakılır.
  await page.click('#btnSettings');
  await page.locator('.modal-card input[placeholder="HAKANO45"]').fill('');
  await page.locator('.modal-card input[type="password"]').fill('test-persistent-token');
  await page.locator('.modal-card button').filter({ hasText: /Kapat|Close/ }).click();
  await page.waitForFunction(() => document.getElementById('modal').hidden);
  await page.reload();
  await page.waitForFunction(() => window.__md && window.__md.settings.gh.token === 'test-persistent-token');
  const settingsSaved = await page.evaluate(async () => {
    const { db } = await import('./js/db.js');
    const primary = await db.get('settings');
    const backup = JSON.parse(localStorage.getItem('md.settings.backup.v1') || 'null');
    return primary?.gh?.token === 'test-persistent-token' && backup?.gh?.token === 'test-persistent-token';
  });
  if (!settingsSaved) throw new Error('GitHub access token not persisted across reload');
  // Mevcut büyük repertuvar entegrasyon testinden önce test yedeğini kaldır.
  await page.evaluate(() => localStorage.removeItem('md.settings.backup.v1'));

  // GitHub ayarla
  await page.evaluate(async () => {
    const { db } = await import('./js/db.js');
    await db.set('settings', { gh: { owner: 'HAKANO45', repo: 'Muzik-Defteri-Repertuar', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, searchText: true });
  });
  await page.reload();
  const t0 = Date.now();
  await page.waitForFunction(() => window.__md && window.__md.songs.size > 5000, null, { timeout: 60000 });
  await page.waitForFunction(() => !window.__md.sync.busy, null, { timeout: 60000 });
  console.log('loaded songs in', Date.now() - t0, 'ms');
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-1-library.png' });
  // Klasöre gir
  await page.locator('.item', { hasText: 'Türküler' }).first().click();
  await page.locator('.item', { hasText: '01.Ussak' }).first().click();
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-2-folder.png' });
  await page.locator('.item', { hasText: 'Haydar Haydar' }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-3-song.png' });
  // CP857 dosyası doğru mu?
  const cp = await page.evaluate(() => { const r = [...window.__md.songs.values()].find(s => s.e === 'cp857' && /[şğıüöç]/.test(s.t)); return r ? r.p + ' :: ' + r.t.slice(0, 80) : 'none'; });
  console.log('cp857 sample:', cp.slice(0, 40));
  // Arama
  const s0 = Date.now();
  await back(page); await page.fill('#q', 'sari gelin');
  await page.waitForTimeout(600);
  console.log('search results:', await page.locator('#sideHead').innerText(), 'ms', Date.now() - s0);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-4-search.png' });
  await back(page); await page.fill('#q', 'kime ne');
  await page.waitForTimeout(800);
  console.log('lyrics search:', await page.locator('#sideHead').innerText());
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-5-search-lyrics.png' });
  // aç, favori, programa ekle
  await page.locator('#list .item').first().click();
  await songAction(page, 'Favori');
  await songAction(page, 'Programa ekle');
  await page.click('text=＋ Yeni program');
  await page.fill('.modal-card input', 'Cumartesi Düğün');
  await page.click('.modal-card >> text=OK');
  await page.waitForTimeout(300);
  // düzenle ve kaydet (iPhone = sadece görüntüleme: Düzenle/Sil/＋♪ olmamalı)
  if (shot === 'phone') {
    await page.click('#phoneBar .pb-btn[title="Diğer"]');
    const acts = await page.locator('.sheet-act').allInnerTexts();
    console.log('iPhone sheet actions:', acts.map(x => x.replace(/\s+/g, ' ')));
    if (acts.some(x => /Düzenle|Sil/.test(x))) throw new Error('iPhone view-only ihlali');
    await page.click('.sheet-close');
    await page.waitForTimeout(5500);
  } else {
  await songAction(page, 'Düzenle');
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-6-editor.png' });
  await page.locator('#editor textarea').press('End');
  await page.locator('#editor textarea').type('\nYENİ SATIR şğıİüöç');
  await page.click('#editor >> text=Kaydet');
  await page.waitForTimeout(5500);
  }
  console.log('PUTs:', puts.map(p => p.path + ' sha=' + p.sha + ' len=' + p.len));
  const songPut = puts.find(p => p.path.startsWith('repertuar/'));
  if (songPut) console.log('encoded tail bytes:', songPut.content.slice(-24).toString('hex'), '(cp1254 ş=fe ğ=f0 ı=fd İ=dd)');
  // programlar sekmesi
  await back(page); await page.fill('#q', '');
  await back(page); await page.click('#tabs button[data-tab=programs]');
  if (await page.locator('.item', { hasText: 'Cumartesi' }).count()) await page.locator('.item', { hasText: 'Cumartesi' }).click();
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-7-program.png' });
  await page.locator('text=Sahneye başla').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-8-stage.png' });
  await page.keyboard.press('Escape');
  // Ayarlar
  await page.click('#btnSettings');
  await page.waitForTimeout(300);
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/' + shot + '-9-settings.png', fullPage: false });
  console.log('ERRORS:', errors);
  await browser.close();
})();
