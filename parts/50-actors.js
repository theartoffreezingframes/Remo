/* ============================================================================
   50 — ACTORS, PROCEDURAL ANIMATION & AI
   Every character is animated analytically: two-bone IK for legs and arms,
   foot planting, head look-at, lean/roll from momentum, vault and ragdoll
   poses. No skeletal assets, no mocap data.
   ============================================================================ */

const _v1 = [0, 0, 0], _v2 = [0, 0, 0], _v3 = [0, 0, 0], _v4 = [0, 0, 0];

/* ------------------------------------------------------- geometry helpers */
/** Oriented box between two points (used for every limb). */
function limb(batch, ax, ay, az, bx, by, bz, rw, rd, col, lenScale) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz) * (lenScale || 1);
  if (len < 1e-4) return;
  const ux = dx / Math.hypot(dx, dy, dz), uy = dy / Math.hypot(dx, dy, dz), uz = dz / Math.hypot(dx, dy, dz);
  let rx, ry, rz;
  if (Math.abs(uy) < 0.94) { rx = -uy; ry = ux; rz = 0; }
  else { rx = 0; ry = -uz; rz = uy; }
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  const zx = uy * rz - uz * ry, zy = uz * rx - ux * rz, zz = ux * ry - uy * rx;
  const m = R.tmpM;
  m[0] = rx * rw * 2; m[1] = ry * rw * 2; m[2] = rz * rw * 2; m[3] = 0;
  m[4] = ux * len; m[5] = uy * len; m[6] = uz * len; m[7] = 0;
  m[8] = zx * rd * 2; m[9] = zy * rd * 2; m[10] = zz * rd * 2; m[11] = 0;
  m[12] = (ax + bx) / 2; m[13] = (ay + by) / 2; m[14] = (az + bz) / 2; m[15] = 1;
  batch.push(m, col[0], col[1], col[2], col[3] === undefined ? 1 : col[3]);
}

/** Oriented cylinder (wheels, pipes, posts). */
function pushCyl(batch, cx, cy, cz, ax, ay, az, radius, length, col) {
  const l = Math.hypot(ax, ay, az) || 1;
  const ux = ax / l, uy = ay / l, uz = az / l;
  let rx, ry, rz;
  if (Math.abs(uy) < 0.94) { rx = -uy; ry = ux; rz = 0; } else { rx = 0; ry = -uz; rz = uy; }
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  const zx = uy * rz - uz * ry, zy = uz * rx - ux * rz, zz = ux * ry - uy * rx;
  const m = R.tmpM2;
  m[0] = rx * radius * 2; m[1] = ry * radius * 2; m[2] = rz * radius * 2; m[3] = 0;
  m[4] = ux * length; m[5] = uy * length; m[6] = uz * length; m[7] = 0;
  m[8] = zx * radius * 2; m[9] = zy * radius * 2; m[10] = zz * radius * 2; m[11] = 0;
  m[12] = cx; m[13] = cy; m[14] = cz; m[15] = 1;
  batch.push(m, col[0], col[1], col[2], col[3] === undefined ? 1 : col[3]);
}

/** Two-bone IK: returns the mid joint for root→target with a pole hint. */
function ik2(ax, ay, az, bx, by, bz, l1, l2, px, py, pz, out) {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  let d = Math.hypot(dx, dy, dz);
  const maxR = (l1 + l2) * 0.999, minR = Math.abs(l1 - l2) * 1.001;
  if (d > maxR) { const k = maxR / d; dx *= k; dy *= k; dz *= k; d = maxR; bx = ax + dx; by = ay + dy; bz = az + dz; }
  else if (d < minR) d = minR;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = ax + dx * (a / d), my = ay + dy * (a / d), mz = az + dz * (a / d);
  // perpendicular inside the plane spanned by (d) and the pole hint
  let ux = dx / d, uy = dy / d, uz = dz / d;
  let ox = py * uz - pz * uy, oy = pz * ux - px * uz, oz = px * uy - py * ux;
  const ol = Math.hypot(ox, oy, oz);
  if (ol < 1e-5) { ox = 1; oy = 0; oz = 0; } else { ox /= ol; oy /= ol; oz /= ol; }
  out[0] = mx + ox * h; out[1] = my + oy * h; out[2] = mz + oz * h;
  out[3] = bx; out[4] = by; out[5] = bz;
  return out;
}

