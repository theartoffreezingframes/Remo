/* ============================================================================
   60 — CAMERA RIG & CINEMATIC DIRECTOR
   Spring-arm third-person camera with world collision, momentum-driven FOV,
   trauma-based shake, and a keyframed cinematic rig that takes over without
   a loading screen.
   ============================================================================ */

class Camera {
  constructor() {
    this.pos = [0, 3, 6];
    this.yaw = 0; this.pitch = -0.12;
    this.tYaw = 0; this.tPitch = -0.12;
    this.fov = 74 * DEG;
    this.tFov = 74 * DEG;
    this.dist = 4.3;
    this.tDist = 4.3;
    this.height = 1.62;
    this.lookAt = [0, 1.5, 0];
    this.roll = 0;
    this.trauma = 0;
    this.shakeT = 0;
    this.mode = 'gameplay';       // gameplay | drive | cinematic | dialogue | aim
    this.blend = 1;
    this.proj = M4.create();
    this.view = M4.create();
    this.shakeSeed = rnd(1000);
    this.sens = 1;
    this.baseFov = 74 * DEG;
    this.collideDist = 4.3;
    this.shakeScale = 1;
    this.dof = 0;
  }

  shake(amount, dur) {
    this.trauma = clamp(this.trauma + amount, 0, 1.4);
    this.shakeT = Math.max(this.shakeT, dur || 0.35);
  }

  addLook(dx, dy) {
    this.tYaw -= dx * 0.0022 * this.sens;
    this.tPitch = clamp(this.tPitch - dy * 0.0019 * this.sens, -1.25, 0.95);
  }

  /** Snap instantly (used on mission start / teleport). */
  snapTo(pos, yaw, pitch) {
    this.pos = [pos[0], pos[1], pos[2]];
    this.yaw = this.tYaw = yaw;
    this.pitch = this.tPitch = pitch === undefined ? -0.12 : pitch;
    this.lookAt = [pos[0], pos[1] + 1.5, pos[2]];
  }

  update(dt, target, opts) {
    opts = opts || {};
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.trauma = Math.max(0, this.trauma - dt * (this.shakeT > 0 ? 0.35 : 1.5));

    /* --- target focus point --- */
    const tp = target.pos;
    const focusY = tp[1] + (target.vehicle ? 1.25 : lerp(1.62, 1.05, target.crouch)) - (target.ragdoll ? 0.5 : 0);
    let fx = tp[0], fy = focusY, fz = tp[2];

    if (this.mode !== 'cinematic') {
      // smooth yaw/pitch follow with different response per mode
      const yawL = this.mode === 'drive' ? 7.5 : (this.mode === 'aim' ? 18 : 13);
      const pitL = this.mode === 'drive' ? 6.5 : 15;
      this.yaw = dampAngle(this.yaw, this.tYaw, yawL, dt);
      this.pitch = damp(this.pitch, this.tPitch, pitL, dt);
    }

    /* --- FOV driven by speed, stance and mode --- */
    let fovTarget = this.baseFov;
    if (this.mode === 'drive' && target.vehicle) {
      const kmh = target.vehicle.kmh;
      fovTarget += (6 + clamp01(kmh / 190) * 17) * DEG;
    } else if (this.mode === 'aim') {
      fovTarget -= 20 * DEG;
    } else if (target.sprint && target.speed > 6) {
      fovTarget += (target.speed - 6) * 1.5 * DEG;
    }
    if (opts.pattern) fovTarget -= 9 * DEG;
    if (opts.cinematicFov) fovTarget = opts.cinematicFov * DEG;
    this.tFov = fovTarget;
    this.fov = damp(this.fov, this.tFov, this.mode === 'drive' ? 3.4 : 7, dt);

    /* --- arm distance --- */
    let distTarget = this.mode === 'aim' ? 2.1 : (target.vehicle ? 8.4 : (target.crouchT ? 3.5 : 4.3));
    if (this.mode === 'drive' && target.vehicle) distTarget = 8.2 + clamp01(target.vehicle.kmh / 160) * 2.4;
    if (opts.cinematicDist) distTarget = opts.cinematicDist;
    this.tDist = distTarget;
    this.dist = damp(this.dist, this.tDist, 5.5, dt);

    /* --- spring arm with collision --- */
    if (this.mode !== 'cinematic' || !opts.lockDist) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      let dx = -sy * cp, dy = sp, dz = -cy * cp;
      const wantD = this.dist;
      const hit = this.castArm(fx, fy, fz, dx, dy, dz, wantD);
      this.collideDist = damp(this.collideDist, hit, hit < this.collideDist ? 26 : 7, dt);
      const d = this.collideDist;
      const nx = fx + dx * d, ny = fy + dy * d + this.height * 0.18, nz = fz + dz * d;
      const follow = this.mode === 'drive' ? 9 : 13;
      this.pos[0] = damp(this.pos[0], nx, follow, dt);
      this.pos[1] = damp(this.pos[1], ny, follow, dt);
      this.pos[2] = damp(this.pos[2], nz, follow, dt);
      this.lookAt[0] = damp(this.lookAt[0], fx, 16, dt);
      this.lookAt[1] = damp(this.lookAt[1], fy, 16, dt);
      this.lookAt[2] = damp(this.lookAt[2], fz, 16, dt);
      // never let the camera go under the floor
      const gh = groundHeightAt(this.pos[0], this.pos[2], this.pos[1] + 2.5) + 0.42;
      if (this.pos[1] < gh) this.pos[1] = gh;
    }

