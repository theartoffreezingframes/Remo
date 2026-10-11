/* ============================================================================
   40 — PHYSICS & MOTION
   Weighted character controller (capsule vs AABB, vaulting, cover, ragdoll)
   and a semi-simulated vehicle model with suspension, tyre slip and damage.
   ============================================================================ */

const GRAVITY = -23.0;
const WORLD_FLOOR = 0;

/** Ground height at (x,z): highest collider top under the point, else WORLD_FLOOR. */
function groundHeightAt(x, z, maxY = 200, ignoreY = null) {
  let best = WORLD_FLOOR;
  const list = nearBoxes(x, z, 1.2, false);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.trigger || !b.solid) continue;
    if (x < b.min[0] - 0.05 || x > b.max[0] + 0.05 || z < b.min[2] - 0.05 || z > b.max[2] + 0.05) continue;
    const top = b.max[1];
    if (top > best + 0.02 && top <= maxY + 0.6 && top !== ignoreY) best = top;
  }
  return best;
}

/** Ceiling height at (x,z) looking up from y. */
function ceilingAt(x, z, fromY) {
  let best = 400;
  const list = nearBoxes(x, z, 0.6, false);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.solid) continue;
    if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
    if (b.min[1] > fromY + 0.2 && b.min[1] < best) best = b.min[1];
  }
  return best;
}

/* --------------------------------------------------------------------------
   CHARACTER CONTROLLER
   -------------------------------------------------------------------------- */
class Character {
  constructor(o) {
    this.pos = [o.x, o.y, o.z];       // feet position
    this.vel = [0, 0, 0];
    this.yaw = o.yaw || 0;
    this.aimYaw = this.yaw;
    this.radius = o.radius || 0.36;
    this.height = o.height || 1.78;
    this.crouchHeight = 1.08;
    this.mass = o.mass || 78;
    this.grounded = false;
    this.crouch = 0;                  // 0..1 blend
    this.crouchT = false;
    this.sprint = false;
    this.stamina = 100;
    this.hp = 100;
    this.speed = 0;
    this.gait = 0;                    // walk-cycle phase
    this.moveDir = [0, 0, 0];
    this.intent = 0;                  // 0..1 how hard we're pushing
    this.strafe = 0;
    this.lean = 0;
    this.vault = 0;                   // vault blend timer
    this.vaultTarget = null;
    this.cover = null;                // box we're pinned to
    this.inCover = false;
    this.ragdoll = null;
    this.stunT = 0;
    this.footL = 0; this.footR = 0;   // IK foot plant heights
    this.stepPhase = 0;
    this.headLook = [0, 0, 0];
    this.landImpact = 0;
    this.airT = 0;
    this.name = o.name || 'NPC';
    this.kind = o.kind || 'npc';
    this.dead = false;
    this.alerted = 0;
    this.lastGroundY = this.pos[1];
  }

  get curHeight() { return lerp(this.height, this.crouchHeight, this.crouch); }
  get eyeY() { return this.pos[1] + this.curHeight - 0.12; }

  /** Desired horizontal velocity from input intent. */
  applyIntent(fwd, strafe, sprinting, dt) {
    const cy = Math.cos(this.aimYaw), sy = Math.sin(this.aimYaw);
    let dx = sy * fwd + cy * strafe;
    let dz = cy * fwd - sy * strafe;
    const l = Math.hypot(dx, dz);
    this.intent = Math.min(1, l);
    if (l > 0.001) { dx /= l; dz /= l; }
    this.moveDir[0] = dx; this.moveDir[1] = 0; this.moveDir[2] = dz;
    this.strafe = strafe;
    this.sprint = sprinting && this.intent > 0.85 && this.stamina > 2 && !this.crouchT;
    return this.intent;
  }

  maxSpeed() {
    if (this.crouchT) return 2.35;
    if (this.sprint) return 8.1;
    return 4.9;
  }

