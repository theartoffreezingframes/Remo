/* ============================================================================
   95 — GAME SHELL
   State, day/night + weather simulation, input, player systems, NPC/traffic
   AI, Pattern Sight, interaction dispatch and the main loop.
   ============================================================================ */

const S = {
  time: 0, dt: 0, timeScale: 1, playTime: 0,
  dayTime: 8.7,                 // Monday, 08:42
  dayLength: 640,               // seconds for a full in-game day
  nightFactor: 0,
  paused: false, booted: false, cinematic: false,
  identity: 'akshay',
  globalAlert: 0,
  flags: {},
  keys: {}, mouse: { dx: 0, dy: 0, l: false, r: false },
  touch: { sprint: false }, touchMove: [0, 0],
  invertY: false,
  pendingNext: null,
  sliceComplete: false,
  weather: { rain: 0, target: 0, fog: 0, wind: 0.6, flash: 0, bolt: 40, drops: [] },
  wetGrip: 0,
  actors: [], vehicles: [], pursuit: [], traffic: [],
  saveKey: 'doublegame.act1.v1',
};

/* --------------------------------------------------------------- booting */
async function boot() {
  const meta = UI.el.bootMeta, bar = UI.el.bootBar;
  const step = async (pct, label, fn) => {
    meta.textContent = label;
    bar.style.width = pct + '%';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return fn ? fn() : null;
  };
  try {
    await step(6, 'BUILDING PROCEDURAL MATERIALS…', () => initMaterials());
    await step(18, 'STARTING WEBGL2 CONTEXT…', () => { initRenderer($('gl'), 1); resizeRenderer(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1); });
    await step(30, 'GENERATING HYDERABAD…', () => initRendererWorld());
    await step(62, 'PLACING ACTORS & VEHICLES…', () => populate());
    await step(74, 'COMPILING AUDIO SYNTH…', () => { S.audio = new AudioEngine(); });
    await step(84, 'LOADING CAMPAIGN SCRIPT…', () => { S.missions = new MissionManager(); S.cin = new Cinematic(); });
    await step(92, 'CALIBRATING CAMERA RIG…', () => initInput());
    await step(100, 'READY', () => { });

    UI.el.startBtn.disabled = false;
    UI.el.startBtn.textContent = 'Begin Act I';
    meta.textContent = 'RENDERER READY · ' + W.stats.boxes.toLocaleString() + ' GEOMETRY UNITS · ' +
      W.stats.colliders + ' COLLIDERS · ' + W.stats.drawCalls + ' DRAW CALLS';
    UI.el.startBtn.onclick = startGame;
  } catch (err) {
    console.error(err);
    UI.el.bootError.classList.remove('hidden');
    UI.el.bootError.textContent = 'STARTUP FAILED\n\n' + (err && err.message ? err.message : String(err));
    UI.el.startBtn.textContent = 'Unavailable';
    throw err;
  }
}

/** World build needs the GL context, so it runs after initRenderer. */
function initRendererWorld() {
  const stats = buildWorld();
  initParticleBuffer(2600);
  buildWorldMap();
  R.state = {
    camPos: [0, 2, 0], sunDir: [0.4, 0.8, 0.3], sunColor: [1, 1, 1],
    ambTop: [0.3, 0.4, 0.55], ambBot: [0.12, 0.12, 0.14],
    fogColor: [0.6, 0.7, 0.8], fogDensity: 0.0026, time: 0, wet: 0, exposure: 1.0,
    skyTop: [0.16, 0.36, 0.62], skyHorizon: [0.66, 0.78, 0.88], groundColor: [0.16, 0.17, 0.19],
    cloud: 0.35, stars: 0, flash: 0, grade: [1, 1, 1], lights: [],
  };
  R.opaque = []; R.trans = [];
  return stats;
}

/* -------------------------------------------------------------- populate */
function populate() {
  // ---- the player ----
  S.player = new Character({ x: LOC.desk[0], y: 0, z: LOC.desk[2] + 2.6, yaw: PI, name: 'Akshay Varma' });
  S.player.kind = 'player';
  S.player.outfit = OUTFITS.akshay;
  S.player.aimMode = false;
  S.player.patternOn = false;
  S.player.focus = 100;
  S.player.hidden = false;
  S.player.vehicle = null;
  S.player.footPhase = 0;

  S.cam = new Camera();
  S.cam.snapTo([S.player.pos[0], 2.4, S.player.pos[2] + 5.5], PI, -0.1);

  // ---- Keerthy, seated at the terrace ----
  S.keerthy = new Keerthy({ x: LOC.keerthy[0], y: 0, z: LOC.keerthy[2], yaw: PI / 2 });
  S.actors.push(S.keerthy);

  // ---- security guards patrolling the bank ----
  const guardRoutes = [
    [[-30, -20], [-50, -20], [-50, -38], [-30, -38]],
    [[-20, -50], [-34, -50], [-34, -60], [-20, -60]],
    [[-44, -70], [-44, -80], [-44, -96], [-60, -96], [-60, -70]],
    [[-26, -16], [-38, -16]],
  ];
  S.guards = guardRoutes.map((r, i) => {
    const g = new Guard({ x: r[0][0], y: 0, z: r[0][1], yaw: 0, route: r });
    S.actors.push(g);
    return g;
  });

  // ---- pedestrians ----
  const pedSpots = [
    [[6, -30], [34, -30], [34, -6], [6, -6]],
    [[46, 2], [74, 2], [74, 10], [46, 10]],
    [[10, -42], [40, -42], [40, 8], [10, 8]],
    [[0, 18], [40, 18], [40, 26], [0, 26]],
    [[52, -20], [70, -20], [70, -8]],
    [[-6, -20], [4, -20], [4, 4]],
    [[62, 16], [76, 16], [76, 24], [62, 24]],
    [[20, -6], [28, -6], [28, 6], [20, 6]],
    [[-4, -34], [16, -34], [16, -22]],
    [[88, 10], [88, 34], [102, 34]],
    [[-30, 18], [-10, 18], [-10, 30]],
    [[46, -40], [72, -40]],
  ];
  pedSpots.forEach((wp, i) => {
    const p = new Pedestrian({ x: wp[0][0], y: 0, z: wp[0][1], yaw: rnd(TAU), wp, outfit: PED_OUTFITS[i % PED_OUTFITS.length] });
    S.actors.push(p);
  });

  // ---- the getaway car ----
  const hero = new Vehicle({ x: LOC.getaway[0], y: 0.6, z: LOC.getaway[2], yaw: PI, color: '#1f3550' });
  hero.id = 'getaway';
  S.vehicles.push(hero);
  S.heroCar = hero;

  // ---- ambient traffic ----
  const laneCols = ['#7d2f36', '#2f4a6b', '#c9c4b4', '#3b5a44', '#5a5f68', '#8a6a3a', '#404048'];
  for (let i = 0; i < 10; i++) {
    const lane = W.roadLanes[i % W.roadLanes.length];
    const t = lerp(lane.minT + 20, lane.maxT - 20, (i / 10 + 0.13) % 1);
    const x = lane.axis === 'x' ? t : lane.c;
    const z = lane.axis === 'x' ? lane.c : t;
    const yaw = lane.axis === 'x' ? (lane.dir > 0 ? PI / 2 : -PI / 2) : (lane.dir > 0 ? 0 : PI);
    const v = new Vehicle({ x, y: 0.6, z, yaw, color: laneCols[i % laneCols.length] });
    v.ai = { lane, speed: rnd(9, 15), t };
    S.traffic.push(v); S.vehicles.push(v);
  }

  // ---- rain drop pool ----
  for (let i = 0; i < 2200; i++) {
    S.weather.drops.push({ x: 0, y: rnd(-4, 34), z: 0, v: rnd(22, 34), life: rnd(4) });
  }
}

