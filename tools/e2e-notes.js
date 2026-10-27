// Şarkı notu testi (v4.4): Solist / Ton / kısa not ekle, GitHub'a notlar.json gider, aramada bulunur, sahnede görünür; iPhone'da sadece görünür.
// Kullanım: python3 -m http.server 8765 &  ->  node tools/e2e-notes.js
const { chromium, devices } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const OUT = process.env.OUT || '/tmp';
let notes = null;
async function setup(browser, opts) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const acc = req.headers()['accept'] || '';
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'notlar.json' && req.method() === 'GET') return notes ? (acc.includes('raw') ? route.fulfill({ body: notes }) : route.fulfill({ json: { sha: 'n1' } })) : route.fulfill({ status: 404, json: {} });
    if (path === 'programlar.json' && req.method() === 'GET') return route.fulfill({ status: 404, json: {} });
    if (req.method() === 'PUT' && path === 'notlar.json') notes = Buffer.from(JSON.parse(req.postData()).content, 'base64');
    return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'HAKANO45', repo: '-Muzik-Defteri-Repertuar', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 });
  await page.waitForTimeout(2800);
  return { page, errors };
}
(async () => {
  const browser = await chromium.launch();
  // 1) iPad: not ekle
  let { page, errors } = await setup(browser, { ...devices['iPad (gen 7)'] });
  await page.fill('#q', 'haydar haydar'); await page.waitForTimeout(600);
  await page.locator('#list .item').first().click(); await page.waitForTimeout(300);
  await page.click('#songNote .chip-add');
  await page.fill('.modal-card input.field >> nth=0', 'Eylem');
  await page.selectOption('.modal-card select', 'La'); await page.check('.modal-card .ton-row input[type=checkbox]');
  await page.fill('.modal-card input.field >> nth=1', '96');
  await page.fill('.modal-card input.field >> nth=2', 'Arabesk 2');
  await page.fill('.modal-card input.field >> nth=3', 'kapo 2, yavaş başla');
  await page.screenshot({ path: OUT + '/notes-ipad-dialog.png' });
  await page.click('.modal-card >> text=Kaydet'); await page.waitForTimeout(300);
  console.log('chips:', await page.locator('#songNote').innerText());
  await page.screenshot({ path: OUT + '/notes-ipad-song.png' });
  await page.waitForTimeout(5000);
  console.log('notlar.json uploaded:', notes ? JSON.stringify(JSON.parse(notes.toString()).notes).slice(0, 160) : null);
  await page.click('#btnBack').catch(() => {});
  await page.fill('#q', 'eylem'); await page.waitForTimeout(700);
  console.log('search eylem:', await page.locator('#sideHead').innerText());
  await page.locator('#list .item').first().click(); await page.waitForTimeout(200);
  await page.keyboard.press('f'); await page.waitForTimeout(300);
  console.log('stage note:', await page.locator('#stageNote').innerText());
  await page.screenshot({ path: OUT + '/notes-ipad-stage.png' });
  console.log('ERR ipad', errors);
  await page.context().close();
  // 2) iPhone: senkronla gelen notu görür, düzenleyemez
  ({ page, errors } = await setup(browser, { ...devices['iPhone 13'] }));
  await page.fill('#q', 'eylem'); await page.waitForTimeout(700);
  console.log('iphone search eylem:', await page.locator('#sideHead').innerText());
  await page.locator('#list .item').first().click(); await page.waitForTimeout(300);
  console.log('iphone chips:', await page.locator('#songNote').innerText(), '| add button:', await page.locator('#songNote .chip-add').count());
  await page.screenshot({ path: OUT + '/notes-iphone-song.png' });
  console.log('ERR iphone', errors);
  await browser.close();
})();