  update(dt, world) {
    if (this.stunT > 0) this.stunT -= dt;
    if (this.ragdoll) { this.updateRagdoll(dt); return; }

    /* --- crouch blend --- */
    this.crouch = damp(this.crouch, this.crouchT ? 1 : 0, 14, dt);

    /* --- desired velocity --- */
    const target = this.maxSpeed() * this.intent;
    let dvx = this.moveDir[0] * target, dvz = this.moveDir[2] * target;
    // acceleration is deliberately slower than deceleration → perceptible mass
    const accelL = this.grounded ? 34 : 7;
    this.vel[0] = damp(this.vel[0], dvx, this.intent > 0.02 ? accelL : 11, dt);
    this.vel[2] = damp(this.vel[2], dvz, this.intent > 0.02 ? accelL : 11, dt);

    // facing: smoothly turn toward movement (or aim direction when aiming)
    const desiredYaw = this.aimMode ? this.aimYaw : Math.atan2(this.moveDir[0], this.moveDir[2]);
    if (this.intent > 0.05 || this.aimMode) this.yaw = dampAngle(this.yaw, desiredYaw, this.grounded ? 13 : 5, dt);

    /* --- stamina --- */
    if (this.sprint && this.intent > 0.5) this.stamina = Math.max(0, this.stamina - dt * 15);
    else this.stamina = Math.min(100, this.stamina + dt * (this.grounded ? 13 : 6));

    /* --- gravity + jump --- */
    this.vel[1] += GRAVITY * dt;
    if (this.vel[1] < -58) this.vel[1] = -58;

    /* --- vault --- */
    if (this.vault > 0) this.updateVault(dt);

    /* --- integrate with collision --- */
    this.moveAndCollide(dt);

    /* --- gait / animation state --- */
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    this.speed = hs;
    if (this.grounded && hs > 0.4) this.gait += dt * (2.1 + hs * 0.62);
    else this.gait = damp(this.gait, Math.round(this.gait / PI) * PI, 8, dt);
    this.lean = damp(this.lean, clamp((this.vel[0] * Math.cos(this.yaw) - this.vel[2] * Math.sin(this.yaw)) * 0.055, -0.34, 0.34), 7, dt);
    this.airT = this.grounded ? 0 : this.airT + dt;
    this.landImpact = Math.max(0, this.landImpact - dt * 4);

    /* --- cover --- */
    this.updateCover();
  }

