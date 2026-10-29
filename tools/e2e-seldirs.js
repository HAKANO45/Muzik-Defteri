// ☑ Klasör de seçilir (içindekilerle), birden fazla klasör + şarkı birlikte taşınır (v5.14.2)
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
  await page.evaluate(() => window.__mdGo('')); await page.waitForTimeout(400);
  const dir = n => page.locator('.item.tree-dir').filter({ has: page.locator('.name', { hasText: new RegExp('^' + n + '$') }) }).first();
  await page.click('#sideHead button[title="Seç"], #sideHead .small-btn:has-text("☑")'); await page.waitForTimeout(300);
  await dir('3-4 wals').locator('.dir-box').click(); await page.waitForTimeout(200);
  await dir('KINA').locator('.dir-box').click(); await page.waitForTimeout(200);
  await dir('9-8 Roman').click(); await page.waitForTimeout(300);           // içini aç
  await page.locator('#list .sel-item').first().click(); await page.waitForTimeout(200);
  console.log('başlık', await page.textContent('.edit-title'));
  await page.screenshot({ path: O + '/s1.png' });
  await page.click('.sel-act:has-text("Taşı")'); await page.waitForTimeout(400);
  await page.locator('.pick-row', { hasText: 'Halay' }).first().locator('.pick-name').click(); await page.waitForTimeout(4000);
  console.log('commit', commits);
  console.log(await page.evaluate(() => ['Halay/3-4 wals/', 'Halay/KINA/'].map(d => [...window.__md.songs.keys()].filter(p => p.startsWith(d)).length)));
  await page.screenshot({ path: O + '/s2.png' });
  console.log('ERR', errors); await b.close();
})();