/* ------------------------------------------------------------ actor basis */
function actorBasis(a, out) {
  const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
  const cp = Math.cos(a.lean), sp = Math.sin(a.lean);
  const cr = Math.cos(a.roll || 0), sr = Math.sin(a.roll || 0);
  // forward
  out.fx = sy * cp; out.fy = -sp; out.fz = cy * cp;
  // right
  out.rx = cy * cr + sy * sp * sr; out.ry = cp * sr; out.rz = -sy * cr + cy * sp * sr;
  // up
  out.ux = -cy * sr + sy * sp * cr; out.uy = cp * cr; out.uz = sy * sr + cy * sp * cr;
  return out;
}
const _basis = { fx: 0, fy: 0, fz: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
function localPt(a, lx, ly, lz, out) {
  actorBasis(a, _basis);
  out[0] = a.pos[0] + _basis.rx * lx + _basis.ux * ly + _basis.fx * lz;
  out[1] = a.pos[1] + _basis.ry * lx + _basis.uy * ly + _basis.fy * lz;
  out[2] = a.pos[2] + _basis.rz * lx + _basis.uz * ly + _basis.fz * lz;
  return out;
}

/* ------------------------------------------------------------- wardrobes */
const OUTFITS = {
  akshay: {
    shirt: [0.88, 0.90, 0.94], pants: [0.13, 0.17, 0.26], skin: [0.72, 0.53, 0.38],
    hair: [0.10, 0.08, 0.07], shoe: [0.16, 0.11, 0.08], accent: [0.35, 0.20, 0.24], tie: true
  },
  r: {
    shirt: [0.07, 0.07, 0.09], pants: [0.10, 0.10, 0.13], skin: [0.72, 0.53, 0.38],
    hair: [0.08, 0.07, 0.06], shoe: [0.05, 0.05, 0.06], accent: [0.85, 0.68, 0.28], jacket: true, shades: true
  },
  keerthy: {
    shirt: [0.72, 0.26, 0.42], pants: [0.55, 0.19, 0.32], skin: [0.76, 0.56, 0.40],
    hair: [0.09, 0.06, 0.06], shoe: [0.35, 0.20, 0.16], accent: [0.95, 0.80, 0.35], dupatta: true, female: true
  },
  guard: {
    shirt: [0.11, 0.16, 0.27], pants: [0.09, 0.13, 0.22], skin: [0.62, 0.45, 0.33],
    hair: [0.07, 0.06, 0.05], shoe: [0.05, 0.05, 0.06], accent: [0.85, 0.72, 0.20], cap: true
  },
  naveen: {
    shirt: [0.85, 0.80, 0.62], pants: [0.28, 0.26, 0.24], skin: [0.66, 0.47, 0.34],
    hair: [0.11, 0.09, 0.07], shoe: [0.22, 0.16, 0.12], accent: [0.30, 0.45, 0.70]
  },
};
const PED_OUTFITS = [
  { shirt: [0.85, 0.85, 0.88], pants: [0.25, 0.28, 0.34], skin: [0.70, 0.51, 0.37], hair: [0.09, 0.07, 0.06], shoe: [0.12, 0.10, 0.09], accent: [0.4, 0.3, 0.3] },
  { shirt: [0.24, 0.42, 0.55], pants: [0.20, 0.20, 0.24], skin: [0.63, 0.45, 0.33], hair: [0.08, 0.06, 0.05], shoe: [0.10, 0.09, 0.09], accent: [0.8, 0.6, 0.3] },
  { shirt: [0.72, 0.35, 0.28], pants: [0.86, 0.83, 0.76], skin: [0.75, 0.55, 0.40], hair: [0.10, 0.08, 0.07], shoe: [0.20, 0.14, 0.10], accent: [0.3, 0.5, 0.4], female: true, dupatta: true },
  { shirt: [0.92, 0.88, 0.78], pants: [0.42, 0.40, 0.36], skin: [0.66, 0.47, 0.34], hair: [0.12, 0.10, 0.09], shoe: [0.15, 0.11, 0.09], accent: [0.2, 0.3, 0.5] },
  { shirt: [0.30, 0.30, 0.34], pants: [0.16, 0.16, 0.20], skin: [0.58, 0.41, 0.30], hair: [0.07, 0.06, 0.05], shoe: [0.08, 0.07, 0.07], accent: [0.9, 0.7, 0.2] },
  { shirt: [0.55, 0.62, 0.35], pants: [0.35, 0.30, 0.26], skin: [0.71, 0.52, 0.38], hair: [0.09, 0.07, 0.06], shoe: [0.13, 0.10, 0.09], accent: [0.7, 0.25, 0.3], female: true },
];

/** Draw a fully posed humanoid into the dynamic batch. */
function drawHumanoid(a, batch, cylBatch) {
  const o = a.outfit || PED_OUTFITS[0];
  const hs = a.height;
  const crouch = Math.max(a.crouch, a.sit || 0);
  const stride = clamp01(a.speed / 4.5);
  const p = a.gait;

  // ragdoll pose
  if (a.ragdoll) {
    const P = a.ragdoll.pts;
    const skin = o.skin, shirt = o.shirt, pants = o.pants;
    const link = (i, j, r, col) => limb(batch, P[i].x, P[i].y, P[i].z, P[j].x, P[j].y, P[j].z, r, r, col);
    link(0, 1, 0.10, shirt); link(1, 2, 0.115, shirt);
    link(1, 3, 0.06, shirt); link(1, 4, 0.06, shirt);
    link(2, 5, 0.075, pants); link(2, 6, 0.075, pants);
    const hd = P[0];
    M4.compose(R.tmpM, hd.x, hd.y, hd.z, 0, 0, 0, 0.20, 0.24, 0.21);
    batch.push(R.tmpM, skin[0], skin[1], skin[2], 1);
    return;
  }

  /* ---- vertical landmarks (crouch compresses the stack) ---- */
  const drop = crouch * 0.42;
  const pelvisY = hs * 0.53 - drop * 0.55 + (a.vault > 0 ? -0.06 : 0);
  const chestY = hs * 0.70 - drop * 0.34;
  const neckY = hs * 0.845 - drop * 0.20;
  const headY = hs * 0.935 - drop * 0.14;
  const shX = hs * 0.115, hipX = hs * 0.058;
  const upArm = hs * 0.163, loArm = hs * 0.15;
  const thigh = hs * 0.245, shin = hs * 0.238;

  const land = a.landImpact;
  const crouchSink = land * 0.10;

  /* ---- torso ---- */
  actorBasis(a, _basis);
  const roll = a.roll || 0;
  // pelvis block
  localPt(a, 0, pelvisY - crouchSink, 0, _v1);
  M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean * 0.5, roll, 0.30, 0.20, 0.19);
  batch.push(R.tmpM, o.pants[0], o.pants[1], o.pants[2], 1);
  // chest block
  localPt(a, 0, chestY - crouchSink, 0.01, _v1);
  M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean, roll, 0.375, 0.34, 0.215);
  batch.push(R.tmpM, o.shirt[0], o.shirt[1], o.shirt[2], 1);
  if (o.jacket) {                                   // R's leather jacket shell
    localPt(a, 0, chestY - crouchSink - 0.02, 0.015, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean, roll, 0.415, 0.40, 0.245);
    batch.push(R.tmpM, 0.06, 0.06, 0.08, 1);
    localPt(a, 0, chestY - crouchSink + 0.06, 0.13, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean + 0.5, roll, 0.30, 0.14, 0.05);
    batch.push(R.tmpM, 0.05, 0.05, 0.07, 1);
  }
  if (o.dupatta) {                                  // draped fabric
    localPt(a, -0.09, chestY - crouchSink + 0.05, 0.10, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean + 0.25, roll, 0.16, 0.55, 0.04);
    batch.push(R.tmpM, o.accent[0], o.accent[1], o.accent[2], 0.95);
  }
  if (o.tie) {
    localPt(a, 0, chestY - crouchSink + 0.02, 0.115, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean, roll, 0.075, 0.30, 0.02);
    batch.push(R.tmpM, o.accent[0], o.accent[1], o.accent[2], 1);
  }
  // neck
  localPt(a, 0, neckY - crouchSink, 0, _v1);
  localPt(a, 0, neckY - crouchSink + 0.09, 0, _v2);
  limb(batch, _v1[0], _v1[1], _v1[2], _v2[0], _v2[1], _v2[2], 0.052, 0.052, o.skin);

  /* ---- head (with look-at) ---- */
  const headYaw = a.yaw + (a.headYaw || 0);
  const headPitch = (a.headPitch || 0);
  localPt(a, 0, headY - crouchSink, 0.01, _v1);
  M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], headYaw, headPitch, roll * 0.5, 0.185, 0.235, 0.20);
  batch.push(R.tmpM, o.skin[0], o.skin[1], o.skin[2], 1);
  // hair
  localPt(a, 0, headY - crouchSink + 0.085, -0.028, _v1);
  M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], headYaw, headPitch, roll * 0.5, 0.195, 0.115, 0.205);
  batch.push(R.tmpM, o.hair[0], o.hair[1], o.hair[2], 1);
  if (o.female) {                                   // long hair
    localPt(a, 0, headY - crouchSink - 0.14, -0.075, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], headYaw, headPitch + 0.1, roll * 0.5, 0.185, 0.30, 0.075);
    batch.push(R.tmpM, o.hair[0], o.hair[1], o.hair[2], 1);
  }
  if (o.shades) {
    localPt(a, 0, headY - crouchSink + 0.015, 0.105, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], headYaw, headPitch, roll * 0.5, 0.175, 0.055, 0.03);
    batch.push(R.tmpM, 0.03, 0.03, 0.05, 1);
  }
  if (o.cap) {
    localPt(a, 0, headY - crouchSink + 0.115, 0.01, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], headYaw, headPitch, roll * 0.5, 0.20, 0.075, 0.21);
    batch.push(R.tmpM, 0.07, 0.10, 0.17, 1);
    localPt(a, 0, headY - crouchSink + 0.10, 0.135, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], headYaw, headPitch - 0.1, roll * 0.5, 0.15, 0.03, 0.10);
    batch.push(R.tmpM, 0.07, 0.10, 0.17, 1);
  }
  // jaw / nose hint
  localPt(a, 0, headY - crouchSink - 0.055, 0.09, _v1);
  M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], headYaw, headPitch, 0, 0.13, 0.075, 0.06);
  batch.push(R.tmpM, o.skin[0] * 0.96, o.skin[1] * 0.96, o.skin[2] * 0.96, 1);

  /* ---- legs: two-bone IK with foot planting ---- */
  const swing = Math.sin(p) * 0.34 * stride;
  const lift = Math.max(0, Math.sin(p)) * 0.15 * stride;
  const swing2 = Math.sin(p + PI) * 0.34 * stride;
  const lift2 = Math.max(0, Math.sin(p + PI)) * 0.15 * stride;
  const stanceSpread = (1 - stride) * 0.02;
  const crouchKnee = crouch * 0.26;

  const legs = [[-hipX, swing, lift, -1], [hipX, swing2, lift2, 1]];
  for (const [hx, fz, fy, side] of legs) {
    let vx = 0, vy = 0, vz = 0;
    if (a.vault > 0) {                              // tucked vault pose
      const k = Math.sin(a.vault * PI);
      vz = 0.30 * k * (side > 0 ? 1 : 0.5); vy = 0.34 * k;
    } else if (!a.grounded) {                       // airborne tuck
      vz = 0.10 + side * 0.05; vy = 0.06;
    } else {
      vz = fz + stanceSpread * side; vy = fy;
    }
    localPt(a, hx, pelvisY - crouchSink - 0.06, 0, _v1);
    localPt(a, hx * 1.15, vy + (a.grounded ? 0.02 : 0.35) - crouchKnee, vz, _v2);
    ik2(_v1[0], _v1[1], _v1[2], _v2[0], _v2[1], _v2[2], thigh, shin,
      _basis.fx, _basis.fy + 0.55, _basis.fz, _v3);
    limb(batch, _v1[0], _v1[1], _v1[2], _v3[0], _v3[1], _v3[2], 0.082, 0.088, o.pants);
    limb(batch, _v3[0], _v3[1], _v3[2], _v3[3], _v3[4], _v3[5], 0.062, 0.068, o.pants);
    // foot
    localPt(a, hx * 1.15, (a.grounded ? 0.035 : 0.42) - crouchKnee, vz + 0.075, _v4);
    if (!a.grounded) { _v4[1] = _v3[5] - 0.03; }
    limb(batch, _v3[3] - _basis.rx * 0.0, _v3[4] - 0.03, _v3[5], _v4[0], _v4[1], _v4[2], 0.055, 0.085, o.shoe);
  }

  /* ---- arms ---- */
  const aiming = a.aimMode && a.kind === 'player';
  const armSwing = Math.sin(p + PI) * 0.28 * stride;
  const armSwing2 = Math.sin(p) * 0.28 * stride;
  const idleSway = Math.sin(S ? S.time * 1.4 : 0) * 0.02;
  const arms = [[-shX, armSwing, -1], [shX, armSwing2, 1]];
  for (const [sx, az, side] of arms) {
    localPt(a, sx, chestY - crouchSink + 0.10, 0, _v1);
    let tx, ty, tz;
    if (aiming) {
      const gy = Math.sin(a.aimYaw), gz = Math.cos(a.aimYaw);
      tx = sx * 0.35 + gy * 0.42; ty = chestY - crouchSink + 0.02 + Math.sin(-(a.aimPitch || 0)) * 0.3;
      tz = gz * 0.42;
    } else if (a.vault > 0) {
      const k = Math.sin(a.vault * PI);
      tx = sx * 0.7; ty = chestY - crouchSink + 0.15 * k + 0.3 * k; tz = 0.35 * k + 0.1;
    } else if (a.talking) {                        // conversational gestures
      const g = Math.sin((S ? S.time : 0) * 2.4 + side) * 0.5 + 0.5;
      tx = sx * (1.15 + g * 0.25); ty = chestY - crouchSink - 0.05 + g * 0.30; tz = 0.18 + g * 0.16;
    } else if (a.carrying) {
      tx = sx * 0.8; ty = chestY - crouchSink - 0.02; tz = 0.30;
    } else {
      tx = sx * 1.02 + idleSway; ty = pelvisY - crouchSink + 0.04; tz = az - 0.02;
    }
    localPt(a, tx, ty, tz, _v2);
    ik2(_v1[0], _v1[1], _v1[2], _v2[0], _v2[1], _v2[2], upArm, loArm,
      -_basis.fx * 0.6 + _basis.rx * side * 0.8, -_basis.uy * 0.4 - 0.5, -_basis.fz * 0.6, _v3);
    limb(batch, _v1[0], _v1[1], _v1[2], _v3[0], _v3[1], _v3[2], 0.055, 0.058, o.jacket ? [0.06, 0.06, 0.08] : o.shirt);
    limb(batch, _v3[0], _v3[1], _v3[2], _v3[3], _v3[4], _v3[5], 0.045, 0.048, o.skin);
    // hand
    limb(batch, _v3[3], _v3[4], _v3[5], _v3[3] + _basis.fx * 0.07, _v3[4] - 0.02, _v3[5] + _basis.fz * 0.07, 0.042, 0.05, o.skin);
  }
  if (o.jacket) {                                   // gold chain for "R"
    localPt(a, 0, chestY - crouchSink + 0.13, 0.125, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean, 0, 0.13, 0.02, 0.02);
    batch.push(R.tmpM, o.accent[0], o.accent[1], o.accent[2], 1);
  }
  // shoulder pads silhouette
  for (const s of [-1, 1]) {
    localPt(a, s * shX, chestY - crouchSink + 0.115, 0, _v1);
    M4.compose(R.tmpM, _v1[0], _v1[1], _v1[2], a.yaw, a.lean, roll, 0.13, 0.12, 0.20);
    batch.push(R.tmpM, o.shirt[0] * 0.97, o.shirt[1] * 0.97, o.shirt[2] * 0.97, 1);
  }
}