  moveAndCollide(dt) {
    const r = this.radius, h = this.curHeight;
    let px = this.pos[0], py = this.pos[1], pz = this.pos[2];
    const steps = this.speed * dt > 0.35 ? 3 : 2;
    const sdt = dt / steps;

    for (let s = 0; s < steps; s++) {
      px += this.vel[0] * sdt;
      pz += this.vel[2] * sdt;
      py += this.vel[1] * sdt;

      // horizontal resolution
      const list = nearBoxes(px, pz, r + 0.4, false);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b.solid || b.trigger) continue;
        if (b.oneWay) continue;
        // only collide if the box vertically overlaps the capsule
        if (b.max[1] <= py + 0.12 || b.min[1] >= py + h - 0.05) continue;
        const dx = px - clamp(px, b.min[0], b.max[0]);
        const dz = pz - clamp(pz, b.min[2], b.max[2]);
        const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 1e-5) {
            // deep inside — push out along the shallowest axis
            const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
            const ox = (b.max[0] - b.min[0]) / 2 + r - Math.abs(px - cx);
            const oz = (b.max[2] - b.min[2]) / 2 + r - Math.abs(pz - cz);
            if (ox < oz) px += (px < cx ? -ox : ox); else pz += (pz < cz ? -oz : oz);
          } else {
            const push = (r - d) / d;
            px += dx * push; pz += dz * push;
            // kill velocity into the wall, keep the tangential slide
            const nx = dx / d, nz = dz / d;
            const vn = this.vel[0] * nx + this.vel[2] * nz;
            if (vn < 0) { this.vel[0] -= vn * nx * 0.92; this.vel[2] -= vn * nz * 0.92; }
          }
        }
      }

      // ground / ceiling
      const gh = groundHeightAt(px, pz, py + 1.6);
      const ceil = ceilingAt(px, pz, py + 0.2);
      if (py <= gh + 0.001 && this.vel[1] <= 0.01) {
        if (!this.grounded && this.vel[1] < -6) {
          this.landImpact = clamp(-this.vel[1] / 22, 0.2, 1.4);
          if (S && S.audio) S.audio.land(clamp(-this.vel[1] / 18, 0, 1));
        }
        py = gh; this.vel[1] = 0; this.grounded = true;
      } else if (py > gh + 0.06) {
        this.grounded = false;
      }
      if (py + h > ceil) { py = ceil - h; if (this.vel[1] > 0) this.vel[1] = 0; }
    }

    // world bounds
    const bnd = W.bounds;
    px = clamp(px, bnd.minX + 2, bnd.maxX - 2);
    pz = clamp(pz, bnd.minZ + 2, bnd.maxZ - 2);

    this.lastGroundY = this.pos[1];
    this.pos[0] = px; this.pos[1] = py; this.pos[2] = pz;
    if (this.pos[1] < -20) { this.pos[1] = 0; this.vel[1] = 0; }
  }

  /** Detect a vaultable ledge directly ahead. */
  tryVault() {
    if (!this.grounded || this.vault > 0 || this.stamina < 8) return false;
    const d = 0.9;
    const fx = this.pos[0] + Math.sin(this.yaw) * d, fz = this.pos[2] + Math.cos(this.yaw) * d;
    const list = nearBoxes(fx, fz, 1.1, false);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.solid || b.trigger || b.oneWay) continue;
      const top = b.max[1] - this.pos[1];
      if (top < 0.34 || top > 1.28) continue;
      // require clear space on the far side
      const fx2 = this.pos[0] + Math.sin(this.yaw) * (d + 1.1);
      const fz2 = this.pos[2] + Math.cos(this.yaw) * (d + 1.1);
      const gh = groundHeightAt(fx2, fz2, this.pos[1] + 2.5);
      if (gh > top + 1.2) continue;
      this.vault = 1;
      this.vaultTarget = { x: fx2, y: Math.max(gh, b.max[1]), z: fz2, top: b.max[1], cx: fx, cz: fz };
      this.grounded = false;
      if (S.audio) S.audio.vault();
      return true;
    }
    return false;
  }

  updateVault(dt) {
    this.vault -= dt * 2.1;
    const t = this.vaultTarget;
    if (!t) { this.vault = 0; return; }
    const k = 1 - this.vault;
    const e = Ease.inOutSine(clamp01(k));
    // arc over the obstacle: hands plant on the ledge, legs tuck
    this.pos[0] = lerp(this.pos[0], t.x, 1 - Math.exp(-9 * dt));
    this.pos[2] = lerp(this.pos[2], t.z, 1 - Math.exp(-9 * dt));
    const arc = Math.sin(e * PI) * 0.72;
    this.pos[1] = lerp(this.pos[1], Math.max(t.y, this.pos[1]) + arc * (k < 0.5 ? 1 : 0.2), 1 - Math.exp(-11 * dt));
    this.vel[1] = 0;
    this.vel[0] *= 0.86; this.vel[2] *= 0.86;
    if (this.vault <= 0) {
      this.vault = 0; this.vaultTarget = null; this.grounded = true;
      this.pos[1] = groundHeightAt(this.pos[0], this.pos[2], this.pos[1] + 2.5);
    }
  }

  updateCover() {
    if (!this.crouchT) { this.inCover = false; this.cover = null; return; }
    const d = 1.5;
    const fx = this.pos[0] - Math.sin(this.aimYaw) * d, fz = this.pos[2] - Math.cos(this.aimYaw) * d;
    const list = nearBoxes(this.pos[0], this.pos[2], 2.2, false);
    let best = null, bestD = 1e9;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.solid || b.trigger) continue;
      if (b.max[1] < this.pos[1] + 0.5 || b.min[1] > this.pos[1] + 1.6) continue;
      const cx = clamp(this.pos[0], b.min[0], b.max[0]), cz = clamp(this.pos[2], b.min[2], b.max[2]);
      const dd = Math.hypot(this.pos[0] - cx, this.pos[2] - cz);
      if (dd < bestD) { bestD = dd; best = b; }
    }
    this.cover = bestD < 1.7 ? best : null;
    this.inCover = !!this.cover;
  }

  jump(power = 7.4) {
    if (!this.grounded || this.vault > 0) return false;
    this.vel[1] = power;
    this.grounded = false;
    if (S.audio) S.audio.jump();
    return true;
  }

  /* ---------------------------------------------------------- ragdoll */
  ragdollize(impulse) {
    const pts = [];
    const parts = [[0, 1.55, 'head'], [0, 1.2, 'chest'], [0, 0.85, 'pelvis'],
    [-0.32, 1.3, 'handL'], [0.32, 1.3, 'handR'], [-0.18, 0.4, 'footL'], [0.18, 0.4, 'footR']];
    for (const [ox, oy, tag] of parts) {
      const px = this.pos[0] + ox * Math.cos(this.yaw), pz = this.pos[2] - ox * Math.sin(this.yaw);
      pts.push({
        tag, x: px, y: this.pos[1] + oy, z: pz,
        px: px - impulse[0] * 0.02, py: this.pos[1] + oy - impulse[1] * 0.02, pz: pz - impulse[2] * 0.02,
        r: tag === 'head' ? 0.16 : 0.13
      });
    }
    const links = [[0, 1, 0.36], [1, 2, 0.36], [1, 3, 0.5], [1, 4, 0.5], [2, 5, 0.5], [2, 6, 0.5], [0, 3, 0.8], [0, 4, 0.8]];
    this.ragdoll = { pts, links, t: 0, recover: 0 };
    this.vel[0] = this.vel[1] = this.vel[2] = 0;
    if (S.audio) S.audio.thud(0.8);
  }

  updateRagdoll(dt) {
    const rd = this.ragdoll;
    rd.t += dt;
    const sub = 3, sdt = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const p of rd.pts) {
        const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985, vz = (p.z - p.pz) * 0.985;
        p.px = p.x; p.py = p.y; p.pz = p.z;
        p.x += vx; p.y += vy + GRAVITY * 0.35 * sdt * sdt * 60; p.z += vz;
        const gh = groundHeightAt(p.x, p.z, p.y + 1.0);
        if (p.y < gh + p.r) { p.y = gh + p.r; p.px = p.x - vx * 0.55; p.pz = p.z - vz * 0.55; p.py = p.y + vy * 0.32; }
      }
      for (let it = 0; it < 3; it++) {
        for (const [a, b, rest] of rd.links) {
          const A = rd.pts[a], Bp = rd.pts[b];
          let dx = Bp.x - A.x, dy = Bp.y - A.y, dz = Bp.z - A.z;
          const d = Math.hypot(dx, dy, dz) || 1e-5;
          const diff = (d - rest) / d * 0.5;
          dx *= diff; dy *= diff; dz *= diff;
          A.x += dx; A.y += dy; A.z += dz;
          Bp.x -= dx; Bp.y -= dy; Bp.z -= dz;
        }
      }
    }
    // centre the logical position on the pelvis so the camera keeps tracking
    const pelvis = rd.pts[2];
    this.pos[0] = pelvis.x; this.pos[1] = pelvis.y - 0.6; this.pos[2] = pelvis.z;
    this.grounded = true;
    if (rd.t > 2.4 && !rd.recovering) rd.recovering = 0.001;
    if (rd.recovering) {
      rd.recovering += dt;
      const head = rd.pts[0];
      const gh = groundHeightAt(this.pos[0], this.pos[2], this.pos[1] + 2);
      this.pos[1] = damp(this.pos[1], gh, 3.2, dt);
      head.y = damp(head.y, this.pos[1] + 1.6, 4, dt);
      head.x = damp(head.x, this.pos[0], 4, dt);
      head.z = damp(head.z, this.pos[2], 4, dt);
      if (rd.recovering > 1.5) { this.ragdoll = null; this.vel[1] = 0; }
    }
  }

  damage(amount, fromDir) {
    this.hp = clamp(this.hp - amount, 0, 100);
    if (this.hp <= 0 && !this.ragdoll) this.ragdollize(fromDir || [0, 4, 0]);
    return this.hp;
  }
}

