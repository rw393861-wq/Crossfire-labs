const $ = s => document.querySelector(s);
const SPEEDS = [1, 2, 4, 16, 64, 'max'];
const REP_SPEEDS = [1, 2, 4, 16];

const App = {
  learners: [],
  game: null,
  games: 0,
  settings: { duration: 600, rays: true, speed: 1 },
  mode: 'train',
  rep: null,
  pending: null,
  chart: 'r',
  paused: false,
  inMenu: true,
  acc: 0,
  last: 0,
  banner: 0,
  uiT: 0,
  saveT: 0,
  repT: 0,
  spsT: 0,
  steps: 0,
  sps: 0,
  source: 'fresh',
  cards: []
};

let renderer;

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const span = s => s < 60 ? plural(Math.round(s), 'second') : plural(Math.round(s / 60), 'minute');
const pct = (h, s) => s ? (h / s * 100).toFixed(1) + '%' : 'no shots';

function applyData(data) {
  App.learners = [0, 1, 2].map(i => new Learner(i, data && data.learners[i]));
  App.games = data && data.games ? data.games : 0;
  if (data && data.settings) Object.assign(App.settings, data.settings);
  if (!SPEEDS.includes(App.settings.speed)) App.settings.speed = 1;
}

function newGame() {
  const seed = RNG.seed();
  App.pending = { seed, snap: App.learners.map(l => l.snapshot()) };
  App.game = new Game(App.learners, App.settings.duration, seed);
  App.acc = 0;
  hideBanner();
}

