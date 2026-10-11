/* ============================================================================
   80 — UI / HUD
   Objectives, radar minimap, dialogue wheel, subtitles, toasts, prompts,
   relationship meters and the pause / mission-complete screens.
   ============================================================================ */

const UI = { el: {}, mapCtx: null, worldMap: null, mapScale: 1.0 };

function $(id) { return document.getElementById(id); }

function initUI() {
  const ids = ['objAct', 'objTitle', 'objList', 'objHint', 'idName', 'idRole', 'hpVal', 'hpFill', 'stamVal', 'stamFill', 'stamLbl', 'relPane',
    'detVal', 'detFill', 'relName', 'relMood', 'trustFill', 'suspFill', 'relNote', 'minimap', 'mapZone', 'compass',
    'prompt', 'promptKey', 'promptText', 'subs', 'dlg', 'dlgSpeaker', 'dlgQ', 'dlgOpts', 'toasts', 'banner', 'banAct',
    'banTitle', 'banSub', 'speedo', 'speedVal', 'gearVal', 'dmgFill', 'alertPane', 'alertTxt', 'dbg', 'clock',
    'pause', 'mcomp', 'mcName', 'mcStats', 'mcNext', 'evPane', 'evTitle', 'evBody', 'patternWash', 'vignette', 'bootError',
    'alertVignette', 'cross', 'boot', 'bootMeta', 'bootBar', 'startBtn', 'touch'];
  ids.forEach(i => UI.el[i] = $(i));
  UI.mapCtx = UI.el.minimap.getContext('2d');
  UI.dlgSel = 0;
  UI.dlgOpen = false;
  UI.opts = [];

  // pause controls
  $('btnResume').onclick = () => S.setPaused(false);
  $('btnRestart').onclick = () => { S.setPaused(false); S.restartAct(); };
  $('btnSkip').onclick = () => { S.setPaused(false); S.missions.skipMission(); };
  $('mcContinue').onclick = () => { UI.el.mcomp.classList.add('hidden'); S.missions.advance(); };
  $('setQual').onchange = e => S.setQuality(+e.target.value);
  $('setFov').oninput = e => { S.cam.baseFov = (+e.target.value) * DEG; };
  $('setSens').oninput = e => { S.cam.sens = (+e.target.value) / 100; };
  $('setVol').oninput = e => { if (S.audio) S.audio.setVolume((+e.target.value) / 100); };
  $('setInv').onchange = e => { S.invertY = e.target.value === '1'; };
  $('setShake').oninput = e => { S.cam.shakeScale = (+e.target.value) / 100; };

  // touch controls
  if (('ontouchstart' in window) && window.innerWidth < 1100) {
    UI.el.touch.classList.remove('hidden');
    initTouch();
  }
}

/* ------------------------------------------------------------- world map */
function buildWorldMap() {
  const b = W.bounds;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const size = 1024;
  UI.mapScale = size / span;
  UI.mapOrigin = [b.minX, b.minZ];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const X = x => (x - b.minX) * UI.mapScale;
  const Z = z => (z - b.minZ) * UI.mapScale;

  g.fillStyle = '#0a0f16'; g.fillRect(0, 0, size, size);
  // ground blocks
  g.fillStyle = '#111823';
  g.fillRect(0, 0, size, size);

  // roads
  g.fillStyle = '#2b3340';
  for (const rd of ROADS) {
    if (rd.axis === 'x') g.fillRect(X(rd.t0), Z(rd.c - rd.hw), X(rd.t1) - X(rd.t0), rd.hw * 2 * UI.mapScale);
    else g.fillRect(X(rd.c - rd.hw), Z(rd.t0), rd.hw * 2 * UI.mapScale, Z(rd.t1) - Z(rd.t0));
  }
  // buildings
  for (const bx of W.boxes) {
    if (bx.tag !== 'building' && bx.tag !== 'column') continue;
    const w = (bx.max[0] - bx.min[0]) * UI.mapScale, h = (bx.max[2] - bx.min[2]) * UI.mapScale;
    const tall = bx.max[1] - bx.min[1];
    g.fillStyle = tall > 40 ? '#3a4655' : (tall > 18 ? '#2f3a48' : '#28313d');
    g.fillRect(X(bx.min[0]), Z(bx.min[2]), w, h);
  }
  // bank footprint highlight
  g.fillStyle = 'rgba(233,182,74,0.16)';
  g.fillRect(X(-80), Z(-116), 72 * UI.mapScale, 103 * UI.mapScale);
  g.strokeStyle = 'rgba(233,182,74,0.55)'; g.lineWidth = 2;
  g.strokeRect(X(-80), Z(-116), 72 * UI.mapScale, 103 * UI.mapScale);
  // plaza
  g.fillStyle = 'rgba(120,160,200,0.10)';
  g.fillRect(X(-8), Z(-46), 54 * UI.mapScale, 60 * UI.mapScale);
  // cafe
  g.fillStyle = 'rgba(255,143,179,0.14)';
  g.fillRect(X(48), Z(-34), 28 * UI.mapScale, 26 * UI.mapScale);
  // parking deck
  g.fillStyle = 'rgba(87,226,255,0.12)';
  g.fillRect(X(100), Z(-44), 48 * UI.mapScale, 64 * UI.mapScale);
  UI.worldMap = c;
}