/* --------------------------------------------------------------------------
   VEHICLE
   Semi-simulated: engine curve, gearbox, longitudinal/lateral tyre forces,
   four-wheel suspension sampling, impulse collision response and damage.
   -------------------------------------------------------------------------- */
class Vehicle {
  constructor(o) {
    this.pos = [o.x, o.y, o.z];
    this.yaw = o.yaw || 0;
    this.pitch = 0; this.roll = 0;
    this.vel = [0, 0, 0];
    this.yawRate = 0;
    this.wheelbase = 2.72;
    this.track = 1.62;
    this.mass = 1560;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.gear = 1;
    this.rpm = 850;
    this.speed = 0;
    this.wheelSpin = 0;
    this.slip = 0;
    this.damage = 0;
    this.susp = [0, 0, 0, 0];        // per-wheel compression
    this.suspV = [0, 0, 0, 0];
    this.bodyH = 0.62;
    this.driven = false;
    this.headlights = true;
    this.color = o.color || '#8a2f34';
    this.model = o.model || 'sedan';
    this.id = o.id || 'car';
    this.ai = o.ai || null;
    this.horn = 0;
    this.impact = 0;
    this.gearRatios = [3.4, 2.1, 1.45, 1.05, 0.82, 0.66];
    this.finalDrive = 3.6;
    this.wheelR = 0.33;
    this.maxPower = 168000;         // W
    this.redline = 6800;
  }