/* --------------------------------------------------------- vehicle render */
const _carM = M4.create();
const _cw = [0, 0, 0], _cw2 = [0, 0, 0];

/** Local (x = right, y = up, z = forward) to world. R = Ry(yaw)·Rx(pitch)·Rz(roll). */
function carLocal(v, lx, ly, lz, out) {
  const cr = Math.cos(v.roll), sr = Math.sin(v.roll);
  const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr, rz = lz;
  const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  const qx = rx, qy = cp * ry - sp * rz, qz = sp * ry + cp * rz;
  const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
  out[0] = v.pos[0] + qx * c + qz * s;
  out[1] = v.pos[1] + qy;
  out[2] = v.pos[2] - qx * s + qz * c;
  return out;
}

function drawVehicle(v, batch, cylBatch) {
  const col = typeof v.color === 'string' ? (v._col || (v._col = hexToRgb(v.color))) : v.color;
  const dark = [col[0] * 0.62, col[1] * 0.62, col[2] * 0.62];

  const part = (lx, ly, lz, sx, sy, sz, colour) => {
    carLocal(v, lx, ly, lz, _cw);
    M4.compose(_carM, _cw[0], _cw[1], _cw[2], v.yaw, v.pitch, v.roll, sx, sy, sz);
    batch.push(_carM, colour[0], colour[1], colour[2], colour[3] === undefined ? 1 : colour[3]);
  };
  const glassPart = (lx, ly, lz, sx, sy, sz, tint) => {
    carLocal(v, lx, ly, lz, _cw);
    M4.compose(_carM, _cw[0], _cw[1], _cw[2], v.yaw, v.pitch, v.roll, sx, sy, sz);
    R.dyn2.push(_carM, tint[0], tint[1], tint[2], tint[3]);
  };

  // chassis + panels
  part(0, 0.58, 0, 1.86, 0.46, 4.52, col);
  part(0, 0.86, 0.05, 1.80, 0.22, 4.30, col);
  part(0, 0.42, 1.62, 1.72, 0.30, 1.20, col);                 // bonnet
  part(0, 0.44, -1.72, 1.74, 0.32, 1.00, col);                // boot
  part(0, 1.20, -0.12, 1.62, 0.62, 2.36, dark);               // greenhouse
  part(0, 1.52, -0.12, 1.56, 0.08, 2.20, col);                // roof
  part(0, 0.36, 2.24, 1.80, 0.22, 0.22, [0.12, 0.12, 0.14]);  // front bumper
  part(0, 0.36, -2.24, 1.80, 0.22, 0.22, [0.12, 0.12, 0.14]); // rear bumper
  part(-0.62, 0.60, 2.30, 0.44, 0.14, 0.06, [1.0, 0.96, 0.82]);
  part(0.62, 0.60, 2.30, 0.44, 0.14, 0.06, [1.0, 0.96, 0.82]);
  part(-0.62, 0.62, -2.30, 0.42, 0.12, 0.06, [0.85, 0.10, 0.12]);
  part(0.62, 0.62, -2.30, 0.42, 0.12, 0.06, [0.85, 0.10, 0.12]);
  part(0, 0.24, 0, 1.70, 0.16, 3.90, [0.06, 0.06, 0.07]);
  part(-0.94, 0.78, 0.55, 0.03, 0.50, 1.05, dark);            // door seams
  part(0.94, 0.78, 0.55, 0.03, 0.50, 1.05, dark);
  part(-0.94, 0.78, -0.75, 0.03, 0.50, 1.05, dark);
  part(0.94, 0.78, -0.75, 0.03, 0.50, 1.05, dark);
  part(-0.97, 0.86, 0.95, 0.04, 0.05, 0.16, [0.75, 0.77, 0.80]);
  part(0.97, 0.86, 0.95, 0.04, 0.05, 0.16, [0.75, 0.77, 0.80]);
  part(-1.04, 1.02, 0.95, 0.14, 0.09, 0.16, dark);            // mirrors
  part(1.04, 1.02, 0.95, 0.14, 0.09, 0.16, dark);

  // glass
  const gt = [0.42, 0.58, 0.68, 0.42];
  glassPart(0, 1.22, 1.06, 1.50, 0.60, 0.06, gt);
  glassPart(0, 1.22, -1.30, 1.48, 0.56, 0.06, gt);
  glassPart(-0.80, 1.22, -0.12, 0.05, 0.48, 2.10, gt);
  glassPart(0.80, 1.22, -0.12, 0.05, 0.48, 2.10, gt);

  // wheels — axle direction taken by differencing two transformed points
  const hw = v.track / 2, hl = v.wheelbase / 2;
  for (let i = 0; i < 4; i++) {
    const lx = (i % 2 === 0) ? -hw : hw;
    const lz = (i < 2) ? hl : -hl;
    const drop = 0.34 - v.susp[i] * 0.10;
    carLocal(v, lx - 0.5, drop, lz, _cw);
    carLocal(v, lx + 0.5, drop, lz, _cw2);
    const ax = _cw2[0] - _cw[0], ay = _cw2[1] - _cw[1], az = _cw2[2] - _cw[2];
    const mx = (_cw[0] + _cw2[0]) / 2, my = (_cw[1] + _cw2[1]) / 2, mz = (_cw[2] + _cw2[2]) / 2;
    pushCyl(cylBatch, mx, my, mz, ax, ay, az, 0.33, 0.26, [0.09, 0.09, 0.10]);
    const sgn = lx > 0 ? 0.14 : -0.14;
    pushCyl(cylBatch, mx + ax * sgn, my + ay * sgn, mz + az * sgn, ax, ay, az, 0.19, 0.06, [0.62, 0.64, 0.68]);
  }

  // emissive lamp faces
  if (v.headlights && S.nightFactor > 0.15) {
    part(-0.62, 0.60, 2.34, 0.50, 0.20, 0.06, [1.0, 0.96, 0.80]);
    part(0.62, 0.60, 2.34, 0.50, 0.20, 0.06, [1.0, 0.96, 0.80]);
  }
  if (v.brakeLight) {
    part(-0.62, 0.62, -2.34, 0.46, 0.14, 0.06, [1.0, 0.05, 0.08]);
    part(0.62, 0.62, -2.34, 0.46, 0.14, 0.06, [1.0, 0.05, 0.08]);
  }
}

