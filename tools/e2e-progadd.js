// ＋☰ Programa ekle (şarkı menüsü), programlar tarzlara göre (v5.15.0)
const { chromium } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const SOZ = fs.readFileSync(process.env.SOZ || '../Muzik-Defteri-Repertuar/bundle/sozluk.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const O = process.env.OUT || '/tmp'; const puts = [], blobs = [], trees = [], commits = [];
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const u = new URL(req.url()).pathname; const acc = req.headers()['accept'] || ''; const m = req.method();
    if (u.endsWith('/git/ref/heads/main')) return route.fulfill({ json: { object: { sha: 'h' } } });
    if (u.includes('/git/commits/') && m === 'GET') return route.fulfill({ json: { tree: { sha: 't0' } } });
    if (u.endsWith('/git/blobs')) { blobs.push(JSON.parse(req.postData())); return route.fulfill({ json: { sha: 'b' + blobs.length } }); }
    if (u.endsWith('/git/trees')) { trees.push(JSON.parse(req.postData())); return route.fulfill({ json: { sha: 't' + trees.length } }); }
    if (u.endsWith('/git/commits') && m === 'POST') { commits.push(JSON.parse(req.postData()).message); return route.fulfill({ json: { sha: 'c' } }); }
    if (u.endsWith('/git/refs') && m === 'POST') { commits.push('BRANCH ' + JSON.parse(req.postData()).ref); return route.fulfill({ json: {} }); }
    if (u.includes('/git/refs/heads/main')) return route.fulfill({ json: {} });
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (path === 'bundle/sozluk.json.gz') return acc.includes('raw') ? route.fulfill({ body: SOZ }) : route.fulfill({ json: { sha: 'soz1' } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    puts.push([path, req.postData()]); return route.fulfill({ json: { content: { sha: 'x' + puts.length } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__mdGo('9-8 Roman')); await page.waitForTimeout(400);
  const song = page.locator('#list .item[data-p="9-8 Roman/01.Abe kaynana neyap.txt"]');
  await song.dblclick(); await page.waitForTimeout(500);
  await page.screenshot({ path: O + '/g1.png' });
  await page.click('.sheet-act:has-text("Programa ekle")'); await page.waitForTimeout(400);
  // yeni program: tarz Halay
  await page.click('.modal-card .btn.primary:has-text("Yeni program")'); await page.waitForTimeout(300);
  await page.fill('.modal-card input.field', 'Halay 9/8 Gece'); await page.click('.prog-tarz .chip-opt:has-text("Halay")');
  await page.click('.modal-card .btn.primary:has-text("OK")'); await page.waitForTimeout(500);
  // ikinci yeni program: yeni tarz
  await page.click('.modal-card .btn.primary:has-text("Yeni program")'); await page.waitForTimeout(300);
  await page.fill('.modal-card input.field >> nth=0', 'Eylem Slow 3');
  await page.click('.prog-tarz .chip-opt:has-text("Slow")');
  await page.click('.modal-card .btn.primary:has-text("OK")'); await page.waitForTimeout(500);
  await page.click('.modal-card .btn.primary:has-text("Yeni program")'); await page.waitForTimeout(300);
  await page.fill('.modal-card input.field >> nth=0', 'Düğün Açılış');
  await page.click('.prog-tarz .chip-opt:has-text("yeni tarz")'); await page.fill('.tarz-new', 'Düğün'); await page.keyboard.press('Enter');
  await page.click('.modal-card .btn.primary:has-text("OK")'); await page.waitForTimeout(500);
  console.log('dialog grupları', await page.$$eval('.prog-pick-grp', e => e.map(x => x.textContent)), await page.$$eval('.prog-pick .item', e => e.map(x => x.innerText.replace(/\n/g, ' '))));
  await page.screenshot({ path: O + '/g2.png' });
  await page.locator('.prog-pick .item', { hasText: 'Halay 9/8 Gece' }).click(); await page.waitForTimeout(300);   // çıkar
  console.log('sonra', await page.$$eval('.prog-pick .item', e => e.map(x => x.innerText.replace(/\n/g, ' '))));
  await page.locator('.prog-pick .item', { hasText: 'Halay 9/8 Gece' }).click(); await page.waitForTimeout(300);   // tekrar ekle
  await page.click('.modal-card .btn:has-text("Bitti")'); await page.waitForTimeout(300);
  await page.click('.tabs button[data-tab="programs"]'); await page.waitForTimeout(500);
  console.log('programlar', await page.$$eval('#list .item', e => e.map(x => x.innerText.replace(/\n/g, ' '))));
  await page.screenshot({ path: O + '/g3.png' });
  const pj = await page.evaluate(() => window.__md.programs.programs.map(p => [p.name, p.tarz, p.items.length]));
  console.log(pj, await page.evaluate(() => window.__md.programs.tarzlar));
  console.log('ERR', errors); await b.close();
})();
