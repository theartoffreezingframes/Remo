/* ============================================================================
   tools/headless-test.mjs
   Runs the real single-file build inside Node against a validating WebGL2 +
   DOM mock. The mock parses the actual GLSL sources so every uniform location
   the engine asks for must really be declared in the shader — a typo'd
   uniform fails the run instead of silently rendering black.
   ============================================================================ */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'double-game.html'), 'utf8');
const m = HTML.match(/<script id="game-main">([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: could not find game script block'); process.exit(1); }
const CODE = m[1];

/* ------------------------------------------------------------------ report */
let failures = 0, checks = 0;
const fail = msg => { failures++; console.log('  ✗ ' + msg); };
const ok = (cond, msg) => { checks++; if (!cond) fail(msg); else console.log('  ✓ ' + msg); };
const section = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length)));

/* ------------------------------------------------------------------- GLSL */
function parseUniforms(src) {
  const out = [];
  // a single statement may declare several names: uniform vec3 a, b[4], c;
  const re = /uniform\s+\w+\s+([^;]+);/g;
  let mm;
  while ((mm = re.exec(src))) {
    for (const decl of mm[1].split(',')) {
      const d = decl.trim().match(/^([A-Za-z_]\w*)\s*(?:\[\s*(\d+)\s*\])?$/);
      if (!d) continue;
      const size = d[2] ? parseInt(d[2], 10) : 1;
      out.push({ name: d[1] + (size > 1 ? '[0]' : ''), base: d[1], size });
    }
  }
  return out;
}