function save() {
  return Store.save(App);
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function speedButtons(wrap, list, onPick) {
  wrap.innerHTML = '';
  list.forEach((sp, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = sp === 'max' ? 'Max' : sp + 'x';
    b.addEventListener('click', () => onPick(sp));
    wrap.appendChild(b);
  });
}

function markButtons(wrap, list, val) {
  [...wrap.children].forEach((b, i) => b.setAttribute('aria-pressed', list[i] === val));
}

function setSpeed(sp) {
  App.settings.speed = sp;
  App.acc = 0;
  markButtons($('#speeds'), SPEEDS, sp);
}

function buildCards() {
  const wrap = $('#cards');
  wrap.innerHTML = '';
  App.cards = App.learners.map(L => {
    const el = document.createElement('section');
    el.className = 'card';
    el.style.setProperty('--ai', L.color);
    const prefs = ['main', 'alt', 'util'].map(k =>
      `<div class="pref" data-k="${k}"><span class="pk">${SLOT_NAMES[k]}</span>` +
      WEAPONS[k].map(w => `<span class="opt"><b>${w.name}</b><em><i></i></em></span>`).join('') + '</div>'
    ).join('');
    el.innerHTML =
      `<header><h2>${L.name}</h2><span class="brain"></span></header>` +
      `<div class="live"><span class="score"></span><span class="hp"><i></i></span><span class="gun"></span></div>` +
      `<dl class="stats">` +
      `<div><dt>Lifetime K/D</dt><dd class="kd"></dd></div>` +
      `<div><dt>Wins</dt><dd class="wins"></dd></div>` +
      `<div><dt>Aim this game</dt><dd class="acc"></dd></div>` +
      `<div><dt>Aim, last 20</dt><dd class="acc20"></dd></div>` +
      `<div><dt>Brain updates</dt><dd class="gen"></dd></div>` +
      `<div><dt>Batch</dt><dd class="batch"></dd></div>` +
      `<div><dt>Coaching</dt><dd class="coach"></dd></div>` +
      `<div><dt>Points this game</dt><dd class="total"></dd></div>` +
      `</dl><div class="prefs">${prefs}</div>` +
      `<details class="why"><summary>Where the points came from</summary><ol class="pts"></ol></details>`;
    wrap.appendChild(el);
    const opts = {};
    el.querySelectorAll('.pref').forEach(p => { opts[p.dataset.k] = [...p.querySelectorAll('.opt')]; });
    const q = s => el.querySelector(s);
    return {
      brain: q('.brain'), score: q('.score'), hp: q('.hp i'), gun: q('.gun'), kd: q('.kd'), wins: q('.wins'),
      acc: q('.acc'), acc20: q('.acc20'), gen: q('.gen'), batch: q('.batch'),
      coach: q('.coach'), total: q('.total'), why: q('.why'), pts: q('.pts'), opts
    };
  });
}

function viewGame() {
  return App.mode === 'replay' ? App.rep.game : App.game;
}

function updateUI() {
  const G = viewGame(), replay = App.mode === 'replay';
  $('#gameNo').textContent = 'Game ' + (replay ? App.rep.rec.game : App.games + 1);
  $('#mapName').textContent = G.map.name;
  $('#clock').textContent = replay ? '' : fmtTime(G.duration - G.t) + ' left';
  $('#sps').textContent = !replay && App.sps ? Math.round(App.sps / 60) + ' sim s per s' : '';
  $('#pauseBtn').textContent = App.paused ? 'Resume' : 'Pause';
  if (replay) {
    $('#repTime').textContent = `${fmtTime(G.t)} / ${fmtTime(G.duration)}`;
    if (!App.rep.dragging) $('#repSeek').value = Math.floor(G.t);
    $('#repPlay').textContent = App.rep.playing ? 'Pause' : G.over ? 'Replay again' : 'Play';
  }

  G.learners.forEach((L, i) => {
    const a = G.agents[i], c = App.cards[i];
    c.brain.textContent = a.alive ? `Variant ${a.chall + 1} of ${L.batchSize}` : 'Respawning';
    c.score.textContent = `${a.kills} K  ${a.deaths} D`;
    c.hp.style.width = (a.alive ? a.hp / SIM.maxHp * 100 : 0) + '%';
    if (a.alive) {
      const w = G.weapon(a), u = WEAPONS.util[a.load.util];
      c.gun.textContent = `${w.name} ${a.reload > 0 ? 'reloading' : a.ammo[a.slot] + '/' + w.mag}, ${u.name} x${a.utilLeft}${a.heal > 0 ? ', healing' : ''}`;
    } else {
      c.gun.textContent = 'Down';
    }
    c.kd.textContent = `${L.totals.kills + a.kills}/${L.totals.deaths + a.deaths}`;
    c.wins.textContent = `${L.totals.wins} of ${L.totals.games}`;
    c.acc.textContent = pct(a.hits, a.shots);
    const r20 = L.recentAcc(20);
    c.acc20.textContent = replay ? 'live only' : r20 === null ? 'none yet' : (r20 * 100).toFixed(1) + '%';
    c.gen.textContent = L.updates;
    c.batch.textContent = `${L.filled()} of ${L.batchSize} lives`;
    c.coach.textContent = Math.round(REWARD.coach(L.updates) * 100) + '%';
    const entries = Object.entries(a.pts).filter(e => Math.abs(e[1]) >= 0.5).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    c.total.textContent = Math.round(entries.reduce((sum, e) => sum + e[1], 0));
    if (c.why.open) {
      c.pts.innerHTML = entries.length
        ? entries.slice(0, 8).map(([k, v]) => `<li class="${v < 0 ? 'neg' : 'pos'}"><span>${REWARD.labels[k]}</span><b>${v > 0 ? '+' : ''}${Math.round(v)}</b></li>`).join('')
        : '<li><span>Nothing scored yet this game.</span></li>';
    }
    for (const slot of ['main', 'alt', 'util']) {
      const p = L.probs(slot);
      c.opts[slot].forEach((el, j) => {
        el.querySelector('i').style.width = Math.round(p[j] * 100) + '%';
        el.classList.toggle('on', a.alive && a.load[slot] === j);
        el.title = `${WEAPONS[slot][j].name}: picked ${Math.round(p[j] * 100)}% of the time`;
      });
    }
  });

  $('#feed').innerHTML = G.feed.slice(-5).map(f => {
    const v = G.learners[f.v];
    const vs = `<b style="color:${v.color}">${v.name}</b>`;
    if (f.k === f.v || f.k < 0) return `<li>${vs} fell to own ${f.cause}</li>`;
    const k = G.learners[f.k];
    return `<li><b style="color:${k.color}">${k.name}</b> downed ${vs} with ${f.cause}</li>`;
  }).join('');
}

function refreshChart() {
  const a = App.chart === 'a';
  $('#chartTitle').textContent = a ? 'Aim per game' : 'Reward per game';
  $('#chartHint').textContent = a
    ? 'Hits divided by shots, smoothed over 10 games. Shotgun pellets count as separate shots.'
    : 'Average score per life, smoothed over 10 games. Early games are noisy.';
  $('#chartR').setAttribute('aria-pressed', !a);
  $('#chartA').setAttribute('aria-pressed', a);
  drawChart($('#chart'), App.learners, App.chart);
}

function menuInfo() {
  const u = App.learners.reduce((s, L) => s + L.updates, 0);
  const src = App.source === 'bundled' ? 'Loaded from the brains file shipped with this site. ' : '';
  $('#saveInfo').textContent = App.games
    ? `${src}${App.games} games trained so far, ${u} brain updates across all three fighters.`
    : 'No training yet. The fighters start with random brains.';
  $('#lenSel').value = String(App.settings.duration);
}

function openMenu() {
  if (App.mode === 'replay') exitReplay();
  App.inMenu = true;
  menuInfo();
  $('#menuMsg').textContent = '';
  $('#library').hidden = true;
  $('#menu').hidden = false;
  $('#startBtn').focus();
}

function closeMenu() {
  App.inMenu = false;
  $('#menu').hidden = true;
  $('#library').hidden = true;
  App.acc = 0;
}

function showBanner(text, sub, color) {
  const b = $('#banner');
  b.innerHTML = '';
  b.append(text);
  const s = document.createElement('small');
  s.textContent = sub;
  b.appendChild(s);
  b.style.setProperty('--win', color);
  b.hidden = false;
}

function hideBanner() {
  $('#banner').hidden = true;
  App.banner = 0;
}

function recordGame(G) {
  const totalK = G.agents.reduce((s, a) => s + a.kills, 0), totalD = G.agents.reduce((s, a) => s + a.dmg, 0);
  Replays.add({
    game: App.games, when: Date.now(), seed: G.seed, duration: G.duration, map: G.map.name,
    winner: G.winner, kills: G.agents.map(a => a.kills), deaths: G.agents.map(a => a.deaths),
    shots: G.agents.map(a => a.shots), hits: G.agents.map(a => a.hits),
    score: Math.round(totalK * 10 + totalD / 10), snap: App.pending.snap
  });
}

function onGameOver() {
  const G = App.game, W = App.learners[G.winner], a = G.agents[G.winner];
  App.games++;
  recordGame(G);
  save();
  refreshChart();
  const sp = App.inMenu ? 1 : App.settings.speed;
  if (sp !== 'max' && sp <= 4) {
    const scores = G.agents.map((x, i) => `${App.learners[i].name} ${x.kills}`).join(', ');
    showBanner(`${W.name} wins game ${App.games}`, `${plural(a.kills, 'kill')}, ${plural(a.deaths, 'death')}, ${pct(a.hits, a.shots)} aim. Final kills: ${scores}. Next game starts shortly.`, W.color);
    App.banner = 5;
  } else {
    newGame();
  }
}

function buildReplay(rec) {
  return new Game(rec.snap.map((s, i) => Learner.fromSnapshot(i, s)), rec.duration, rec.seed);
}

function openReplay(rec) {
  App.mode = 'replay';
  App.rep = { rec, game: buildReplay(rec), playing: true, speed: 1, acc: 0, dragging: false };
  closeMenu();
  hideBanner();
  $('#trainCtl').hidden = true;
  $('#repCtl').hidden = false;
  $('#modeTag').hidden = false;
  $('#repSeek').max = Math.floor(rec.duration);
  $('#repSeek').value = 0;
  $('#raysBtn2').setAttribute('aria-pressed', App.settings.rays);
  markButtons($('#repSpeeds'), REP_SPEEDS, 1);
  updateUI();
}

function exitReplay() {
  if (App.mode !== 'replay') return;
  App.mode = 'train';
  App.rep = null;
  hideBanner();
  $('#trainCtl').hidden = false;
  $('#repCtl').hidden = true;
  $('#modeTag').hidden = true;
  App.acc = 0;
  App.last = 0;
}

function seekReplay(t) {
  const R = App.rep;
  if (t < R.game.t) R.game = buildReplay(R.rec);
  let guard = 0;
  while (R.game.t < t && !R.game.over && guard++ < 400000) R.game.step();
  R.acc = 0;
  hideBanner();
  if (R.game.over) finishReplay();
  updateUI();
}

function finishReplay() {
  const R = App.rep, G = R.game;
  R.playing = false;
  const match = G.agents.every((a, i) => a.kills === R.rec.kills[i] && a.hits === R.rec.hits[i]);
  const W = G.learners[G.winner];
  showBanner('Replay finished',
    `${W.name} won with ${plural(G.agents[G.winner].kills, 'kill')}.` +
    (match ? '' : ' This replay drifted from the original game, most likely because the code changed after it was recorded.'),
    W.color);
}

function stepReplay(el) {
  const R = App.rep;
  if (!R.playing || R.game.over) return;
  R.acc += el * R.speed;
  let n = 0;
  while (R.acc >= SIM.dt && !R.game.over) {
    R.game.step();
    R.acc -= SIM.dt;
    if (++n > 3000) { R.acc = 0; break; }
  }
  if (R.game.over) finishReplay();
}

function stepTraining(el) {
  if (App.paused) return;
  if (App.banner > 0) {
    App.banner -= el;
    if (App.banner <= 0) newGame();
    return;
  }
  const sp = App.inMenu ? 1 : App.settings.speed, G = App.game;
  let n = 0;
  if (sp === 'max') {
    const end = performance.now() + 13;
    while (performance.now() < end && !G.over) {
      for (let i = 0; i < 40 && !G.over; i++) { G.step(); n++; }
    }
  } else {
    App.acc += el * sp;
    while (App.acc >= SIM.dt && !G.over) {
      G.step();
      App.acc -= SIM.dt;
      if (++n > 6000) { App.acc = 0; break; }
    }
  }
  App.steps += n;
  if (G.over) onGameOver();
}

function frame(ts) {
  const el = Math.min(0.1, (ts - (App.last || ts)) / 1000);
  App.last = ts;
  if (App.mode === 'replay') stepReplay(el); else stepTraining(el);
  if (ts - App.spsT > 1000) {
    App.sps = App.steps * 1000 / (ts - App.spsT || 1);
    App.steps = 0;
    App.spsT = ts;
  }
  renderer.draw(viewGame(), { rays: App.settings.rays });
  if (ts - App.uiT > 250) { App.uiT = ts; updateUI(); }
  if (ts - App.saveT > 30000) { App.saveT = ts; save(); }
  if (ts - App.repT > 10000) { App.repT = ts; Replays.flush(); }
  requestAnimationFrame(frame);
}

function restart(data, msg) {
  exitReplay();
  applyData(data);
  buildCards();
  newGame();
  save();
  refreshChart();
  menuInfo();
  $('#menuMsg').textContent = msg;
}

function openLibrary() {
  Replays.flush();
  const list = $('#libList');
  const items = Replays.list();
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<li class="empty">Finished games show up here. Watch or train at least one full game first.</li>';
  }
  for (const { rec, latest } of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rep-item';
    const W = AI_ROSTER[rec.winner], total = rec.kills.reduce((s, k) => s + k, 0);
    const kills = rec.kills.map((k, i) =>
      `<span><b style="color:${AI_ROSTER[i].color}">${AI_ROSTER[i].name}</b> ${plural(k, 'kill')}, ${pct(rec.hits[i], rec.shots[i])} aim</span>`).join('');
    b.innerHTML =
      `<span class="rt">Game ${rec.game} on ${rec.map}</span><span class="rtag">${latest ? 'Latest game' : 'Score ' + rec.score}</span>` +
      `<span class="rs">${W.name} won. ${plural(total, 'kill')} in ${span(rec.duration)}.</span>` +
      `<span class="rk">${kills}</span>`;
    b.addEventListener('click', () => openReplay(rec));
    li.appendChild(b);
    list.appendChild(li);
  }
  $('#menu').hidden = true;
  $('#library').hidden = false;
  $('#libBack').focus();
}