function drawMinimap() {
  const g = UI.mapCtx, size = 200;
  g.clearRect(0, 0, size, size);
  if (!UI.worldMap) return;
  const P = S.player;
  const yaw = S.cam.mode === 'drive' && P.vehicle ? P.vehicle.yaw : S.cam.yaw;
  const range = P.vehicle ? 96 : 56;               // metres visible across the radar
  const pxm = size / (range * 2);

  g.save();
  g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, TAU); g.clip();
  g.translate(size / 2, size / 2);
  g.rotate(yaw);
  const sc = pxm / UI.mapScale;
  g.scale(sc, sc);
  g.translate(-(P.pos[0] - UI.mapOrigin[0]) * UI.mapScale, -(P.pos[2] - UI.mapOrigin[1]) * UI.mapScale);
  g.drawImage(UI.worldMap, 0, 0);
  g.restore();

  // blips
  const blip = (x, z, colour, r, ring) => {
    const dx = x - P.pos[0], dz = z - P.pos[2];
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
    const rx = dx * cy - dz * sy, rz = dx * sy + dz * cy;
    const sx = size / 2 + rx * pxm, sz = size / 2 - rz * pxm;
    if (Math.hypot(sx - size / 2, sz - size / 2) > size / 2 - 4) return;
    g.fillStyle = colour;
    g.beginPath(); g.arc(sx, sz, r, 0, TAU); g.fill();
    if (ring) { g.strokeStyle = colour; g.lineWidth = 1; g.beginPath(); g.arc(sx, sz, r + 3, 0, TAU); g.stroke(); }
  };

  // objective marker
  const obj = S.missions.currentMarker();
  if (obj) {
    const dx = obj[0] - P.pos[0], dz = obj[1] - P.pos[2];
    const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
    let rx = dx * cy - dz * sy, rz = dx * sy + dz * cy;
    const d = Math.hypot(rx, rz);
    const maxR = size / 2 - 9;
    let sx, sz, clamped = false;
    if (d * pxm > maxR) { rx *= maxR / (d * pxm); rz *= maxR / (d * pxm); clamped = true; }
    sx = size / 2 + rx * pxm; sz = size / 2 - rz * pxm;
    g.save();
    g.translate(sx, sz);
    g.fillStyle = 'rgba(233,182,74,0.95)';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(6, 5); g.lineTo(0, 2); g.lineTo(-6, 5); g.closePath(); g.fill();
    if (clamped) { g.strokeStyle = 'rgba(233,182,74,0.5)'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.stroke(); }
    g.restore();
  }

  // characters
  for (const a of S.actors) {
    if (a === P || a.dead) continue;
    if (a.kind === 'guard') blip(a.pos[0], a.pos[2], a.state === 'alert' ? '#ff4d5e' : (a.state === 'patrol' ? '#7f95b5' : '#ffb020'), 3.2, a.state === 'alert');
    else if (a.kind === 'keerthy') blip(a.pos[0], a.pos[2], '#ff8fb3', 4.2, true);
    else blip(a.pos[0], a.pos[2], 'rgba(160,185,215,0.55)', 2.1);
  }
  for (const v of S.vehicles) {
    if (v === P.vehicle) continue;
    blip(v.pos[0], v.pos[2], v.ai ? '#ff6b4a' : 'rgba(140,170,200,0.6)', 3);
  }
  // pattern-sight nodes
  if (P.patternOn) for (const n of W.patternNodes) if (!n.found) blip(n.x, n.z, '#2ff0ff', 4, true);

  // player arrow (always centred, pointing up)
  g.save();
  g.translate(size / 2, size / 2);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -7.5); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.stroke();
  g.restore();

  // compass heading
  const deg = ((-yaw / DEG) % 360 + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  UI.el.compass.innerHTML = `<b>${dirs[Math.round(deg / 45) % 8]}</b>`;
}

