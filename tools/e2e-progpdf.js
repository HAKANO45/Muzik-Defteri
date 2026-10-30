// 📄 Programlar: PDF'den program / PDF'den ekle (v5.17.0). Örnek dosyalar: FX klasörü (sözsüz deneme metinleri; depoya konmaz)
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
  await page.click('.tabs button[data-tab="programs"]'); await page.waitForTimeout(400);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.doc-prog-btn')]);
  await fc.setFiles(FX + '/Karadeniz_2023.pdf'); await page.waitForTimeout(3000);
  console.log('seçenekler', await page.$$eval('.doc-song', e => e.map(x => x.querySelector('.doc-title').value + ' | ' + [...x.querySelectorAll('.doc-opt')].map(b => b.textContent).join(' / '))));
  console.log('düğme', await page.textContent('.fix-apply'));
  await page.click('.prog-tarz .chip-opt:has-text("THM")');
  await page.screenshot({ path: O + '/q1.png' });
  await page.locator('.doc-song').nth(1).scrollIntoViewIfNeeded(); await page.evaluate(() => { const e = document.querySelectorAll('.doc-song')[1]; e.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(200); await page.screenshot({ path: O + '/q1b.png' });
  await page.click('.fix-apply'); await page.waitForTimeout(3000);
  console.log('commit', commits);
  const pr = await page.evaluate(() => { const p = window.__md.programs.programs.find(x => x.id === window.__md.programId); return p && [p.name, p.tarz, p.items]; });
  console.log('program', JSON.stringify(pr));
  await page.screenshot({ path: O + '/q2.png' });
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.doc-prog-btn')]);
  await fc2.setFiles(FX + '/ornek.pdf'); await page.waitForTimeout(2500);
  console.log('append ipucu', await page.textContent('.doc-file .hint'));
  await page.click('.fix-apply'); await page.waitForTimeout(3000);
  console.log('sonra', await page.evaluate(() => { const p = window.__md.programs.programs.find(x => x.id === window.__md.programId); return p.items.length; }), commits.length);
  console.log('ERR', errors); await b.close();
})();