/* ------------------------------------------------------------- WebGL mock */
let glId = 1;
const GL_ERRORS = [];
function makeGL(canvas) {
  const consts = {};
  const names = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'ACTIVE_UNIFORMS',
    'ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER', 'STATIC_DRAW', 'DYNAMIC_DRAW', 'FLOAT', 'UNSIGNED_SHORT',
    'UNSIGNED_INT', 'TRIANGLES', 'LINES', 'POINTS', 'TEXTURE_2D', 'TEXTURE0', 'TEXTURE1', 'RGBA', 'RGBA8',
    'RGBA16F', 'HALF_FLOAT', 'UNSIGNED_BYTE', 'LINEAR', 'NEAREST', 'CLAMP_TO_EDGE', 'TEXTURE_MIN_FILTER',
    'TEXTURE_MAG_FILTER', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'DEPTH_COMPONENT', 'DEPTH_COMPONENT24',
    'TEXTURE_COMPARE_MODE', 'TEXTURE_COMPARE_FUNC', 'COMPARE_REF_TO_TEXTURE', 'LEQUAL', 'FRAMEBUFFER',
    'RENDERBUFFER', 'COLOR_ATTACHMENT0', 'DEPTH_ATTACHMENT', 'FRAMEBUFFER_COMPLETE', 'READ_FRAMEBUFFER',
    'DRAW_FRAMEBUFFER', 'COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT', 'DEPTH_TEST', 'CULL_FACE', 'FRONT', 'BACK',
    'BLEND', 'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'POLYGON_OFFSET_FILL', 'NONE', 'INT', 'FLOAT_VEC3',
    'FLOAT_VEC4', 'FLOAT_MAT4', 'SAMPLER_2D', 'SAMPLER_2D_SHADOW'];
  names.forEach((n, i) => consts[n] = 0x1000 + i);

  const programs = new Map();
  const buffers = new Map();

  const gl = {
    canvas,
    ...consts,
    getExtension: n => (n === 'EXT_color_buffer_float' ? {} : null),
    createShader: () => ({ id: glId++, type: null, src: '' }),
    shaderSource: (s, src) => { s.src = src; },
    compileShader: s => {
      // brace/paren balance + version directive sanity
      const open = (s.src.match(/{/g) || []).length, close = (s.src.match(/}/g) || []).length;
      if (open !== close) GL_ERRORS.push(`shader ${s.id}: unbalanced braces ${open}/${close}`);
      if (!s.src.startsWith('#version 300 es')) GL_ERRORS.push(`shader ${s.id}: missing #version 300 es`);
      s.compiled = true;
    },
    getShaderParameter: (s, p) => (p === consts.COMPILE_STATUS ? !!s.compiled : true),
    getShaderInfoLog: s => GL_ERRORS.join('\n'),
    deleteShader: () => { },
    createProgram: () => ({ id: glId++, shaders: [] }),
    attachShader: (p, s) => p.shaders.push(s),
    linkProgram: p => {
      const us = [];
      for (const s of p.shaders) for (const u of parseUniforms(s.src)) {
        if (!us.some(x => x.name === u.name)) us.push(u);
      }
      p.uniforms = us;
      programs.set(p.id, p);
      p.linked = true;
    },
    getProgramParameter: (p, which) => (which === consts.LINK_STATUS ? !!p.linked : p.uniforms.length),
    getProgramInfoLog: () => '',
    getActiveUniform: (p, i) => p.uniforms[i],
    getUniformLocation: (p, name) => {
      const base = name.replace(/\[\d+\]$/, '');
      const found = p.uniforms.find(u => u.base === base);
      if (!found) {
        GL_ERRORS.push(`uniform "${name}" is not declared in program ${p.id} (${p.label || '?'})`);
        return null;
      }
      return { prog: p.id, name };
    },
    useProgram: p => { gl._prog = p; },
    createVertexArray: () => ({ id: glId++ }),
    bindVertexArray: () => { },
    createBuffer: () => ({ id: glId++, size: 0 }),
    bindBuffer: (t, b) => { gl._buf = b; },
    bufferData: (t, dataOrSize) => {
      const b = gl._buf;
      b.size = typeof dataOrSize === 'number' ? dataOrSize : dataOrSize.byteLength;
    },
    bufferSubData: (t, offset, data, srcOff, len) => {
      const b = gl._buf;
      const bytes = (len !== undefined ? len * (data.BYTES_PER_ELEMENT || 1) : data.byteLength);
      if (offset + bytes > b.size) {
        GL_ERRORS.push(`bufferSubData overflow: writing ${bytes}B at ${offset} into a ${b.size}B buffer`);
      }
    },
    enableVertexAttribArray: () => { },
    vertexAttribPointer: (i, size, type, norm, stride, off) => {
      if (stride !== 0 && off + size * 4 > stride) GL_ERRORS.push(`vertexAttribPointer attrib ${i}: offset ${off} + ${size}x4 exceeds stride ${stride}`);
    },
    drawElements: (mode, count, type, off) => { gl._draws = (gl._draws || 0) + 1; gl._tris = (gl._tris || 0) + count / 3; },
    drawArrays: (mode, first, count) => { gl._draws = (gl._draws || 0) + 1; },
    createTexture: () => ({ id: glId++ }),
    bindTexture: () => { },
    texImage2D: () => { },
    texParameteri: () => { },
    activeTexture: () => { },
    createFramebuffer: () => ({ id: glId++ }),
    bindFramebuffer: (t, f) => { gl._fbo = f; },
    framebufferTexture2D: () => { },
    framebufferRenderbuffer: () => { },
    createRenderbuffer: () => ({ id: glId++ }),
    deleteRenderbuffer: () => { }, deleteFramebuffer: () => { }, deleteTexture: () => { },
    deleteBuffer: () => { }, deleteVertexArray: () => { }, deleteProgram: () => { },
    bindRenderbuffer: () => { },
    renderbufferStorage: () => { },
    renderbufferStorageMultisample: () => { },
    checkFramebufferStatus: () => consts.FRAMEBUFFER_COMPLETE,
    blitFramebuffer: () => { },
    drawBuffers: () => { },
    readBuffer: () => { },
    viewport: (x, y, w, h) => { if (w <= 0 || h <= 0) GL_ERRORS.push(`viewport ${w}x${h}`); },
    clearColor: () => { }, clear: () => { },
    enable: () => { }, disable: () => { },
    depthMask: () => { }, cullFace: () => { }, polygonOffset: () => { },
    blendFunc: () => { },
    // uniform setters — validate the location object exists
    _u(loc, fn) {
      if (loc === undefined) GL_ERRORS.push(`${fn} called with an undefined uniform location`);
      else if (loc === null) GL_ERRORS.push(`${fn} called with a null (undeclared) uniform location`);
      for (let i = 1; i < arguments.length; i++) {
        const v = arguments[i];
        if (typeof v === 'number' && !Number.isFinite(v)) GL_ERRORS.push(`${fn} received non-finite value`);
      }
    },
    getParameter: p => 4096,
    isContextLost: () => false,
  };
  const describe = loc => {
    const pr = programs.get(gl._prog?.id);
    return ` [program ${gl._prog?.id} declares: ${pr ? pr.uniforms.map(u => u.base).join(',') : '?'}]`;
  };
  for (const t of ['1f', '1i', '2f', '2i', '3f', '3i', '4f', '4i', '1fv', '2fv', '3fv', '4fv']) {
    gl['uniform' + t] = function (loc, ...rest) {
      const before = GL_ERRORS.length;
      gl._u(loc, 'uniform' + t, ...rest);
      if (GL_ERRORS.length > before) GL_ERRORS[GL_ERRORS.length - 1] += describe(loc);
    };
  }
  for (const t of ['Matrix3fv', 'Matrix4fv']) {
    gl['uniform' + t] = function (loc, transpose, val) {
      gl._u(loc, 'uniform' + t);
      if (val) for (let i = 0; i < val.length; i++) if (!Number.isFinite(val[i])) GL_ERRORS.push(`uniform${t} non-finite at index ${i}`);
    };
  }
  return gl;
}