/* ------------------------------------------------------------- objectives */
function setObjectives(act, title, list, hint) {
  UI.el.objAct.textContent = act;
  UI.el.objTitle.textContent = title;
  UI.el.objList.innerHTML = '';
  list.forEach(o => {
    const d = document.createElement('div');
    d.className = 'obj' + (o.done ? ' done' : (o.active ? ' active' : '')) + (o.hot ? ' hot' : '');
    d.innerHTML = `<div class="tick"></div><div>${o.text}</div>`;
    UI.el.objList.appendChild(d);
  });
  UI.el.objHint.innerHTML = hint || '';
}

/* ------------------------------------------------------------------ toast */
function toast(html, kind, ms) {
  const d = document.createElement('div');
  d.className = 'toast ' + (kind || '');
  d.innerHTML = html;
  UI.el.toasts.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 500); }, ms || 3200);
}

/* --------------------------------------------------------------- subtitle */
let subTimer = null;
function subtitle(who, text, dur) {
  if (!text) { UI.el.subs.innerHTML = ''; return; }
  UI.el.subs.innerHTML = `<div class="sub-line"><span class="sub-who">${who || ''}</span><span class="sub-txt"></span></div>`;
  const target = UI.el.subs.querySelector('.sub-txt');
  // typewriter reveal — reads like a game, not a text dump
  let i = 0;
  const step = () => {
    i = Math.min(text.length, i + 2);
    target.textContent = text.slice(0, i);
    if (i < text.length) requestAnimationFrame(step);
  };
  step();
  if (S.audio && who) S.audio.dialogBlip(/KEERTHY/i.test(who));
  clearTimeout(subTimer);
  subTimer = setTimeout(() => { UI.el.subs.innerHTML = ''; }, (dur || 3.2) * 1000);
}
function clearSubs() { clearTimeout(subTimer); UI.el.subs.innerHTML = ''; }

/* ----------------------------------------------------------------- banner */
let bannerTimer = null;
function banner(act, title, sub) {
  UI.el.banAct.textContent = act;
  UI.el.banTitle.textContent = title;
  UI.el.banSub.textContent = sub || '';
  UI.el.banner.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => UI.el.banner.classList.remove('on'), 4200);
}

/* ----------------------------------------------------------------- prompt */
function prompt(key, text) {
  if (!text) { UI.el.prompt.classList.remove('on'); return; }
  UI.el.promptKey.textContent = key || 'E';
  UI.el.promptText.innerHTML = text;
  UI.el.prompt.classList.add('on');
}

