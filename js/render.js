const PAL = {
  void: '#141a23',
  floor: '#1e2632',
  grid: 'rgba(230,225,214,0.035)',
  wall: '#c2ab7a',
  wallEdge: '#7d6d4c',
  wallTop: '#d8c497',
  frag: '#ffe3a8',
  ink: '#e6e1d6'
};

class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
  }

  fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.c.clientWidth * dpr)), h = Math.max(1, Math.round(this.c.clientHeight * dpr));
    if (w === this.w && h === this.h) return;
    this.c.width = this.w = w;
    this.c.height = this.h = h;
    this.s = Math.min(w / World.W, h / World.H) * 0.97;
    this.ox = (w - World.W * this.s) / 2;
    this.oy = (h - World.H * this.s) / 2;
  }

  draw(game, opt) {
    this.fit();
    const g = this.g, L = game.learners;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PAL.void;
    g.fillRect(0, 0, this.w, this.h);
    g.setTransform(this.s, 0, 0, this.s, this.ox, this.oy);

    g.fillStyle = PAL.floor;
    g.fillRect(0, 0, World.W, World.H);
    g.strokeStyle = PAL.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 50; x < World.W; x += 50) { g.moveTo(x, 0); g.lineTo(x, World.H); }
    for (let y = 50; y < World.H; y += 50) { g.moveTo(0, y); g.lineTo(World.W, y); }
    g.stroke();

    for (const f of game.fires) {
      const k = Math.min(1, f.t / 1.2), flick = 0.85 + Math.random() * 0.15;
      const grd = g.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r);
      grd.addColorStop(0, `rgba(255,214,120,${0.75 * k * flick})`);
      grd.addColorStop(0.5, `rgba(240,110,40,${0.5 * k})`);
      grd.addColorStop(1, 'rgba(160,40,20,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
    }

    for (const b of game.walls) {
      g.fillStyle = PAL.wallEdge;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = PAL.wall;
      g.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 5);
      g.fillStyle = PAL.wallTop;
      g.fillRect(b.x + 2, b.y + 2, b.w - 4, 3);
    }

    if (opt.rays) {
      g.lineWidth = 1;
      for (const a of game.agents) {
        if (!a.alive) continue;
        const col = L[a.id].color;
        for (let r = 0; r < SIM.rays.length; r++) {
          const ang = a.a + SIM.rays[r], d = a.rayD[r];
          g.globalAlpha = a.rayE[r] ? 0.75 : 0.13;
          g.strokeStyle = a.rayE[r] ? col : PAL.ink;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d);
          g.stroke();
        }
        if (a.target >= 0 && game.agents[a.target].alive) {
          const t = game.agents[a.target];
          g.globalAlpha = 0.5;
          g.strokeStyle = col;
          g.setLineDash([4, 6]);
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(t.x, t.y); g.stroke();
          g.setLineDash([]);
        }
      }
      g.globalAlpha = 1;
    }

    for (const t of game.tracers) {
      g.globalAlpha = t.life / t.max;
      g.strokeStyle = L[t.id].color;
      g.lineWidth = t.heavy ? 2.5 : 1.4;
      g.beginPath(); g.moveTo(t.x1, t.y1); g.lineTo(t.x2, t.y2); g.stroke();
    }
    g.globalAlpha = 1;

    g.strokeStyle = PAL.frag;
    g.lineWidth = 1.6;
    g.beginPath();
    for (const f of game.frags) {
      g.moveTo(f.px - f.dx * 6, f.py - f.dy * 6);
      g.lineTo(f.x, f.y);
    }
    g.stroke();

    for (const n of game.nades) {
      const blink = n.type === 'grenade' && Math.floor(n.t * (n.t > n.fuse - 0.6 ? 14 : 5)) % 2 === 0;
      g.fillStyle = n.type === 'grenade' ? (blink ? '#f2d16b' : '#556b3a') : '#d9772f';
      g.beginPath(); g.arc(n.x, n.y, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.stroke();
    }

    for (const b of game.blasts) {
      const k = 1 - b.life / b.max;
      g.globalAlpha = (1 - k) * 0.8;
      g.fillStyle = 'rgba(255,220,150,0.35)';
      g.beginPath(); g.arc(b.x, b.y, b.r * (0.3 + 0.7 * k), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffe3a8'; g.lineWidth = 3;
      g.beginPath(); g.arc(b.x, b.y, b.r * (0.4 + 0.6 * k), 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;

    g.font = '600 13px "Saira Condensed", "Arial Narrow", sans-serif';
    g.textAlign = 'center';
    for (const a of game.agents) {
      const col = L[a.id].color;
      if (!a.alive) {
        g.strokeStyle = col; g.globalAlpha = 0.45; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(a.x - 7, a.y - 7); g.lineTo(a.x + 7, a.y + 7);
        g.moveTo(a.x + 7, a.y - 7); g.lineTo(a.x - 7, a.y + 7);
        g.stroke();
        g.globalAlpha = 1;
        continue;
      }
      const w = game.weapon(a), c = Math.cos(a.a), s = Math.sin(a.a);
      g.strokeStyle = '#0e1218'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + c * w.barrel, a.y + s * w.barrel); g.stroke();
      g.strokeStyle = PAL.ink; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(a.x + c * 6, a.y + s * 6); g.lineTo(a.x + c * w.barrel, a.y + s * w.barrel); g.stroke();
      g.lineCap = 'butt';
      if (a.flash > 0) {
        g.fillStyle = '#fff1c4';
        g.beginPath(); g.arc(a.x + c * (w.barrel + 3), a.y + s * (w.barrel + 3), 4, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = col;
      g.beginPath(); g.arc(a.x, a.y, SIM.radius, 0, Math.PI * 2); g.fill();
      g.strokeStyle = a.hurt > 0.4 ? '#ffffff' : 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.stroke();
      if (a.heal > 0) {
        g.strokeStyle = '#9bd46b'; g.lineWidth = 2;
        g.beginPath(); g.arc(a.x, a.y, SIM.radius + 5, 0, Math.PI * 2 * (1 - a.heal / 1.5)); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(a.x - 16, a.y + 17, 32, 4);
      g.fillStyle = a.hp > 40 ? col : '#ff4a3d';
      g.fillRect(a.x - 16, a.y + 17, 32 * a.hp / SIM.maxHp, 4);
      g.fillStyle = PAL.ink;
      g.fillText(L[a.id].name, a.x, a.y - 18);
    }
  }
}

function drawChart(canvas, learners, metric) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  const series = learners.map(L => {
    const hist = L.history.slice(-100), out = [];
    const pts = metric === 'a' ? hist.filter(p => p.s).map(p => p.h / p.s * 100) : hist.map(p => p.r);
    for (let i = 0; i < pts.length; i++) out.push(U.mean(pts.slice(Math.max(0, i - 9), i + 1)));
    return out;
  });
  const n = Math.max(...series.map(s => s.length));
  g.font = `${12 * dpr}px "Atkinson Hyperlegible", Verdana, sans-serif`;
  g.fillStyle = '#8f9aa8';
  if (n < 2) {
    g.fillText(metric === 'a' ? 'Accuracy appears after two finished games.' : 'The curve appears after two finished games.', 8 * dpr, h / 2);
    return;
  }
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const v of s) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (hi - lo < 1) { hi += 1; lo -= 1; }
  const pad = 6 * dpr, X = i => pad + i / (n - 1) * (w - pad * 2), Y = v => h - pad - (v - lo) / (hi - lo) * (h - pad * 2);
  if (metric === 'a') lo = Math.min(lo, 0);
  if (lo < 0 && hi > 0) {
    g.strokeStyle = 'rgba(230,225,214,0.15)'; g.lineWidth = dpr;
    g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(w - pad, Y(0)); g.stroke();
  }
  series.forEach((s, i) => {
    g.strokeStyle = learners[i].color; g.lineWidth = 2 * dpr;
    g.beginPath();
    const off = n - s.length;
    s.forEach((v, j) => { j ? g.lineTo(X(j + off), Y(v)) : g.moveTo(X(j + off), Y(v)); });
    g.stroke();
  });
  g.fillStyle = '#8f9aa8';
  const unit = metric === 'a' ? '%' : '';
  g.fillText(hi.toFixed(metric === 'a' ? 1 : 0) + unit, pad, pad + 10 * dpr);
  g.fillText(lo.toFixed(metric === 'a' ? 1 : 0) + unit, pad, h - pad);
}