/* ============================================================================
   NPC — pedestrians
   ============================================================================ */
class Pedestrian extends Character {
  constructor(o) {
    super(o);
    this.outfit = o.outfit || PED_OUTFITS[0];
    this.kind = 'ped';
    this.wp = o.wp || [[0, 0], [10, 0]];
    this.wpi = 0;
    this.waitT = 0;
    this.panic = 0;
    this.height = o.height || (this.outfit.female ? 1.66 : 1.76);
    this.scale = this.height / 1.78;
    this.chatter = rnd(TAU);
  }
  update(dt) {
    if (this.dead) return;
    this.panic = Math.max(0, this.panic - dt * 0.25);

    if (this.waitT > 0) {
      this.waitT -= dt;
      this.applyIntent(0, 0, false, dt);
      this.headYaw = Math.sin(S.time * 0.7 + this.chatter) * 0.5;
      super.update(dt);
      return;
    }
    const t = this.wp[this.wpi];
    const dx = t[0] - this.pos[0], dz = t[1] - this.pos[2];
    const d = Math.hypot(dx, dz);
    if (d < 1.2) {
      this.wpi = (this.wpi + 1) % this.wp.length;
      this.waitT = rnd(0.6, 4.2);
    }
    // flee from loud events
    let fx = 0, fz = 0;
    if (this.panic > 0) {
      const px = this.pos[0] - this.panicSrc[0], pz = this.pos[2] - this.panicSrc[1];
      const pl = Math.hypot(px, pz) || 1;
      fx = px / pl * 6; fz = pz / pl * 6;
    }
    // mild avoidance of the player
    const pd = V.distXZ(this.pos, S.player.pos);
    if (pd < 1.6) {
      const px = this.pos[0] - S.player.pos[0], pz = this.pos[2] - S.player.pos[2];
      const pl = Math.hypot(px, pz) || 1;
      fx += px / pl * 1.4; fz += pz / pl * 1.4;
    }
    const speed = this.panic > 0 ? 1 : 0.55;
    this.applyIntent(
      (dx / (d || 1)) * speed + fz, (dz / (d || 1)) * speed + fx, this.panic > 0, dt);
    this.headYaw = Math.sin(S.time * 0.55 + this.chatter) * 0.35;
    super.update(dt);
  }
  startle(x, z, amount) {
    if (V.distXZ(this.pos, [x, 0, z]) < 34) {
      this.panic = Math.max(this.panic, amount);
      this.panicSrc = [x, z];
    }
  }
}