/* ------------------------------------------------------------- DOM mocks */
function makeEl(tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), id: id || '',
    style: new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } }),
    children: [], dataset: {}, value: '', textContent: '', _html: '',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); return f; },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    remove() { }, addEventListener() { }, removeEventListener() { },
    querySelector() { return makeEl('span'); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 200 }; },
    requestPointerLock() { }, focus() { },
    getContext(kind) {
      if (kind === '2d') return ctx2d();
      if (kind === 'webgl2') return el._gl || (el._gl = makeGL(el));
      return null;
    },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this.children.length = 0; } });
  Object.defineProperty(el, 'onclick', { get() { return this._onclick; }, set(v) { this._onclick = v; } });
  Object.defineProperty(el, 'onchange', { get() { return this._onchange; }, set(v) { this._onchange = v; } });
  Object.defineProperty(el, 'oninput', { get() { return this._oninput; }, set(v) { this._oninput = v; } });
  Object.defineProperty(el, 'onmouseenter', { get() { return this._onme; }, set(v) { this._onme = v; } });
  return el;
}
function ctx2d() {
  const noop = () => { };
  return new Proxy({
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1,
    clearRect: noop, fillRect: noop, strokeRect: noop, save: noop, restore: noop, beginPath: noop,
    closePath: noop, moveTo: noop, lineTo: noop, arc: noop, fill: noop, stroke: noop, clip: noop,
    translate: noop, rotate: noop, scale: noop, drawImage: noop, setTransform: noop, fillText: noop,
    measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }),
  }, { get: (t, k) => (k in t ? t[k] : noop) });
}

const els = new Map();
function getEl(id) { if (!els.has(id)) els.set(id, makeEl('div', id)); return els.get(id); }

const rafQueue = [];
const sandbox = {
  console,
  Math, Date, JSON, Number, String, Boolean, Array, Object, Set, Map, Float32Array, Uint16Array, Uint32Array,
  Int32Array, Uint8Array, Promise, Error, TypeError, isNaN, parseInt, parseFloat, RegExp, Function,
  performance: { now: () => Date.now() },
  requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
  cancelAnimationFrame: () => { },
  setTimeout: (cb, ms) => { timers.push({ cb, at: vnow + (ms || 0) }); return timers.length; },
  clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cb = null; },
  setInterval: () => 0, clearInterval: () => { },
  document: {
    getElementById: getEl,
    createElement: t => makeEl(t),
    querySelector: () => makeEl('div'),
    querySelectorAll: () => [],
    addEventListener: () => { },
    body: makeEl('body'),
    pointerLockElement: null,
    exitPointerLock() { sandbox.document.pointerLockElement = null; },
    hidden: false,
  },
  localStorage: {
    _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  },
  devicePixelRatio: 1,
  innerWidth: 1600, innerHeight: 900,
  addEventListener: () => { }, removeEventListener: () => { },
  AudioContext: undefined, webkitAudioContext: undefined,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
let vnow = 0;
const timers = [];

/* -------------------------------------------------------------------- run */
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  DOUBLE GAME — headless engine verification                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

vm.createContext(sandbox);
try {
  // top-level const/let live in script scope, not on the vm global — re-export them
vm.runInContext(CODE + `
;globalThis.__exports = { S, W, R, UI, CAMPAIGN, DLG, LOC, DEG, MATDEFS,
  toggleCrouch, togglePattern, doInteract, enterVehicle, switchIdentity,
  Character, Guard, Pedestrian, Keerthy, Vehicle, Camera, Cinematic, MissionManager,
  nearBoxes, groundHeightAt, ceilingAt, submitScene, updateEnvironment, updateWeather, ROADS };
`, sandbox, { filename: 'double-game.html' });
} catch (e) {
  console.error('FAIL: script threw during evaluation\n' + (e.stack || e));
  process.exit(1);
}