function toggleRays() {
  App.settings.rays = !App.settings.rays;
  $('#raysBtn').setAttribute('aria-pressed', App.settings.rays);
  $('#raysBtn2').setAttribute('aria-pressed', App.settings.rays);
}

function wire() {
  speedButtons($('#speeds'), SPEEDS, setSpeed);
  markButtons($('#speeds'), SPEEDS, App.settings.speed);
  speedButtons($('#repSpeeds'), REP_SPEEDS, sp => {
    App.rep.speed = sp;
    markButtons($('#repSpeeds'), REP_SPEEDS, sp);
  });

  $('#startBtn').addEventListener('click', closeMenu);
  $('#menuBtn').addEventListener('click', openMenu);
  $('#pauseBtn').addEventListener('click', () => { App.paused = !App.paused; updateUI(); });
  $('#raysBtn').addEventListener('click', toggleRays);
  $('#raysBtn2').addEventListener('click', toggleRays);
  $('#raysBtn').setAttribute('aria-pressed', App.settings.rays);
  $('#saveBtn').addEventListener('click', e => {
    const ok = save();
    Replays.flush();
    e.currentTarget.textContent = ok ? 'Saved' : 'Save failed';
    setTimeout(() => { $('#saveBtn').textContent = 'Save'; }, 1400);
  });
  $('#chartR').addEventListener('click', () => { App.chart = 'r'; refreshChart(); });
  $('#chartA').addEventListener('click', () => { App.chart = 'a'; refreshChart(); });

  $('#libBtn').addEventListener('click', openLibrary);
  $('#libBack').addEventListener('click', openMenu);
  $('#repExit').addEventListener('click', exitReplay);
  $('#repPlay').addEventListener('click', () => {
    const R = App.rep;
    if (R.game.over) { seekReplay(0); R.playing = true; }
    else R.playing = !R.playing;
    updateUI();
  });
  const seek = $('#repSeek');
  seek.addEventListener('input', () => {
    App.rep.dragging = true;
    $('#repTime').textContent = `${fmtTime(+seek.value)} / ${fmtTime(App.rep.game.duration)}`;
  });
  seek.addEventListener('change', () => {
    App.rep.dragging = false;
    $('#repTime').textContent = 'Seeking';
    setTimeout(() => seekReplay(+seek.value), 20);
  });

  $('#lenSel').addEventListener('change', e => {
    App.settings.duration = +e.target.value;
    App.game.duration = Math.max(App.game.t + 5, App.settings.duration);
    save();
  });
  $('#exportBtn').addEventListener('click', () => {
    save();
    Store.download(App);
    $('#menuMsg').textContent = 'Exported brains.json.';
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Store.valid(data)) throw new Error('bad');
      App.source = 'import';
      restart(data, `Imported ${f.name}.`);
    } catch (err) {
      $('#menuMsg').textContent = 'That file is not a Crossfire Lab brains export. Choose a brains.json made with Export brains.';
    }
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Erase all three brains, their stats and saved replays? Export first if you want a copy.')) return;
    Store.clear();
    Replays.clear();
    App.source = 'fresh';
    restart(null, 'All three fighters now have fresh random brains.');
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (App.mode === 'replay') {
      if (e.key === 'Escape') exitReplay();
      else if (e.key === ' ') { e.preventDefault(); $('#repPlay').click(); }
      else if (e.key === 'r' || e.key === 'R') toggleRays();
      return;
    }
    if (e.key === 'Escape') {
      if (!$('#library').hidden) openMenu();
      else App.inMenu ? closeMenu() : openMenu();
      return;
    }
    if (App.inMenu) return;
    if (e.key === ' ') { e.preventDefault(); App.paused = !App.paused; updateUI(); }
    else if (e.key === 'r' || e.key === 'R') toggleRays();
    else if (e.key >= '1' && e.key <= '6') setSpeed(SPEEDS[+e.key - 1]);
  });

  const bye = () => { save(); Replays.flush(); };
  window.addEventListener('beforeunload', bye);
  document.addEventListener('visibilitychange', () => { if (document.hidden) bye(); });
  window.addEventListener('resize', refreshChart);
}