/* ============================================================================
   SECURITY GUARD — patrol / suspicious / search / pursue
   ============================================================================ */
class Guard extends Character {
  constructor(o) {
    super(o);
    this.outfit = OUTFITS.guard;
    this.kind = 'guard';
    this.route = o.route || [[0, 0]];
    this.ri = 0;
    this.state = 'patrol';
    this.detect = 0;
    this.searchT = 0;
    this.lastKnown = [0, 0, 0];
    this.torch = o.torch !== false;
    this.height = 1.80;
    this.scale = 1.01;
    this.shoutCd = 0;
  }

  /** Line of sight test against sight-blocking geometry. */
  canSee(target) {
    const ox = this.pos[0], oy = this.eyeY - 0.08, oz = this.pos[2];
    const tx = target.pos[0], ty = target.pos[1] + target.curHeight * 0.6, tz = target.pos[2];
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > this.viewRange()) return false;
    dx /= dist; dy /= dist; dz /= dist;
    // view cone
    const fwd = [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
    const dot = (dx * fwd[0] + dz * fwd[2]);
    if (dot < Math.cos(this.viewCone()) && dist > 2.2) return false;
    // occlusion
    const list = nearBoxes(ox + dx * dist * 0.5, oz + dz * dist * 0.5, dist * 0.5 + 2, false);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.solid || b.trigger) continue;
      if (!b.opaqueSight) continue;
      const hit = rayBox(ox, oy, oz, dx, dy, dz, b, dist);
      if (hit && hit.t < dist - 0.2) return false;
    }
    return { dist, dot };
  }

  viewRange() {
    let r = 26;
    if (S.nightFactor > 0.5) r *= 0.72;
    if (S.weather.rain > 0.4) r *= 0.85;
    return r;
  }
  viewCone() { return this.state === 'alert' ? 1.5 : 0.95; }

  update(dt) {
    if (this.dead) return;
    this.shoutCd = Math.max(0, this.shoutCd - dt);
    const P = S.player;
    const visible = this.canSee(P);

    /* --- detection accumulation --- */
    if (visible && !P.hidden && !S.cinematic) {
      let exposure = 1;
      if (P.crouchT) exposure *= P.inCover ? 0.16 : 0.38;
      if (P.sprint && P.speed > 6) exposure *= 1.75;
      if (P.vehicle) exposure *= 1.4;
      exposure *= (1.15 - clamp01(visible.dist / this.viewRange()) * 0.75);
      if (P.patternOn) exposure *= 1.25;
      this.detect = Math.min(1.35, this.detect + dt * exposure * 0.62);
    } else {
      this.detect = Math.max(0, this.detect - dt * 0.28);
    }
    if (S.globalAlert > 0.2 && this.state === 'patrol') this.detect = Math.max(this.detect, S.globalAlert);

    const prevState = this.state;
    if (this.detect > 1.0) this.state = 'alert';
    else if (this.detect > 0.42) this.state = 'suspicious';
    else if (this.searchT > 0) { this.state = 'search'; this.searchT -= dt; }
    else this.state = 'patrol';

    if (this.state !== prevState) {
      if (this.state === 'alert') {
        S.raiseAlert(0.9);
        this.shout(pick(['Hey! Stop right there!', 'Security! We have a breach!', 'You! Hands where I can see them!']));
        if (S.audio) S.audio.shout();
      } else if (this.state === 'suspicious') this.shout(pick(['Hmm… you lost?', 'Sir, this area is restricted.', 'Can I see your ID?']));
    }

    /* --- behaviour --- */
    let tx, tz, run = false;
    if (this.state === 'alert' || this.state === 'search') {
      if (this.state === 'alert') {
        this.lastKnown = [P.pos[0], P.pos[1], P.pos[2]];
        this.searchT = 9;
      }
      tx = this.lastKnown[0]; tz = this.lastKnown[2];
      run = V.distXZ(this.pos, this.lastKnown) > 3.2;
      const d = V.distXZ(this.pos, this.lastKnown);
      if (d < 2.2) {
        // grab attempt
        if (this.shoutCd <= 0) { this.shout('Got you!'); this.shoutCd = 3; }
        if (d < 1.5 && P.grounded && !P.vehicle) {
          P.damage(14 * dt * 6, [this.pos[0] - P.pos[0], 3, this.pos[2] - P.pos[2]]);
          S.cam.shake(0.25, 0.2);
        }
      }
    } else if (this.state === 'suspicious') {
      tx = P.pos[0]; tz = P.pos[2];
      run = false;
    } else {
      const w = this.route[this.ri];
      tx = w[0]; tz = w[1];
      if (V.distXZ(this.pos, [tx, 0, tz]) < 1.4) this.ri = (this.ri + 1) % this.route.length;
    }

    const dx = tx - this.pos[0], dz = tz - this.pos[2];
    const d = Math.hypot(dx, dz) || 1;
    this.applyIntent(dx / d * (run ? 1 : 0.62), dz / d * (run ? 1 : 0.62), run, dt);
    this.aimMode = false;
    this.headYaw = (this.state === 'patrol') ? Math.sin(S.time * 0.5 + this.ri) * 0.5 : 0;
    this.headPitch = (this.state === 'suspicious') ? -0.1 : 0;
    super.update(dt);
  }

  shout(line) {
    if (this.shoutCd > 0) return;
    this.shoutCd = 4;
    S.subtitle('SECURITY', line, 2.6);
  }
}