/* ----------------------------------------------------------------- input */
function initInput() {
  const cv = $('gl');
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { S.setPaused(!S.paused); return; }
    if (S.paused) return;
    if (e.code === 'KeyF') { if (S.cin.active) S.cin.skip(); return; }
    S.keys[e.code] = true;
    if (UI.dlgOpen) {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { UI.moveDialogue(-1); e.preventDefault(); }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { UI.moveDialogue(1); e.preventDefault(); }
      if (e.code === 'Enter') UI.chooseDialogue();
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5) - 1;
        if (n >= 0 && n < UI.opts.length) UI.chooseDialogue(n);
      }
      return;
    }
    if (e.code === 'KeyC') toggleCrouch();
    if (e.code === 'KeyQ') togglePattern();
    if (e.code === 'Space') { e.preventDefault(); if (!S.player.vehicle) S.player.tryVault() || S.player.jump(); }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { S.keys[e.code] = false; });
  window.addEventListener('blur', () => { S.keys = {}; });

  cv.addEventListener('mousedown', e => {
    if (S.paused || S.cin.active) return;
    if (e.button === 0) {
      S.mouse.l = true;
      if (UI.dlgOpen) UI.chooseDialogue();
      else if (S.pendingInteract) doInteract(S.pendingInteract);
      else if (S.player.vehicle) S.player.vehicle.horn = 0.6;
    }
    if (e.button === 2) S.mouse.r = true;
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) S.mouse.l = false; if (e.button === 2) S.mouse.r = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    S.locked = document.pointerLockElement === cv;
    if (!S.locked && S.booted && !S.paused && !UI.dlgOpen) S.setPaused(true);
  });
  window.addEventListener('mousemove', e => {
    if (!S.locked) return;
    S.cam.addLook(e.movementX || 0, (e.movementY || 0) * (S.invertY ? -1 : 1));
  });
  cv.addEventListener('click', () => {
    if (!S.locked && S.booted && !S.paused && !UI.dlgOpen && !S.cin.active) cv.requestPointerLock();
  });

  window.addEventListener('resize', () => {
    resizeRenderer(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    UI.worldMap && null;
  });
  window.addEventListener('wheel', e => {
    if (S.paused) return;
    S.cam.tDist = clamp(S.cam.tDist + Math.sign(e.deltaY) * 0.4, 1.6, 14);
  }, { passive: true });
}

function toggleCrouch() {
  const P = S.player;
  if (P.vehicle) return;
  P.crouchT = !P.crouchT;
  if (S.audio) S.audio.step(0.5, 'cloth');
  if (P.crouchT) UI.toast(P.inCover ? 'In cover · visibility reduced' : 'Crouched · quieter, slower', 'info', 1600);
}

function togglePattern() {
  const P = S.player;
  if (P.vehicle) return;
  if (P.focus < 6 && !P.patternOn) { UI.toast('Focus depleted', 'bad', 1500); return; }
  P.patternOn = !P.patternOn;
  if (S.audio) (P.patternOn ? S.audio.patternOn() : S.audio.patternOff());
  if (P.patternOn) {
    UI.toast('<b>PATTERN SIGHT</b> · financial anomalies highlighted', 'info', 2600);
    const near = W.patternNodes.filter(n => !n.found && V.dist(P.pos, [n.x, n.y, n.z]) < 30).length;
    if (near) UI.toast(`${near} corrupted node${near > 1 ? 's' : ''} within range`, 'info', 2600);
  }
}

/* ------------------------------------------------------------- dialogue */
S.beginDialogue = function (id) {
  const node = DLG[id];
  if (!node) return;
  if (S.cin.active) S.cin.stop();
  if (document.pointerLockElement) document.exitPointerLock();
  S.cam.mode = 'dialogue';
  S.keerthy.dialogueActive = true;
  S.keerthy.talking = true;
  UI.showDialogue(node.who, node.line, node.options.map(o => Object.assign({}, o, {
    onChoose() {
      if (o.onChoose) o.onChoose();
      S.subtitle('AKSHAY', o.text, 3.2);
      if (node.after) setTimeout(() => S.beginDialogue(node.after), 1400);
      else if (o.next) setTimeout(() => S.beginDialogue(o.next), 1500);
      else setTimeout(() => {
        UI.hideDialogue();
        if (!S.cin.active) S.cam.mode = S.player.vehicle ? 'drive' : 'gameplay';
        S.keerthy.dialogueActive = false; S.keerthy.talking = false;
      }, 1700);
    }
  })));
  // frame the conversation over the shoulder
  const P = S.player, K = S.keerthy;
  S.cam.yaw = S.cam.tYaw = Math.atan2(K.pos[0] - P.pos[0], K.pos[2] - P.pos[2]);
  S.cam.pitch = S.cam.tPitch = -0.05;
  if (S.audio) S.audio.music('romance');
};

