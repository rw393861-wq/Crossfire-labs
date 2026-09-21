const Store = {
  key: 'crossfire-lab-v1',

  pack(app) {
    return {
      app: 'crossfire-lab', version: 2, saved: Date.now(), games: app.games,
      settings: app.settings, learners: app.learners.map(l => l.toJSON())
    };
  },

  save(app) {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.pack(app)));
      return true;
    } catch (e) {
      return false;
    }
  },

  load() {
    try {
      const s = localStorage.getItem(this.key);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  },

  async bundled() {
    try {
      const r = await fetch('brains.json', { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  },

  valid(d) {
    return !!(d && Array.isArray(d.learners) && d.learners.length === 3);
  },

  clear() {
    try { localStorage.removeItem(this.key); } catch (e) {}
  },

  download(app) {
    const blob = new Blob([JSON.stringify(this.pack(app))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brains.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
};

const Replays = {
  key: 'crossfire-lab-replays',
  keep: 8,
  data: { sim: SIM.version, best: [], last: null },
  dirty: false,

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (d && d.sim === SIM.version && Array.isArray(d.best)) this.data = d;
    } catch (e) {}
  },

  add(rec) {
    this.data.last = rec;
    this.data.best.push(rec);
    this.data.best.sort((a, b) => b.score - a.score);
    this.data.best.length = Math.min(this.data.best.length, this.keep);
    this.dirty = true;
  },

  flush() {
    if (!this.dirty) return;
    for (let tries = 0; tries < 6; tries++) {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.data));
        this.dirty = false;
        return;
      } catch (e) {
        if (this.data.best.length > 2) this.data.best.pop();
        else { this.data.last = null; }
      }
    }
  },

  clear() {
    this.data = { sim: SIM.version, best: [], last: null };
    try { localStorage.removeItem(this.key); } catch (e) {}
  },

  list() {
    const out = [];
    if (this.data.last) out.push({ rec: this.data.last, latest: true });
    for (const r of this.data.best) if (!this.data.last || r.when !== this.data.last.when) out.push({ rec: r, latest: false });
    return out;
  }
};