    /* --- roll: lean into turns --- */
    let rollTarget = 0;
    if (target.vehicle) rollTarget = -target.vehicle.roll * 0.55 - target.vehicle.yawRate * 0.045;
    else rollTarget = -target.lean * 0.28;
    this.roll = damp(this.roll, rollTarget + (opts.roll || 0), 5, dt);

    /* --- trauma shake --- */
    let sx = 0, sy2 = 0, sz = 0, sroll = 0, sfov = 0;
    if (this.trauma > 0.001) {
      const t = this.trauma * this.trauma * this.shakeScale;
      const T = S ? S.time * 34 : 0;
      sx = (this.n(T * 1.0) ) * 0.30 * t;
      sy2 = (this.n(T * 1.13 + 31.7)) * 0.26 * t;
      sz = (this.n(T * 0.97 + 71.3)) * 0.30 * t;
      sroll = (this.n(T * 1.31 + 17.1)) * 0.055 * t;
      sfov = (this.n(T * 0.81 + 5.3)) * 2.4 * t * DEG;
    }
    // engine + road vibration while driving
    if (target.vehicle && target.vehicle.driven) {
      const v = target.vehicle;
      const vib = clamp01(v.kmh / 90) * 0.5 + v.rpm / v.redline * 0.22 + v.slip * 0.5;
      const T = S.time * 60;
      sx += this.n(T) * 0.012 * vib;
      sy2 += this.n(T * 1.7 + 9) * 0.010 * vib;
      sfov += Math.sin(T * 0.4) * 0.12 * vib * DEG;
    }

    const ex = this.pos[0] + sx, ey = this.pos[1] + sy2, ez = this.pos[2] + sz;
    const lx = this.lookAt[0] - sx * 0.4, ly = this.lookAt[1] + sy2 * 0.4 + (opts.lookY || 0), lz = this.lookAt[2] - sz * 0.4;