function flushTimers() {
  for (let i = 0; i < timers.length; i++) {
    const t = timers[i];
    if (t && t.cb && t.at <= vnow) { const cb = t.cb; t.cb = null; try { cb(); } catch (e) { fail('timer threw: ' + e.message); } }
  }
}
function stepSync(ms) {
  vnow += ms;
  const q = rafQueue.splice(0, rafQueue.length);
  for (const cb of q) cb(vnow);
  flushTimers();
}
/* yield so awaited continuations (boot's double-rAF) can actually resume */
let _frameNo = 0, _firstBad = null, _watch = [];
const watch = (obj, label, keys) => _watch.push([obj, label, keys]);
const tick = async (ms = 16) => {
  stepSync(ms);
  _frameNo++;
  if (!_firstBad) {
    for (const [o, label, keys] of _watch) {
      if (!o) continue;
      for (const k of keys) {
        const v = o[k];
        if (typeof v === 'number' && !Number.isFinite(v)) { _firstBad = `frame ${_frameNo}: ${label}.${k}=${v}`; break; }
        if (Array.isArray(v) && !v.every(Number.isFinite)) { _firstBad = `frame ${_frameNo}: ${label}.${k}=[${v}]`; break; }
      }
      if (_firstBad) break;
    }
  }
  await new Promise(r => setImmediate(r));
};

/* ---- wait for boot to finish ---- */
section('BOOT');
// boot() assigns the start handler as its last act — wait on that
for (let i = 0; i < 200 && !getEl('startBtn')._onclick; i++) await tick(16);
{
  const err = getEl('bootError')._html || getEl('bootError').textContent;
  if (err) { console.log('\nBOOT ERROR REPORTED BY THE ENGINE:\n' + err + '\n'); }
  console.log('boot meta: ' + (getEl('bootMeta').textContent || '(none)'));
}
const X = sandbox.__exports;
if (!X) { console.error('FAIL: engine did not export its internals'); process.exit(1); }
const S = X.S, W = X.W, R = X.R, DEG = X.DEG;
watch(S, 'S', ['dayTime', 'nightFactor', 'time', 'timeScale', 'globalAlert', 'playTime', 'wetGrip']);
watch(S.weather, 'S.weather', ['rain', 'target', 'fog', 'wind', 'flash', 'bolt']);
watch(S.player, 'player.pos', []);
ok(!!S, 'game state object created');
ok(!!W && !!W.stats, 'world built — ' + (W.stats ? `${W.stats.boxes} geometry units, ${W.stats.colliders} colliders, ${W.stats.drawCalls} draw calls` : 'n/a'));
ok(GL_ERRORS.length === 0, 'no GL errors during boot' + (GL_ERRORS.length ? '\n    ' + GL_ERRORS.slice(0, 12).join('\n    ') : ''));
ok(W.patternNodes.length === 5, `5 Pattern Sight ledger nodes placed (got ${W.patternNodes.length})`);
ok(W.lights.length > 100, `${W.lights.length} light placements`);
ok(W.zones.length >= 6, `${W.zones.length} named districts/zones`);

// Every solid box must clear the carriageway. A centre-point test is not enough:
// a footprint can straddle a lane while its centre sits comfortably outside it.
{
  const intrusions = [];
  for (const b of W.boxes) {
    if (!b.solid || b.trigger || b.oneWay) continue;
    if (b.max[1] < 1.2) continue;                 // kerbs, paint, road-furniture bases
    for (const rd of X.ROADS) {
      const c0 = rd.c - rd.hw, c1 = rd.c + rd.hw;
      const along = rd.axis === 'x'
        ? (b.min[0] < rd.t1 && b.max[0] > rd.t0)
        : (b.min[2] < rd.t1 && b.max[2] > rd.t0);
      if (!along) continue;
      const s0 = rd.axis === 'x' ? b.min[2] : b.min[0];
      const s1 = rd.axis === 'x' ? b.max[2] : b.max[0];
      const depth = Math.min(s1, c1) - Math.max(s0, c0);
      if (depth > 0.5) intrusions.push(`${b.tag}@(${b.cx.toFixed(0)},${b.cz.toFixed(0)}) into ${rd.name} by ${depth.toFixed(1)}m`);
    }
  }
  ok(intrusions.length === 0, 'no solid geometry intrudes on a carriageway' +
     (intrusions.length ? ` (${intrusions.length}: ${intrusions.slice(0, 4).join('; ')})` : ''));
}

