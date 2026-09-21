const AI_ROSTER = [
  { name: 'Kestrel', color: '#ef6f5e' },
  { name: 'Harrow', color: '#5cb8e4' },
  { name: 'Juniper', color: '#9bd46b' }
];

const LEARN = {
  version: 3,
  pairs: 8,
  sigma: 0.04,
  lr: 0.03,
  decay: 0.005
};

const zeros3 = () => ({ main: [0, 0, 0], alt: [0, 0, 0], util: [0, 0, 0] });

class Learner {
  constructor(i, data) {
    this.idx = i;
    this.name = AI_ROSTER[i].name;
    this.color = AI_ROSTER[i].color;
    const d = data || {};
    const count = new Net(SIM.sizes, new Float32Array(1)).count;
    let same = d.v === LEARN.version && typeof d.theta === 'string';
    if (same) {
      this.theta = B64.dec(d.theta);
      this.m = B64.dec(d.m);
      this.v = B64.dec(d.v2);
      same = this.theta.length === count && this.m.length === count && this.v.length === count;
    }
    if (!same) {
      this.theta = Float32Array.from(new Net(SIM.sizes).w);
      this.m = new Float32Array(count);
      this.v = new Float32Array(count);
    }
    this.step = same ? d.step : 0;
    this.updates = same ? d.updates : 0;
    this.batchSeed = same ? d.batchSeed : null;
    this.fit = same ? d.fit.slice() : null;
    this.next = same ? d.next : 0;
    this.batchMeans = same && d.batchMeans ? d.batchMeans.slice() : [];
    this.q = same && d.q ? JSON.parse(JSON.stringify(d.q)) : zeros3();
    this.n = same && d.n ? JSON.parse(JSON.stringify(d.n)) : zeros3();
    this.totals = Object.assign({ games: 0, wins: 0, kills: 0, deaths: 0, damage: 0, segments: 0, shots: 0, hits: 0 }, d.totals);
    this.history = d.history ? d.history.slice() : [];
    this.gameR = 0;
    this.gameN = 0;
    this.champion = new Net(SIM.sizes, this.theta);
    if (this.batchSeed === null) this.newBatch(); else this.buildBatch();
  }

  get batchSize() { return LEARN.pairs * 2; }

  newBatch() {
    this.batchSeed = Math.floor(U.rand() * 4294967296) >>> 0;
    this.fit = new Array(this.batchSize).fill(null);
    this.next = 0;
    this.buildBatch();
  }

  buildBatch() {
    const r = RNG.make(this.batchSeed), n = this.theta.length;
    this.eps = [];
    this.nets = [];
    for (let p = 0; p < LEARN.pairs; p++) {
      const e = new Float32Array(n);
      for (let i = 0; i < n; i++) e[i] = U.gauss(r);
      this.eps.push(e);
    }
    for (let k = 0; k < this.batchSize; k++) {
      const e = this.eps[k >> 1], sg = (k & 1 ? -1 : 1) * LEARN.sigma, w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = this.theta[i] + sg * e[i];
      this.nets.push(new Net(SIM.sizes, w));
    }
  }

  filled() { return this.fit.filter(f => f !== null).length; }

  nextBrain() {
    const k = this.next % this.batchSize;
    this.next++;
    return { net: this.nets[k], chall: k };
  }

  report(r, k, load) {
    this.totals.segments++;
    this.gameR += r;
    this.gameN++;
    for (const s of ['main', 'alt', 'util']) {
      const i = load[s];
      this.n[s][i]++;
      this.q[s][i] += (r - this.q[s][i]) * 0.05;
    }
    this.fit[k] = this.fit[k] === null ? r : (this.fit[k] + r) / 2;
    if (this.fit.every(f => f !== null)) this.update();
  }

  update() {
    const F = this.fit, N = F.length, P = LEARN.pairs, n = this.theta.length;
    const order = F.map((f, i) => i).sort((a, b) => F[a] - F[b]), rank = new Array(N);
    order.forEach((i, r) => { rank[i] = r / (N - 1) - 0.5; });
    const g = new Float32Array(n);
    for (let p = 0; p < P; p++) {
      const d = rank[2 * p] - rank[2 * p + 1], e = this.eps[p];
      for (let i = 0; i < n; i++) g[i] += d * e[i];
    }
    this.step++;
    const b1 = 0.9, b2 = 0.999, lr = LEARN.lr, c1 = 1 - Math.pow(b1, this.step), c2 = 1 - Math.pow(b2, this.step);
    for (let i = 0; i < n; i++) {
      const gi = g[i] / P;
      this.m[i] = b1 * this.m[i] + (1 - b1) * gi;
      this.v[i] = b2 * this.v[i] + (1 - b2) * gi * gi;
      this.theta[i] += lr * (this.m[i] / c1) / (Math.sqrt(this.v[i] / c2) + 1e-8) - lr * LEARN.decay * this.theta[i];
    }
    this.updates++;
    this.batchMeans.push(Math.round(U.mean(F) * 10) / 10);
    if (this.batchMeans.length > 60) this.batchMeans.shift();
    this.champion = new Net(SIM.sizes, this.theta);
    this.newBatch();
  }

  probs(k) {
    const q = this.q[k], n = this.n[k];
    const temp = Math.max(6, 40 / Math.sqrt(1 + (n[0] + n[1] + n[2]) / 25));
    const m = Math.max(q[0], q[1], q[2]);
    const e = q.map(v => Math.exp((v - m) / temp));
    const s = e[0] + e[1] + e[2];
    return e.map(v => 0.93 * v / s + 0.07 / 3);
  }

  pick(k) {
    const p = this.probs(k);
    let r = U.rand();
    for (let i = 0; i < 3; i++) { r -= p[i]; if (r <= 0) return i; }
    return 2;
  }

  pickLoadout() {
    return { main: this.pick('main'), alt: this.pick('alt'), util: this.pick('util') };
  }

  recentAcc(n) {
    const h = this.history.slice(-n).filter(x => x.s);
    const s = h.reduce((a, x) => a + x.s, 0), hit = h.reduce((a, x) => a + x.h, 0);
    return s ? hit / s : null;
  }

  gameOver(ag, won) {
    const t = this.totals;
    t.games++;
    if (won) t.wins++;
    t.kills += ag.kills;
    t.deaths += ag.deaths;
    t.damage += Math.round(ag.dmg);
    t.shots += ag.shots;
    t.hits += ag.hits;
    this.history.push({
      r: this.gameN ? Math.round(this.gameR / this.gameN * 10) / 10 : 0,
      k: ag.kills, d: ag.deaths, s: ag.shots, h: ag.hits
    });
    if (this.history.length > 300) this.history.shift();
    this.gameR = 0;
    this.gameN = 0;
  }

  snapshot() {
    return {
      v: LEARN.version, theta: B64.enc(this.theta), m: B64.enc(this.m), v2: B64.enc(this.v),
      step: this.step, updates: this.updates, batchSeed: this.batchSeed, fit: this.fit.slice(), next: this.next,
      batchMeans: this.batchMeans.slice(), q: JSON.parse(JSON.stringify(this.q)), n: JSON.parse(JSON.stringify(this.n)),
      totals: Object.assign({}, this.totals)
    };
  }

  toJSON() {
    const o = this.snapshot();
    o.history = this.history;
    return o;
  }

  static fromSnapshot(i, s) { return new Learner(i, s); }
}