    const up = [Math.sin(this.roll) * 0.4, 1, 0];
    const ul = Math.hypot(up[0], up[1], up[2]);
    up[0] /= ul; up[1] /= ul; up[2] /= ul;
    M4.lookAt(this.view, [ex, ey, ez], [lx, ly, lz], up);
    const aspect = R.pw / R.ph;
    M4.perspective(this.proj, this.fov + sfov, aspect, 0.08, 900);
    this.eye = [ex, ey, ez];
  }

  /** Cheap 1-D value noise for shake. */
  n(t) {
    const i = Math.floor(t), f = t - i;
    const h = x => { const s = Math.sin(x * 127.1 + this.shakeSeed) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
    const u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  }

  /** Raycast the spring arm against solid, sight-blocking geometry. */
  castArm(ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD;
    const list = nearBoxes(ox + dx * maxD * 0.5, oz + dz * maxD * 0.5, maxD * 0.55 + 1.5, false);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.solid || b.trigger) continue;
      if (b.max[1] < oy - 0.6) continue;                       // floor below us
      const hit = rayBox(ox, oy, oz, dx, dy, dz, b, best);
      if (hit && hit.t > 0.05) best = Math.max(0.55, hit.t - 0.28);
    }
    return best;
  }

  /** Hard-set the camera from a cinematic shot. */
  setFromShot(shot, t) {
    const e = Ease[shot.ease || 'inOutSine'](clamp01(t));
    this.pos[0] = lerp(shot.from[0], shot.to[0], e);
    this.pos[1] = lerp(shot.from[1], shot.to[1], e);
    this.pos[2] = lerp(shot.from[2], shot.to[2], e);
    const tx = lerp(shot.lookFrom[0], shot.lookTo[0], e);
    const ty = lerp(shot.lookFrom[1], shot.lookTo[1], e);
    const tz = lerp(shot.lookFrom[2], shot.lookTo[2], e);
    this.lookAt[0] = tx; this.lookAt[1] = ty; this.lookAt[2] = tz;
    if (shot.fov) this.fov = damp(this.fov, shot.fov * DEG, 6, 1 / 60);
    M4.lookAt(this.view, this.pos, [tx, ty, tz], [0, 1, 0]);
    M4.perspective(this.proj, this.fov, R.pw / R.ph, 0.08, 900);
    this.eye = [this.pos[0], this.pos[1], this.pos[2]];
  }
}

/* ============================================================================
   CINEMATIC DIRECTOR
   Plays scripted shot lists with letterboxing, subtitles and fades.
   ============================================================================ */
class Cinematic {
  constructor() {
    this.active = false;
    this.timeline = [];
    this.idx = 0;
    this.t = 0;
    this.onEnd = null;
    this.fade = 0;
    this.letterbox = 0;
  }

  play(timeline, onEnd) {
    this.timeline = timeline;
    this.idx = 0; this.t = 0;
    this.active = true;
    this.onEnd = onEnd || null;
    S.cinematic = true;
    S.cam.mode = 'cinematic';
    document.body.classList.add('cine');
    if (S.audio) S.audio.music('cinematic');
  }

  stop() {
    this.active = false;
    S.cinematic = false;
    S.cam.mode = 'gameplay';
    document.body.classList.remove('cine');
    UI.clearSubs();
    const cb = this.onEnd; this.onEnd = null;
    if (cb) cb();
  }

  skip() {
    // jump to the last beat so story state still advances
    while (this.idx < this.timeline.length) {
      const b = this.timeline[this.idx];
      if (b.onEnter && !b._done) { b._done = true; b.onEnter(); }
      this.idx++;
    }
    this.stop();
  }

  update(dt) {
    if (!this.active) { this.fade = damp(this.fade, 0, 6, dt); return; }
    const beat = this.timeline[this.idx];
    if (!beat) { this.stop(); return; }
    if (this.t === 0 && !beat._done) { beat._done = true; if (beat.onEnter) beat.onEnter(); }
    this.t += dt * (S.timeScale || 1);

    if (beat.line && !beat._said) {
      beat._said = true;
      S.subtitle(beat.who || '', beat.line, Math.min(beat.dur, 6.5));
    }
    if (beat.cam) {
      const shot = beat.cam;
      const off = shot.at || 0;
      const local = clamp01((this.t - off) / Math.max(0.001, (shot.dur || beat.dur) - off));
      S.cam.setFromShot(shot, local);
    }
    this.fade = damp(this.fade, beat.fadeTo === undefined ? 0 : beat.fadeTo, 5, dt);
    if (this.t >= beat.dur) {
      if (beat.onExit) beat.onExit();
      this.idx++; this.t = 0;
      if (this.idx >= this.timeline.length) this.stop();
    }
  }
}

/** Helper: build a dolly shot between two camera positions looking at two targets. */
function shot(dur, from, to, lookFrom, lookTo, o) {
  return Object.assign({
    dur, from, to, lookFrom: lookFrom || to, lookTo: lookTo || lookFrom || from,
    fov: 46, ease: 'inOutSine'
  }, o || {});
}