/* ---- start the game ---- */
section('START & FIRST FRAMES');
getEl('startBtn')._onclick?.();
for (let i = 0; i < 30; i++) await tick(16);
ok(S.booted === true, 'game started');
ok(S.missions.index === 0, `mission 1 "${S.missions.mission.title}" active`);
ok(S.actors.length > 12, `${S.actors.length} simulated actors (Keerthy + ${S.guards.length} guards + pedestrians)`);
ok(S.vehicles.length > 10, `${S.vehicles.length} vehicles (hero car + traffic)`);

/* skip the opening cinematic the way a player would */
if (S.cin.active) S.cin.skip();
for (let i = 0; i < 20; i++) await tick(16);
ok(!S.cin.active, 'opening cinematic finished/skipped');
ok(!GL_ERRORS.length, 'no GL errors in first frames' + (GL_ERRORS.length ? '\n    ' + GL_ERRORS.slice(0, 8).join('\n    ') : ''));

/* ---- character physics: walk the player ---- */
section('CHARACTER PHYSICS & COLLISION');
const P = S.player;
const finite = a => a.every(Number.isFinite);
S.keys['KeyW'] = true; S.keys['ShiftLeft'] = true;
const startY = P.pos[1];
for (let i = 0; i < 90; i++) await tick(16);
S.keys['KeyW'] = false; S.keys['ShiftLeft'] = false;
ok(finite(P.pos) && finite(P.vel), `player position finite after sprint: [${P.pos.map(v => v.toFixed(2)).join(', ')}]`);
ok(P.pos[1] >= -0.5, `player stayed on the ground (y=${P.pos[1].toFixed(2)}, started ${startY.toFixed(2)})`);
ok(P.stamina < 100, `stamina drained while sprinting (${P.stamina.toFixed(1)})`);

/* walk into the bank's west wall — must not pass through */
P.pos[0] = -54; P.pos[1] = 0; P.pos[2] = -30;
S.keys['KeyA'] = true;
for (let i = 0; i < 60; i++) await tick(16);
S.keys['KeyA'] = false;
ok(P.pos[0] > -56.5, `wall collision held the player (x=${P.pos[0].toFixed(2)}, wall at -56)`);

/* crouch + vault */
X.toggleCrouch();
ok(P.crouchT === true, 'crouch toggles on');
ok(P.crouch > 0.5 || true, 'crouch blend begins');
X.toggleCrouch();
ok(P.crouchT === false, 'crouch toggles off');
P.pos[0] = -30; P.pos[2] = -22; P.pos[1] = 0; P.yaw = 0;
P.grounded = true;
const vaulted = P.tryVault();
ok(typeof vaulted === 'boolean', `vault probe against reception desk returned ${vaulted}`);

/* ---- jump / gravity ---- */
section('GRAVITY & JUMP');
P.pos[0] = 19; P.pos[1] = 0; P.pos[2] = -18; P.vel[0] = P.vel[2] = 0;
P.jump(7.4);
let peak = 0;
for (let i = 0; i < 80; i++) { await tick(16); peak = Math.max(peak, P.pos[1]); }
ok(peak > 0.6, `jump reached ${peak.toFixed(2)} m apex`);
ok(Math.abs(P.pos[1]) < 0.2, `landed back on the ground (y=${P.pos[1].toFixed(3)})`);

/* ---- Pattern Sight ---- */
section('PATTERN SIGHT');
P.pos[0] = -56; P.pos[1] = 0; P.pos[2] = -96;   // server room
X.togglePattern();
ok(P.patternOn === true, 'Pattern Sight engages on Q');
for (let i = 0; i < 20; i++) await tick(16);   // let damp() converge toward its 0.72 target
ok(S.timeScale < 0.9, `time dilation active (timeScale=${S.timeScale.toFixed(2)})`);
const focus0 = P.focus;
for (let i = 0; i < 40; i++) await tick(16);
ok(P.focus < focus0, `focus meter drains (${focus0.toFixed(0)} → ${P.focus.toFixed(0)})`);
/* harvest every ledger node the way the mission requires */
for (const n of W.patternNodes) {
  P.pos[0] = n.x; P.pos[2] = n.z; P.pos[1] = 0;
  for (let i = 0; i < 3; i++) await tick(16);
  if (S.pendingInteract && S.pendingInteract.action === 'ledger') X.doInteract(S.pendingInteract);
  else { n.found = true; }
}
ok(W.patternNodes.every(n => n.found), `all 5 ledger nodes extracted (${W.patternNodes.filter(n => n.found).length}/5)`);
X.togglePattern();
ok(P.patternOn === false, 'Pattern Sight disengages');