  /** Signed forward speed along heading. */
  get fwdSpeed() { return this.vel[0] * Math.sin(this.yaw) + this.vel[2] * Math.cos(this.yaw); }
  get latSpeed() { return this.vel[0] * Math.cos(this.yaw) - this.vel[2] * Math.sin(this.yaw); }
  get kmh() { return Math.abs(this.fwdSpeed) * 3.6; }

  cornerOff(i) {
    const hw = this.track / 2, hl = this.wheelbase / 2;
    const lx = (i === 0 || i === 2) ? -hw : hw;
    const lz = (i < 2) ? hl : -hl;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.pos[0] + lx * c + lz * s, this.pos[2] - lx * s + lz * c];
  }

  update(dt, input) {
    if (!this.driven && !this.ai) { this.settle(dt); return; }

    const thr = input ? input.throttle : 0;
    const brk = input ? input.brake : 0;
    const strIn = input ? input.steer : 0;
    this.handbrake = input ? !!input.handbrake : false;

    /* --- steering with speed-sensitive return-to-centre --- */
    const spd = Math.abs(this.fwdSpeed);
    const steerLimit = lerp(0.62, 0.17, clamp01(spd / 34));
    this.steer = damp(this.steer, strIn * steerLimit, 9, dt);

    /* --- engine / gearbox --- */
    const ratio = this.gearRatios[clamp(this.gear - 1, 0, 5)] * this.finalDrive;
    const wheelRpm = Math.abs(this.fwdSpeed) / (TAU * this.wheelR) * 60;
    this.wheelSpin = damp(this.wheelSpin, Math.max(0, thr - 0.45) * clamp01(1 - spd / 26), 6, dt);

    if (this.gear > 1 && this.rpm < 2100) this.gear--;
    else if (this.gear < 6 && this.rpm > 5600) this.gear++;
    if (this.fwdSpeed < -0.6 && thr < -0.15) this.gear = 1;

    /* --- longitudinal force --- */
    const torqueCurve = t => {                      // t = rpm normalised
      if (t < 0.12) return 0.55 + t * 3.2;
      if (t < 0.62) return 0.95 + (t - 0.12) * 0.24;
      return 1.1 - (t - 0.62) * 1.15;
    };
    // at a standstill the engine still revs with throttle (launching, revving at lights)
    const freeRev = 850 + Math.max(0, thr) * 4300 * (1 - clamp01(Math.abs(this.fwdSpeed) / 9));
    const targetRpm2 = clamp(Math.max(850 + wheelRpm * ratio, freeRev), 800, this.redline + 400);
    this.rpm = damp(this.rpm, targetRpm2, 8, dt);
    const rpmN = clamp01(this.rpm / this.redline);
    let driveForce = 0;
    if (Math.abs(thr) > 0.01) {
      const power = this.maxPower * torqueCurve(rpmN) * (1 - this.damage * 0.0032);
      driveForce = (power / Math.max(Math.abs(this.fwdSpeed), 4.5)) * thr;
      driveForce = clamp(driveForce, -9000, 15500);
    }
    // brakes
    const brakeForce = -sign(this.fwdSpeed) * brk * 15000;
    const handForce = this.handbrake ? -sign(this.fwdSpeed) * 7000 : 0;
    // resistance
    const drag = 0.42 * this.fwdSpeed * Math.abs(this.fwdSpeed);
    const roll = 145 * this.fwdSpeed;
    let F = driveForce + brakeForce + handForce - drag - roll;
    let aFwd = F / this.mass;

    /* --- lateral: slip angle + tyre grip --- */
    let vF = this.fwdSpeed, vL = this.latSpeed;
    const gripBase = this.handbrake ? 2.6 : 9.6;
    const loadTransfer = clamp01(Math.abs(aFwd) / 9) * 0.34;
    const grip = gripBase * (1 - loadTransfer) * (1 - this.damage * 0.0016) * (1 - (S.wetGrip || 0) * 0.34);
    vL = damp(vL, 0, grip, dt);

    /* --- yaw response --- */
    const steerAngle = this.steer;
    const understeer = clamp01(spd / 30) * 0.32;
    let desiredYaw = Math.tan(steerAngle) * vF / Math.max(this.wheelbase, 0.5) * (1 - understeer);
    if (this.handbrake) desiredYaw *= 1.55;
    desiredYaw = clamp(desiredYaw, -2.5, 2.5);
    this.yawRate = damp(this.yawRate, desiredYaw, this.handbrake ? 5.5 : 8.5, dt);
    this.yaw += this.yawRate * dt;
    if (this.yaw > PI) this.yaw -= TAU; if (this.yaw < -PI) this.yaw += TAU;

    vF += aFwd * dt;

    /* --- recompose world velocity from body axes --- */
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.vel[0] = vF * s + vL * c;
    this.vel[2] = vF * c - vL * s;
    this.vel[1] += GRAVITY * dt;

    this.slip = clamp01(Math.abs(vL) / 7 + Math.abs(this.yawRate) * 0.16);

    /* --- integrate --- */
    this.pos[0] += this.vel[0] * dt;
    this.pos[2] += this.vel[2] * dt;
    this.pos[1] += this.vel[1] * dt;

    this.collide(dt);

    /* --- suspension sampling → body attitude --- */
    let sumH = 0, minC = 99;
    for (let i = 0; i < 4; i++) {
      const [wx, wz] = this.cornerOff(i);
      const gh = groundHeightAt(wx, wz, this.pos[1] + 2.2);
      const comp = clamp((this.pos[1] + this.bodyH - gh) / 0.4, 0, 1);
      const target = 1 - comp;
      this.suspV[i] = damp(this.suspV[i], 0, 6, dt);
      this.susp[i] = damp(this.susp[i], target, 13, dt);
      sumH += gh;
      minC = Math.min(minC, comp);
    }
    const avgH = sumH / 4;
    const targetY = avgH + this.bodyH - (1 - minC) * 0.06;
    if (this.pos[1] < targetY - 0.05) { this.vel[1] = Math.max(this.vel[1], 0); }
    this.pos[1] = damp(this.pos[1], targetY, 16, dt);
    if (this.pos[1] < targetY - 0.6) this.pos[1] = targetY;

    // pitch from accel/brake, roll from lateral load — this is what the camera feels
    const targetPitch = clamp(-aFwd * 0.0125, -0.09, 0.09) + (this.susp[0] + this.susp[1] - this.susp[2] - this.susp[3]) * 0.02;
    const targetRoll = clamp(vL * this.yawRate * 0.012, -0.13, 0.13) + (this.susp[0] + this.susp[2] - this.susp[1] - this.susp[3]) * 0.03;
    this.pitch = damp(this.pitch, targetPitch, 7, dt);
    this.roll = damp(this.roll, targetRoll, 7, dt);

    this.speed = Math.hypot(this.vel[0], this.vel[2]);
    this.impact = Math.max(0, this.impact - dt * 2.4);
    this.horn = Math.max(0, this.horn - dt);

    const bnd = W.bounds;
    this.pos[0] = clamp(this.pos[0], bnd.minX + 3, bnd.maxX - 3);
    this.pos[2] = clamp(this.pos[2], bnd.minZ + 3, bnd.maxZ - 3);
  }

  settle(dt) {
    this.vel[0] = this.vel[2] = 0;
    this.vel[1] += GRAVITY * dt;
    this.pos[1] += this.vel[1] * dt;
    const gh = groundHeightAt(this.pos[0], this.pos[2], this.pos[1] + 2.2);
    if (this.pos[1] < gh) { this.pos[1] = gh; this.vel[1] = 0; }
    this.pitch = damp(this.pitch, 0, 5, dt);
    this.roll = damp(this.roll, 0, 5, dt);
    for (let i = 0; i < 4; i++) this.susp[i] = damp(this.susp[i], 0.5, 6, dt);
    this.rpm = damp(this.rpm, 800, 3, dt);
    this.speed = 0;
  }

  collide(dt) {
    const hw = this.track / 2 + 0.14, hl = this.wheelbase / 2 + 0.62;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const probes = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      const lx = Math.cos(a) * hw * (Math.abs(Math.cos(a)) > 0.7 ? 1 : 0.9);
      const lz = Math.sin(a) * hl;
      probes.push([this.pos[0] + lx * c + lz * s, this.pos[2] - lx * s + lz * c, lx, lz]);
    }
    for (const [px, pz, lx, lz] of probes) {
      const list = nearBoxes(px, pz, 0.9, false);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b.solid || b.trigger || b.oneWay) continue;
        if (b.max[1] < this.pos[1] + 0.15 || b.min[1] > this.pos[1] + 1.5) continue;
        const cx = clamp(px, b.min[0], b.max[0]), cz = clamp(pz, b.min[2], b.max[2]);
        const dx = px - cx, dz = pz - cz;
        const d = Math.hypot(dx, dz);
        const rad = 0.42;
        if (d < rad) {
          const nx = d > 1e-5 ? dx / d : 0, nz = d > 1e-5 ? dz / d : 1;
          const pen = rad - d;
          this.pos[0] += nx * pen; this.pos[2] += nz * pen;
          const vn = this.vel[0] * nx + this.vel[2] * nz;
          if (vn < 0) {
            const j = -vn * 1.35;
            this.vel[0] += nx * j; this.vel[2] += nz * j;
            // torque from the offset contact point
            const rx = px - this.pos[0], rz = pz - this.pos[2];
            this.yawRate += (rx * nz - rz * nx) * j * 0.00035;
            const impact = Math.abs(vn);
            if (impact > 3.2) {
              this.damage = clamp(this.damage + impact * 0.72, 0, 100);
              this.impact = clamp(impact / 14, 0.2, 1);
              if (S && S.audio) S.audio.crash(clamp01(impact / 16));
              if (S && S.player && S.player.vehicle === this) S.cam.shake(clamp(impact / 9, 0.1, 1.6), 0.5);
            }
          }
        }
      }
    }
  }

  /** World-space position of the driver's seat (for enter/exit). */
  seatPos(out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = -this.track / 2 + 0.16, lz = 0.25;
    out[0] = this.pos[0] + lx * c + lz * s;
    out[1] = this.pos[1] + 0.72;
    out[2] = this.pos[2] - lx * s + lz * c;
    return out;
  }

  /** Position just outside the driver's door. */
  doorPos(out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = -this.track / 2 - 0.95, lz = 0.25;
    out[0] = this.pos[0] + lx * c + lz * s;
    out[1] = this.pos[1];
    out[2] = this.pos[2] - lx * s + lz * c;
    return out;
  }
}
