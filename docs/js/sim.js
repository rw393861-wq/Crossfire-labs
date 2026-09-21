const SIM = {
  dt: 1 / 60,
  rays: [-60, -45, -30, -18, -8, 0, 8, 18, 30, 45, 60, 120, 180, -120].map(d => d * Math.PI / 180),
  frontRays: 11,
  rayLen: 700,
  radius: 12,
  speed: 150,
  turn: 3.6,
  maxHp: 100,
  respawn: 3,
  segMax: 25,
  fov: Math.PI / 3,
  think: 2,
  version: 3
};
SIM.inputs = SIM.rays.length * 3 + 9 + 9 + 2 + 6;
SIM.outputs = 9;
SIM.sizes = [SIM.inputs, 32, 16, SIM.outputs];

function makeAgent(id) {
  return {
    id, x: 60, y: 60, a: 0, alive: false, hp: SIM.maxHp, respawn: 0.2 + id * 0.15,
    load: { main: 0, alt: 0, util: 0 }, slot: 0, ammo: [0, 0], reload: 0,
    fireCd: 0, switchCd: 0, utilLeft: 0, utilCd: 0, heal: 0, hurt: 0, spd: 0, flash: 0,
    mem: [0, 0], inp: new Float32Array(SIM.inputs), out: new Float32Array(SIM.outputs),
    rayD: new Float32Array(SIM.rays.length), rayE: new Uint8Array(SIM.rays.length),
    brain: null, chall: false, seg: null, kills: 0, deaths: 0, dmg: 0, shots: 0, hits: 0, target: -1, aimErr: 0,
    onTarget: false, crossId: -1, lastHitBy: {}, pts: REWARD.blank()
  };
}

class Game {
  constructor(learners, duration, seed) {
    this.seed = seed === undefined ? RNG.seed() : seed >>> 0;
    this.rng = RNG.make(this.seed);
    RNG.cur = this.rng;
    this.learners = learners;
    this.map = MAPS[U.ri(MAPS.length)];
    RNG.cur = RNG.free;
    this.walls = World.border().concat(this.map.walls);
    this.duration = duration;
    this.t = 0;
    this.over = false;
    this.winner = -1;
    this.agents = learners.map((l, i) => makeAgent(i));
    this.tracers = [];
    this.nades = [];
    this.fires = [];
    this.frags = [];
    this.blasts = [];
    this.feed = [];
    this.checks = [];
  }

  weapon(ag) {
    return ag.slot === 0 ? WEAPONS.main[ag.load.main] : WEAPONS.alt[ag.load.alt];
  }

  step() {
    if (this.over) return;
    RNG.cur = this.rng;
    const dt = SIM.dt;
    this.t += dt;
    this.tick = (this.tick || 0) + 1;
    for (const ag of this.agents) {
      if (!ag.alive) {
        ag.respawn -= dt;
        if (ag.respawn <= 0) this.spawn(ag);
        continue;
      }
      if (!ag.thought || (this.tick + ag.id) % SIM.think === 0) {
        this.sense(ag);
        ag.out.set(ag.brain.forward(ag.inp));
        ag.thought = true;
      }
      this.act(ag, dt);
    }
    this.updateNades(dt);
    this.updateFrags(dt);
    this.updateFires(dt);
    for (const ag of this.agents) {
      if (!ag.alive || !ag.seg) continue;
      ag.seg.time += dt;
      if (ag.seg.time >= SIM.segMax) {
        this.endSeg(ag, false);
        this.startSeg(ag);
      }
    }
    this.fade(this.tracers, dt);
    this.fade(this.blasts, dt);
    this.fade(this.feed, dt);
    if (this.t >= this.duration) this.finish();
    RNG.cur = RNG.free;
  }