/* --------------------------------------------------------- dialogue wheel */
function showDialogue(speaker, question, options) {
  UI.dlgOpen = true;
  UI.opts = options;
  UI.dlgSel = 0;
  UI.el.dlgSpeaker.textContent = speaker || '';
  UI.el.dlgQ.innerHTML = question || '';
  UI.el.dlgOpts.innerHTML = '';
  options.forEach((o, i) => {
    const d = document.createElement('div');
    d.className = 'opt' + (i === 0 ? ' sel' : '');
    const eff = o.effect || [];
    const effHtml = eff.map(e => {
      const cls = e.v > 0 ? 'up' : 'dn';
      const s = e.v > 0 ? '+' : '';
      return `<b class="${cls}">${e.k} ${s}${e.v}</b>`;
    }).join(' · ');
    d.innerHTML = `<div class="key">${i + 1}</div><div class="tag ${o.tag || 'professional'}">${o.tag || 'neutral'}</div>
      <div class="txt">${o.text}</div><div class="eff">${effHtml}</div>`;
    d.onclick = () => chooseDialogue(i);
    d.onmouseenter = () => { UI.dlgSel = i; refreshDlgSel(); if (S.audio) S.audio.blip(i); };
    UI.el.dlgOpts.appendChild(d);
  });
  UI.el.dlg.classList.add('on');
  if (S.audio) S.audio.select();
}
function refreshDlgSel() {
  [...UI.el.dlgOpts.children].forEach((c, i) => c.classList.toggle('sel', i === UI.dlgSel));
}
function moveDialogue(dir) {
  if (!UI.dlgOpen) return;
  UI.dlgSel = (UI.dlgSel + dir + UI.opts.length) % UI.opts.length;
  refreshDlgSel();
  if (S.audio) S.audio.blip(UI.dlgSel);
}
function chooseDialogue(i) {
  if (!UI.dlgOpen) return;
  const o = UI.opts[i === undefined ? UI.dlgSel : i];
  if (!o) return;
  UI.dlgOpen = false;
  UI.el.dlg.classList.remove('on');
  if (S.audio) S.audio.select();
  if (o.onChoose) o.onChoose();
}
function hideDialogue() { UI.dlgOpen = false; UI.el.dlg.classList.remove('on'); }

/* --------------------------------------------------------------- evidence */
function showEvidence(title, body, ms) {
  UI.el.evTitle.innerHTML = title;
  UI.el.evBody.innerHTML = body;
  UI.el.evPane.classList.add('on');
  clearTimeout(UI.evTimer);
  UI.evTimer = setTimeout(() => UI.el.evPane.classList.remove('on'), ms || 6500);
}

/* ------------------------------------------------------------ per-frame */
function updateHUD(dt) {
  const P = S.player;
  // vitals
  UI.el.hpVal.textContent = Math.round(P.hp);
  UI.el.hpFill.style.width = P.hp + '%';
  UI.el.stamVal.textContent = Math.round(P.stamina);
  UI.el.stamFill.style.width = P.stamina + '%';

  // identity
  if (S.identity === 'R') {
    UI.el.idName.textContent = '"R"';
    UI.el.idRole.textContent = 'Nobody You Know';
    UI.el.idName.style.color = '#ffd479';
  } else {
    UI.el.idName.textContent = 'AKSHAY VARMA';
    UI.el.idRole.textContent = 'Operations Analyst · Apex Global';
    UI.el.idName.style.color = '';
  }

  // detection
  const det = clamp01(S.globalAlert);
  UI.el.detFill.style.width = (det * 100) + '%';
  UI.el.detVal.textContent = det > 0.85 ? 'COMBAT' : det > 0.5 ? 'ALERT' : det > 0.15 ? 'SUSPICIOUS' : 'CLEAR';
  UI.el.detVal.style.color = det > 0.5 ? '#ff8a95' : (det > 0.15 ? '#ffd479' : '');
  UI.el.alertPane.classList.toggle('on', det > 0.5);
  UI.el.alertVignette.style.opacity = det > 0.5 ? (0.35 + Math.sin(S.time * 6) * 0.2) * det : 0;

  // relationship
  const K = S.keerthy;
  UI.el.trustFill.style.width = K.trust + '%';
  UI.el.suspFill.style.width = K.suspicion + '%';
  UI.el.relMood.textContent = K.met ? K.moodLine : 'Event Strategist — Unmet';
  UI.el.relNote.innerHTML = K.met
    ? (K.suspicion > 60 ? 'She is comparing your stories. One more inconsistency and it is over.'
      : K.trust > 60 ? 'She leans in when you speak. Keep it that way.'
        : 'Professional, curious, unreadable.')
    : 'You have not met her yet.';

  // speedometer
  const v = P.vehicle;
  UI.el.speedo.classList.toggle('on', !!v);
  if (v) {
    UI.el.speedVal.textContent = Math.round(v.kmh);
    UI.el.gearVal.textContent = v.fwdSpeed < -0.5 ? 'R' : (Math.abs(v.kmh) < 1 ? 'N' : v.gear);
    UI.el.dmgFill.style.width = (100 - v.damage) + '%';
    UI.el.relPane.style.opacity = 0.35;
  } else UI.el.relPane.style.opacity = 1;

  // damage vignette
  UI.el.vignette.style.opacity = P.hp < 45 ? (1 - P.hp / 45) * 0.85 : 0;

  // zone label
  let zoneName = 'HYDERABAD';
  for (const z of W.zones) {
    if (P.pos[0] >= z.minX && P.pos[0] <= z.maxX && P.pos[2] >= z.minZ && P.pos[2] <= z.maxZ) { zoneName = z.name; break; }
  }
  if (UI._zone !== zoneName) { UI._zone = zoneName; UI.el.mapZone.textContent = zoneName; }

  // clock
  UI.el.clock.textContent = S.clockString() + ' · ' + S.weatherLabel();

  // pattern sight wash
  UI.el.patternWash.classList.toggle('on', P.patternOn);
  document.body.classList.toggle('aim', !!P.aimMode);

  drawMinimap();
}