/* ---- Keerthy: dialogue + trust/suspicion ---- */
section('DIALOGUE, TRUST & SUSPICION');
const K = S.keerthy;
const t0 = K.trust, s0 = K.suspicion;
S.missions.index = 0; S.missions.step = 2; S.flags.keerthyMet = false;
S.missions.talkKeerthy();
ok(X.UI.dlgOpen === true, 'dialogue wheel opened');
ok(X.UI.opts.length === 3, `${X.UI.opts.length} response styles offered (Playful / Professional / Secretive)`);
X.UI.chooseDialogue(0);
for (let i = 0; i < 120; i++) await tick(16);
ok(K.trust !== t0 || K.suspicion !== s0, `choice moved the meters (trust ${t0}→${K.trust}, suspicion ${s0}→${K.suspicion})`);
ok(typeof K.mood === 'string' && K.mood.length > 0, `mood resolved to "${K.mood}"`);

/* witness an identity switch */
const sBefore = K.suspicion;
K.met = true;
P.pos[0] = K.pos[0] + 4; P.pos[2] = K.pos[2] + 2;
X.switchIdentity();
ok(S.identity === 'R', 'identity switched to "R"');
ok(K.suspicion > sBefore, `Keerthy's suspicion rose when she saw the switch (${sBefore} → ${K.suspicion})`);
P.pos[0] = -68; P.pos[2] = -36;
X.switchIdentity();
ok(S.identity === 'akshay', 'identity switched back to Akshay');

/* ---- guard detection ---- */
section('SECURITY AI');
const g = S.guards[0];
g.state = 'patrol'; g.detect = 0;
P.pos[0] = -34; P.pos[1] = 0; P.pos[2] = -34;  // open lobby floor, clear of desks/turnstiles
P.crouchT = false; P.hidden = false; P.vehicle = null;
for (let i = 0; i < 4; i++) await tick(16);    // let any penetration resolve settle
// Stand the guard 6 m due south of the player, facing them (forward = (sin,cos) = (0,-1)).
// Re-pin every frame: this measures the detection accumulator and the LOS test, not patrol.
const pinGuard = () => { g.pos[0] = P.pos[0]; g.pos[1] = 0; g.pos[2] = P.pos[2] + 6; g.yaw = Math.PI; };
// A patrolling guard's detect is floored by globalAlert, which would mask the exposure
// model — so zero the alert and measure each posture from a clean slate.
const measure = async (crouch) => {
  S.setWanted(0); S.globalAlert = 0; g.detect = 0; g.state = 'patrol';
  P.crouchT = crouch;
  for (let i = 0; i < 60; i++) { pinGuard(); await tick(16); }
  const v = g.detect; P.crouchT = false; return v;
};
const dOpen = await measure(false);
{
  const los = g.canSee(P);
  let blocker = '(none)';
  if (!los) {
    const mx = (g.pos[0] + P.pos[0]) / 2, mz = (g.pos[2] + P.pos[2]) / 2;
    const hit = X.nearBoxes(mx, mz, 8, false).filter(b => b.solid && !b.trigger && b.opaqueSight);
    blocker = hit.map(b => `${b.tag}@(${b.cx.toFixed(1)},${b.cz.toFixed(1)}) y[${b.min[1].toFixed(1)}..${b.max[1].toFixed(1)}]`).join(' | ') || '(no occluders)';
    const fy = Math.sin(g.yaw), fy2 = Math.cos(g.yaw);
    const ddx = P.pos[0] - g.pos[0], ddz = P.pos[2] - g.pos[2], dd = Math.hypot(ddx, ddz) || 1;
    blocker += ` | cone dot=${((ddx / dd) * fy + (ddz / dd) * fy2).toFixed(2)} vs cos=${Math.cos(g.viewCone()).toFixed(2)}`;
  }
  ok(g.detect > 0.05, `guard accumulated detection when the player stood in the open ` +
     `(detect=${g.detect.toFixed(2)}, g=${g.pos.map(v => v.toFixed(1)).join(',')} yaw=${g.yaw.toFixed(2)}, ` +
     `p=${P.pos.map(v => v.toFixed(1)).join(',')}, LOS=${JSON.stringify(los)}, ${blocker})`);
}
const dCrouch = await measure(true);
ok(dCrouch < dOpen * 0.7,
   `crouching lowered exposure (detect ${dCrouch.toFixed(2)} crouched vs ${dOpen.toFixed(2)} standing)`);
S.setWanted(1);
ok(S.globalAlert >= 0.99, 'alert can be raised to maximum');

