// ＋☰ aramada / favorilerde / son açılanlarda programa ekle; son açılanları temizle (v5.15.1)
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
  await page.fill('#q', 'gel yani'); await page.waitForTimeout(900);
  console.log('arama ＋☰', await page.locator('#list .plus-prog').count());
  await page.screenshot({ path: O + '/h1.png' });
  await page.locator('#list .item[data-p]').nth(1).click({ button: 'right' }); await page.waitForTimeout(300);
  console.log('sağ tık', await page.$$eval('#ctxMenu .ctx-act', e => e.map(x => x.innerText.split('\n')[0])));
  await page.keyboard.press('Escape'); await page.mouse.click(900, 880); await page.waitForTimeout(200);
  await page.locator('#list .plus-prog').first().click(); await page.waitForTimeout(400);
  await page.click('.modal-card .btn.primary:has-text("Yeni program")'); await page.waitForTimeout(300);
  await page.fill('.modal-card input.field >> nth=0', 'Ankara Gecesi'); await page.click('.prog-tarz .chip-opt:has-text("Oyun Havası")');
  await page.click('.modal-card .btn.primary:has-text("OK")'); await page.waitForTimeout(400);
  await page.screenshot({ path: O + '/h2.png' });
  await page.click('.modal-card .btn:has-text("Bitti")'); await page.waitForTimeout(200);
  for (const i of [0, 2, 3]) { await page.locator('#list .item[data-p]').nth(i).click(); await page.waitForTimeout(400); }
  await page.fill('#q', ''); await page.waitForTimeout(300);
  await page.click('.tabs button[data-tab="recent"]'); await page.waitForTimeout(400);
  console.log('son', await page.$$eval('#list .item[data-p]', e => e.length));
  await page.screenshot({ path: O + '/h3.png' });
  await page.locator('#list .plus-prog.rm').first().click(); await page.waitForTimeout(300);
  console.log('✕ sonrası', await page.$$eval('#list .item[data-p]', e => e.length));
  await page.click('.side-head .danger-btn'); await page.waitForTimeout(300); await page.click('.modal-card >> text=OK'); await page.waitForTimeout(300);
  console.log('temizle sonrası', await page.$$eval('#list .item[data-p]', e => e.length), await page.textContent('#list'));
  console.log(await page.evaluate(() => window.__md.programs.programs.map(p => [p.name, p.tarz, p.items.length])));
  console.log('ERR', errors); await b.close();
})();