/* ------------------------------------------------------------------ pause */
function setPaused(on) {
  UI.el.pause.classList.toggle('hidden', !on);
  if (on && document.pointerLockElement) document.exitPointerLock();
}

function missionComplete(name, stats, next) {
  UI.el.mcName.textContent = name;
  UI.el.mcStats.innerHTML = stats.map(s => `<div class="mcStat"><b>${s.v}</b><span>${s.k}</span></div>`).join('');
  UI.el.mcNext.innerHTML = next || '';
  UI.el.mcomp.classList.remove('hidden');
  if (S.audio) S.audio.missionDone();
}

/* ------------------------------------------------------------------ touch */
function initTouch() {
  const stick = $('stick'), nub = $('stickNub');
  let sid = null, cx = 0, cy = 0;
  const set = (dx, dy) => {
    const l = Math.hypot(dx, dy), max = 48;
    const k = l > max ? max / l : 1;
    nub.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    S.touchMove = [dx * k / max, dy * k / max];
  };
  stick.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; sid = t.identifier;
    const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  stick.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === sid) set(t.clientX - cx, t.clientY - cy);
    e.preventDefault();
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; set(0, 0); } };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);

  document.querySelectorAll('.tbtn').forEach(b => {
    const act = b.dataset.act;
    b.addEventListener('touchstart', e => {
      e.preventDefault();
      if (act === 'sprint') S.touch.sprint = true;
      else if (act === 'jump') S.keys['Space'] = true;
      else if (act === 'interact') S.keys['KeyE'] = true;
      else if (act === 'crouch') S.keys['KeyC'] = true;
      else if (act === 'pattern') S.keys['KeyQ'] = true;
    }, { passive: false });
    b.addEventListener('touchend', e => {
      e.preventDefault();
      if (act === 'sprint') S.touch.sprint = false;
      else if (act === 'jump') S.keys['Space'] = false;
      else if (act === 'interact') S.keys['KeyE'] = false;
      else if (act === 'crouch') S.keys['KeyC'] = false;
      else if (act === 'pattern') S.keys['KeyQ'] = false;
    }, { passive: false });
  });

  // drag on the right half of the screen to look
  let lid = null, lx = 0, ly = 0;
  window.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.4 && lid === null && !t.target.closest('#hud,#touch,.pane')) {
        lid = t.identifier; lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === lid) {
      S.cam.addLook((t.clientX - lx) * 1.6, (t.clientY - ly) * 1.6);
      lx = t.clientX; ly = t.clientY;
    }
  }, { passive: true });
  window.addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === lid) lid = null; });
}

/* Publish the HUD API — the rest of the engine calls these through UI.* */
Object.assign(UI, {
  initUI, buildWorldMap, drawMinimap, setObjectives, toast, subtitle, clearSubs, banner,
  prompt, showDialogue, refreshDlgSel, moveDialogue, chooseDialogue, hideDialogue,
  showEvidence, updateHUD, setPaused, missionComplete, initTouch,
});