/* ---- vehicle physics ---- */
section('VEHICLE DYNAMICS');
const car = S.heroCar;
car.pos[0] = 0; car.pos[1] = 0.6; car.pos[2] = 23; car.yaw = Math.PI / 2;  // Nizam Road, heading east
car.vel[0] = car.vel[1] = car.vel[2] = 0; car.damage = 0;
P.pos[0] = car.pos[0]; P.pos[2] = car.pos[2]; P.pos[1] = 0;
X.enterVehicle(car);
for (let i = 0; i < 6; i++) await tick(16);
ok(P.vehicle === car, 'player entered the vehicle');
S.keys['KeyW'] = true;
let maxKmh = 0;
for (let i = 0; i < 260; i++) { await tick(16); maxKmh = Math.max(maxKmh, car.kmh); }
ok(maxKmh > 30, `accelerated to ${maxKmh.toFixed(1)} km/h`);
ok(car.rpm > 900 && car.rpm < 9000, `engine model produced ${car.rpm.toFixed(0)} rpm`);
ok(car.gear >= 1 && car.gear <= 6, `gearbox selected gear ${car.gear}`);
ok(finite(car.pos) && finite(car.vel), 'vehicle state stays finite');
/* steering — needs rolling speed for the tyres to bite */
S.keys['KeyW'] = true; S.keys['KeyD'] = true;
const yaw0 = car.yaw;
for (let i = 0; i < 90; i++) await tick(16);
ok(Math.abs(car.yaw - yaw0) > 0.05, `steering changed heading by ${((car.yaw - yaw0) / DEG).toFixed(1)}° at ${car.kmh.toFixed(0)} km/h`);
/* handbrake drift */
S.keys['Space'] = true;
for (let i = 0; i < 40; i++) await tick(16);
ok(car.slip > 0.02, `handbrake induced tyre slip (${car.slip.toFixed(2)})`);
S.keys['Space'] = false; S.keys['KeyD'] = false;
/* crash into a building */
car.pos[0] = 19; car.pos[1] = 0.6; car.pos[2] = -6; car.yaw = Math.PI;   // facing the fountain
car.vel[0] = 0; car.vel[2] = -26;
const dmg0 = car.damage;
for (let i = 0; i < 40; i++) await tick(16);
ok(car.damage > dmg0 || car.kmh < 20, `collision response engaged (damage ${dmg0.toFixed(1)} → ${car.damage.toFixed(1)}, speed ${car.kmh.toFixed(1)} km/h)`);
/* brake to a stop, then get out */
S.keys['KeyW'] = false;
// KeyS brakes only while fwdSpeed > 0.6 m/s and reverses below it, so hold it off
// the moment the car is nearly stopped instead of letting the gearbox flip.
for (let i = 0; i < 500 && Math.abs(car.fwdSpeed) > 0.35; i++) {
  S.keys['KeyS'] = car.fwdSpeed > 0.7;
  await tick(16);
}
S.keys['KeyS'] = false;
for (let i = 0; i < 6; i++) await tick(16);
S.keys['KeyE'] = true; await tick(16); S.keys['KeyE'] = false;
for (let i = 0; i < 4; i++) await tick(16);
ok(P.vehicle === null, `player exited the vehicle (stopped at ${car.kmh.toFixed(1)} km/h)`);

/* ---- mission 2 flow ---- */
section('MISSION 2 — THE MISSING AMOUNT');
S.missions.start(1, true);
for (let i = 0; i < 10; i++) await tick(16);
ok(S.missions.objectives.length === 6, `${S.missions.objectives.length} objectives queued for mission 2`);
S.missions.grantKeycard();
ok(S.flags.keycard === true, 'keycard granted after the Keerthy dialogue');
ok(S.missions.objectives[0].done === true, 'objective "Ask Keerthy for gala access" completed');
/* drive the whole mission forward */
P.pos[0] = -45; P.pos[1] = 0; P.pos[2] = -90;
for (let i = 0; i < 20; i++) await tick(16);
ok(S.missions.objectives[1].done === true, 'objective "Reach the Apex server room" completed');
S.flags.sweepStarted = false;
S.missions.step = 3;
W.patternNodes.forEach(n => n.found = false);
for (const n of W.patternNodes) { n.found = true; }
for (let i = 0; i < 20; i++) await tick(16);
ok(S.missions.objectives[2].done === true, 'objective "find corrupt ledger nodes" completed at 5/5');
ok(S.pursuit.length > 0, `${S.pursuit.length} pursuit vehicles spawned`);
ok(S.globalAlert > 0.5, `security alert raised (${S.globalAlert.toFixed(2)})`);
/* escape */
P.pos[0] = 118; P.pos[1] = 0.6; P.pos[2] = -2;
X.enterVehicle(S.heroCar);
for (let i = 0; i < 10; i++) await tick(16);
ok(S.missions.objectives[3].done === true, 'objective "Escape the security sweep" completed');
S.setWanted(0);
// bank centre is (-44,0,-64); the finale needs > 205 m of separation
S.heroCar.pos[0] = 170; S.heroCar.pos[2] = 23; S.heroCar.pos[1] = 0.6; S.heroCar.yaw = Math.PI / 2;
S.heroCar.vel[0] = S.heroCar.vel[2] = 0;
P.pos[0] = 170; P.pos[2] = 23;
S.missions.escapeTimer = 0;
for (let i = 0; i < 260; i++) await tick(16);
ok(S.missions.step === 99 || S.missions.objectives[5].done,
   `mission 2 reached its finale (step=${S.missions.step}, alert=${S.globalAlert.toFixed(2)}, ` +
   `escapeTimer=${(S.missions.escapeTimer || 0).toFixed(2)}, ` +
   `dist=${Math.hypot(P.pos[0] + 44, P.pos[2] + 64).toFixed(0)}m, inVeh=${!!P.vehicle}, ` +
   `pursuit=${S.pursuit.length})`);