  fade(list, dt) {
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.life -= dt;
      if (e.life > 0) list[j++] = e;
    }
    list.length = j;
  }

  spawn(ag) {
    let best = null, bestD = -1;
    for (let k = 0; k < 40; k++) {
      const x = U.rr(40, World.W - 40), y = U.rr(40, World.H - 40);
      if (!World.free(this.walls, x, y, SIM.radius + 6)) continue;
      let md = 1e9;
      for (const o of this.agents) if (o !== ag && o.alive) md = Math.min(md, Math.hypot(o.x - x, o.y - y));
      for (const f of this.fires) if (Math.hypot(f.x - x, f.y - y) < f.r + 30) md = -1;
      if (md > bestD) { bestD = md; best = [x, y]; }
    }
    if (!best) best = [60, 60];
    ag.x = best[0];
    ag.y = best[1];
    ag.a = U.rr(-Math.PI, Math.PI);
    ag.alive = true;
    ag.hp = SIM.maxHp;
    ag.load = this.learners[ag.id].pickLoadout();
    ag.slot = 0;
    ag.ammo[0] = WEAPONS.main[ag.load.main].mag;
    ag.ammo[1] = WEAPONS.alt[ag.load.alt].mag;
    ag.reload = 0;
    ag.fireCd = 0.4;
    ag.switchCd = 0;
    ag.utilLeft = WEAPONS.util[ag.load.util].count;
    ag.utilCd = 1;
    ag.heal = 0;
    ag.hurt = 0;
    ag.mem[0] = ag.mem[1] = 0;
    ag.thought = false;
    this.startSeg(ag);
  }

  startSeg(ag) {
    const pick = this.learners[ag.id].nextBrain();
    ag.brain = pick.net;
    ag.chall = pick.chall;
    ag.seg = { time: 0, raw: REWARD.blank(), shots: 0, hits: 0, seen: 0, cells: new Set(), prevTarget: -1, prevErr: 0 };
  }

  endSeg(ag, died) {
    const s = ag.seg;
    if (!s) return;
    ag.seg = null;
    if (s.time < 3 && !died) return;
    const L = this.learners[ag.id];
    s.raw.death = died ? 1 : 0;
    s.raw.accuracy = s.shots >= 6 ? s.hits / s.shots : 0;
    const r = REWARD.score(s.raw, REWARD.coach(L.updates || 0), ag.pts);
    L.report(r, ag.chall, ag.load);
  }

  sense(ag) {
    const inp = ag.inp, R = SIM.rayLen;
    let k = 0, inFire = false;
    for (const f of this.fires) if (Math.hypot(f.x - ag.x, f.y - ag.y) < f.r) inFire = true;
    for (let r = 0; r < SIM.rays.length; r++) {
      const ang = ag.a + SIM.rays[r], dx = Math.cos(ang), dy = Math.sin(ang);
      const wd = Geo.castWalls(this.walls, ag.x, ag.y, dx, dy, R);
      let ed = Infinity, hd = Infinity;
      for (const o of this.agents) {
        if (o === ag || !o.alive) continue;
        const t = Geo.rayCircle(ag.x, ag.y, dx, dy, o.x, o.y, SIM.radius + Math.hypot(o.x - ag.x, o.y - ag.y) * 0.06);
        if (t < ed) ed = t;
      }
      for (const f of this.fires) {
        const t = Geo.rayCircle(ag.x, ag.y, dx, dy, f.x, f.y, f.r);
        if (t < hd) hd = t;
      }
      for (const n of this.nades) {
        if (n.type !== 'grenade') continue;
        const t = Geo.rayCircle(ag.x, ag.y, dx, dy, n.x, n.y, 50);
        if (t < hd) hd = t;
      }
      const enemy = ed < wd;
      inp[k++] = 1 - wd / R;
      inp[k++] = enemy ? 1 - 0.8 * ed / R : 0;
      inp[k++] = inFire ? 1 : hd < wd ? 1 - hd / R : 0;
      ag.rayD[r] = enemy ? ed : wd;
      ag.rayE[r] = enemy ? 1 : 0;
    }
    const w = this.weapon(ag), u = WEAPONS.util[ag.load.util];
    inp[k++] = ag.hp / SIM.maxHp * 2 - 1;
    inp[k++] = ag.ammo[ag.slot] / w.mag * 2 - 1;
    inp[k++] = ag.slot ? 1 : -1;
    inp[k++] = ag.reload > 0 ? 1 : -1;
    inp[k++] = ag.utilLeft / u.count * 2 - 1;
    inp[k++] = ag.utilCd <= 0 && ag.utilLeft > 0 ? 1 : -1;
    inp[k++] = ag.hurt > 0 ? 1 : -1;
    inp[k++] = ag.heal > 0 ? 1 : -1;
    inp[k++] = ag.spd / SIM.speed;
    for (let i = 0; i < 3; i++) inp[k++] = ag.load.main === i ? 1 : 0;
    for (let i = 0; i < 3; i++) inp[k++] = ag.load.alt === i ? 1 : 0;
    for (let i = 0; i < 3; i++) inp[k++] = ag.load.util === i ? 1 : 0;
    inp[k++] = ag.mem[0];
    inp[k++] = ag.mem[1];

    let best = null, bd = Infinity, be = 0;
    for (const o of this.agents) {
      if (o === ag || !o.alive) continue;
      const dx = o.x - ag.x, dy = o.y - ag.y, d = Math.hypot(dx, dy);
      if (d > R || d < 1) continue;
      const err = U.wrap(Math.atan2(dy, dx) - ag.a);
      if (Math.abs(err) > SIM.fov) continue;
      if (Geo.castWalls(this.walls, ag.x, ag.y, dx / d, dy / d, d) < d - SIM.radius) continue;
      if (d < bd) { bd = d; best = o; be = err; }
    }
    inp[k++] = best ? 1 : -1;
    inp[k++] = best ? be / SIM.fov : 0;
    inp[k++] = best ? 1 - bd / R : 0;
    inp[k++] = best ? best.hp / SIM.maxHp : 0;
    inp[k++] = best ? U.clamp(be / 0.08, -1, 1) : 0;
    let onTarget = false;
    const cx = Math.cos(ag.a), cy = Math.sin(ag.a), cw = Geo.castWalls(this.walls, ag.x, ag.y, cx, cy, w.range);
    let crossId = -1, crossD = cw;
    for (const o of this.agents) {
      if (o === ag || !o.alive) continue;
      const t = Geo.rayCircle(ag.x, ag.y, cx, cy, o.x, o.y, SIM.radius);
      if (t < crossD) { crossD = t; crossId = o.id; onTarget = true; }
    }
    inp[k++] = onTarget ? 1 : -1;
    ag.onTarget = onTarget;
    ag.crossId = crossId;
    ag.target = best ? best.id : -1;
    ag.aimErr = be;
    const s = ag.seg;
    if (s) {
      const dt = SIM.dt * SIM.think;
      if (best) {
        s.raw.view += dt;
        if (!(s.seen & (1 << best.id))) { s.seen |= 1 << best.id; s.raw.spot++; }
        if (s.prevTarget === best.id) s.raw.aimGain += Math.abs(s.prevErr) - Math.abs(be);
      }
      s.prevTarget = best ? best.id : -1;
      s.prevErr = be;
      if (onTarget) s.raw.onTarget += dt;
      for (const o of this.agents) {
        if (o !== ag && o.alive && o.crossId === ag.id) { s.raw.exposed += dt; break; }
      }
      const cell = Math.floor(ag.x / 100) * 20 + Math.floor(ag.y / 100);
      if (!s.cells.has(cell) && s.cells.size < REWARD.exploreCap) { s.cells.add(cell); s.raw.explore++; }
    }
  }

  act(ag, dt) {
    const o = ag.out;
    let slow = this.weapon(ag).slow || 1;
    if (ag.heal > 0) slow *= 0.55;
    ag.a = U.wrap(ag.a + o[2] * SIM.turn * dt);
    const c = Math.cos(ag.a), s = Math.sin(ag.a);
    let mx = c * o[0] - s * o[1] * 0.8, my = s * o[0] + c * o[1] * 0.8;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const px = ag.x, py = ag.y;
    ag.x += mx * SIM.speed * slow * dt;
    ag.y += my * SIM.speed * slow * dt;
    for (const q of this.agents) {
      if (q === ag || !q.alive) continue;
      const dx = ag.x - q.x, dy = ag.y - q.y, d = Math.hypot(dx, dy), min = SIM.radius * 2;
      if (d < min && d > 0.01) { const p = (min - d) / d; ag.x += dx * p; ag.y += dy * p; }
    }
    for (const b of this.walls) Geo.pushOut(ag, SIM.radius, b);
    const moved = Math.hypot(ag.x - px, ag.y - py);
    ag.spd = moved / dt;
    if (ag.seg && Math.hypot(o[0], o[1]) > 0.5 && ag.spd < SIM.speed * slow * 0.2) ag.seg.raw.stuck += dt;

    ag.fireCd -= dt; ag.switchCd -= dt; ag.utilCd -= dt; ag.hurt -= dt; ag.flash -= dt;
    if (ag.reload > 0) {
      ag.reload -= dt;
      if (ag.reload <= 0) { ag.reload = 0; ag.ammo[ag.slot] = this.weapon(ag).mag; }
    }
    if (ag.heal > 0) {
      ag.heal -= dt;
      const before = ag.hp;
      ag.hp = Math.min(SIM.maxHp, ag.hp + WEAPONS.util[1].rate * dt);
      if (ag.seg) ag.seg.raw.healed += ag.hp - before;
    }
    const busy = ag.heal > 0;
    if (o[4] > 0.6 && ag.switchCd <= 0 && !busy) {
      ag.slot ^= 1;
      ag.switchCd = 0.7;
      ag.reload = 0;
      ag.fireCd = Math.max(ag.fireCd, 0.3);
    }
    const w = this.weapon(ag);
    if (!busy && ag.reload <= 0) {
      if (ag.ammo[ag.slot] <= 0) ag.reload = w.reload;
      else if (o[3] > 0 && ag.fireCd <= 0) this.shoot(ag, w);
    }
    if (o[5] > 0.5 && ag.utilCd <= 0 && ag.utilLeft > 0 && !busy) this.useUtil(ag, o[6]);
    ag.mem[0] = o[7];
    ag.mem[1] = o[8];
  }

  shoot(ag, w) {
    ag.ammo[ag.slot]--;
    ag.fireCd = w.cd;
    ag.flash = 0.05;
    if (ag.seg) {
      if (ag.onTarget) ag.seg.raw.goodShot++;
      else if (ag.target >= 0) ag.seg.raw.looseShot++;
      else ag.seg.raw.blindShot++;
    }
    const spr = w.spread * (1 + ag.spd / SIM.speed * 0.9);
    for (let p = 0; p < w.pellets; p++) {
      const ang = ag.a + (U.rand() * 2 - 1) * spr, dx = Math.cos(ang), dy = Math.sin(ang);
      let end = Geo.castWalls(this.walls, ag.x, ag.y, dx, dy, w.range), hit = null;
      for (const q of this.agents) {
        if (q === ag || !q.alive) continue;
        const t = Geo.rayCircle(ag.x, ag.y, dx, dy, q.x, q.y, SIM.radius);
        if (t < end) { end = t; hit = q; }
      }
      ag.shots++;
      if (ag.seg) ag.seg.shots++;
      if (hit) {
        ag.hits++;
        if (ag.seg) { ag.seg.hits++; ag.seg.raw.hit++; }
        const f = w.falloff ? 1 - w.falloff * end / w.range : 1;
        this.damage(hit, w.dmg * f, ag, w.name);
      }
      if (this.tracers.length < 300) {
        this.tracers.push({ x1: ag.x + dx * 14, y1: ag.y + dy * 14, x2: ag.x + dx * end, y2: ag.y + dy * end, life: 0.09, max: 0.09, id: ag.id, heavy: w.dmg > 30 });
      }
    }
  }

  useUtil(ag, power) {
    const u = WEAPONS.util[ag.load.util];
    ag.utilLeft--;
    ag.utilCd = u.cd;
    if (u.id === 'medkit') {
      if (ag.hp >= SIM.maxHp - 5 && ag.seg) ag.seg.raw.healWaste++;
      ag.heal = u.time;
      return;
    }
    const sp = u.minSpeed + (power + 1) * 0.5 * (u.maxSpeed - u.minSpeed);
    const c = Math.cos(ag.a), s = Math.sin(ag.a);
    this.nades.push({
      type: u.id, x: ag.x + c * 16, y: ag.y + s * 16, vx: c * sp, vy: s * sp,
      t: 0, fuse: u.fuse + U.rr(-u.fuseJitter, u.fuseJitter), owner: ag, dmg: 0
    });
  }

  updateNades(dt) {
    const drag = Math.pow(0.3, dt);
    let j = 0;
    for (let i = 0; i < this.nades.length; i++) {
      const n = this.nades[i];
      n.t += dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.vx *= drag;
      n.vy *= drag;
      let done = false;
      for (const b of this.walls) {
        const h = Geo.pushOut(n, 4, b);
        if (!h) continue;
        if (n.type === 'molotov') { done = true; break; }
        const d = n.vx * h.nx + n.vy * h.ny;
        if (d < 0) { n.vx -= 1.55 * d * h.nx; n.vy -= 1.55 * d * h.ny; }
      }
      if (!done && n.type === 'molotov') {
        for (const q of this.agents) {
          if (!q.alive || (q === n.owner && n.t < 0.3)) continue;
          if (Math.hypot(q.x - n.x, q.y - n.y) < SIM.radius + 4) { done = true; break; }
        }
      }
      if (done || n.t >= n.fuse) {
        if (n.type === 'grenade') this.explode(n); else this.ignite(n);
        continue;
      }
      this.nades[j++] = n;
    }
    this.nades.length = j;
  }

  explode(n) {
    const u = WEAPONS.util[0];
    this.blasts.push({ x: n.x, y: n.y, r: u.blast, life: 0.4, max: 0.4 });
    for (const q of this.agents) {
      if (!q.alive) continue;
      const dx = q.x - n.x, dy = q.y - n.y, d = Math.hypot(dx, dy);
      if (d > u.blast) continue;
      if (d > 1 && Geo.castWalls(this.walls, n.x, n.y, dx / d, dy / d, d) < d - SIM.radius) continue;
      this.damage(q, u.blastDmg * (1 - d / u.blast), n.owner, 'Grenade', n);
    }
    this.checks.push({ t: 0.8, via: n });
    const count = u.fragMin + U.ri(u.fragMax - u.fragMin + 1);
    const slice = Math.PI * 2 / count, base = U.rand() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const ang = base + i * slice + (U.rand() - 0.5) * slice * 1.6;
      this.frags.push({
        x: n.x, y: n.y, px: n.x, py: n.y, dx: Math.cos(ang), dy: Math.sin(ang),
        v: U.rr(450, 850), left: U.rr(u.fragRange[0], u.fragRange[1]),
        dmg: U.rr(u.fragDmg[0], u.fragDmg[1]), owner: n.owner, via: n
      });
    }
  }

  updateFrags(dt) {
    let j = 0;
    for (let i = 0; i < this.frags.length; i++) {
      const f = this.frags[i];
      const len = Math.min(f.v * dt, f.left);
      let end = Geo.castWalls(this.walls, f.x, f.y, f.dx, f.dy, len), hit = null;
      const stop = end < len;
      for (const q of this.agents) {
        if (!q.alive) continue;
        const t = Geo.rayCircle(f.x, f.y, f.dx, f.dy, q.x, q.y, SIM.radius);
        if (t < end) { end = t; hit = q; }
      }
      f.px = f.x; f.py = f.y;
      f.x += f.dx * end; f.y += f.dy * end;
      f.left -= end;
      if (hit) { this.damage(hit, f.dmg, f.owner, 'Grenade', f.via); continue; }
      if (stop || f.left <= 0.5) continue;
      this.frags[j++] = f;
    }
    this.frags.length = j;
  }

  ignite(n) {
    const u = WEAPONS.util[2], t = U.rr(u.burn[0], u.burn[1]);
    this.fires.push({ x: n.x, y: n.y, r: U.rr(u.radius[0], u.radius[1]), t, max: t, owner: n.owner, dmg: 0 });
  }

  updateFires(dt) {
    const dps = WEAPONS.util[2].dps;
    let j = 0;
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i];
      f.t -= dt;
      for (const q of this.agents) {
        if (q.alive && Math.hypot(q.x - f.x, q.y - f.y) < f.r + SIM.radius * 0.5) this.damage(q, dps * dt, f.owner, 'Molotov', f);
      }
      if (f.t > 0) this.fires[j++] = f;
      else this.wasted(f);
    }
    this.fires.length = j;
    let c = 0;
    for (let i = 0; i < this.checks.length; i++) {
      const e = this.checks[i];
      e.t -= dt;
      if (e.t > 0) this.checks[c++] = e; else this.wasted(e.via);
    }
    this.checks.length = c;
  }

  wasted(via) {
    if (via.dmg <= 0 && via.owner.seg) via.owner.seg.raw.wastedUtil++;
  }

  damage(t, amt, src, cause, via) {
    if (!t.alive || amt <= 0) return;
    amt = Math.min(amt, t.hp);
    t.hp -= amt;
    t.hurt = 0.6;
    if (t.seg) t.seg.raw.taken += amt;
    if (src && src !== t) {
      src.dmg += amt;
      if (src.seg) src.seg.raw.dmg += amt;
      if (via) via.dmg += amt;
      t.lastHitBy[src.id] = this.t;
    } else if (src === t && t.seg) {
      t.seg.raw.self += amt;
    }
    if (t.hp <= 1e-4) this.kill(t, src, cause);
  }

  kill(t, src, cause) {
    t.alive = false;
    t.hp = 0;
    t.heal = 0;
    t.respawn = SIM.respawn;
    t.deaths++;
    if (src && src !== t) {
      src.kills++;
      if (src.seg) src.seg.raw.kill++;
    }
    for (const id in t.lastHitBy) {
      const helper = this.agents[id];
      if (helper !== src && helper !== t && this.t - t.lastHitBy[id] <= REWARD.assistWindow && helper.seg) helper.seg.raw.assist++;
    }
    t.lastHitBy = {};
    this.feed.push({ k: src ? src.id : -1, v: t.id, cause, life: 6 });
    if (this.feed.length > 8) this.feed.shift();
    this.endSeg(t, true);
  }

  finish() {
    if (this.over) return;
    for (const ag of this.agents) if (ag.alive) this.endSeg(ag, false);
    this.over = true;
    const order = this.agents.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.dmg - a.dmg);
    this.winner = order[0].id;
    this.learners.forEach((L, i) => L.gameOver(this.agents[i], i === this.winner));
  }
}
