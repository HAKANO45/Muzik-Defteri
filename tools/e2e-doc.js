// 📄 PDF / Word içe aktar (v5.10.0). Örnek dosyalar: FX klasörü (sözsüz deneme metinleri; depoya konmaz)
const { chromium } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const FX = process.env.FX; const O = process.env.OUT || '/tmp';
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const blobs = [], trees = [], commits = [];
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
    if (u.includes('/git/refs/heads/main')) return route.fulfill({ json: {} });
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if (m === 'GET') return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'H', repo: 'r', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.side-head .small-btn[title="PDF / Word içe aktar"]')]);
  await fc.setFiles([FX + '/ornek.pdf', FX + '/ornek.docx']); await page.waitForTimeout(2500);
  const titles = await page.$$eval('.doc-title', e => e.map(x => x.value));
  console.log('klasör', await page.$$eval('.doc-folder', e => e.map(x => x.value)), 'şarkı', titles);
  await page.locator('.doc-song').nth(0).locator('.small-btn').click();
  await page.screenshot({ path: O + '/d1.png' });
  await page.click('.fix-apply'); await page.waitForTimeout(2500);
  console.log('commit', commits, 'blob', blobs.length, 'yollar', trees.flatMap(t => t.tree).map(e => e.path).slice(0, 7));
  console.log('sıra', JSON.stringify(await page.evaluate(() => window.__md.order.order['9-8 Roman Ege Havalari'])));
  console.log('dir', await page.evaluate(() => window.__md.dir), await page.$$eval('#list .item .name', e => e.slice(0, 8).map(x => x.firstChild.textContent)));
  await page.locator('#list .item[data-p]').first().click(); await page.waitForTimeout(600);
  await page.screenshot({ path: O + '/d2.png' });
  console.log('ERR', errors); await b.close();
})();