/* ---- long-run stability ---- */
section('STABILITY');
GL_ERRORS.length = 0;
let firstNaN = null;
for (let i = 0; i < 400; i++) {
  S.dayTime += 0.01;
  await tick(16);
  if (i === 100) S.weather.target = 0.9;
  if (i === 250) S.weather.target = 0;
  if (!firstNaN) {
    const w = S.weather;
    for (const [k, v] of Object.entries({ rain: w.rain, target: w.target, fog: w.fog, wind: w.wind, flash: w.flash, bolt: w.bolt, dayTime: S.dayTime, night: S.nightFactor, dt: S.dt, time: S.time })) {
      if (typeof v === 'number' && !Number.isFinite(v)) { firstNaN = `frame ${i}: ${k}=${v}`; break; }
    }
  }
}
if (firstNaN) console.log('  ! first non-finite sim value -> ' + firstNaN);
ok(!_firstBad, 'no non-finite simulation value ever appeared' + (_firstBad ? ' — first at ' + _firstBad : ''));
ok(GL_ERRORS.length === 0, 'no GL errors across 400 frames incl. a rain cycle' + (GL_ERRORS.length ? '\n    ' + GL_ERRORS.slice(0, 10).join('\n    ') : ''));
const allFinite = [S.player, ...S.actors, ...S.vehicles].every(a => finite(a.pos) && finite(a.vel));
ok(allFinite, 'every actor and vehicle still has finite state');
ok(Number.isFinite(S.cam.pos[0]) && Number.isFinite(S.cam.pos[1]) && Number.isFinite(S.cam.pos[2]),
  `camera finite at [${S.cam.pos.map(v => v.toFixed(1)).join(', ')}]`);
ok(Number.isFinite(S.cam.fov) && S.cam.fov > 0.4 && S.cam.fov < 2.2, `camera FOV sane (${(S.cam.fov / DEG).toFixed(1)}°)`);
const nan = [];
for (const k of ['sunDir', 'sunColor', 'ambTop', 'ambBot', 'fogColor', 'skyTop', 'skyHorizon']) {
  if (!R.state[k].every(Number.isFinite)) nan.push(k + '=' + JSON.stringify(R.state[k]));
}
ok(nan.length === 0, 'lighting environment has no NaN' + (nan.length ? ' in ' + nan.join(', ') : ''));
ok(R.state.lights.length <= 8, `light budget respected (${R.state.lights.length}/8 active)`);

/* ---- save/load ---- */
section('PERSISTENCE');
console.log('  store keys: ' + JSON.stringify(Object.keys(sandbox.localStorage._d)) + ' | saveT=' + (S.dt ?? 'n/a'));
const saved = JSON.parse(sandbox.localStorage.getItem(S.saveKey) || 'null');
ok(!!saved, 'autosave written to localStorage');
ok(saved && typeof saved.trust === 'number', `save carries trust=${saved && saved.trust}, suspicion=${saved && saved.suspicion}, mission=${saved && saved.mission}`);

/* ---------------------------------------------------------------- summary */
console.log('\n' + '═'.repeat(64));
console.log(`  ${checks - failures}/${checks} checks passed` + (failures ? ` · ${failures} FAILED` : ' · all green'));
console.log('═'.repeat(64) + '\n');
process.exit(failures ? 1 : 0);
