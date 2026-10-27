// Klasör işlemleri testi (v4.6): yeniden adlandır/taşı ve sil — GitHub'da TEK commit (Git Data API), favori/not/program yolları güncellenir.
// Kullanım: python3 -m http.server 8765 &  ->  node tools/e2e-folders-ops.js
const { chromium } = require('playwright');
const fs = require('fs'); const crypto = require('crypto');
const BUNDLE = fs.readFileSync(process.env.BUNDLE || '../Muzik-Defteri-Repertuar/bundle/repertuar.json.gz');
const bsha = crypto.createHash('sha1').update(BUNDLE).digest('hex');
const trees = [], commits = [], patches = [], puts = [];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const acc = req.headers()['accept'] || '';
    const m = req.method(); const u = url.pathname;
    if (u.endsWith('/git/ref/heads/main')) return route.fulfill({ json: { object: { sha: 'head1' } } });
    if (u.includes('/git/commits/') && m === 'GET') return route.fulfill({ json: { tree: { sha: 'tree0' } } });
    if (u.endsWith('/git/trees')) { const b = JSON.parse(req.postData()); trees.push(b); return route.fulfill({ json: { sha: 'tree' + trees.length } }); }
    if (u.endsWith('/git/commits') && m === 'POST') { commits.push(JSON.parse(req.postData())); return route.fulfill({ json: { sha: 'c' + commits.length } }); }
    if (u.includes('/git/refs/heads/main')) { patches.push(JSON.parse(req.postData())); return route.fulfill({ json: {} }); }
    const path = decodeURIComponent(u.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    if (path === 'bundle/repertuar.json.gz') return acc.includes('raw') ? route.fulfill({ body: BUNDLE }) : route.fulfill({ json: { sha: bsha } });
    if ((path === 'programlar.json' || path === 'notlar.json') && m === 'GET') return route.fulfill({ status: 404, json: {} });
    if (m === 'PUT') puts.push(path);
    return route.fulfill({ json: { content: { sha: 'x' } } });
  });
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('md.lang', 'tr'); localStorage.setItem('md.settings.backup.v1', JSON.stringify({ gh: { owner: 'HAKANO45', repo: '-Muzik-Defteri-Repertuar', branch: 'main', token: 'x' }, font: 22, stageFont: 34, speed: 30, _savedAt: Date.now() })); });
  await page.reload();
  await page.waitForFunction(() => window.__md.songs.size > 5000 && !window.__md.sync.busy, null, { timeout: 60000 });
  await page.waitForTimeout(2800);
  // 1) Hakkı Bulut klasörüne gir, bir şarkıyı favori yap
  await page.evaluate(() => window.__mdGo('Sanatçılar/Hakkı Bulut')); await page.waitForTimeout(450);
  const before = await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Sanatçılar/Hakkı Bulut/')));
  await page.locator('#list .item[data-p]').first().click(); await page.waitForTimeout(450);
  await page.click('#songToolbar button[title="Favori"]');
  // 2) taşı: Arabesk/Hakkı Bulut
  await page.click('button[title="Klasörü yeniden adlandır / taşı"]');
  await page.fill('.modal-card input', 'Arabesk/Hakkı Bulut'); await page.click('.modal-card >> text=OK');
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Arabesk/Hakkı Bulut/')));
  console.log('taşınan', before.length, '->', after.length, '| eski kalan:', await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Sanatçılar/Hakkı Bulut/')).length));
  const t = trees[0].tree; console.log('commit:', commits.map(c => c.message), '| ağaç girdisi', t.length, 'ekle', t.filter(e => e.sha).length, 'sil', t.filter(e => e.sha === null).length, '| içerik yüklemesi(PUT):', puts.filter(p => p.startsWith('repertuar/')).length);
  console.log('dir:', await page.evaluate(() => window.__md.dir), '| fav:', await page.evaluate(() => window.__md.programs.fav));
  await page.screenshot({ path: (process.env.OUT || '/tmp') + '/folder-moved.png' });
  // 3) sil (3 şarkı, yazarak onay gerekmez)
  await page.click('button[title="Klasörü sil"]'); await page.click('.modal-card >> text=OK'); await page.waitForTimeout(1500);
  console.log('silme commit:', commits[1] && commits[1].message, '| sil girdisi', trees.slice(1).flatMap(x => x.tree).filter(e => e.sha === null).length,
    '| kalan:', await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Arabesk/')).length), '| fav:', await page.evaluate(() => window.__md.programs.fav));
  // 4) büyük klasör: Yeni -> Yeni Arşiv (yazarak onay yok, sadece süre ölç)
  await page.click('.crumb >> nth=0');
  await page.evaluate(() => window.__mdGo('Yeni')); await page.waitForTimeout(450);
  const t0 = Date.now();
  await page.click('button[title="Klasörü yeniden adlandır / taşı"]');
  await page.fill('.modal-card input', 'Yeni Arşiv'); await page.click('.modal-card >> text=OK');
  await page.waitForFunction(() => window.__md.dir === 'Yeni Arşiv', null, { timeout: 120000 });
  const tc = trees.slice(-20).filter(x => x.tree.some(e => e.path.startsWith('repertuar/Yeni Arşiv/')));
  console.log('Büyük klasör taşıma süresi', Date.now() - t0, 'ms | ağaç parçası', tc.length, '| commit:', commits[commits.length - 1].message, '| şarkı:', await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Yeni Arşiv/')).length));
  // 5) yeniden açılış: kalıcı mı
  await page.reload(); await page.waitForTimeout(3000);
  console.log('yeniden açılış: Yeni Arşiv', await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Yeni Arşiv/')).length), 'eski Yeni/', await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Yeni/')).length));
  console.log('ERR', errors); await browser.close();
})();
