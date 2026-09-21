const World = {
  W: 1400,
  H: 900,
  border() {
    const W = this.W, H = this.H, t = 20;
    return [
      { x: 0, y: 0, w: W, h: t }, { x: 0, y: H - t, w: W, h: t },
      { x: 0, y: 0, w: t, h: H }, { x: W - t, y: 0, w: t, h: H }
    ];
  },
  free(walls, x, y, r) {
    for (const b of walls) if (Geo.touches(x, y, r, b)) return false;
    return true;
  }
};

const MAPS = [
  {
    name: 'Yard',
    walls: [
      { x: 300, y: 150, w: 40, h: 220 }, { x: 300, y: 530, w: 40, h: 220 },
      { x: 1060, y: 150, w: 40, h: 220 }, { x: 1060, y: 530, w: 40, h: 220 },
      { x: 600, y: 430, w: 200, h: 40 }, { x: 680, y: 120, w: 40, h: 170 },
      { x: 680, y: 610, w: 40, h: 170 }, { x: 460, y: 270, w: 100, h: 34 },
      { x: 840, y: 596, w: 100, h: 34 }
    ]
  },
  {
    name: 'Blocks',
    walls: [
      { x: 220, y: 170, w: 90, h: 90 }, { x: 520, y: 170, w: 150, h: 60 },
      { x: 830, y: 150, w: 60, h: 150 }, { x: 1090, y: 180, w: 90, h: 90 },
      { x: 250, y: 420, w: 60, h: 150 }, { x: 560, y: 400, w: 110, h: 110 },
      { x: 830, y: 450, w: 150, h: 60 }, { x: 1120, y: 420, w: 60, h: 150 },
      { x: 220, y: 680, w: 150, h: 60 }, { x: 540, y: 660, w: 60, h: 140 },
      { x: 830, y: 690, w: 90, h: 90 }, { x: 1060, y: 680, w: 150, h: 60 }
    ]
  },
  {
    name: 'Corridors',
    walls: [
      { x: 180, y: 280, w: 440, h: 30 }, { x: 780, y: 280, w: 440, h: 30 },
      { x: 180, y: 590, w: 440, h: 30 }, { x: 780, y: 590, w: 440, h: 30 },
      { x: 685, y: 80, w: 30, h: 130 }, { x: 685, y: 690, w: 30, h: 130 },
      { x: 640, y: 420, w: 120, h: 60 }, { x: 140, y: 430, w: 130, h: 40 },
      { x: 1130, y: 430, w: 130, h: 40 }, { x: 420, y: 410, w: 34, h: 80 },
      { x: 946, y: 410, w: 34, h: 80 }
    ]
  }
];

const Geo = {
  rayBox(ox, oy, dx, dy, b) {
    let tmin = 0, tmax = Infinity;
    if (Math.abs(dx) < 1e-9) {
      if (ox < b.x || ox > b.x + b.w) return Infinity;
    } else {
      let t1 = (b.x - ox) / dx, t2 = (b.x + b.w - ox) / dx;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
    if (Math.abs(dy) < 1e-9) {
      if (oy < b.y || oy > b.y + b.h) return Infinity;
    } else {
      let t1 = (b.y - oy) / dy, t2 = (b.y + b.h - oy) / dy;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  },

  castWalls(walls, ox, oy, dx, dy, max) {
    let best = max;
    for (let i = 0; i < walls.length; i++) {
      const t = this.rayBox(ox, oy, dx, dy, walls[i]);
      if (t < best) best = t;
    }
    return best;
  },

  rayCircle(ox, oy, dx, dy, cx, cy, r) {
    const fx = ox - cx, fy = oy - cy;
    const b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t < 0) t = -b + sq;
    return t < 0 ? Infinity : t;
  },

  touches(x, y, r, b) {
    const cx = U.clamp(x, b.x, b.x + b.w), cy = U.clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  },

  pushOut(o, r, b) {
    const cx = U.clamp(o.x, b.x, b.x + b.w), cy = U.clamp(o.y, b.y, b.y + b.h);
    const dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      o.x = cx + nx * r; o.y = cy + ny * r;
      return { nx, ny };
    }
    const l = o.x - b.x, rt = b.x + b.w - o.x, t = o.y - b.y, bt = b.y + b.h - o.y;
    const m = Math.min(l, rt, t, bt);
    if (m === l) { o.x = b.x - r; return { nx: -1, ny: 0 }; }
    if (m === rt) { o.x = b.x + b.w + r; return { nx: 1, ny: 0 }; }
    if (m === t) { o.y = b.y - r; return { nx: 0, ny: -1 }; }
    o.y = b.y + b.h + r;
    return { nx: 0, ny: 1 };
  }
};