/* ============================================================================
   KEERTHY RAO — romantic lead & investigative partner
   Trust / Suspicion are the two dials the whole campaign turns on.
   ============================================================================ */
class Keerthy extends Character {
  constructor(o) {
    super(o);
    this.outfit = OUTFITS.keerthy;
    this.kind = 'keerthy';
    this.name = 'Keerthy Rao';
    this.height = 1.66;
    this.trust = 0;
    this.suspicion = 0;
    this.met = false;
    this.mood = 'wary';          // wary | warm | playful | hurt | furious
    this.seated = true;
    this.talking = false;
    this.gesture = 0;
    this.homePos = [o.x, o.y, o.z];
    this.homeYaw = o.yaw || 0;
  }

  adjust(trust, suspicion, why) {
    const before = this.trust;
    this.trust = clamp(this.trust + trust, 0, 100);
    this.suspicion = clamp(this.suspicion + suspicion, 0, 100);
    this.updateMood();
    if (why) S.toast(why, trust > 0 ? 'good' : (trust < 0 ? 'bad' : 'info'));
    if (S.audio) S.audio.meter(trust >= 0 ? 1 : -1);
    return this.trust - before;
  }

  updateMood() {
    const t = this.trust, s = this.suspicion;
    if (s > 74) this.mood = 'furious';
    else if (s > 52) this.mood = 'hurt';
    else if (t > 68 && s < 34) this.mood = 'playful';
    else if (t > 38) this.mood = 'warm';
    else this.mood = 'wary';
    return this.mood;
  }

