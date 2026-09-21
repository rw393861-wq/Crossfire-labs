const RNG = {
  cur: null,
  make(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  seed() { return (Math.random() * 4294967296) >>> 0; }
};
RNG.free = RNG.make(RNG.seed());
RNG.cur = RNG.free;

const U = {
  rand() { return RNG.cur(); },
  gauss(rng) {
    const f = rng || RNG.cur;
    let u = 0, v = 0;
    while (!u) u = f();
    while (!v) v = f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  ri(n) { return Math.floor(RNG.cur() * n); },
  rr(a, b) { return a + RNG.cur() * (b - a); },
  wrap(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  },
  mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; },
  vari(a) {
    if (a.length < 2) return 0;
    const m = U.mean(a);
    return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1);
  }
};

const B64 = {
  enc(f32) {
    const b = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  },
  dec(str) {
    const s = atob(str), b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return new Float32Array(b.buffer);
  }
};

class Net {
  constructor(sizes, weights) {
    this.sizes = sizes.slice();
    let n = 0;
    for (let l = 0; l < sizes.length - 1; l++) n += (sizes[l] + 1) * sizes[l + 1];
    this.count = n;
    this.w = weights && weights.length === n ? Float32Array.from(weights) : Net.fresh(sizes, n);
    this.act = sizes.map(s => new Float32Array(s));
  }

  static fresh(sizes, n) {
    const w = new Float32Array(n);
    let k = 0;
    for (let l = 0; l < sizes.length - 1; l++) {
      const a = sizes[l], b = sizes[l + 1], s = 1 / Math.sqrt(a);
      for (let j = 0; j < b; j++) {
        for (let i = 0; i < a; i++) w[k++] = U.gauss() * s;
        w[k++] = U.gauss() * 0.1;
      }
    }
    return w;
  }

  forward(input) {
    const w = this.w, L = this.sizes.length;
    this.act[0].set(input);
    let k = 0;
    for (let l = 0; l < L - 1; l++) {
      const x = this.act[l], y = this.act[l + 1], a = this.sizes[l], b = this.sizes[l + 1];
      for (let j = 0; j < b; j++) {
        let s = 0;
        for (let i = 0; i < a; i++) s += x[i] * w[k++];
        s += w[k++];
        y[j] = Math.tanh(s);
      }
    }
    return this.act[L - 1];
  }

  mutant(sigma) {
    const c = new Net(this.sizes, this.w);
    const w = c.w;
    for (let i = 0; i < w.length; i++) if (U.rand() < 0.1) w[i] += U.gauss() * sigma;
    return c;
  }

  toJSON() {
    return { sizes: this.sizes, w: Array.from(this.w, v => Math.round(v * 1e4) / 1e4) };
  }

  snap() { return { sizes: this.sizes, b: B64.enc(this.w) }; }

  static fromSnap(o) { return o ? new Net(o.sizes, B64.dec(o.b)) : null; }

  static fits(o, sizes) {
    return !!(o && o.w && o.sizes && o.sizes.join() === sizes.join());
  }

  static grows(o, sizes) {
    return !!(o && o.w && o.sizes && o.sizes.length === sizes.length &&
      o.sizes.slice(1).join() === sizes.slice(1).join() && o.sizes[0] < sizes[0]);
  }

  static usable(o, sizes) { return Net.fits(o, sizes) || Net.grows(o, sizes); }

  static widen(o, sizes) {
    const a0 = o.sizes[0], a1 = sizes[0], h = sizes[1], w = [];
    let k = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < a0; i++) w.push(o.w[k++]);
      for (let i = a0; i < a1; i++) w.push(0);
      w.push(o.w[k++]);
    }
    while (k < o.w.length) w.push(o.w[k++]);
    return new Net(sizes, w);
  }

  static from(o, sizes) {
    if (Net.fits(o, sizes)) return new Net(sizes, o.w);
    if (Net.grows(o, sizes)) return Net.widen(o, sizes);
    return new Net(sizes);
  }
}
