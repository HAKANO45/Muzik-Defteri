// GitHub senkronizasyonu (özel repertuvar deposu, kişisel erişim anahtarı ile).
// Okuma : bundle/repertuar.json.gz  (GitHub Actions her değişiklikte yeniden üretir)
// Yazma : repertuar/<yol> dosyaları tek tek (Contents API), programlar.json
import { toBase64 } from './encoding.js';

const API = 'https://api.github.com';

export class GitHub {
  constructor({ owner, repo, branch = 'main', token }) {
    Object.assign(this, { owner, repo, branch, token });
  }
  get ok() { return !!(this.owner && this.repo && this.token); }

  url(path) {
    const enc = path.split('/').map(encodeURIComponent).join('/');
    return `${API}/repos/${this.owner}/${this.repo}/contents/${enc}`;
  }
  headers(extra = {}) {
    return { Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...extra };
  }
  async call(method, url, { body, accept = 'application/vnd.github+json' } = {}) {
    const r = await fetch(url, {
      method, cache: 'no-store',
      headers: this.headers({ Accept: accept, ...(body ? { 'Content-Type': 'application/json' } : {}) }),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); if (j.message) msg = `${r.status}: ${j.message}`; } catch (_) {}
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return r;
  }

  async testAccess() {
    const r = await this.call('GET', `${API}/repos/${this.owner}/${this.repo}`);
    const j = await r.json();
    return { private: j.private, canPush: !!(j.permissions && j.permissions.push), defaultBranch: j.default_branch };
  }

  /** Dosyanın meta bilgisi (sha). Yoksa null. */
  async stat(path) {
    try {
      const r = await this.call('GET', this.url(path) + `?ref=${encodeURIComponent(this.branch)}`);
      return await r.json();
    } catch (e) { if (e.status === 404) return null; throw e; }
  }

  async getRaw(path) {
    const r = await this.call('GET', this.url(path) + `?ref=${encodeURIComponent(this.branch)}`, { accept: 'application/vnd.github.raw' });
    return new Uint8Array(await r.arrayBuffer());
  }

  /** Paketi indir ve aç. */
  async fetchBundle(onProgress) {
    const bytes = await this.getRaw('bundle/repertuar.json.gz');
    onProgress && onProgress('unzip');
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(ds).text();
    return JSON.parse(text);
  }

  /** Dosya yaz. sha verilmezse ve dosya varsa önce sha alınır (son yazan kazanır). Yeni sha döner. */
  async putFile(path, bytes, message, sha) {
    const body = { message, content: toBase64(bytes), branch: this.branch };
    if (sha) body.sha = sha;
    try {
      const r = await this.call('PUT', this.url(path), { body });
      return (await r.json()).content.sha;
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        const st = await this.stat(path);
        if (st && st.sha !== sha) { body.sha = st.sha; const r = await this.call('PUT', this.url(path), { body }); return (await r.json()).content.sha; }
        if (!st && sha) { delete body.sha; const r = await this.call('PUT', this.url(path), { body }); return (await r.json()).content.sha; }
      }
      throw e;
    }
  }

  async deleteFile(path, message, sha) {
    if (!sha) { const st = await this.stat(path); if (!st) return; sha = st.sha; }
    try {
      await this.call('DELETE', this.url(path), { body: { message, sha, branch: this.branch } });
    } catch (e) {
      if (e.status === 404) return;
      if (e.status === 409 || e.status === 422) {
        const st = await this.stat(path); if (!st) return;
        await this.call('DELETE', this.url(path), { body: { message, sha: st.sha, branch: this.branch } });
        return;
      }
      throw e;
    }
  }

  async getJson(path) {
    const st = await this.stat(path);
    if (!st) return { data: null, sha: null };
    const bytes = await this.getRaw(path);
    return { data: JSON.parse(new TextDecoder().decode(bytes)), sha: st.sha };
  }
}