  get moodLine() {
    return {
      wary: 'Event Strategist — sizing you up',
      warm: 'Event Strategist — warming to you',
      playful: 'Event Strategist — openly flirting',
      hurt: 'Event Strategist — keeping her distance',
      furious: 'Event Strategist — done with your lies',
    }[this.mood];
  }

  update(dt) {
    const P = S.player;
    const d = V.distXZ(this.pos, P.pos);
    // she watches you when you're close — this is the "she notices" tension
    if (d < 16 && !this.seatedBusy) {
      const want = Math.atan2(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
      this.headYaw = clamp(((want - this.yaw + PI) % TAU + TAU) % TAU - PI, -1.05, 1.05) * 0.9;
    } else this.headYaw = damp(this.headYaw, 0, 2, dt);

    if (this.seated) {
      this.sit = 0.62;
      this.talking = this.dialogueActive;
      super.update(dt);
      return;
    }
    this.sit = 0;
    // free-roam: she walks to meet you
    if (this.target) {
      const dx = this.target[0] - this.pos[0], dz = this.target[1] - this.pos[2];
      const dd = Math.hypot(dx, dz);
      if (dd > 1.4) { this.applyIntent(dx / dd * 0.6, dz / dd * 0.6, false, dt); this.aimMode = false; }
      else { this.applyIntent(0, 0, false, dt); this.target = null; }
    } else this.applyIntent(0, 0, false, dt);
    super.update(dt);
  }

  /** Observes identity switches — the core dual-identity pressure. */
  witnessSwitch(nearCamera) {
    if (!this.met) return;
    const d = V.distXZ(this.pos, S.player.pos);
    if (d < 40 || nearCamera) {
      const amt = nearCamera ? 16 : (d < 12 ? 13 : 7);
      this.adjust(-4, amt, `Keerthy noticed something · <b>+${amt}</b> suspicion`);
      if (d < 22) this.subtitle(pick([
        'Wait. Was that… you? No. Impossible.',
        'I swear I just saw someone who looked exactly like—',
        'Okay, that was weird. You were just over there.'
      ]));
    }
  }
  subtitle(line) { S.subtitle('KEERTHY', line, 3.4); }
}
