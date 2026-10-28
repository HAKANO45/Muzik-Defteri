// 🧹 Repertuvar Düzenleyici (v5.13.0): ① adlar/gereksiz yazılar, ② sanatçıları topla
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
  const ok = async () => { await page.click('.modal-card >> text=OK').catch(() => {}); };
  page.on('dialog', d => d.accept());
  await page.click('#btnSettings'); await page.waitForTimeout(400);
  await page.click('.btn.ton-set:has-text("Düzenleyici")'); await page.waitForTimeout(400);
  await page.screenshot({ path: O + '/o0.png' });
  await page.click('.org-backup'); await page.waitForTimeout(600);
  await page.click('.org-step:has-text("Adları")'); await page.waitForTimeout(500);
  await page.waitForFunction(() => /değişecek/.test((document.querySelector('.modal-card h3') || {}).textContent || ''), null, { timeout: 120000 });
  console.log('①', await page.textContent('.modal-card h3'));
  console.log(await page.$$eval('.fix-frow', e => e.slice(0, 15).map(x => x.innerText.replace(/\n/g, ' | '))));
  await page.screenshot({ path: O + '/o1.png' });
  await page.click('.fix-apply'); await page.waitForTimeout(400); await ok(); await page.waitForTimeout(4000);
  console.log('commit', commits, 'ağaç', trees.flatMap(t => t.tree).length);
  const ak = await page.evaluate(() => [...window.__md.songs.keys()].filter(p => /diyarbak/i.test(p)));
  console.log('diyarbakır', ak);
  await page.waitForTimeout(2000); await page.click('.modal-head .mh-btn'); await page.waitForTimeout(300);
  await page.click('.org-step:has-text("Sanatçıları")'); await page.waitForTimeout(1500);
  console.log('②', await page.textContent('.modal-card h3'));
  console.log(await page.$$eval('.org-group', e => e.slice(0, 6).map(x => x.innerText.replace(/\n/g, ' | '))));
  await page.screenshot({ path: O + '/o2.png' });
  await page.click('.fix-apply'); await page.waitForTimeout(400); await ok(); await page.waitForTimeout(5000);
  console.log('commit', commits);
  console.log(await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Sanatçılar/Ahmet Kaya/')).length));
  console.log('ERR', errors); await b.close();
})();
