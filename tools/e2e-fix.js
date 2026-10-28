// 🔤 Düzelt (v5.9.0): şarkıda öneriler + klasörde toplu düzeltme (tek commit, kodlama korunur)
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
  // 1) tek şarkı
  await page.evaluate(() => window.__mdGo('9-8 Roman')); await page.waitForTimeout(300);
  await page.locator('#list .item[data-p="9-8 Roman/01.Abe kaynana neyap.txt"]').click(); await page.waitForTimeout(600);
  await page.click('#songToolbar button[title="Düzenle"]'); await page.waitForTimeout(300);
  await page.click('.btn.fix-btn'); await page.waitForTimeout(500);
  const sugs = await page.$$eval('.fix-sug', e => e.map(x => x.querySelector('.w').textContent));
  console.log('öneriler', sugs.length, sugs.slice(0, 12), 'tahmin', await page.locator('.fix-sug.guess').count());
  await page.evaluate(() => { const l = document.querySelector('.fix-list'); if (l) l.scrollTop = 1e4; const p = document.querySelector('.fix-prev'); if (p) p.scrollTop = 1e4; }); await page.screenshot({ path: O + '/f1.png' });
  await page.locator('.fix-sug').nth(0).locator('.fix-no').click(); await page.waitForTimeout(150);
  await page.click('.fix-apply'); await page.waitForTimeout(800);
  const rec = await page.evaluate(() => { const r = window.__md.songs.get('9-8 Roman/01.Abe kaynana neyap.txt'); return { t: r.t.slice(0, 120), e: r.e, dirty: r.dirty }; });
  console.log('kaydedildi', rec);
  await page.screenshot({ path: O + '/f2.png' });
  console.log('kişisel', JSON.stringify(await page.evaluate(() => window.__md.pers)).slice(0, 200));
  // ayarlar: eksik harfli şarkılar
  await page.click('#btnSettings'); await page.waitForTimeout(400);
  await page.locator('.miss-box').scrollIntoViewIfNeeded(); await page.screenshot({ path: O + '/f-miss.png' });
  console.log('eksik', await page.textContent('.miss-box h3'));
  await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelector('#modal') && (document.querySelector('#modal').hidden = true));
  // 2) klasörde toplu
  await page.evaluate(() => window.__mdGo('')); await page.waitForTimeout(300);
  await page.locator('.item.tree-dir', { hasText: '9-8 Roman' }).first().dblclick(); await page.waitForTimeout(400);
  await page.click('.sheet-act:has-text("Türkçe harf düzelt")'); await page.waitForTimeout(800);
  console.log('klasör:', await page.textContent('.modal-card h3'));
  await page.screenshot({ path: O + '/f3.png' });
  page.once('dialog', d => d.accept());
  await page.click('.fix-apply'); await page.waitForTimeout(400);
  await page.click('.modal-card >> text=OK').catch(() => {}); await page.waitForTimeout(2500);
  console.log('commit', commits, 'blob', blobs.length, 'ağaç girdisi', trees.flatMap(t => t.tree).length, 'sil', trees.flatMap(t => t.tree).filter(e => e.sha === null).length);
  const one = await page.evaluate(() => [...window.__md.songs.values()].filter(r => r.p.startsWith('9-8 Roman/')).map(r => r.p + ' [' + r.e + ']').slice(0, 6));
  console.log(one);
  console.log('ERR', errors); await b.close();
})();