/* ------------------------------------------------------------- identity */
function switchIdentity() {
  const P = S.player;
  const to = S.identity === 'akshay' ? 'R' : 'akshay';
  S.identity = to;
  P.outfit = to === 'R' ? OUTFITS.r : OUTFITS.akshay;
  P.name = to === 'R' ? '"R"' : 'Akshay Varma';
  // changing faces resets security alertness…
  const wasAlert = S.globalAlert;
  S.setWanted(0);
  for (const g of S.guards) { g.detect = 0; if (g.state !== 'patrol') { g.state = 'patrol'; g.searchT = 0; } }
  UI.toast(to === 'R' ? 'Now playing <b>"R"</b> · security lost your face' : 'Now playing <b>Akshay Varma</b>', 'info', 3200);
  if (wasAlert > 0.4) UI.toast('Alert cleared — they are looking for someone else', 'good', 3200);
  // …but Keerthy notices
  const onCamera = isOnCamera(P.pos);
  S.keerthy.witnessSwitch(onCamera);
  if (S.audio) S.audio.ui(1);
  S.cam.shake(0.2, 0.3);
}

/** Is this position covered by a CCTV dome? */
function isOnCamera(pos) {
  for (const b of W.boxes) {
    if (b.tag !== 'cctv') continue;
    if (V.dist([b.cx, b.cy, b.cz], pos) < 22) return true;
  }
  return false;
}