const REWARD_UNITS = {
  dmg: 'per HP', kill: 'each', assist: 'each, damaged the victim in the last 4 s', taken: 'per HP', death: 'each',
  self: 'per HP', healed: 'per HP restored', healWaste: 'each, used at full health',
  spot: 'per enemy, first sighting each life', view: 'per second an enemy is visible', aimGain: 'per radian turned onto target (turning away loses it)',
  onTarget: 'per second the crosshair is on an enemy', goodShot: 'per trigger pull on target', looseShot: 'per trigger pull with an enemy visible but off target',
  blindShot: 'per trigger pull with no enemy in view', hit: 'per bullet or pellet that hits', accuracy: 'times hit rate, once 6 or more shots',
  exposed: 'per second in an enemy crosshair', explore: 'per new 100 px square visited, up to 30 per life', stuck: 'per second pushing into a wall',
  wastedUtil: 'per grenade or molotov that hurts no enemy'
};

function buildRewardTable() {
  const row = (k, v) => `<tr><td>${REWARD.labels[k]}<br><small class="dim">${REWARD_UNITS[k]}</small></td><td>${v > 0 ? '+' : ''}${v}</td></tr>`;
  $('#rewardTable').innerHTML =
    '<tr><th colspan="2">Results</th></tr>' + Object.entries(REWARD.outcome).map(([k, v]) => row(k, v)).join('') +
    '<tr><th colspan="2">Coaching</th></tr>' + Object.entries(REWARD.shaping).map(([k, v]) => row(k, v)).join('');
}

async function boot() {
  buildRewardTable();
  renderer = new Renderer($('#arena'));
  let data = Store.load();
  if (Store.valid(data)) {
    App.source = 'local';
  } else {
    data = await Store.bundled();
    App.source = Store.valid(data) ? 'bundled' : 'fresh';
    if (App.source === 'fresh') data = null;
  }
  Replays.load();
  applyData(data);
  buildCards();
  wire();
  newGame();
  refreshChart();
  openMenu();
  requestAnimationFrame(frame);
}

boot();
