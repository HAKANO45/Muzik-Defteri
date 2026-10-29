// 📋 Kes · kopyala · yapıştır · sil, sağ tık menüsü, klasör sürükle (v5.14.0)
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
  const dir = n => page.locator('.item.tree-dir', { hasText: n }).first();
  // 1) sağ tık → menü
  await dir('3-4 wals').click({ button: 'right' }); await page.waitForTimeout(300);
  await page.screenshot({ path: O + '/k1.png' });
  console.log('menü', await page.$$eval('#ctxMenu .ctx-act', e => e.map(x => x.innerText.replace(/\n/g, ' '))));
  await page.click('#ctxMenu .ctx-act:has-text("Kes")'); await page.waitForTimeout(400);
  // 2) hedef klasörü aç (tek tık), 📥 düğmeleri ve alt şerit görünür
  await dir('Istek Parcalar').click(); await page.waitForTimeout(600);
  console.log('📥 sayısı', await page.locator('.paste-here').count(), '| şerit:', await page.textContent('.clip-bar'));
  await page.screenshot({ path: O + '/k2.png' });
  await dir('Istek Parcalar').locator('.paste-here').click(); await page.waitForTimeout(2500);
  console.log('commit', commits.slice(-1));
  console.log('taşındı mı', await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Istek Parcalar/3-4 wals/')).length, ), 'şerit var mı', await page.locator('.clip-bar').count());
  await page.screenshot({ path: O + '/k3.png' });
  // 3) şarkı: tıkla (odak) → Ctrl+C → klasöre tıkla → Ctrl+V
  await page.evaluate(() => window.__mdGo('9-8 Roman')); await page.waitForTimeout(400);
  await page.locator('#list .item[data-p="9-8 Roman/01.Abe kaynana neyap.txt"]').click(); await page.waitForTimeout(500);
  await page.locator('#list').focus().catch(() => {}); await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Control+c'); await page.waitForTimeout(300);
  await page.evaluate(() => window.__mdGo('')); await page.waitForTimeout(400);
  await dir('KINA').click(); await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Control+v'); await page.waitForTimeout(2500);
  console.log('commit', commits.slice(-1), await page.evaluate(() => window.__md.songs.has('KINA/01.Abe kaynana neyap.txt')));
  // 4) klasör sürükle-bırak
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('.item.tree-dir')].find(x => x.innerText.includes('Ciftetelli'));
    const b = [...document.querySelectorAll('.item.tree-dir')].find(x => x.innerText.includes('Halay'));
    const dt = new DataTransfer();
    a.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    b.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    b.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(400); await page.click('.modal-card >> text=OK').catch(() => {}); await page.waitForTimeout(2500);
  console.log('commit', commits.slice(-1), await page.evaluate(() => [...window.__md.songs.keys()].filter(p => p.startsWith('Halay/Ciftetelli/')).length));
  console.log('ERR', errors); await b.close();
})();
