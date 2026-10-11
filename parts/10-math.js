/* ============================================================================
   10 — MATH & CORE
   Minimal linear algebra (column-major mat4), vector ops, AABB utilities,
   deterministic RNG and frame-rate independent damping.
   ============================================================================ */

const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0 || 1e-6)); return t * t * (3 - 2 * t); };
const smootherstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0 || 1e-6)); return t * t * t * (t * (t * 6 - 15) + 10); };
/** Exponential damping — independent of frame time. */
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
/** Damp an angle (radians) toward a target along the shortest arc. */
function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + PI) % TAU + TAU) % TAU - PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}
const sign = Math.sign;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const fmtTime = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtInt = n => Math.round(n).toLocaleString('en-IN');

/** Deterministic PRNG (mulberry32) — keeps procedural city layout stable per seed. */
function makeRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ VEC3 ------------------------------ */
const V = {
  create: (x = 0, y = 0, z = 0) => [x, y, z],
  set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
  clone: a => [a[0], a[1], a[2]],
  add: (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  addScaled: (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  sub: (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  scale: (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (o, a, b) => {
    const ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
    o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx; return o;
  },
  len: a => Math.hypot(a[0], a[1], a[2]),
  lenSq: a => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  distXZ: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
  norm: (o, a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
  },
  normXZ: (o, a) => {
    const l = Math.hypot(a[0], a[2]) || 1;
    o[0] = a[0] / l; o[1] = 0; o[2] = a[2] / l; return o;
  },
  negate: (o, a) => { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; return o; },
  lerp: (o, a, b, t) => { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); return o; },
  fromYaw: (yaw, out) => { out = out || [0, 0, 0]; out[0] = Math.sin(yaw); out[1] = 0; out[2] = Math.cos(yaw); return out; },
  angleXZ: (a, b) => Math.atan2(b[0] - a[0], b[2] - a[2]),
};

/* ------------------------------ MAT4 (column-major) ------------------------------ */
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy(o, a) { o.set(a); return o; },

  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  },

  ortho(o, l, r, b, t, n, f) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o.fill(0);
    o[0] = -2 * lr; o[5] = -2 * bt; o[10] = 2 * nf;
    o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
    return o;
  },

  /** Right-handed look-at. */
  lookAt(o, eye, center, up) {
    let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    let l = Math.hypot(z0, z1, z2) || 1; z0 /= l; z1 /= l; z2 /= l;
    let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    l = Math.hypot(x0, x1, x2) || 1; x0 /= l; x1 /= l; x2 /= l;
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    o[15] = 1;
    return o;
  },

  mul(o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  },

  /** Rotation about Y (yaw). */
  rotY(o, a) {
    const c = Math.cos(a), s = Math.sin(a);
    o.fill(0); o[0] = c; o[2] = -s; o[5] = 1; o[8] = s; o[10] = c; o[15] = 1;
    return o;
  },

  /** Translation * rotY(yaw) * rotX(pitch) * rotZ(roll) * scale — used for props/actors. */
  compose(o, px, py, pz, yaw, pitch, roll, sx, sy, sz) {
    const cy = Math.cos(yaw), sny = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    /* R = Ry * Rx * Rz, rows written out then packed column-major:
         row0 = [ cy*cr + sny*sp*sr,  -cy*sr + sny*sp*cr,  sny*cp ]
         row1 = [ cp*sr,               cp*cr,              -sp     ]
         row2 = [-sny*cr + cy*sp*sr,   sny*sr + cy*sp*cr,   cy*cp  ]            */
    o[0] = (cy * cr + sny * sp * sr) * sx;
    o[1] = (cp * sr) * sx;
    o[2] = (-sny * cr + cy * sp * sr) * sx;
    o[3] = 0;
    o[4] = (-cy * sr + sny * sp * cr) * sy;
    o[5] = (cp * cr) * sy;
    o[6] = (sny * sr + cy * sp * cr) * sy;
    o[7] = 0;
    o[8] = (sny * cp) * sz;
    o[9] = (-sp) * sz;
    o[10] = (cy * cp) * sz;
    o[11] = 0;
    o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
    return o;
  },

  translation(o, x, y, z) {
    M4.identity(o); o[12] = x; o[13] = y; o[14] = z; return o;
  },

  invert(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M4.identity(o);
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },

  transpose(o, a) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) o[i * 4 + j] = a[j * 4 + i];
    return o;
  },

  /** Normal matrix = transpose(inverse(mat3(M))) packed into a 3x3. */
  normalMat3(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[4], a11 = a[5], a12 = a[6], a20 = a[8], a21 = a[9], a22 = a[10];
    const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) { o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 1; o[5] = 0; o[6] = 0; o[7] = 0; o[8] = 1; return o; }
    det = 1 / det;
    o[0] = b01 * det; o[1] = (-a22 * a01 + a02 * a21) * det; o[2] = (a12 * a01 - a02 * a11) * det;
    o[3] = b11 * det; o[4] = (a22 * a00 - a02 * a20) * det; o[5] = (-a12 * a00 + a02 * a10) * det;
    o[6] = b21 * det; o[7] = (-a21 * a00 + a01 * a20) * det; o[8] = (a11 * a00 - a01 * a10) * det;
    return o;
  },

  /** Transform a point by a mat4 (w-divide). */
  xformPoint(o, m, p) {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    o[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    o[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    o[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return o;
  },

  /** Forward direction (-Z) of a rotation matrix. */
  forward(o, m) { o[0] = -m[8]; o[1] = -m[9]; o[2] = -m[10]; return o; },
  right(o, m) { o[0] = m[0]; o[1] = m[1]; o[2] = m[2]; return o; },
  up(o, m) { o[0] = m[4]; o[1] = m[5]; o[2] = m[6]; return o; },
};

/* ------------------------------ AABB ------------------------------ */
/** Boxes are stored flat: {min:[x,y,z], max:[x,y,z], tag, solid, ...} */
function boxFrom(cx, cy, cz, hx, hy, hz, tag, extra) {
  const b = {
    min: [cx - hx, cy - hy, cz - hz], max: [cx + hx, cy + hy, cz + hz],
    cx, cy, cz, hx, hy, hz, tag: tag || 'static', solid: true, ...extra
  };
  return b;
}
function boxIntersect(a, b) {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2];
}
function boxContainsPoint(b, x, y, z, pad = 0) {
  return x >= b.min[0] - pad && x <= b.max[0] + pad &&
    y >= b.min[1] - pad && y <= b.max[1] + pad &&
    z >= b.min[2] - pad && z <= b.max[2] + pad;
}
/** Ray vs AABB slab test → {t, nx, ny, nz} or null. */
function rayBox(ox, oy, oz, dx, dy, dz, b, maxT = 1e9) {
  let tmin = 0, tmax = maxT, nx = 0, ny = 0, nz = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < b.min[i] || o[i] > b.max[i]) return null;
    } else {
      const inv = 1 / d[i];
      let t1 = (b.min[i] - o[i]) * inv, t2 = (b.max[i] - o[i]) * inv;
      let flip = false;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; flip = true; }
      if (t1 > tmin) {
        tmin = t1; nx = ny = nz = 0;
        if (i === 0) nx = flip ? 1 : -1; else if (i === 1) ny = flip ? 1 : -1; else nz = flip ? 1 : -1;
      }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return { t: tmin, nx, ny, nz };
}

/* ------------------------------ capsule helpers ------------------------------ */
/** Closest point on segment AB to P. Returns t in [0,1]. */
function closestOnSeg(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const l = abx * abx + aby * aby + abz * abz;
  if (l < 1e-9) return 0;
  return clamp01(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / l);
}

/* ------------------------------ colour ------------------------------ */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
function mixRgb(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mulRgb(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function rgbCss(c) { return `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`; }

/* ------------------------------ easing ------------------------------ */
const Ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOutQuad: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2),
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1,
  inOutSine: t => -(Math.cos(PI * t) - 1) / 2,
};