/* --------------------------------------------------------------- alerts */
S.raiseAlert = function (amount) {
  const before = S.globalAlert;
  S.globalAlert = clamp(S.globalAlert + amount, 0, 1.2);
  if (before < 0.5 && S.globalAlert >= 0.5 && S.audio) S.audio.alert();
};
S.setWanted = function (v) {
  S.globalAlert = clamp(v, 0, 1.2);
  if (v === 0) { S.pursuit.forEach(c => c.ai = null); S.pursuit.length = 0; }
};
S.spawnPursuit = function (n) {
  const P = S.player;
  for (let i = 0; i < n; i++) {
    const ang = rnd(TAU);
    const d = rnd(38, 62);
    const x = clamp(P.pos[0] + Math.sin(ang) * d, W.bounds.minX + 8, W.bounds.maxX - 8);
    const z = clamp(P.pos[2] + Math.cos(ang) * d, W.bounds.minZ + 8, W.bounds.maxZ - 8);
    const v = new Vehicle({ x, y: 0.6, z, yaw: Math.atan2(P.pos[0] - x, P.pos[2] - z), color: '#1a2333' });
    v.driven = true;
    v.ai = { pursuit: true, speed: 22 };
    v.headlights = true;
    S.pursuit.push(v);
    S.vehicles.push(v);
  }
};
S.subtitle = (w, t, d) => UI.subtitle(w, t, d);
S.toast = (h, k, d) => UI.toast(h, k, d);
S.setPaused = function (on) {
  S.paused = on;
  UI.setPaused(on);
  if (!on && S.booted) $('gl').requestPointerLock();
};
S.setQuality = function (q) {
  R.quality = q;
  R.shadowSize = q >= 1 ? 2048 : 1024;
  resizeRenderer(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  const gl = R.gl;
  gl.bindTexture(gl.TEXTURE_2D, R.shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, R.shadowSize, R.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  UI.toast('Render quality: <b>' + ['LOW', 'CINEMATIC', 'ULTRA'][q] + '</b>', 'info', 2000);
};
S.clockString = function () {
  const h = Math.floor(S.dayTime), m = Math.floor((S.dayTime - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
S.weatherLabel = function () {
  const r = S.weather.rain;
  if (r > 0.66) return 'HEAVY RAIN';
  if (r > 0.33) return 'RAIN';
  if (r > 0.08) return 'DRIZZLE';
  if (S.weather.fog > 0.5) return 'FOG';
  return S.nightFactor > 0.6 ? 'CLEAR NIGHT' : 'CLEAR';
};
S.showSliceEnd = function () {
  UI.missionComplete('Act I Complete', [
    { v: '2 / 2', k: 'Missions' },
    { v: `${Math.round(S.keerthy.trust)}%`, k: 'Keerthy Trust' },
    { v: `${Math.round(S.keerthy.suspicion)}%`, k: 'Suspicion' },
    { v: fmtTime(S.playTime), k: 'Slice Time' },
  ], 'The vertical slice ends here. <b>Act II — The Birth of "R"</b> is next: disguise crafting, the Vantara gala, and two dates running at once.<br><br><span style="color:#8ea3bd;font-size:11.5px">Free roam stays live — Pattern Sight, cover, driving and the trust meter all keep working.</span>');
};
S.restartAct = function () {
  localStorage.removeItem(S.saveKey);
  location.reload();
};

/* ============================================================================
   SIMULATION
   ============================================================================ */
function updateEnvironment(dt) {
  S.dayTime = (S.dayTime + dt * 24 / S.dayLength) % 24;
  const t = clamp01((S.dayTime - 6) / 12);
  const el = Math.sin(t * PI) * 1.12;
  const azE = lerp(1.4, -1.4, t);
  const ce = Math.cos(el), se = Math.sin(el);
  const sd = [Math.sin(azE) * ce, se, -(Math.cos(azE) * ce * 0.45 + 0.15)];
  const l = Math.hypot(sd[0], sd[1], sd[2]);
  const st = R.state;

  S.nightFactor = clamp01((0.06 - se) / 0.30);
  const dusk = smoothstep(-0.08, 0.22, se) * (1 - smoothstep(0.22, 0.5, se));

  // sun / moon direction
  if (se > -0.06) {
    st.sunDir = [sd[0] / l, sd[1] / l, sd[2] / l];
  } else {
    st.sunDir = [-sd[0] / l, -sd[1] / l * 0.85, -sd[2] / l];
  }

  const day = [1.0, 0.97, 0.90], duskC = [1.0, 0.52, 0.26], night = [0.20, 0.26, 0.46];
  let sunC = mixRgb(day, duskC, dusk);
  sunC = mixRgb(sunC, night, S.nightFactor);
  const rainDim = 1 - S.weather.rain * 0.62;
  st.sunColor = mulRgb(sunC, (0.25 + 1.55 * Math.max(0, se)) * rainDim * (se > -0.06 ? 1 : 0.5));

  st.skyTop = mixRgb(mixRgb([0.10, 0.30, 0.62], [0.10, 0.13, 0.32], dusk), [0.012, 0.02, 0.05], S.nightFactor);
  st.skyHorizon = mixRgb(mixRgb([0.62, 0.74, 0.86], [0.98, 0.48, 0.24], dusk), [0.05, 0.07, 0.13], S.nightFactor);
  st.groundColor = mixRgb([0.13, 0.14, 0.16], [0.02, 0.025, 0.04], S.nightFactor);
  const rainGrey = S.weather.rain;
  st.skyTop = mixRgb(st.skyTop, [0.20, 0.23, 0.27], rainGrey * 0.8);
  st.skyHorizon = mixRgb(st.skyHorizon, [0.34, 0.37, 0.41], rainGrey * 0.85);

  st.ambTop = mulRgb(mixRgb(st.skyTop, [0.5, 0.58, 0.7], 0.35), 0.55 + (1 - S.nightFactor) * 0.65);
  st.ambBot = mulRgb(mixRgb(st.groundColor, [0.22, 0.2, 0.18], 0.3), 0.8 + (1 - S.nightFactor) * 0.7);

  st.fogColor = mixRgb(st.skyHorizon, [0.5, 0.55, 0.6], rainGrey * 0.5);
  st.fogDensity = 0.0022 + S.weather.rain * 0.0072 + S.weather.fog * 0.010 + S.nightFactor * 0.0012;
  st.cloud = 0.28 + S.weather.rain * 0.62 + S.weather.fog * 0.2;
  st.stars = (1 - S.nightFactor) < 0.4 ? 0 : smoothstep(0.4, 0.85, S.nightFactor) * (1 - S.weather.rain);
  st.exposure = lerp(1.02, 1.62, S.nightFactor) * (1 - S.weather.rain * 0.16);
  st.wet = S.wetGrip;
  st.time = S.time;
  st.grade = S.player.patternOn ? [0.82, 1.06, 1.16] : mixRgb([1, 1, 1], [0.94, 0.97, 1.06], S.nightFactor);
}

function updateWeather(dt) {
  const w = S.weather;
  w.bolt -= dt;
  if (w.bolt <= 0) {
    w.bolt = rnd(28, 90) / Math.max(0.2, w.rain);
    if (w.rain > 0.28) {
      w.flash = 0.85 + rnd(0.4);
      if (S.audio) S.audio.thunder();
      S.cam.shake(0.18, 0.6);
    }
  }
  w.flash = Math.max(0, w.flash - dt * 3.4);
  R.state.flash = w.flash * 0.55;

  // weather drifts; the escape forces a downpour for atmosphere
  if (S.missions && S.missions.index === 1 && S.missions.step >= 3) w.target = 0.85;
  else if (w.target < 0 && Math.random() < dt * 0.02) w.target = rnd(0, 0.7);
  if (Math.random() < dt * 0.012) w.target = clamp(rnd(-0.05, 0.85), 0, 0.9);
  w.rain = damp(w.rain, w.target, 0.12, dt);
  w.fog = damp(w.fog, S.dayTime > 4 && S.dayTime < 8 ? 0.45 : 0.06, 0.05, dt);
  w.wind = damp(w.wind, 0.4 + Math.sin(S.time * 0.11) * 0.5, 0.3, dt);
  S.wetGrip = damp(S.wetGrip, clamp01(w.rain * 1.3), 0.25, dt);
  if (S.audio) S.audio.setRain(w.rain, w.rain > 0.4 && w.flash > 0.5);
}

/** Spawn and recycle rain streaks around the camera. */
function updateRain(dt) {
  const w = S.weather;
  R.partCount = 0;
  const amount = w.rain;
  if (amount < 0.02) return;
  const cam = S.cam.eye || S.cam.pos;
  const count = Math.floor(amount * 1700);
  const spread = 42, height = 30;
  const windX = w.wind * 3.4, windZ = 1.6;
  for (let i = 0; i < count && i < w.drops.length; i++) {
    const d = w.drops[i];
    d.y -= d.v * dt;
    d.x += windX * dt; d.z += windZ * dt;
    if (d.y < -2 || Math.abs(d.x - cam[0]) > spread || Math.abs(d.z - cam[2]) > spread) {
      d.x = cam[0] + rnd(-spread, spread);
      d.z = cam[2] + rnd(-spread, spread);
      d.y = cam[1] + rnd(6, height);
      d.v = rnd(24, 38);
    }
    const gh = (d.y < 1.2) ? 0 : 0;
    const len = 0.55 + d.v * 0.028;
    const a = 0.10 + amount * 0.26;
    pushLine(d.x, d.y, d.z, d.x - windX * 0.028, d.y + len, d.z - windZ * 0.028, 0.66, 0.78, 0.9, a);
  }
}

/* ------------------------------------------------------------- lighting */
function updateLights() {
  const cam = S.cam.eye || S.cam.pos;
  const st = R.state;
  st.lights.length = 0;
  const cand = [];
  for (let i = 0; i < W.lights.length; i++) {
    const L = W.lights[i];
    if (L.nightOnly && S.nightFactor < 0.28) continue;
    const d = Math.hypot(L.x - cam[0], L.y - cam[1], L.z - cam[2]);
    if (d > L.radius * 2.6) continue;
    let inten = L.intensity * (L.nightOnly ? smoothstep(0.2, 0.65, S.nightFactor) : 1);
    if (L.flicker) inten *= 0.72 + Math.sin(S.time * 17 + L.phase) * 0.28;
    cand.push({ L, d, inten });
  }
  cand.sort((a, b) => a.d - b.d);
  for (let i = 0; i < Math.min(8, cand.length); i++) {
    const c = cand[i];
    st.lights.push({ x: c.L.x, y: c.L.y, z: c.L.z, radius: c.L.radius, r: c.L.r, g: c.L.g, b: c.L.b, intensity: c.inten });
  }
  // vehicle headlights become real lights at night
  if (S.nightFactor > 0.25) {
    for (const v of S.vehicles) {
      if (!v.headlights || st.lights.length >= 8) continue;
      const d = V.dist(v.pos, cam);
      if (d < 46) {
        const fx = Math.sin(v.yaw) * 2.6, fz = Math.cos(v.yaw) * 2.6;
        st.lights.push({ x: v.pos[0] + fx, y: v.pos[1] + 0.7, z: v.pos[2] + fz, radius: 26, r: 1, g: 0.94, b: 0.76, intensity: 1.5 * S.nightFactor });
      }
    }
  }
}

/* ============================================================================
   PLAYER
   ============================================================================ */
function updatePlayer(dt) {
  const P = S.player;
  S.pendingInteract = null;
  const ePressed = !!S.keys['KeyE'] && !S.eLatch;
  S.eLatch = !!S.keys['KeyE'];

  /* ---------------- driving ---------------- */
  if (P.vehicle) {
    const v = P.vehicle;
    const k = S.keys;
    let thr = 0, str = 0, brk = 0;
    if (k['KeyW'] || k['ArrowUp']) thr += 1;
    if (k['KeyS'] || k['ArrowDown']) { if (v.fwdSpeed > 0.6) brk = 1; else thr -= 1; }
    if (k['KeyA'] || k['ArrowLeft']) str -= 1;
    if (k['KeyD'] || k['ArrowRight']) str += 1;
    v.throttle = thr;
    v.brakeLight = brk > 0 || thr < 0;
    v.update(dt, { throttle: thr, brake: brk, steer: str, handbrake: !!k['Space'] });
    v.driven = true;
    P.pos[0] = v.pos[0]; P.pos[1] = v.pos[1] + 0.5; P.pos[2] = v.pos[2];
    P.yaw = v.yaw;
    if (S.audio) {
      S.audio.updateEngine(v);
      if (v.slip > 0.35 && Math.random() < dt * 4) S.cam.shake(0.1 * v.slip, 0.2);
    }
    // running people down is a choice with consequences
    for (const a of S.actors) {
      if (a.dead || a === S.keerthy && false) continue;
      if (V.distXZ(a.pos, v.pos) < 1.9 && Math.abs(v.kmh) > 18 && !a.ragdoll) {
        a.ragdollize([v.vel[0] * 0.7, 5, v.vel[2] * 0.7]);
        a.dead = a.kind !== 'guard';
        S.raiseAlert(0.55);
        S.cam.shake(0.7, 0.5);
        for (const p of S.actors) if (p.startle) p.startle(a.pos[0], a.pos[2], 1);
      }
    }
    // exit
    if (ePressed && Math.abs(v.kmh) < 4) {
      const out = v.doorPos([0, 0, 0]);
      P.pos[0] = out[0]; P.pos[1] = out[1]; P.pos[2] = out[2];
      P.vel[0] = P.vel[2] = 0;
      v.driven = false; P.vehicle = null;
      S.cam.mode = 'gameplay';
      S.cam.tDist = 4.3;
      UI.toast('Exited vehicle', 'info', 1400);
    }
    S.cam.mode = 'drive';
    return;
  }

  /* ---------------- on foot ---------------- */
  let fwd = 0, strafe = 0;
  if (S.keys['KeyW'] || S.keys['ArrowUp']) fwd += 1;
  if (S.keys['KeyS'] || S.keys['ArrowDown']) fwd -= 1;
  if (S.keys['KeyA'] || S.keys['ArrowLeft']) strafe -= 1;
  if (S.keys['KeyD'] || S.keys['ArrowRight']) strafe += 1;
  if (S.touchMove[1]) fwd -= S.touchMove[1];
  if (S.touchMove[0]) strafe += S.touchMove[0];
  const sprint = !!(S.keys['ShiftLeft'] || S.keys['ShiftRight'] || S.touch.sprint);

  P.aimMode = S.mouse.r;
  const wasGait = Math.floor(P.gait / PI);
  P.applyIntent(fwd, strafe, sprint && !UI.dlgOpen, dt);
  if (UI.dlgOpen) P.applyIntent(0, 0, false, dt);
  P.update(dt);

  // footstep audio on foot plant
  const gait = Math.floor(P.gait / PI);
  if (gait !== wasGait && P.grounded && P.speed > 0.9) {
    const surf = (P.pos[0] < -8 && P.pos[2] < -12) ? 'marble' : 'concrete';
    S.audio.step(clamp01(P.speed / 7) * (P.sprint ? 1.25 : 0.85), surf);
  }

  /* ---------------- Pattern Sight ---------------- */
  if (P.patternOn) {
    P.focus = Math.max(0, P.focus - dt * 11);
    S.timeScale = damp(S.timeScale, 0.72, 6, dt);
    if (P.focus <= 0) { togglePattern(); UI.toast('Focus depleted', 'bad', 1500); }
  } else {
    P.focus = Math.min(100, P.focus + dt * 7.5);
    S.timeScale = damp(S.timeScale, 1, 5, dt);
  }
  UI.el.stamLbl.textContent = P.patternOn ? 'Focus' : 'Stamina';
  const shownStam = P.patternOn ? P.focus : P.stamina;
  UI.el.stamVal.textContent = Math.round(shownStam);
  UI.el.stamFill.style.width = shownStam + '%';

  // highlight nearby ledger nodes while in Pattern Sight
  if (P.patternOn) {
    let best = null, bd = 1e9;
    for (const n of W.patternNodes) {
      if (n.found) continue;
      const d = V.dist(P.pos, [n.x, n.y, n.z]);
      if (d < 4.5 && d < bd) { bd = d; best = n; }
    }
    if (best) S.pendingInteract = { action: 'ledger', node: best, label: 'Extract <em>' + best.title + '</em>', key: 'E' };
  }

  /* ---------------- interaction scan ---------------- */
  if (!S.pendingInteract) {
    let best = null, bd = 1e9;
    for (const pr of W.props) {
      if (pr.hidden) continue;
      if (pr.action === 'ledger' && !P.patternOn) continue;
      const d = V.distXZ(P.pos, [pr.x, 0, pr.z]);
      if (d < pr.radius && d < bd) { bd = d; best = pr; }
    }
    if (best) S.pendingInteract = best;
    // vehicles
    if (!best) {
      for (const v of S.vehicles) {
        if (v.ai && v.ai.pursuit) continue;
        const d = V.distXZ(P.pos, v.pos);
        if (d < 3.4 && d < bd) { bd = d; S.pendingInteract = { action: 'enterCar', vehicle: v, label: 'Enter the <em>Sedan</em>', key: 'E' }; }
      }
    }
  }
  UI.prompt(S.pendingInteract ? S.pendingInteract.key : null, S.pendingInteract ? S.pendingInteract.label : null);

  if (ePressed && S.pendingInteract) doInteract(S.pendingInteract);

  /* ---------------- visibility to guards ---------------- */
  P.hidden = P.crouchT && P.inCover;
  S.cam.mode = P.aimMode ? 'aim' : 'gameplay';

  /* ---------------- head tracking ---------------- */
  let look = null;
  if (S.keerthy.met && V.distXZ(P.pos, S.keerthy.pos) < 9) look = S.keerthy.pos;
  if (look) {
    const want = Math.atan2(look[0] - P.pos[0], look[2] - P.pos[2]);
    P.headYaw = clamp(((want - P.yaw + PI) % TAU + TAU) % TAU - PI, -0.9, 0.9);
    P.headPitch = -0.08;
  } else {
    P.headYaw = damp(P.headYaw, 0, 5, dt);
    P.headPitch = damp(P.headPitch, 0, 5, dt);
  }

  /* ---------------- trigger volumes ---------------- */
  for (const b of nearBoxes(P.pos[0], P.pos[2], 1.2, true)) {
    if (!b.trigger) continue;
    if (!boxContainsPoint(b, P.pos[0], P.pos[1] + 0.9, P.pos[2], 0.3)) continue;
    if (b.trigger === 'disguiseZone' && !P._disgLatch) {
      P._disgLatch = true;
      switchIdentity();
    }
  }
  if (!nearBoxes(P.pos[0], P.pos[2], 1.2, true).some(b => b.trigger === 'disguiseZone')) P._disgLatch = false;

  // fell out of the world
  if (P.pos[1] < -12) { P.pos[1] = 2; P.vel[1] = 0; }
}

function doInteract(pr) {
  const P = S.player;
  switch (pr.action) {
    case 'desk': {
      S.flags.deskDone = true;
      UI.showEvidence('WORKSTATION — SETTLEMENT QUEUE', 'Anomaly detected',
        'Batch <em>#4471</em> settled with a variance of <em>₹4,20,00,000</em>.<br>Authorising ID: <em>#0409</em> — not in the employee register.<br>Timestamp predates your login by <em>11 years</em>.', 8000);
      S.subtitle('AKSHAY', 'Four point two crore. It moved, it settled, and nobody signed for it.', 4.2);
      if (S.audio) S.audio.evidence();
      break;
    }
    case 'keydoor': {
      if (S.flags.keycard) {
        const idx = W.boxes.findIndex(b => b.tag === 'keydoor');
        if (idx >= 0) { W.boxes[idx].solid = false; W.boxes.splice(idx, 1); rebuildHash(); }
        UI.toast('Keycard accepted · <b>server room unlocked</b>', 'good', 3000);
        if (S.audio) S.audio.keycard(true);
        pr.hidden = true;
      } else {
        UI.toast('<b>Access denied</b> — you need an event keycard', 'bad', 3000);
        if (S.audio) S.audio.keycard(false);
        S.raiseAlert(0.12);
      }
      break;
    }
    case 'ledger': {
      const n = pr.node;
      if (n.found) return;
      n.found = true;
      UI.showEvidence(n.title, n.body, 8000);
      if (S.audio) S.audio.evidence();
      S.cam.shake(0.22, 0.3);
      S.raiseAlert(0.22);
      break;
    }
    case 'disguise': switchIdentity(); break;
    case 'talkKeerthy': S.missions.talkKeerthy(); break;
    case 'enterCar': {
      let v = pr.vehicle;
      if (!v) {
        let bd = 1e9;
        for (const c of S.vehicles) {
          if (c.ai && c.ai.pursuit) continue;
          const d = V.distXZ(S.player.pos, c.pos);
          if (d < 5 && d < bd) { bd = d; v = c; }
        }
      }
      if (v) enterVehicle(v);
      break;
    }
  }
}

function rebuildHash() {
  W.hash = {};
  for (let i = 0; i < W.boxes.length; i++) {
    const b = W.boxes[i];
    const x0 = Math.floor(b.min[0] / W.cell), x1 = Math.floor(b.max[0] / W.cell);
    const z0 = Math.floor(b.min[2] / W.cell), z1 = Math.floor(b.max[2] / W.cell);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x + ',' + z;
      (W.hash[k] = W.hash[k] || []).push(i);
    }
  }
}

function enterVehicle(v) {
  const P = S.player;
  P.vehicle = v;
  v.driven = true;
  v.gear = 1;
  S.cam.mode = 'drive';
  S.cam.tDist = 8.4;
  S.cam.tYaw = v.yaw + PI;
  S.cam.yaw = v.yaw + PI;
  UI.toast('Vehicle acquired · <b>WASD</b> drive · <b>Space</b> handbrake', 'info', 3600);
  if (S.audio) { S.audio.ui(1); S.audio.music('chase'); }
  S.cam.shake(0.2, 0.3);
  if (S.missions && S.missions.index === 1 && S.missions.step >= 4 && !S.flags.naveenCalled) {
    S.flags.naveenCalled = true;
    if (S.audio) S.audio.phone();
    setTimeout(() => { if (!S.cin.active) S.beginDialogue('m2_naveen'); }, 2600);
  }
}

/* ============================================================================
   NPC / TRAFFIC
   ============================================================================ */
function updateActors(dt) {
  for (const a of S.actors) {
    if (a.dead && a.kind === 'ped' && !a.ragdoll) continue;
    const d = V.dist(a.pos, S.cam.pos);
    if (d > 190) {
      // Out of simulation range. A culled guard can no longer track the player, so let
      // its awareness bleed off here — otherwise it freezes in the 'alert' state with a
      // full detect meter and holds the global alert high forever (see updateAlertness).
      if (a.kind === 'guard') {
        a.detect = Math.max(0, a.detect - dt * 0.5);
        a.searchT = Math.max(0, a.searchT - dt);
        if (a.detect <= 0.42 && a.searchT <= 0 && a.state !== 'patrol') a.state = 'patrol';
      }
      continue;
    }
    a.update(dt);
    if (a.ragdoll && a.dead) a.deadT = (a.deadT || 0) + dt;
  }
  // alert decay
  // Only guards close enough to still be a threat may hold the wanted level up. Without
  // the proximity gate a single guard left in 'alert' on the far side of the district
  // pins globalAlert at 0.7 indefinitely and the escape objective can never be met.
  const anyAlert = S.actors.some(a => a.kind === 'guard' &&
    (a.state === 'alert' || a.detect > 0.5) && V.distXZ(a.pos, S.player.pos) < 90);
  S.globalAlert = damp(S.globalAlert, anyAlert ? Math.max(S.globalAlert, 0.7) : 0, anyAlert ? 2 : 0.22, dt);
  if (S.player.patternOn) { /* pattern sight is quiet */ }
  if (S.globalAlert > 0.6 && Math.random() < dt * 1.1 && S.audio) S.audio.heart(0.5);
}

function updateTraffic(dt) {
  for (const v of S.traffic) {
    const ai = v.ai;
    if (!ai) continue;
    ai.t += ai.speed * dt * ai.lane.dir;
    if (ai.t > ai.lane.maxT - 6) ai.t = ai.lane.minT + 6;
    if (ai.t < ai.lane.minT + 6) ai.t = ai.lane.maxT - 6;
    const tx = ai.lane.axis === 'x' ? ai.t : ai.lane.c;
    const tz = ai.lane.axis === 'x' ? ai.lane.c : ai.t;
    const yaw = ai.lane.axis === 'x' ? (ai.lane.dir > 0 ? PI / 2 : -PI / 2) : (ai.lane.dir > 0 ? 0 : PI);
    // brake for the player
    const dp = V.distXZ(v.pos, S.player.pos);
    const spd = dp < 12 ? ai.speed * 0.15 : ai.speed;
    const cx = v.pos[0], cz = v.pos[2];
    v.pos[0] = damp(cx, tx, 3.2, dt);
    v.pos[2] = damp(cz, tz, 3.2, dt);
    v.yaw = dampAngle(v.yaw, yaw, 5, dt);
    v.vel[0] = (v.pos[0] - cx) / Math.max(dt, 1e-4);
    v.vel[2] = (v.pos[2] - cz) / Math.max(dt, 1e-4);
    v.throttle = spd > 2 ? 0.4 : 0;
    v.rpm = damp(v.rpm, 900 + spd * 90, 4, dt);
    v.slip = 0;
    const gh = groundHeightAt(v.pos[0], v.pos[2], v.pos[1] + 2);
    v.pos[1] = damp(v.pos[1], gh, 12, dt);
    for (let i = 0; i < 4; i++) v.susp[i] = damp(v.susp[i], 0.5, 6, dt);
    v.brakeLight = dp < 12;
  }
}

function updatePursuit(dt) {
  const P = S.player;
  for (const v of S.pursuit) {
    if (!v.ai) continue;
    const dx = P.pos[0] - v.pos[0], dz = P.pos[2] - v.pos[2];
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let err = ((want - v.yaw + PI) % TAU + TAU) % TAU - PI;
    // crude obstacle avoidance
    const ahead = [v.pos[0] + Math.sin(v.yaw) * 9, v.pos[2] + Math.cos(v.yaw) * 9];
    let avoid = 0;
    for (const b of nearBoxes(ahead[0], ahead[1], 3.4, false)) {
      if (!b.solid || b.trigger) continue;
      if (b.max[1] < 0.6) continue;
      const cx = clamp(v.pos[0], b.min[0], b.max[0]), cz = clamp(v.pos[2], b.min[2], b.max[2]);
      if (Math.hypot(v.pos[0] - cx, v.pos[2] - cz) < 10) {
        avoid = (v.pos[0] - b.cx) > 0 ? -1 : 1;
        break;
      }
    }
    const steer = clamp(err * 1.9 + avoid * 0.9, -1, 1);
    const throttle = Math.abs(err) < 1.0 ? 1 : 0.3;
    const brake = (v.kmh > 26 && Math.abs(err) > 1.15) ? 0.7 : 0;
    v.throttle = throttle;
    v.brakeLight = brake > 0;
    v.update(dt, { throttle, brake, steer, handbrake: v.kmh > 30 && Math.abs(err) > 1.6 });
    // ramming the player
    if (dist < 4.4 && v.kmh > 12) {
      S.cam.shake(0.5, 0.4);
      S.player.damage(3.2 * dt * 8, [dx, 2, dz]);
    }
    if (dist > 260) { v.ai = null; }
  }
}

/* ============================================================================
   SUBMISSION
   ============================================================================ */
function submitScene() {
  const cam = S.cam.eye || S.cam.pos;
  submitWorld(cam, S.player.patternOn);

  // actors
  for (const a of S.actors) {
    if (a === S.player) continue;
    if (V.dist(a.pos, cam) > 120) continue;
    drawHumanoid(a, R.dyn, R.dynCyl);
  }
  if (!S.player.vehicle) drawHumanoid(S.player, R.dyn, R.dynCyl);
  else {
    // seated driver silhouette inside the cabin
    const v = S.player.vehicle;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    const hx = -0.30, hz = 0.25;
    const X = v.pos[0] + hx * c + hz * s, Z = v.pos[2] - hx * s + hz * c;
    M4.compose(R.tmpM, X, v.pos[1] + 0.95, Z, v.yaw, 0, 0, 0.42, 0.58, 0.30);
    R.dyn.push(R.tmpM, 0.88, 0.90, 0.94, 1);
    M4.compose(R.tmpM, X, v.pos[1] + 1.36, Z, v.yaw, 0, 0, 0.19, 0.24, 0.20);
    R.dyn.push(R.tmpM, 0.72, 0.53, 0.38, 1);
  }

  // vehicles
  for (const v of S.vehicles) {
    if (V.dist(v.pos, cam) > 220) continue;
    drawVehicle(v, R.dyn, R.dynCyl);
  }

  // pattern-sight markers
  if (S.player.patternOn) {
    for (const n of W.patternNodes) {
      if (n.found) continue;
      const d = V.dist(cam, [n.x, n.y, n.z]);
      if (d > 70) continue;
      const pulse = 0.6 + Math.sin(S.time * 3.4 + n.x) * 0.4;
      const s = 0.34 + pulse * 0.10;
      M4.compose(R.tmpM, n.x, n.y + Math.sin(S.time * 1.6 + n.z) * 0.12, n.z, S.time * 0.9, 0, S.time * 0.5, s, s, s);
      R.dyn.push(R.tmpM, 0.18, 0.94, 1.0, 1);
      // vertical scan beam
      M4.compose(R.tmpM, n.x, n.y + 1.1, n.z, 0, 0, 0, 0.05, 2.2, 0.05);
      R.dyn.push(R.tmpM, 0.10, 0.70, 0.95, 0.5);
      // orbiting ring segments
      for (let i = 0; i < 3; i++) {
        const a = S.time * 1.8 + i * TAU / 3;
        M4.compose(R.tmpM, n.x + Math.cos(a) * 0.7, n.y, n.z + Math.sin(a) * 0.7, a, 0, 0, 0.22, 0.03, 0.06);
        R.dyn.push(R.tmpM, 0.2, 0.95, 1.0, 1);
      }
    }
  }

  // interaction beacon
  if (S.pendingInteract && S.pendingInteract.x !== undefined) {
    const p = S.pendingInteract;
    const pulse = 0.5 + Math.sin(S.time * 4) * 0.5;
    M4.compose(R.tmpM, p.x, p.y + 0.9 + pulse * 0.12, p.z, S.time, 0, 0, 0.16, 0.16, 0.16);
    R.dyn.push(R.tmpM, 1.0, 0.83, 0.3, 1);
  }

  // upload dynamic batches
  for (const db of R.dynBatches) db.batch.upload(db.mesh);
}

/* ============================================================================
   MAIN LOOP
   ============================================================================ */
let lastT = 0, fpsAcc = 0, fpsN = 0, fpsShown = 60;
function frame(now) {
  requestAnimationFrame(frame);
  if (!S.booted) return;
  // clamp hard: a backgrounded tab or a first-frame clock skew would otherwise
  // feed a negative dt into the damping maths and NaN poisons the sim forever
  const rawDt = clamp((now - lastT) / 1000, 0.001, 0.05);
  lastT = now;
  S.dt = rawDt;

  const dt = rawDt * (S.paused ? 0 : S.timeScale);
  S.time += rawDt;
  if (!S.paused) S.playTime += rawDt;

  if (!S.paused) {
    updateWeather(rawDt);
    updateEnvironment(rawDt);
    if (S.cin.active) { S.cin.update(dt); }
    else {
      updatePlayer(dt);
      updateActors(dt);
      updateTraffic(dt);
      updatePursuit(dt);
      S.missions.tick(dt);
      // ambient music bed
      if (S.audio && !S.player.vehicle && S.globalAlert < 0.5) {
        S.audio.music(S.nightFactor > 0.5 ? 'night' : 'day');
      }
    }
    if (S.audio) S.audio.musicTick(rawDt);
    if (!S.player.vehicle && S.audio) S.audio.updateEngine(null);
    autosave();
  }

  /* ---- camera ---- */
  const opts = { pattern: S.player.patternOn };
  if (!S.cin.active) S.cam.update(rawDt, S.player, opts);

  /* ---- shadow frustum follows the player ---- */
  const focus = S.player.vehicle ? S.player.vehicle.pos : S.player.pos;
  updateShadowFrustum(focus, S.player.vehicle ? 62 : 40, R.state.sunDir);

  /* ---- draw ---- */
  R.opaque.length = 0; R.trans.length = 0;
  updateRain(rawDt);
  updateLights();
  submitScene();
  const P = S.player;
  renderFrame({ pos: S.cam.eye || S.cam.pos, view: S.cam.view, proj: S.cam.proj }, {
    bloom: 0.62 + S.nightFactor * 0.30 + (P.patternOn ? 0.3 : 0),
    bloomThresh: 0.78 - S.nightFactor * 0.10,
    vignette: 0.42 + (P.patternOn ? 0.25 : 0) + (1 - P.hp / 100) * 0.3,
    grain: 0.028 + S.weather.rain * 0.03,
    chroma: 0.0011 + P.patternOn * 0.0022 + (P.vehicle ? clamp01(P.vehicle.kmh / 200) * 0.0018 : 0),
    sat: P.patternOn ? 0.55 : (S.nightFactor > 0.5 ? 0.92 : 1.06),
    contrast: 1.06 + S.nightFactor * 0.05,
    scan: P.patternOn ? 1 : 0,
    desat: P.patternOn ? 1 : 0,
    fade: S.cin.fade > 0.01 ? 1 - S.cin.fade : 1,
    particles: { count: R.partCount },
  });

  if (!S.paused) UI.updateHUD(rawDt);

  // fps counter
  fpsAcc += rawDt; fpsN++;
  if (fpsAcc > 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  UI.el.dbg.textContent = `${fpsShown} FPS · ${W.stats.boxes} geo · ${W.stats.colliders} colliders · ${(W.lights.length)} lights`;
}

/* -------------------------------------------------------------- autosave */
let saveT = 0;
function autosave() {
  saveT += S.dt || 0.016;
  if (saveT < 6) return;
  saveT = 0;
  try {
    localStorage.setItem(S.saveKey, JSON.stringify({
      mission: S.missions.index, trust: S.keerthy.trust, suspicion: S.keerthy.suspicion,
      keycard: S.flags.keycard, met: S.keerthy.met, nodes: W.patternNodes.filter(n => n.found).length,
      identity: S.identity, dayTime: S.dayTime,
    }));
  } catch (e) { /* private mode — ignore */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(S.saveKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

/* ============================================================================
   START
   ============================================================================ */
function startGame() {
  UI.el.boot.style.transition = 'opacity .8s ease';
  UI.el.boot.style.opacity = '0';
  setTimeout(() => UI.el.boot.classList.add('hidden'), 820);
  S.booted = true;
  S.audio.init();
  S.audio.resume();
  S.audio.music('cinematic');
  $('gl').requestPointerLock();
  resizeRenderer(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);

  const save = loadSave();
  if (save && save.mission !== undefined) {
    S.keerthy.trust = save.trust || 0;
    S.keerthy.suspicion = save.suspicion || 0;
    S.keerthy.met = !!save.met;
    S.keerthy.updateMood();
    S.identity = save.identity || 'akshay';
    S.player.outfit = S.identity === 'R' ? OUTFITS.r : OUTFITS.akshay;
    S.dayTime = save.dayTime || 8.7;
    if (save.keycard) {
      S.flags.keycard = true;
      const d = W.props.find(p => p.id === 'serverDoor');
      if (d) { d.locked = false; d.hidden = true; }
      const idx = W.boxes.findIndex(b => b.tag === 'keydoor');
      if (idx >= 0) { W.boxes.splice(idx, 1); rebuildHash(); }
    }
    S.missions.start(Math.min(save.mission, 1), true);
    for (let i = 0; i < (save.nodes || 0); i++) { if (W.patternNodes[i]) W.patternNodes[i].found = true; }
    UI.toast('Progress restored from local save', 'info', 3000);
  } else {
    S.missions.start(0);
  }
  lastT = performance.now();
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------- launch */
window.addEventListener('error', e => {
  const b = $('bootError');
  if (b && !b.classList.contains('hidden') === false) return;
  b.classList.remove('hidden');
  b.textContent = 'RUNTIME ERROR\n\n' + (e.message || e.error) + '\n' + (e.filename || '') + ':' + (e.lineno || '');
});

initUI();
boot();
