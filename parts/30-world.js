/* ============================================================================
   30 — WORLD CONSTRUCTION
   Procedural fictionalized Hyderabad: Financial District, Apex Global Bank
   interior, plaza, café, street grid, parking deck and the skyline blocks.
   Everything is generated from code — no external assets.
   ============================================================================ */

const W = {
  boxes: [],          // collision volumes
  entries: [],        // deferred render geometry {mat, m, col, uv}
  lights: [],         // static light placements (activated by proximity/time)
  zones: [],          // named regions for HUD + audio beds
  props: [],          // interactables
  patternNodes: [],   // Pattern Sight targets
  meshes: {},         // material key -> mesh
  mats: {},
  bounds: { minX: -140, maxX: 190, minZ: -140, maxZ: 130 },
  groundY: 0,
  interiors: [],      // {min,max,ceil} — used to hide the sky/roof when inside
  spawn: [-30, 0, -30],
  roadLanes: [],      // {axis, c, dir, minT, maxT} — for AI traffic
  walkAreas: [],      // {minX,maxX,minZ,maxZ} — pedestrian roaming
};

/* ---------------------------------------------------------------- materials */
const MATDEFS = {
  marble:      { rough: 0.22, metal: 0.0, detail: 6, color: '#dfe4ea', name: 'Marble' },
  tile:        { rough: 0.35, metal: 0.0, detail: 2, color: '#c8ccd2', name: 'Tile' },
  carpet:      { rough: 0.95, metal: 0.0, detail: 5, color: '#3d4a63', name: 'Carpet' },
  concrete:    { rough: 0.88, metal: 0.0, detail: 1, color: '#9aa0a6', name: 'Concrete' },
  concreteDk:  { rough: 0.9, metal: 0.0, detail: 1, color: '#6b7076', name: 'Concrete' },
  plaster:     { rough: 0.82, metal: 0.0, detail: 1, color: '#d8d4cc', name: 'Plaster' },
  plasterWarm: { rough: 0.8, metal: 0.0, detail: 1, color: '#c9a98a', name: 'Plaster' },
  brick:       { rough: 0.92, metal: 0.0, detail: 1, color: '#9c6b52', name: 'Brick' },
  asphalt:     { rough: 0.94, metal: 0.0, detail: 4, color: '#3a3d42', name: 'Asphalt' },
  sidewalk:    { rough: 0.86, metal: 0.0, detail: 1, color: '#8e9196', name: 'Paving' },
  metal:       { rough: 0.34, metal: 0.92, detail: 3, color: '#a8b0b8', name: 'Steel' },
  metalDk:     { rough: 0.42, metal: 0.88, detail: 3, color: '#4a5058', name: 'Steel' },
  metalGold:   { rough: 0.24, metal: 0.95, detail: 3, color: '#c8a05a', name: 'Brass' },
  glass:       { rough: 0.06, metal: 0.05, detail: 0, color: '#9fc6dc', alpha: 0.34, name: 'Glass' },
  glassTint:   { rough: 0.05, metal: 0.05, detail: 0, color: '#3d5c70', alpha: 0.42, name: 'Glass' },
  winLit:      { rough: 0.14, metal: 0.3, detail: 8, color: '#22303c', emissive: 1.0, name: 'Window' },
  wood:        { rough: 0.62, metal: 0.0, detail: 7, color: '#7a5236', name: 'Wood' },
  woodLight:   { rough: 0.58, metal: 0.0, detail: 7, color: '#a8794a', name: 'Wood' },
  fabric:      { rough: 0.98, metal: 0.0, detail: 5, color: '#4a5670', name: 'Fabric' },
  fabricRed:   { rough: 0.98, metal: 0.0, detail: 5, color: '#7d2f3a', name: 'Fabric' },
  foliage:     { rough: 0.9, metal: 0.0, detail: 7, color: '#3f6b3a', name: 'Foliage' },
  bark:        { rough: 0.95, metal: 0.0, detail: 7, color: '#4a3a2c', name: 'Bark' },
  white:       { rough: 0.6, metal: 0.0, detail: 0, color: '#eef1f5', name: 'Paint' },
  navy:        { rough: 0.55, metal: 0.05, detail: 0, color: '#1d2c46', name: 'Paint' },
  charcoal:    { rough: 0.7, metal: 0.1, detail: 0, color: '#24272c', name: 'Paint' },
  rubber:      { rough: 0.95, metal: 0.0, detail: 0, color: '#191b1e', name: 'Rubber' },
  screen:      { rough: 0.2, metal: 0.0, detail: 0, color: '#0d2a3a', emissive: 2.6, name: 'Screen' },
  screenGreen: { rough: 0.2, metal: 0.0, detail: 0, color: '#08301f', emissive: 2.4, name: 'Screen' },
  neonGold:    { rough: 0.3, metal: 0.0, detail: 0, color: '#ffb43a', emissive: 4.2, name: 'Neon' },
  neonCyan:    { rough: 0.3, metal: 0.0, detail: 0, color: '#37d9ff', emissive: 4.0, name: 'Neon' },
  neonRed:     { rough: 0.3, metal: 0.0, detail: 0, color: '#ff3f5a', emissive: 3.6, name: 'Neon' },
  ledBlue:     { rough: 0.4, metal: 0.0, detail: 0, color: '#1f6fff', emissive: 2.2, name: 'LED' },
  ledGreen:    { rough: 0.4, metal: 0.0, detail: 0, color: '#2ce88a', emissive: 2.0, name: 'LED' },
  ledRed:      { rough: 0.4, metal: 0.0, detail: 0, color: '#ff3b30', emissive: 2.6, name: 'LED' },
  paintMark:   { rough: 0.85, metal: 0.0, detail: 0, color: '#e8e4d6', name: 'Marking' },
  paintYellow: { rough: 0.8, metal: 0.0, detail: 0, color: '#e8b84a', name: 'Marking' },
  water:       { rough: 0.05, metal: 0.2, detail: 0, color: '#2d6f8f', alpha: 0.62, name: 'Water' },
  server:      { rough: 0.5, metal: 0.6, detail: 3, color: '#20242a', name: 'Rack' },
  skin:        { rough: 0.68, metal: 0.0, detail: 0, color: '#c08a63', name: 'Skin' },
  hair:        { rough: 0.85, metal: 0.0, detail: 0, color: '#221a16', name: 'Hair' },
  evidence:    { rough: 0.3, metal: 0.0, detail: 0, color: '#2ff0ff', emissive: 3.4, pattern: 1, name: 'Evidence' },
};

function initMaterials() {
  for (const k in MATDEFS) {
    const d = MATDEFS[k];
    W.mats[k] = {
      key: k,
      rough: d.rough, metal: d.metal, detail: d.detail,
      emissive: d.emissive || 0, alpha: d.alpha === undefined ? 1 : d.alpha,
      pattern: d.pattern || 0, tint: hexToRgb(d.color),
      baseColor: d.color, name: d.name
    };
  }
  R.dynMat = W.mats.metal;
  R.dyn2Mat = W.mats.glass;
  if (R.dynBatches) {
    R.dynBatches[0].mat = W.mats.metal;
    R.dynBatches[1].mat = W.mats.rubber;
    R.dynBatches[2].mat = W.mats.glass;
  }
}

/* ------------------------------------------------------------- builder API */
const _bm = M4.create();
/** Add a render box (and optionally a collider). */
function B(matKey, cx, cy, cz, hx, hy, hz, o) {
  o = o || {};
  const m = W.mats[matKey] || W.mats.concrete;
  const col = o.color ? (typeof o.color === 'string' ? hexToRgb(o.color) : o.color) : [1, 1, 1];
  M4.compose(_bm, cx, cy, cz, o.yaw || 0, o.pitch || 0, o.roll || 0, hx * 2, hy * 2, hz * 2);
  if (!o.noRender) W.entries.push({ mat: matKey, m: new Float32Array(_bm), col, uv: o.uv || 1, alpha: o.alpha });
  // collide:false  → the box is a trigger volume or pure decoration (never solid)
  const bx = boxFrom(cx, cy, cz, hx, hy, hz, o.tag || matKey, {
    solid: o.collide !== false,
    yaw: o.yaw || 0, oneWay: !!o.oneWay, cover: !!o.cover, opaqueSight: !!o.opaqueSight,
    interior: !!o.interior, trigger: o.trigger || null
  });
  W.boxes.push(bx);
  return bx;
}

function light(x, y, z, hexColor, radius, intensity, o) {
  o = o || {};
  const c = hexToRgb(hexColor);
  W.lights.push({ x, y, z, r: c[0], g: c[1], b: c[2], radius, intensity, nightOnly: !!o.night, flicker: !!o.flicker, phase: rnd(TAU), tag: o.tag || '' });
}

function zone(name, minX, maxX, minZ, maxZ, o) {
  W.zones.push({ name, minX, maxX, minZ, maxZ, ...o });
}

/** Interior volume: hides roof/sky occluders and switches the audio bed. */
function interior(minX, maxX, minY, maxY, minZ, maxZ, name) {
  W.interiors.push({ min: [minX, minY, minZ], max: [maxX, maxY, maxZ], name });
}

/* ============================================================================
   APEX GLOBAL BANK — INTERIOR
   ============================================================================ */
function buildBankInterior() {
  const FL = 0, CH = 11;      // floor level, ceiling height

  /* --- trading floor / lobby --- */
  const LX0 = -56, LX1 = -14, LZ0 = -44, LZ1 = -14;
  // polished marble floor
  B('marble', (LX0 + LX1) / 2, FL - 0.1, (LZ0 + LZ1) / 2, (LX1 - LX0) / 2, 0.1, (LZ1 - LZ0) / 2, { collide: false, uv: 1 });
  // ceiling slab
  B('plaster', (LX0 + LX1) / 2, CH + 0.2, (LZ0 + LZ1) / 2, (LX1 - LX0) / 2 + 1, 0.2, (LZ1 - LZ0) / 2 + 1, { collide: false, tag: 'roof', color: '#cdcac2' });
  // coffered ceiling detail + recessed lighting
  for (let x = LX0 + 4; x < LX1; x += 7) for (let z = LZ0 + 4; z < LZ1; z += 7) {
    B('white', x, CH - 0.12, z, 1.5, 0.08, 1.5, { collide: false });
    B('white', x, CH - 0.2, z, 0.9, 0.06, 0.9, { collide: false, color: '#ffffff' });
    light(x, CH - 0.5, z, '#fff3dd', 15, 0.85);
  }

  // walls
  B('plaster', LX0 - 0.3, CH / 2, (LZ0 + LZ1) / 2, 0.3, CH / 2 + 0.5, (LZ1 - LZ0) / 2, { interior: true, opaqueSight: true, color: '#d9d5cc' });
  B('plaster', LX1 + 0.3, CH / 2, (LZ0 + LZ1) / 2 - 5, 0.3, CH / 2 + 0.5, (LZ1 - LZ0) / 2 - 5, { interior: true, opaqueSight: true, color: '#d9d5cc' });
  B('plaster', (LX0 + LX1) / 2, CH / 2, LZ0 - 0.3, (LX1 - LX0) / 2 + 0.6, CH / 2 + 0.5, 0.3, { interior: true, opaqueSight: true, color: '#d9d5cc' });

  // glazed front facade (south) with revolving-door gap
  const FZ = LZ1 + 0.25;
  B('metalDk', (LX0 + LX1) / 2, CH / 2, FZ, (LX1 - LX0) / 2 + 0.3, 0.22, 0.32, { collide: false, color: '#3b4148' });
  B('metalDk', (LX0 + LX1) / 2, 0.05, FZ, (LX1 - LX0) / 2 + 0.3, 0.12, 0.34, { collide: false, color: '#3b4148' });
  for (let x = LX0; x <= LX1; x += 3.4) B('metalDk', x, CH / 2, FZ, 0.11, CH / 2, 0.16, { color: '#4a5158' });
  B('glassTint', (LX0 - 12) / 2 - 3, CH / 2, FZ, 10.4, CH / 2 - 0.2, 0.09, { alpha: 0.3, collide: false, uv: 6 });
  B('glassTint', -18.5, CH / 2, FZ, 4.2, CH / 2 - 0.2, 0.09, { alpha: 0.3, collide: false, uv: 3 });
  B('glassTint', (LX1 - 8) / 2 + 2, CH / 2, FZ, 12, CH / 2 - 0.2, 0.09, { alpha: 0.3, collide: false, uv: 7 });
  // invisible door triggers either side of the revolving door
  B('charcoal', -24.5, CH / 2, FZ, 2.2, CH / 2, 0.14, { collide: false, trigger: 'bankDoor' });
  // revolving door housing
  B('metal', -24.5, 1.6, FZ, 2.4, 1.6, 1.1, { collide: false, color: '#b9c0c8' });
  for (let i = 0; i < 4; i++) B('glass', -24.5, 1.5, FZ, 2.2, 1.4, 0.05, { yaw: i * PI / 4, collide: false, alpha: 0.24 });

  // brand signage above the door
  B('navy', -24.5, 8.6, FZ + 0.4, 7.5, 1.15, 0.16, { collide: false });
  B('neonGold', -24.5, 8.6, FZ + 0.62, 6.9, 0.62, 0.06, { collide: false });
  light(-24.5, 7.6, FZ + 2.4, '#ffc46a', 16, 1.4);

  /* --- reception desks --- */
  for (let i = 0; i < 3; i++) {
    const dx = -46 + i * 8, dz = -24;
    B('woodLight', dx, 0.55, dz, 2.6, 0.55, 0.8, { cover: true, tag: 'desk' });
    B('charcoal', dx, 1.13, dz, 2.7, 0.05, 0.86, { collide: false });
    B('screen', dx + 1.4, 1.55, dz - 0.2, 0.45, 0.32, 0.04, { collide: false });
    B('metalDk', dx + 1.4, 1.28, dz - 0.2, 0.16, 0.14, 0.16, { collide: false });
    B('ledGreen', dx - 2.2, 1.2, dz + 0.6, 0.06, 0.06, 0.06, { collide: false });
  }
  // teller glass partitions
  for (let i = 0; i < 3; i++) B('glass', -46 + i * 8, 2.0, -24, 2.5, 0.85, 0.05, { alpha: 0.2, collide: false });

  /* --- ATM alcove (west) --- */
  B('metalDk', LX0 + 1.0, 1.1, -34, 0.7, 1.1, 3.6, { tag: 'atm' });
  for (let i = 0; i < 4; i++) {
    B('screen', LX0 + 1.75, 1.35, -36.4 + i * 1.6, 0.06, 0.34, 0.5, { collide: false });
    B('ledBlue', LX0 + 1.78, 0.85, -36.4 + i * 1.6, 0.04, 0.05, 0.42, { collide: false });
  }
  light(LX0 + 3, 3.2, -34, '#9fd8ff', 11, 0.7);

  /* --- waiting area --- */
  for (let i = 0; i < 4; i++) {
    const sx = -20 + (i % 2) * 3.4, sz = -38 + Math.floor(i / 2) * 3.2;
    B('fabric', sx, 0.42, sz, 1.1, 0.2, 1.1, { cover: true, tag: 'seat' });
    B('fabric', sx, 0.78, sz - 0.95, 1.1, 0.36, 0.16, { cover: true });
    B('metalDk', sx, 0.1, sz, 0.9, 0.1, 0.9, { collide: false });
  }
  B('woodLight', -18.3, 0.28, -36.4, 0.6, 0.28, 0.6, { collide: false });
  B('foliage', -18.3, 0.75, -36.4, 0.36, 0.3, 0.36, { collide: false });
  // potted palms
  for (const [px, pz] of [[-52, -18], [-16, -18], [-52, -40], [-16, -40]]) {
    B('charcoal', px, 0.45, pz, 0.62, 0.45, 0.62, { collide: true, cover: true });
    B('bark', px, 1.5, pz, 0.1, 0.7, 0.1, { collide: false });
    for (let f = 0; f < 7; f++) B('foliage', px + Math.cos(f) * 0.75, 2.25 + Math.sin(f * 2.3) * 0.2, pz + Math.sin(f) * 0.75, 0.75, 0.1, 0.26, { yaw: f * TAU / 7, collide: false });
  }

  /* --- security desk by the entrance --- */
  B('charcoal', -29.5, 0.5, -17.5, 2.4, 0.5, 0.9, { cover: true, tag: 'security' });
  B('screen', -29.5, 1.25, -17.5, 0.5, 0.32, 0.05, { collide: false });
  B('metalDk', -29.5, 1.02, -17.5, 0.7, 0.04, 0.7, { collide: false });
  // turnstiles
  for (let i = 0; i < 3; i++) {
    B('metalDk', -35 + i * 2.6, 0.55, -19.5, 0.3, 0.55, 1.1, { cover: true, tag: 'turnstile' });
    B('ledGreen', -35 + i * 2.6, 1.16, -19.5, 0.1, 0.04, 0.1, { collide: false });
  }
  // CCTV domes
  for (const [cx, cz] of [[-50, -16], [-18, -16], [-50, -42], [-18, -42], [-32, -28]]) {
    B('charcoal', cx, CH - 0.55, cz, 0.3, 0.22, 0.3, { collide: false, tag: 'cctv' });
    B('ledRed', cx, CH - 0.8, cz, 0.06, 0.06, 0.06, { collide: false });
  }

  /* --- back office (Akshay's desk) --- */
  const BX0 = -40, BX1 = -14, BZ0 = -64, BZ1 = -44;
  B('carpet', (BX0 + BX1) / 2, FL - 0.08, (BZ0 + BZ1) / 2, (BX1 - BX0) / 2, 0.09, (BZ1 - BZ0) / 2, { collide: false });
  B('plaster', (BX0 + BX1) / 2, CH / 2, BZ0 - 0.3, (BX1 - BX0) / 2 + 0.6, CH / 2, 0.3, { interior: true, opaqueSight: true });
  B('plaster', BX1 + 0.3, CH / 2, (BZ0 + BZ1) / 2, 0.3, CH / 2, (BZ1 - BZ0) / 2, { interior: true, opaqueSight: true });
  // partition wall between lobby and back office, with a doorway
  B('plaster', -33.5, CH / 2, -44.3, 6.4, CH / 2, 0.3, { interior: true, opaqueSight: true });
  B('plaster', -18.5, CH / 2, -44.3, 7.4, CH / 2, 0.3, { interior: true, opaqueSight: true });
  B('plaster', -25.9, CH - 1.4, -44.3, 1.8, 1.4, 0.3, { interior: true, opaqueSight: true });
  for (let x = BX0 + 3; x < BX1; x += 8) for (let z = BZ0 + 4; z < BZ1; z += 8) {
    B('white', x, CH - 0.14, z, 1.3, 0.07, 1.3, { collide: false });
    light(x, CH - 0.5, z, '#eaf2ff', 13, 0.7);
  }
  // desk pods
  const AKSHAY_DESK = [-22, -56];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const dx = -36 + c * 8, dz = -60 + r * 9;
    B('woodLight', dx, 0.38, dz, 2.9, 0.38, 1.5, { cover: true, tag: 'desk' });
    B('charcoal', dx, 0.79, dz, 3.0, 0.03, 1.55, { collide: false });
    B('screen', dx - 1.2, 1.25, dz - 0.55, 0.6, 0.36, 0.04, { collide: false });
    B('screen', dx + 0.2, 1.25, dz - 0.55, 0.6, 0.36, 0.04, { collide: false });
    B('metalDk', dx - 1.2, 0.9, dz - 0.5, 0.2, 0.1, 0.2, { collide: false });
    B('fabric', dx, 0.42, dz + 2.1, 0.55, 0.42, 0.55, { cover: true });
    B('charcoal', dx, 0.86, dz + 2.1, 0.5, 0.44, 0.12, { collide: false });
    B('metalDk', dx, 0.08, dz + 2.1, 0.32, 0.08, 0.32, { collide: false });
    if (dx === AKSHAY_DESK[0] && dz === AKSHAY_DESK[1]) {
      B('navy', dx + 2.3, 0.95, dz - 1.4, 0.5, 0.16, 0.2, { collide: false, color: '#24375a' });
      W.props.push({
        id: 'akshayDesk', type: 'desk', x: dx, y: 1.0, z: dz + 1.0, radius: 3.0,
        label: 'Your workstation — <em>Apex Global Bank</em>', key: 'E', action: 'desk'
      });
    }
  }
  // printer / filing cabinets
  B('white', -16.5, 0.6, -60, 1.1, 0.6, 0.9, { cover: true });
  B('ledGreen', -16.5, 1.25, -59.3, 0.2, 0.04, 0.04, { collide: false });
  for (let i = 0; i < 3; i++) B('metalDk', -38.5, 0.9, -46.5 - i * 1.4, 0.85, 0.9, 0.6, { cover: true });

  /* --- corridor to the server room --- */
  const CX = -46, CZ0 = -84, CZ1 = -64;
  B('tile', CX + 3, FL - 0.08, (CZ0 + CZ1) / 2, 3.2, 0.09, (CZ1 - CZ0) / 2, { collide: false });
  B('plaster', CX - 0.3, CH / 2, (CZ0 + CZ1) / 2, 0.3, CH / 2, (CZ1 - CZ0) / 2, { interior: true, opaqueSight: true });
  B('plaster', CX + 6.3, CH / 2, (CZ0 + CZ1) / 2, 0.3, CH / 2, (CZ1 - CZ0) / 2, { interior: true, opaqueSight: true });
  B('plaster', CX + 3, CH + 0.15, (CZ0 + CZ1) / 2, 3.5, 0.25, (CZ1 - CZ0) / 2, { collide: false, tag: 'roof' });
  for (let z = CZ0 + 3; z < CZ1; z += 6) {
    B('white', CX + 3, CH - 0.16, z, 0.9, 0.06, 0.9, { collide: false });
    light(CX + 3, CH - 0.6, z, '#dff0ff', 10, 0.55);
  }
  // fire extinguisher + noticeboard
  B('neonRed', CX - 0.05, 1.1, -74, 0.16, 0.4, 0.16, { collide: false });
  B('white', CX + 6.0, 1.7, -70, 0.06, 0.7, 1.1, { collide: false });

  /* --- server room (keycard) --- */
  const SX0 = -72, SX1 = -40, SZ0 = -108, SZ1 = -84;
  B('tile', (SX0 + SX1) / 2, FL - 0.08, (SZ0 + SZ1) / 2, (SX1 - SX0) / 2, 0.09, (SZ1 - SZ0) / 2, { collide: false, color: '#8f959c' });
  B('concreteDk', (SX0 + SX1) / 2, 3.6, SZ0 - 0.4, (SX1 - SX0) / 2 + 0.8, 3.6, 0.4, { interior: true, opaqueSight: true });
  B('concreteDk', SX0 - 0.4, 3.6, (SZ0 + SZ1) / 2, 0.4, 3.6, (SZ1 - SZ0) / 2 + 0.8, { interior: true, opaqueSight: true });
  B('concreteDk', SX1 + 0.4, 3.6, (SZ0 + SZ1) / 2, 0.4, 3.6, (SZ1 - SZ0) / 2 + 0.8, { interior: true, opaqueSight: true });
  // door wall with keycard reader
  B('concreteDk', (SX0 - 8) / 2 - 2, 3.6, SZ1 + 0.4, 8.4, 3.6, 0.4, { interior: true, opaqueSight: true });
  B('concreteDk', (SX1 - 4) / 2 + 6, 3.6, SZ1 + 0.4, 10, 3.6, 0.4, { interior: true, opaqueSight: true });
  B('concreteDk', -48, 3.6 - 1.0, SZ1 + 0.4, 2, 1.0, 0.4, { interior: true, opaqueSight: true });
  B('metalDk', -48, 1.3, SZ1 + 0.4, 1.95, 1.3, 0.12, { tag: 'keydoor', color: '#3d444c' });
  B('ledRed', -46.05, 1.55, SZ1 + 0.6, 0.14, 0.14, 0.06, { collide: false });
  B('metal', -46.05, 1.55, SZ1 + 0.62, 0.1, 0.2, 0.04, { collide: false });
  W.props.push({
    id: 'serverDoor', type: 'keydoor', x: -48, y: 1.2, z: SZ1 + 1.4, radius: 3.2,
    label: 'Server room — <em>keycard required</em>', key: 'E', action: 'keydoor', locked: true
  });
  B('concreteDk', (SX0 + SX1) / 2, 7.4, (SZ0 + SZ1) / 2, (SX1 - SX0) / 2 + 0.8, 0.4, (SZ1 - SZ0) / 2 + 0.8, { collide: false, tag: 'roof' });
  for (let z = SZ0 + 3; z < SZ1; z += 6) light(-56, 6.6, z, '#7fd8ff', 16, 0.5);

  // server racks — 4 rows
  let nodeIdx = 0;
  const NODE_TEXT = [
    ['TXN 0x7A31 — SPLIT LEDGER', '₹<em>4.2 Cr</em> routed through four shell accounts in a single settlement window. The counterparty resolves to a P.O. box in Begumpet.'],
    ['TXN 0x7B90 — ROUND TRIP', 'Funds leave Apex at 02:14 and return at 02:19 as "consulting revenue". Same signatory on both legs.'],
    ['TXN 0x7C02 — GHOST PAYROLL', '<em>217 salaries</em> paid to employees who do not exist in HR records. Total ₹<em>18.6 Cr</em> per quarter.'],
    ['TXN 0x7D44 — STRUCTURED CASH', 'Deposits split into <em>₹49.4 L</em> chunks — deliberately under the reporting threshold.'],
    ['TXN 0x7E18 — THE ORIGIN', 'Dated <em>eleven years ago</em>. Before your employment. Authorising ID: <em>#0409</em>.'],
  ];
  for (let row = 0; row < 4; row++) {
    const rx = SX0 + 5 + row * 7.2;
    for (let i = 0; i < 5; i++) {
      const rz = SZ0 + 4 + i * 4.2;
      B('server', rx, 1.1, rz, 1.5, 1.1, 1.7, { tag: 'rack', cover: true });
      for (let u = 0; u < 7; u++) {
        B(u % 3 === 0 ? 'ledBlue' : 'ledGreen', rx + 1.52, 0.4 + u * 0.26, rz, 0.03, 0.05, 1.2, { collide: false });
      }
      B('metalDk', rx, 2.25, rz, 1.55, 0.06, 1.75, { collide: false });
    }
  }
  // cable trays + cold aisle
  for (let row = 0; row < 4; row++) B('metalDk', SX0 + 5 + row * 7.2, 3.1, (SZ0 + SZ1) / 2, 0.2, 0.1, 10, { collide: false });
  B('metal', (SX0 + SX1) / 2, 2.6, SZ0 + 2.5, 12, 0.5, 0.8, { collide: false, color: '#8b939b' });
  light(-56, 4.2, SZ0 + 6, '#4fb6ff', 22, 0.9);
  light(-56, 4.2, SZ1 - 6, '#4fb6ff', 22, 0.9);

  // Pattern Sight ledger nodes
  const nodePos = [[-67, -102], [-59.8, -93.6], [-52.6, -102], [-45.4, -93.6], [-56, -86.5]];
  nodePos.forEach(([nx, nz], i) => {
    W.patternNodes.push({
      id: 'node' + i, x: nx, y: 1.55, z: nz, found: false, radius: 2.6,
      title: NODE_TEXT[i][0], body: NODE_TEXT[i][1]
    });
    W.props.push({
      id: 'ledger' + i, type: 'ledger', x: nx, y: 1.55, z: nz, radius: 2.8, node: i,
      label: 'Analyse transaction node', key: 'E', action: 'ledger'
    });
  });
  // master console
  B('metalDk', -56, 0.55, SZ0 + 2.6, 3.2, 0.55, 0.9, { cover: true, tag: 'console' });
  B('screen', -56, 1.35, SZ0 + 2.6, 1.6, 0.7, 0.06, { collide: false });
  light(-56, 2.6, SZ0 + 5, '#7fe8ff', 12, 1.1);

  /* --- restroom (disguise spot) --- */
  const RX0 = -76, RX1 = -60, RZ0 = -44, RZ1 = -28;
  B('tile', (RX0 + RX1) / 2, FL - 0.08, (RZ0 + RZ1) / 2, (RX1 - RX0) / 2, 0.09, (RZ1 - RZ0) / 2, { collide: false, color: '#aeb4bb' });
  B('plaster', (RX0 + RX1) / 2, CH / 2, RZ0 - 0.3, (RX1 - RX0) / 2 + 0.6, CH / 2, 0.3, { interior: true, opaqueSight: true });
  B('plaster', RX0 - 0.3, CH / 2, (RZ0 + RZ1) / 2, 0.3, CH / 2, (RZ1 - RZ0) / 2, { interior: true, opaqueSight: true });
  B('plaster', (RX0 + RX1) / 2, CH + 0.2, (RZ0 + RZ1) / 2, (RX1 - RX0) / 2 + 0.6, 0.2, (RZ1 - RZ0) / 2 + 0.6, { collide: false, tag: 'roof' });
  B('plaster', RX1 + 0.3, CH / 2, (RZ0 + RZ1) / 2 - 4, 0.3, CH / 2, (RZ1 - RZ0) / 2 - 4, { interior: true, opaqueSight: true });
  B('plaster', (RX0 + RX1) / 2, CH / 2, RZ1 + 0.3, (RX1 - RX0) / 2 + 0.6, CH / 2, 0.3, { interior: true, opaqueSight: true });
  for (let i = 0; i < 5; i++) B('white', RX0 + 2 + i * 3, 0.95, RZ0 + 1.4, 0.9, 0.95, 0.45, { cover: true });
  B('marble', (RX0 + RX1) / 2, 0.5, RZ1 - 1.6, 6, 0.5, 0.6, { cover: true });
  B('glass', (RX0 + RX1) / 2, 1.6, RZ1 - 1.6, 5.6, 0.6, 0.06, { alpha: 0.22, collide: false });
  light((RX0 + RX1) / 2, CH - 0.6, (RZ0 + RZ1) / 2, '#fff6e6', 16, 0.9);
  W.props.push({
    id: 'restroom', type: 'disguise', x: -68, y: 1.0, z: -36, radius: 3.4,
    label: 'Restroom — <em>change identity</em>', key: 'E', action: 'disguise'
  });
  B('charcoal', -68, 1.0, -36, 1.0, 1.0, 1.0, { collide: false, trigger: 'disguiseZone' });

  interior(LX0 - 1, LX1 + 1, -1, CH + 1, LZ0 - 1, LZ1 + 1, 'Apex Bank — Lobby');
  interior(BX0 - 1, BX1 + 1, -1, CH + 1, BZ0 - 1, BZ1 + 1, 'Apex Bank — Operations Floor');
  interior(CX - 1, CX + 7, -1, CH + 1, CZ0 - 1, CZ1 + 1, 'Apex Bank — Corridor');
  interior(SX0 - 1, SX1 + 1, -1, 8, SZ0 - 1, SZ1 + 1, 'Apex Bank — Server Room');
  interior(RX0 - 1, RX1 + 1, -1, CH + 1, RZ0 - 1, RZ1 + 1, 'Apex Bank — Restroom');

  zone('APEX GLOBAL BANK', LX0 - 2, LX1 + 2, LZ0 - 2, LZ1 + 2, { indoor: true });
  zone('SERVER ROOM', SX0, SX1, SZ0, SZ1, { indoor: true });
  zone('OPERATIONS FLOOR', BX0, BX1, BZ0, BZ1, { indoor: true });
}

/* ============================================================================
   APEX TOWER — EXTERIOR MASSING + COLONNADE
   ============================================================================ */
function buildBankExterior() {
  const X0 = -80, X1 = -8, Z0 = -116, Z1 = -13;
  // plinth / steps
  B('marble', (X0 + X1) / 2, -0.25, (Z0 + Z1) / 2, (X1 - X0) / 2 + 3, 0.25, (Z1 - Z0) / 2 + 3, { collide: false, color: '#c6cbd2' });
  for (let i = 0; i < 4; i++) B('marble', -30, 0.12 + i * 0.16, -10.4 + i * 0.85, 12 - i * 0.4, 0.08, 0.5, { collide: false, color: '#d6dbe2' });

  // tower shell (hollow — interior rooms are inside)
  const T = 1.2, H = 96;
  B('glass', (X0 + X1) / 2, H / 2 + 12, Z0 - T / 2, (X1 - X0) / 2, H / 2, T / 2, { collide: false, alpha: 0.5, uv: 24, color: '#5d7f96' });
  B('metalDk', X0 - T / 2, H / 2 + 12, (Z0 + Z1) / 2, T / 2, H / 2, (Z1 - Z0) / 2 + T, { color: '#5a6169' });
  B('metalDk', X1 + T / 2, H / 2 + 12, (Z0 + Z1) / 2, T / 2, H / 2, (Z1 - Z0) / 2 + T, { color: '#5a6169' });
  B('metalDk', (X0 + X1) / 2, H / 2 + 12, Z1 + T / 2 + 1.2, (X1 - X0) / 2, H / 2, T / 2, { color: '#5a6169' });
  // floor bands
  for (let y = 12; y < H + 8; y += 4) {
    B('metal', (X0 + X1) / 2, y, Z0 - 0.4, (X1 - X0) / 2 + 0.6, 0.22, 0.3, { collide: false, color: '#8d959d' });
    B('metal', (X0 + X1) / 2, y, Z1 + 1.9, (X1 - X0) / 2 + 0.6, 0.22, 0.3, { collide: false, color: '#8d959d' });
    B('metal', X0 - 0.4, y, (Z0 + Z1) / 2, 0.3, 0.22, (Z1 - Z0) / 2 + 0.6, { collide: false, color: '#8d959d' });
    B('metal', X1 + 0.4, y, (Z0 + Z1) / 2, 0.3, 0.22, (Z1 - Z0) / 2 + 0.6, { collide: false, color: '#8d959d' });
    // lit window strips (glow at night)
    B('winLit', (X0 + X1) / 2, y + 1.9, Z0 - 0.75, (X1 - X0) / 2 - 1, 1.2, 0.12, { collide: false, uv: 18 });
    B('winLit', X1 + 0.75, y + 1.9, (Z0 + Z1) / 2, 0.12, 1.2, (Z1 - Z0) / 2 - 1, { collide: false, uv: 18 });
  }
  // crown + mast
  B('metalDk', (X0 + X1) / 2, H + 12, (Z0 + Z1) / 2, (X1 - X0) / 2 - 4, 2.5, (Z1 - Z0) / 2 - 4, { color: '#4a5158' });
  B('metal', (X0 + X1) / 2, H + 22, (Z0 + Z1) / 2, 0.4, 8, 0.4, { collide: false });
  B('neonRed', (X0 + X1) / 2, H + 30.2, (Z0 + Z1) / 2, 0.35, 0.35, 0.35, { collide: false });
  // roof sign
  B('navy', -44, H + 16, Z1 + 2.6, 14, 2.6, 0.3, { collide: false });
  B('neonGold', -44, H + 16, Z1 + 3.0, 12.6, 1.5, 0.12, { collide: false });

  // ground-floor colonnade along the plaza side
  for (let i = 0; i < 6; i++) {
    const cx = X1 - 0.6;
    B('marble', cx, 6, Z0 + 12 + i * 16, 1.0, 6, 1.0, { tag: 'column', color: '#d3d8de' });
    B('marble', cx, 12.4, Z0 + 12 + i * 16, 1.4, 0.4, 1.4, { collide: false, color: '#d3d8de' });
  }
  // side entrance canopy
  B('metal', X1 + 2.2, 4.4, -30, 3.4, 0.25, 6, { color: '#9aa2aa' });
  B('metalDk', X1 + 4.8, 2.2, -34, 0.16, 2.2, 0.16, { collide: false });
  B('metalDk', X1 + 4.8, 2.2, -26, 0.16, 2.2, 0.16, { collide: false });
  B('neonGold', X1 + 2.2, 4.05, -30, 2.8, 0.08, 5.2, { collide: false });
  light(X1 + 3, 3.6, -30, '#ffcf8a', 18, 1.1, { night: true });

  // perimeter planters + bollards
  for (let i = 0; i < 10; i++) {
    const bx = X1 + 1.6, bz = Z0 + 10 + i * 10;
    B('concrete', bx, 0.4, bz, 1.2, 0.4, 1.2, { cover: true });
    B('foliage', bx, 1.0, bz, 1.0, 0.42, 1.0, { collide: false });
  }
  for (let i = 0; i < 8; i++) B('metalGold', -14 - i * 0.0, 0.55, -12.2 + i * 0, 0.16, 0.55, 0.16, { collide: false });
  for (let i = 0; i < 9; i++) B('metalGold', -38 + i * 3.2, 0.5, -9.4, 0.14, 0.5, 0.14, { collide: true });
}

/* ============================================================================
   PLAZA — FINANCIAL DISTRICT
   ============================================================================ */
function buildPlaza() {
  const X0 = -8, X1 = 46, Z0 = -46, Z1 = 14;
  B('sidewalk', (X0 + X1) / 2, -0.12, (Z0 + Z1) / 2, (X1 - X0) / 2, 0.12, (Z1 - Z0) / 2, { collide: false });
  // paving pattern bands
  for (let i = 0; i < 8; i++) B('concrete', X0 + 2 + i * 6.6, -0.02, (Z0 + Z1) / 2, 0.5, 0.03, (Z1 - Z0) / 2, { collide: false, color: '#7d8288' });

  // central fountain
  const FX = 19, FZ = -18;
  B('marble', FX, 0.3, FZ, 6.4, 0.3, 6.4, { tag: 'fountain', color: '#cfd5dc' });
  B('water', FX, 0.44, FZ, 5.5, 0.1, 5.5, { collide: false, alpha: 0.55 });
  B('marble', FX, 0.9, FZ, 1.4, 0.6, 1.4, { color: '#d8dee5' });
  B('metalGold', FX, 1.9, FZ, 0.35, 1.0, 0.35, { collide: false });
  B('water', FX, 2.7, FZ, 1.1, 0.16, 1.1, { collide: false, alpha: 0.5 });
  light(FX, 1.6, FZ, '#8fd8ff', 20, 0.9, { night: true });

  // benches + planters
  for (let i = 0; i < 6; i++) {
    const bx = 2 + (i % 3) * 15, bz = -40 + Math.floor(i / 3) * 30;
    B('woodLight', bx, 0.46, bz, 2.6, 0.12, 0.6, { cover: true, tag: 'bench' });
    B('metalDk', bx - 1.9, 0.22, bz, 0.2, 0.22, 0.5, { collide: false });
    B('metalDk', bx + 1.9, 0.22, bz, 0.2, 0.22, 0.5, { collide: false });
    B('woodLight', bx, 0.85, bz - 0.5, 2.6, 0.4, 0.1, { cover: true });
  }
  for (let i = 0; i < 8; i++) {
    const px = 0 + (i % 4) * 14, pz = -44 + Math.floor(i / 4) * 46;
    B('concrete', px, 0.35, pz, 1.6, 0.35, 1.6, { cover: true });
    B('bark', px, 2.2, pz, 0.26, 1.6, 0.26, {});
    for (let c = 0; c < 4; c++) B('foliage', px + Math.cos(c * 1.7) * 1.4, 3.9 + (c % 2) * 0.5, pz + Math.sin(c * 1.7) * 1.4, 1.7, 0.9, 1.7, { collide: false });
    B('foliage', px, 4.6, pz, 1.3, 1.0, 1.3, { collide: false });
  }

  // plaza light columns
  for (let i = 0; i < 6; i++) {
    const lx = -4 + (i % 2) * 44, lz = -42 + Math.floor(i / 2) * 24;
    B('metalDk', lx, 3.0, lz, 0.16, 3.0, 0.16, { collide: true });
    B('white', lx, 6.1, lz, 0.5, 0.22, 0.5, { collide: false });
    B('white', lx, 6.0, lz, 0.34, 0.1, 0.34, { collide: false, color: '#fffaf0' });
    light(lx, 5.6, lz, '#ffe6bd', 26, 1.5, { night: true, tag: 'street' });
  }

  // office towers ringing the plaza
  const towers = [
    [56, -50, 22, 20, 62, '#7f8b98'], [58, -84, 20, 18, 88, '#6e7a88'],
    [16, -66, 18, 16, 54, '#8a949f'], [-2, -86, 24, 22, 74, '#77828f'],
    [60, 30, 24, 22, 96, '#6b7684'], [22, 44, 20, 18, 60, '#7c8794'],
    [-30, 44, 26, 20, 82, '#737e8c'], [-70, 40, 22, 24, 58, '#808b98'],
    [110, -80, 24, 22, 70, '#6f7a87'], [140, -60, 20, 20, 48, '#7d8894'],
  ];
  // Hand-authored footprints must still clear the carriageway. Push each tower out of
  // every road band along the axis of least penetration so no tower ever sits in a lane.
  const clearOfRoads = (tx, tz, hx, hz) => {
    for (let pass = 0; pass < 4; pass++) {
      for (const rd of ROADS) {
        const m = rd.hw + 5;
        if (rd.axis === 'x') {
          if (tz - hz < rd.c + m && tz + hz > rd.c - m) {
            tz = (tz >= rd.c) ? rd.c + m + hz : rd.c - m - hz;
          }
        } else if (tx - hx < rd.c + m && tx + hx > rd.c - m) {
          tx = (tx >= rd.c) ? rd.c + m + hx : rd.c - m - hx;
        }
      }
    }
    return [tx, tz];
  };
  towers.forEach(([tx, tz, hx, hz, h, col], i) => {
    const [fx, fz] = clearOfRoads(tx, tz, hx, hz);
    buildTower(fx, fz, hx, hz, h, col, 1000 + i);
  });

  // glass bus shelter + kiosk
  B('metalDk', 34, 1.7, -2, 3.6, 1.7, 0.14, { collide: false });
  B('glass', 34, 1.7, -2, 3.6, 1.6, 0.06, { alpha: 0.24, collide: false });
  B('metalDk', 30.6, 1.8, -2, 0.14, 1.8, 1.3, { collide: true });
  B('metalDk', 37.4, 1.8, -2, 0.14, 1.8, 1.3, { collide: true });
  B('metalDk', 34, 3.7, -2, 4.0, 0.16, 1.6, { collide: false });
  B('screen', 31.2, 1.9, -1.2, 0.9, 1.1, 0.06, { collide: false });
  light(34, 3.2, -2, '#cfe8ff', 14, 0.9, { night: true });

  // newspaper kiosk
  B('neonRed', 4, 1.4, 4, 1.8, 1.4, 1.4, { collide: true, color: '#b03348' });
  B('white', 4, 2.95, 4, 2.0, 0.14, 1.6, { collide: false });
  B('neonGold', 4, 2.5, 2.5, 1.5, 0.22, 0.08, { collide: false });

  zone('FINANCIAL DISTRICT PLAZA', X0, X1, Z0, Z1);
  W.walkAreas.push({ minX: X0 + 2, maxX: X1 - 2, minZ: Z0 + 2, maxZ: Z1 - 2 });
}

/** Reusable office tower with lit window strips. */
function buildTower(cx, cz, hx, hz, h, col, seed) {
  const rng = makeRNG(seed);
  B('concrete', cx, h / 2, cz, hx, h / 2, hz, { tag: 'building', color: col });
  const rows = Math.floor(h / 4);
  for (let i = 0; i < rows; i++) {
    const y = 3 + i * 4;
    if (y > h - 3) break;
    const litF = rng();
    for (const [ox, oz, w, d] of [[0, -hz - 0.3, hx - 1.2, 0.1], [0, hz + 0.3, hx - 1.2, 0.1], [-hx - 0.3, 0, 0.1, hz - 1.2], [hx + 0.3, 0, 0.1, hz - 1.2]]) {
      B('winLit', cx + ox, y, cz + oz, Math.max(0.1, w), 1.4, Math.max(0.1, d), { collide: false, uv: 12, color: litF > 0.35 ? '#1b2733' : '#141c25' });
    }
    if (i % 4 === 0) B('metalDk', cx, y + 2.1, cz, hx + 0.35, 0.18, hz + 0.35, { collide: false, color: '#5c646c' });
  }
  // rooftop clutter
  B('concreteDk', cx + hx * 0.3, h + 1.2, cz - hz * 0.3, 3, 1.2, 3, { collide: false });
  B('metalDk', cx - hx * 0.4, h + 2.2, cz + hz * 0.35, 0.5, 2.2, 0.5, { collide: false });
  if (rng() > 0.5) B('neonRed', cx - hx * 0.4, h + 4.5, cz + hz * 0.35, 0.3, 0.3, 0.3, { collide: false });
  // ground floor retail band
  B('metalDk', cx, 2.2, cz - hz - 0.4, hx - 2, 2.2, 0.4, { collide: false, color: '#4d555d' });
  B('winLit', cx, 1.8, cz - hz - 0.85, hx - 4, 1.5, 0.08, { collide: false, uv: 10 });
}

/* ============================================================================
   CAFÉ — "THE IRANI ROOM"
   ============================================================================ */
function buildCafe() {
  const X0 = 48, X1 = 76, Z0 = -34, Z1 = -8, CH = 6.5;
  // interior shell
  B('tile', (X0 + X1) / 2, -0.1, (Z0 + Z1) / 2, (X1 - X0) / 2, 0.1, (Z1 - Z0) / 2, { collide: false, color: '#b9a58c' });
  B('plasterWarm', (X0 + X1) / 2, CH / 2, Z0 - 0.3, (X1 - X0) / 2 + 0.6, CH / 2, 0.3, { interior: true, opaqueSight: true });
  B('plasterWarm', X0 - 0.3, CH / 2, (Z0 + Z1) / 2, 0.3, CH / 2, (Z1 - Z0) / 2, { interior: true, opaqueSight: true });
  B('plasterWarm', X1 + 0.3, CH / 2, (Z0 + Z1) / 2, 0.3, CH / 2, (Z1 - Z0) / 2, { interior: true, opaqueSight: true });
  B('brick', (X0 + X1) / 2, CH / 2, Z1 + 0.3, (X1 - X0) / 2 + 0.6, CH / 2, 0.3, { interior: true, opaqueSight: true, color: '#8f6049' });
  B('plasterWarm', (X0 + X1) / 2, CH + 0.25, (Z0 + Z1) / 2, (X1 - X0) / 2 + 0.8, 0.25, (Z1 - Z0) / 2 + 0.8, { collide: false, tag: 'roof' });
  // upper storey
  B('plasterWarm', (X0 + X1) / 2, CH + 3.6, (Z0 + Z1) / 2, (X1 - X0) / 2, 3.2, (Z1 - Z0) / 2, { collide: false, color: '#c19a76' });
  B('winLit', (X0 + X1) / 2, CH + 3.8, Z1 + 0.5, (X1 - X0) / 2 - 3, 1.6, 0.1, { collide: false, uv: 8 });
  B('metalDk', (X0 + X1) / 2, CH + 7.1, (Z0 + Z1) / 2, (X1 - X0) / 2 + 1, 0.3, (Z1 - Z0) / 2 + 1, { collide: false });
  // sign
  B('charcoal', (X0 + X1) / 2, CH + 0.9, Z1 + 0.7, 9, 0.85, 0.16, { collide: false });
  B('neonGold', (X0 + X1) / 2, CH + 0.9, Z1 + 0.92, 8.2, 0.5, 0.08, { collide: false });
  light((X0 + X1) / 2, CH + 0.2, Z1 + 3, '#ffc978', 22, 1.3, { night: true });

  // counter + espresso bar
  B('wood', X0 + 5, 0.55, Z0 + 5, 4.6, 0.55, 1.1, { cover: true, tag: 'counter' });
  B('marble', X0 + 5, 1.13, Z0 + 5, 4.8, 0.06, 1.25, { collide: false, color: '#e6e2da' });
  B('metal', X0 + 3.2, 1.55, Z0 + 5, 0.9, 0.4, 0.6, { collide: false, color: '#c3c9cf' });
  B('ledGreen', X0 + 3.2, 2.0, Z0 + 4.4, 0.08, 0.06, 0.06, { collide: false });
  B('wood', X0 + 8.4, 1.2, Z0 + 5, 0.9, 0.6, 0.5, { collide: false });
  // shelves of cups
  for (let i = 0; i < 3; i++) {
    B('woodLight', X0 + 1.2, 1.6 + i * 1.1, Z0 + 1.6, 0.4, 0.07, 3.4, { collide: false });
    for (let j = 0; j < 6; j++) B('white', X0 + 1.2, 1.8 + i * 1.1, Z0 + 0.2 + j * 1.1, 0.22, 0.16, 0.22, { collide: false });
  }
  // pendant lights
  for (let i = 0; i < 5; i++) {
    const lx = X0 + 4 + i * 5.4, lz = Z0 + 11;
    B('metalDk', lx, CH - 0.9, lz, 0.03, 0.9, 0.03, { collide: false });
    B('neonGold', lx, CH - 1.9, lz, 0.42, 0.3, 0.42, { collide: false, color: '#ffd79a' });
    light(lx, CH - 2.2, lz, '#ffcf94', 13, 1.0);
  }
  // indoor tables
  for (let i = 0; i < 4; i++) {
    const tx = X0 + 6 + (i % 2) * 12, tz = Z0 + 16 + Math.floor(i / 2) * 6;
    B('woodLight', tx, 0.72, tz, 1.0, 0.06, 1.0, { collide: false });
    B('metalDk', tx, 0.36, tz, 0.1, 0.36, 0.1, { collide: false });
    B('metalDk', tx, 0.04, tz, 0.5, 0.04, 0.5, { collide: false });
    for (let c = 0; c < 2; c++) {
      const cx2 = tx + (c ? 1.5 : -1.5);
      B('fabricRed', cx2, 0.44, tz, 0.42, 0.06, 0.42, { collide: false });
      B('metalDk', cx2, 0.22, tz, 0.08, 0.22, 0.08, { collide: false });
      B('fabricRed', cx2, 0.78, tz + (c ? 0.36 : -0.36), 0.42, 0.36, 0.07, { collide: false });
    }
  }
  light(X0 + 12, CH - 1.4, Z0 + 14, '#ffd6a0', 20, 0.85);
  interior(X0 - 1, X1 + 1, -1, CH, Z0 - 1, Z1 + 1, 'The Irani Room');
  zone('THE IRANI ROOM', X0, X1, Z0, Z1, { indoor: true });

  /* --- terrace --- */
  const TX0 = 44, TX1 = 78, TZ0 = -8, TZ1 = 12;
  B('sidewalk', (TX0 + TX1) / 2, -0.1, (TZ0 + TZ1) / 2, (TX1 - TX0) / 2, 0.1, (TZ1 - TZ0) / 2, { collide: false, color: '#9a8f80' });
  // string lights
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const sx = TX0 + 1.5 + t * (TX1 - TX0 - 3);
    const sy = 4.4 - Math.sin(t * PI) * 0.9;
    B('neonGold', sx, sy, TZ0 + 1.5, 0.12, 0.12, 0.12, { collide: false, color: '#ffe0a8' });
    if (i % 2 === 0) light(sx, sy - 0.3, TZ0 + 1.5, '#ffc98a', 12, 0.5, { night: true });
  }
  // parasols + tables (Keerthy sits at the corner table)
  const tables = [[52, 4], [60, 4], [68, 4], [56, 10], [64, 10]];
  tables.forEach(([tx, tz], i) => {
    B('woodLight', tx, 0.72, tz, 1.1, 0.06, 1.1, { collide: false });
    B('metalDk', tx, 0.36, tz, 0.1, 0.36, 0.1, { collide: false });
    B('metalDk', tx, 0.04, tz, 0.5, 0.04, 0.5, { collide: false });
    B('metalDk', tx, 1.7, tz, 0.05, 1.0, 0.05, { collide: false });
    B('fabricRed', tx, 2.8, tz, 1.9, 0.14, 1.9, { collide: false, color: '#a8485a' });
    for (let c = 0; c < 2; c++) {
      const cx2 = tx + (c ? 1.6 : -1.6);
      B('fabric', cx2, 0.46, tz, 0.44, 0.06, 0.44, { collide: false, color: '#c8b79a' });
      B('metalDk', cx2, 0.23, tz, 0.08, 0.23, 0.08, { collide: false });
      B('fabric', cx2, 0.8, tz + (c ? 0.38 : -0.38), 0.44, 0.36, 0.07, { collide: false, color: '#c8b79a' });
    }
    B('white', tx + 0.5, 0.86, tz + 0.4, 0.14, 0.1, 0.14, { collide: false });
  });
  // Keerthy's own chair, back turned to the street
  B('fabric', 60, 0.46, 2.4, 0.46, 0.06, 0.46, { collide: false, color: '#c8b79a' });
  B('metalDk', 60, 0.23, 2.4, 0.08, 0.23, 0.08, { collide: false });
  B('fabric', 60, 0.80, 1.98, 0.07, 0.38, 0.46, { collide: false, color: '#c8b79a' });
  // Keerthy's table
  const KX = 60, KZ = 4;
  B('neonCyan', KX - 0.5, 0.86, KZ - 0.5, 0.16, 0.08, 0.1, { collide: false });
  B('white', KX - 0.5, 0.9, KZ - 0.5, 0.12, 0.12, 0.12, { collide: false });
  W.props.push({
    id: 'keerthy', type: 'talk', x: KX + 1.6, y: 1.0, z: KZ, radius: 3.6,
    label: 'Speak with <em>Keerthy Rao</em>', key: 'E', action: 'talkKeerthy'
  });
  // planters + railing along the road
  for (let i = 0; i < 7; i++) B('concrete', TX0 + 2 + i * 5.4, 0.35, TZ1 - 0.8, 0.9, 0.35, 0.9, { cover: true });
  for (let i = 0; i < 7; i++) B('foliage', TX0 + 2 + i * 5.4, 0.85, TZ1 - 0.8, 0.75, 0.32, 0.75, { collide: false });
  for (let i = 0; i < 12; i++) B('metalDk', TX0 + 1 + i * 3, 0.55, TZ1 + 0.3, 0.06, 0.55, 0.06, { collide: false });
  B('metalDk', (TX0 + TX1) / 2, 1.05, TZ1 + 0.3, (TX1 - TX0) / 2, 0.05, 0.05, { collide: false });
  // menu board
  B('charcoal', 46.5, 1.2, TZ0 + 1, 0.9, 1.2, 0.12, { collide: false });
  B('white', 46.5, 1.3, TZ0 + 1.14, 0.7, 0.9, 0.03, { collide: false, color: '#e8e2d4' });
  zone('CAFÉ TERRACE', TX0, TX1, TZ0, TZ1);
  W.walkAreas.push({ minX: TX0 + 2, maxX: TX1 - 2, minZ: TZ0 + 1, maxZ: TZ1 - 2 });
}

/* ============================================================================
   STREETS
   ============================================================================ */
const ROADS = [
  { axis: 'x', c: 23, hw: 7.5, t0: -120, t1: 180, name: 'Nizam Road' },
  // Charminar Link stops at the plaza's west edge: the Apex complex (x[-72,-8]) reaches
  // as far south as z=-108, so an unbroken E-W carriageway at z=-70 would run straight
  // through the bank's back-of-house corridor and server annex.
  { axis: 'x', c: -70, hw: 7.5, t0: -6, t1: 180, name: 'Charminar Link' },
  { axis: 'z', c: 96, hw: 7.5, t0: -110, t1: 90, name: 'Golconda Avenue' },
  { axis: 'z', c: -96, hw: 7.0, t0: -110, t1: 90, name: 'Old Mill Road' },
];

function buildRoads() {
  // ground plane
  const b = W.bounds;
  B('asphalt', (b.minX + b.maxX) / 2, -0.35, (b.minZ + b.maxZ) / 2,
    (b.maxX - b.minX) / 2, 0.35, (b.maxZ - b.minZ) / 2, { collide: false, color: '#2c2f33' });

  ROADS.forEach(rd => {
    const len = rd.t1 - rd.t0, mid = (rd.t0 + rd.t1) / 2;
    if (rd.axis === 'x') {
      B('asphalt', mid, -0.06, rd.c, len / 2, 0.06, rd.hw, { collide: false, color: '#35383d' });
      // centre dashes
      for (let t = rd.t0; t < rd.t1; t += 6) B('paintMark', t + 2, 0.01, rd.c, 1.7, 0.02, 0.13, { collide: false });
      // edge lines
      B('paintMark', mid, 0.01, rd.c - rd.hw + 0.5, len / 2 - 2, 0.02, 0.1, { collide: false, color: '#d8d2bf' });
      B('paintMark', mid, 0.01, rd.c + rd.hw - 0.5, len / 2 - 2, 0.02, 0.1, { collide: false, color: '#d8d2bf' });
      // kerbs + sidewalks
      B('sidewalk', mid, 0.12, rd.c - rd.hw - 1.8, len / 2, 0.14, 1.9, { collide: false });
      B('sidewalk', mid, 0.12, rd.c + rd.hw + 1.8, len / 2, 0.14, 1.9, { collide: false });
      B('concrete', mid, 0.14, rd.c - rd.hw - 0.1, len / 2, 0.16, 0.14, { collide: false, color: '#7f848a' });
      B('concrete', mid, 0.14, rd.c + rd.hw + 0.1, len / 2, 0.16, 0.14, { collide: false, color: '#7f848a' });
      // streetlights both sides
      for (let t = rd.t0 + 12; t < rd.t1; t += 26) {
        for (const s of [-1, 1]) {
          const lx = t, lz = rd.c + s * (rd.hw + 1.4);
          B('metalDk', lx, 3.6, lz, 0.14, 3.6, 0.14, { collide: true });
          B('metalDk', lx - s * 0, 7.1, lz - s * 0.9, 0.12, 0.12, 1.0, { collide: false });
          B('white', lx, 7.0, lz - s * 1.7, 0.42, 0.14, 0.28, { collide: false, color: '#fff8ea' });
          light(lx, 6.6, lz - s * 1.7, '#ffdfae', 30, 1.6, { night: true, tag: 'street' });
        }
      }
      // traffic lanes for AI
      W.roadLanes.push({ axis: 'x', c: rd.c - rd.hw / 2, dir: 1, minT: rd.t0, maxT: rd.t1 });
      W.roadLanes.push({ axis: 'x', c: rd.c + rd.hw / 2, dir: -1, minT: rd.t0, maxT: rd.t1 });
    } else {
      B('asphalt', rd.c, -0.06, mid, rd.hw, 0.06, len / 2, { collide: false, color: '#35383d' });
      for (let t = rd.t0; t < rd.t1; t += 6) B('paintMark', rd.c, 0.01, t + 2, 0.13, 0.02, 1.7, { collide: false });
      B('paintMark', rd.c - rd.hw + 0.5, 0.01, mid, 0.1, 0.02, len / 2 - 2, { collide: false, color: '#d8d2bf' });
      B('paintMark', rd.c + rd.hw - 0.5, 0.01, mid, 0.1, 0.02, len / 2 - 2, { collide: false, color: '#d8d2bf' });
      B('sidewalk', rd.c - rd.hw - 1.8, 0.12, mid, 1.9, 0.14, len / 2, { collide: false });
      B('sidewalk', rd.c + rd.hw + 1.8, 0.12, mid, 1.9, 0.14, len / 2, { collide: false });
      B('concrete', rd.c - rd.hw - 0.1, 0.14, mid, 0.14, 0.16, len / 2, { collide: false, color: '#7f848a' });
      B('concrete', rd.c + rd.hw + 0.1, 0.14, mid, 0.14, 0.16, len / 2, { collide: false, color: '#7f848a' });
      for (let t = rd.t0 + 12; t < rd.t1; t += 26) {
        for (const s of [-1, 1]) {
          const lx = rd.c + s * (rd.hw + 1.4), lz = t;
          B('metalDk', lx, 3.6, lz, 0.14, 3.6, 0.14, { collide: true });
          B('metalDk', lx - s * 0.9, 7.1, lz, 1.0, 0.12, 0.12, { collide: false });
          B('white', lx - s * 1.7, 7.0, lz, 0.28, 0.14, 0.42, { collide: false, color: '#fff8ea' });
          light(lx - s * 1.7, 6.6, lz, '#ffdfae', 30, 1.6, { night: true, tag: 'street' });
        }
      }
      W.roadLanes.push({ axis: 'z', c: rd.c - rd.hw / 2, dir: -1, minT: rd.t0, maxT: rd.t1 });
      W.roadLanes.push({ axis: 'z', c: rd.c + rd.hw / 2, dir: 1, minT: rd.t0, maxT: rd.t1 });
    }
    zone(rd.name.toUpperCase(), rd.axis === 'x' ? rd.t0 : rd.c - rd.hw, rd.axis === 'x' ? rd.t1 : rd.c + rd.hw,
      rd.axis === 'x' ? rd.c - rd.hw : rd.t0, rd.axis === 'x' ? rd.c + rd.hw : rd.t1);
  });

  // crosswalks at the big junction
  for (let i = 0; i < 8; i++) {
    B('paintMark', 88 + i * 1.8, 0.02, 23 - 5, 0.6, 0.02, 4, { collide: false });
    B('paintMark', 88 + i * 1.8, 0.02, 23 + 5, 0.6, 0.02, 4, { collide: false });
  }
}

/* ============================================================================
   OLD CITY / MARKET BLOCKS + INDUSTRIAL OUTSKIRTS
   ============================================================================ */
function buildCityBlocks() {
  const rng = makeRNG(20240117);
  // Rectangle-vs-rectangle overlap. The candidate block's FOOTPRINT must clear the
  // reserved area, not just its centre — a tall block centred north of a road still
  // reaches into it when its half-depth is large enough.
  const overlaps = (minX, maxX, minZ, maxZ, bx0, bx1, bz0, bz1) =>
    minX < bx1 && maxX > bx0 && minZ < bz1 && maxZ > bz0;
  const ROAD_MARGIN = 5;   // keep blocks back from the kerb line
  const occupied = (x, z, hx, hz) => {
    const x0 = x - hx, x1 = x + hx, z0 = z - hz, z1 = z + hz;
    // bank + plaza + cafe + server annex
    if (overlaps(x0, x1, z0, z1, -88, 80, -122, 18)) return true;
    // parking deck
    if (overlaps(x0, x1, z0, z1, 92, 152, -50, 24)) return true;
    for (const rd of ROADS) {
      const m = rd.hw + ROAD_MARGIN;
      if (rd.axis === 'x' && overlaps(x0, x1, z0, z1, rd.t0, rd.t1, rd.c - m, rd.c + m)) return true;
      if (rd.axis === 'z' && overlaps(x0, x1, z0, z1, rd.c - m, rd.c + m, rd.t0, rd.t1)) return true;
    }
    // out of the playable map
    if (x0 < W.bounds.minX || x1 > W.bounds.maxX || z0 < W.bounds.minZ || z1 > W.bounds.maxZ) return true;
    return false;
  };

  const palettes = [
    ['#a8927a', '#8d7a66'], ['#96745c', '#7d5f4b'], ['#b0a894', '#8f8878'],
    ['#7e8b83', '#64706a'], ['#a5887f', '#8a6f68'], ['#8c93a0', '#6f7684'],
  ];
  const count = 74;
  const footprints = [];
  let placed = 0, attempts = 0;
  while (placed < count && attempts < count * 60) {
    attempts++;
    const x = -120 + rng() * 300, z = -120 + rng() * 230;
    const hx = 8 + rng() * 13, hz = 8 + rng() * 13;
    if (occupied(x, z, hx, hz)) continue;
    // blocks must not intersect each other either
    if (footprints.some(f => overlaps(x - hx, x + hx, z - hz, z + hz, f[0], f[1], f[2], f[3]))) continue;
    footprints.push([x - hx, x + hx, z - hz, z + hz]);
    placed++;
    const h = 6 + Math.pow(rng(), 1.7) * 46;
    const pal = palettes[(rng() * palettes.length) | 0];
    const old = z > -60 && x > 90;                                   // Old City markets, east
    const ind = z < -80 && x > 40;                                   // industrial outskirts
    if (ind) {
      B('concreteDk', x, h / 2, z, hx, h / 2, hz, { tag: 'building', color: '#6d7175' });
      B('metalDk', x, h + 0.8, z, hx + 0.4, 0.8, hz + 0.4, { collide: false });
      for (let k = 0; k < 3; k++) B('metal', x - hx + k * hx, h + 3.4 + rng() * 4, z, 0.6, 3.4, 0.6, { collide: false });
      B('winLit', x, h * 0.5, z + hz + 0.3, hx - 2, 1.6, 0.1, { collide: false, uv: 6 });
      if (rng() > 0.6) { B('neonRed', x + hx * 0.5, h + 1.6, z, 0.3, 0.3, 0.3, { collide: false }); }
    } else if (old) {
      B('plasterWarm', x, h / 2, z, hx, h / 2, hz, { tag: 'building', color: pal[0] });
      B('brick', x, h + 0.5, z, hx + 0.5, 0.5, hz + 0.5, { collide: false, color: pal[1] });
      const rows = Math.max(1, Math.floor(h / 4.5));
      for (let r = 0; r < rows; r++) {
        B('winLit', x, 3 + r * 4.5, z + hz + 0.3, hx - 2, 1.2, 0.1, { collide: false, uv: 6 });
        B('winLit', x + hx + 0.3, 3 + r * 4.5, z, 0.1, 1.2, hz - 2, { collide: false, uv: 6 });
        B('woodLight', x, 2.4 + r * 4.5, z + hz + 0.8, hx - 1.6, 0.1, 0.5, { collide: false });
      }
      // awnings + signage at street level
      B('fabricRed', x, 3.2, z + hz + 1.3, hx - 1, 0.14, 1.3, { collide: false, color: pick(['#c25a4a', '#3f6f8f', '#c89b3c', '#4f7a52']) });
      B('neonCyan', x, 4.6, z + hz + 0.5, hx * 0.7, 0.35, 0.1, { collide: false, color: pick(['#37d9ff', '#ff7ad9', '#ffd43a']) });
      light(x, 4.2, z + hz + 2.4, '#ffcf94', 18, 1.1, { night: true });
    } else {
      B('concrete', x, h / 2, z, hx, h / 2, hz, { tag: 'building', color: pal[0] });
      const rows = Math.max(1, Math.floor(h / 4));
      for (let r = 0; r < rows; r++) {
        B('winLit', x, 3 + r * 4, z + hz + 0.3, hx - 1.4, 1.3, 0.1, { collide: false, uv: 8 });
        B('winLit', x, 3 + r * 4, z - hz - 0.3, hx - 1.4, 1.3, 0.1, { collide: false, uv: 8 });
        B('winLit', x + hx + 0.3, 3 + r * 4, z, 0.1, 1.3, hz - 1.4, { collide: false, uv: 8 });
        B('winLit', x - hx - 0.3, 3 + r * 4, z, 0.1, 1.3, hz - 1.4, { collide: false, uv: 8 });
      }
      B('metalDk', x, h + 0.6, z, hx + 0.5, 0.6, hz + 0.5, { collide: false, color: '#5b6269' });
      if (rng() > 0.55) B('metal', x + hx * 0.4, h + 3, z - hz * 0.3, 0.5, 2.4, 0.5, { collide: false });
      if (rng() > 0.7) {
        B('navy', x, h * 0.72, z + hz + 0.5, hx * 0.6, 1.6, 0.14, { collide: false });
        B('neonGold', x, h * 0.72, z + hz + 0.68, hx * 0.52, 1.0, 0.06, { collide: false });
      }
      B('winLit', x, 1.9, z + hz + 0.5, hx - 2.5, 1.5, 0.1, { collide: false, uv: 6 });
    }
  }

  // market stalls along the eastern road (Old City flavour)
  for (let i = 0; i < 14; i++) {
    const sx = 108 + (i % 2) * 16, sz = -54 + Math.floor(i / 2) * 15;
    if (occupied(sx, sz, 4)) continue;
    B('wood', sx, 0.9, sz, 2.4, 0.1, 1.5, { cover: true });
    B('woodLight', sx - 2.1, 0.45, sz - 1.2, 0.09, 0.45, 0.09, { collide: false });
    B('woodLight', sx + 2.1, 0.45, sz - 1.2, 0.09, 0.45, 0.09, { collide: false });
    B('woodLight', sx - 2.1, 0.45, sz + 1.2, 0.09, 0.45, 0.09, { collide: false });
    B('woodLight', sx + 2.1, 0.45, sz + 1.2, 0.09, 0.45, 0.09, { collide: false });
    const cc = pick(['#c8503c', '#d8a038', '#3c7cc8', '#4a9a5c', '#b8489a']);
    B('fabric', sx, 2.7, sz, 3.0, 0.12, 2.0, { collide: false, color: cc });
    for (let g = 0; g < 5; g++) B('metalGold', sx - 2 + g, 1.15, sz + (g % 2) * 0.6, 0.2, 0.14, 0.2, { collide: false });
    B('neonGold', sx, 2.2, sz + 1.6, 1.2, 0.2, 0.06, { collide: false });
    light(sx, 2.4, sz, '#ffc98a', 14, 0.9, { night: true });
  }
  zone('OLD CITY MARKETS', 100, 150, -60, 40);
  zone('INDUSTRIAL OUTSKIRTS', 40, 150, -120, -80);
}

/* ============================================================================
   PARKING DECK
   ============================================================================ */
function buildParkingDeck() {
  const X0 = 100, X1 = 148, Z0 = -44, Z1 = 20;
  const L1 = 0, L2 = 5.2;

  // ground slab
  B('concreteDk', (X0 + X1) / 2, -0.12, (Z0 + Z1) / 2, (X1 - X0) / 2, 0.12, (Z1 - Z0) / 2, { collide: false, color: '#5f6367' });
  // bay markings
  for (let i = 0; i < 10; i++) {
    B('paintMark', X0 + 4 + i * 4.4, 0.02, Z0 + 6, 0.12, 0.02, 2.6, { collide: false, color: '#dcd6c4' });
    B('paintMark', X0 + 4 + i * 4.4, 0.02, Z1 - 6, 0.12, 0.02, 2.6, { collide: false, color: '#dcd6c4' });
  }
  B('paintYellow', (X0 + X1) / 2, 0.02, 0, (X1 - X0) / 2 - 2, 0.02, 0.14, { collide: false });
  B('paintMark', X0 + 3, 0.02, (Z0 + Z1) / 2, 0.14, 0.02, (Z1 - Z0) / 2 - 4, { collide: false });

  // columns
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const cx = X0 + 4 + i * 10.5, cz = Z0 + 5 + j * 22;
    B('concrete', cx, L2 / 2, cz, 0.5, L2 / 2, 0.5, { tag: 'column' });
    B('paintYellow', cx, 0.5, cz, 0.55, 0.5, 0.55, { collide: false, color: '#c9a53c' });
  }
  // level-2 slab with a ramp cut
  for (let i = 0; i < 5; i++) {
    const sx = X0 + i * 9.8;
    B('concreteDk', sx + 4.9, L2 - 0.2, (Z0 + Z1) / 2, 4.9, 0.22, (Z1 - Z0) / 2, { collide: false, color: '#6a6e72' });
    B('concreteDk', sx + 4.9, L2 - 0.2, (Z0 + Z1) / 2, 4.9, 0.22, (Z1 - Z0) / 2, { collide: true, oneWay: true, tag: 'deck2' });
  }
  // ramp up to level 2
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const rx = X1 - 6, rz = Z0 + 4 + t * (Z1 - Z0 - 8);
    const ry = t * L2;
    B('concrete', rx, ry - 0.25, rz, 3.6, 0.3, (Z1 - Z0 - 8) / steps / 2 + 0.4, { collide: false, color: '#6f7377' });
    B('concrete', rx, ry - 0.25, rz, 3.6, 0.3, (Z1 - Z0 - 8) / steps / 2 + 0.4, { collide: true, oneWay: true, tag: 'ramp' });
  }
  B('paintYellow', X1 - 6, L2 * 0.5, (Z0 + Z1) / 2, 0.1, 0.1, 0.1, { collide: false });

  // perimeter barriers
  for (let i = 0; i < 14; i++) {
    B('concrete', X0 + 2 + i * 3.4, 0.55, Z0 + 0.5, 1.6, 0.55, 0.35, { cover: true });
    B('concrete', X0 + 2 + i * 3.4, L2 + 0.55, Z0 + 0.5, 1.6, 0.55, 0.35, { collide: false });
  }
  for (let i = 0; i < 18; i++) {
    B('concrete', X0 + 0.5, 0.55, Z0 + 2 + i * 3.4, 0.35, 0.55, 1.6, { cover: true });
    B('concrete', X1 - 0.5, 0.55, Z0 + 2 + i * 3.4, 0.35, 0.55, 1.6, { cover: true });
  }
  // level 2 railings
  for (let i = 0; i < 18; i++) {
    B('metalDk', X0 + 0.4, L2 + 1.1, Z0 + 2 + i * 3.4, 0.08, 0.55, 0.08, { collide: false });
    B('metalDk', X1 - 0.4, L2 + 1.1, Z0 + 2 + i * 3.4, 0.08, 0.55, 0.08, { collide: false });
  }
  B('metalDk', X0 + 0.4, L2 + 1.6, (Z0 + Z1) / 2, 0.06, 0.06, (Z1 - Z0) / 2, { collide: false });
  B('metalDk', X1 - 0.4, L2 + 1.6, (Z0 + Z1) / 2, 0.06, 0.06, (Z1 - Z0) / 2, { collide: false });

  // roof over level 2
  B('concreteDk', (X0 + X1) / 2, L2 * 2 + 0.4, (Z0 + Z1) / 2, (X1 - X0) / 2 + 1, 0.3, (Z1 - Z0) / 2 + 1, { collide: false, tag: 'roof' });
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++)
    B('concrete', X0 + 4 + i * 10.5, L2 + (L2) / 2, Z0 + 5 + j * 22, 0.5, L2 / 2, 0.5, { collide: false });

  // lighting
  for (let i = 0; i < 4; i++) {
    const lx = X0 + 8 + i * 12;
    B('metalDk', lx, 3.4, (Z0 + Z1) / 2, 0.5, 0.1, 0.5, { collide: false });
    B('white', lx, 3.28, (Z0 + Z1) / 2, 0.4, 0.06, 0.4, { collide: false, color: '#f2f8ff' });
    light(lx, 3.0, (Z0 + Z1) / 2, '#cfe4ff', 26, 1.2);
  }
  // exit arrow signage
  B('navy', X0 + 1.2, 2.6, Z1 - 2, 0.14, 0.7, 1.4, { collide: false });
  B('ledGreen', X0 + 1.36, 2.6, Z1 - 2, 0.05, 0.4, 0.9, { collide: false });
  B('white', X0 + 1.36, 2.6, Z1 - 2, 0.04, 0.22, 0.5, { collide: false, color: '#eafff0' });

  // parked cars (static scenery) + the getaway car
  const cars = [];
  for (let i = 0; i < 8; i++) cars.push([X0 + 6 + i * 4.4, Z0 + 6, pick(['#8a2f34', '#26364f', '#c9c4b8', '#3c4a3e', '#6a6f76'])]);
  for (let i = 0; i < 8; i++) cars.push([X0 + 6 + i * 4.4, Z1 - 6, pick(['#2b3a4a', '#9a8f7a', '#5c2f3a', '#37474f'])]);
  cars.forEach(([cx, cz, col], i) => buildParkedCar(cx, cz, col, cz < 0 ? 0 : PI, 'parked' + i));

  W.props.push({
    id: 'getaway', type: 'vehicle', x: 118, y: 0.6, z: -2, radius: 4.6,
    label: 'Enter the <em>Sedan</em>', key: 'E', action: 'enterCar'
  });
  interior(X0, X1, L2 - 0.6, L2 * 2 + 1, Z0, Z1, 'Parking Deck — Level 2');
  zone('PARKING DECK', X0, X1, Z0, Z1);
}

/** Static scenery car (also used as a template shape reference). */
function buildParkedCar(cx, cz, col, yaw, id) {
  const c = hexToRgb(col);
  B('metal', cx, 0.62, cz, 0.95, 0.42, 2.25, { yaw, color: c, tag: 'car', cover: true });
  B('metal', cx + Math.sin(yaw) * 0, 1.16, cz, 0.82, 0.32, 1.25, { yaw, color: c });
  B('glassTint', cx, 1.2, cz + Math.cos(yaw) * 0.55, 0.76, 0.26, 0.62, { yaw, alpha: 0.5, collide: false });
  for (const [ox, oz] of [[-0.82, 1.5], [0.82, 1.5], [-0.82, -1.5], [0.82, -1.5]]) {
    B('rubber', cx + ox * Math.cos(yaw) + oz * Math.sin(yaw) * 0, 0.34, cz + oz * Math.cos(yaw), 0.16, 0.34, 0.34, { yaw, collide: false });
  }
  B('white', cx - Math.sin(yaw) * 2.2, 0.66, cz - Math.cos(yaw) * 2.2 + Math.sin(yaw) * 0, 0.6, 0.1, 0.06, { yaw, collide: false, color: '#fff6dc' });
}

/* ============================================================================
   BUILD EVERYTHING
   ============================================================================ */
function buildWorld() {
  initMaterials();
  buildRoads();
  buildBankInterior();
  buildBankExterior();
  buildPlaza();
  buildCafe();
  buildCityBlocks();
  buildParkingDeck();

  // bake entries into per-material meshes
  const byMat = {};
  for (const e of W.entries) (byMat[e.mat] = byMat[e.mat] || []).push(e);
  let totalBoxes = 0, drawCalls = 0;
  for (const key in byMat) {
    if (!W.mats[key]) {
      console.warn('[world] unknown material "' + key + '" — falling back to concrete');
      W.mats[key] = W.mats.concrete;
    }
    const list = byMat[key];
    totalBoxes += list.length;
    const batch = new Batch(list.length, true);
    for (const e of list) batch.push(e.m, e.col[0], e.col[1], e.col[2], e.col[3] === undefined ? (e.alpha === undefined ? 1 : e.alpha) : e.col[3], e.uv);
    const gl = R.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, batch.verts.subarray(0, list.length * 24 * VSTRIDE), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VSTRIDE * 4, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VSTRIDE * 4, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, VSTRIDE * 4, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, VSTRIDE * 4, 32);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, batch.idx.subarray(0, list.length * 36), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const alpha = W.mats[key].alpha;
    W.meshes[key] = { vao, count: list.length * 36, type: gl.UNSIGNED_INT, mat: W.mats[key], alpha };
    drawCalls++;
  }
  W.entries.length = 0;
  W.stats = { boxes: totalBoxes, drawCalls, colliders: W.boxes.length, lights: W.lights.length };

  // build a coarse spatial hash so collision queries don't scan everything
  W.hash = {};
  W.cell = 12;
  for (let i = 0; i < W.boxes.length; i++) {
    const b = W.boxes[i];
    const x0 = Math.floor(b.min[0] / W.cell), x1 = Math.floor(b.max[0] / W.cell);
    const z0 = Math.floor(b.min[2] / W.cell), z1 = Math.floor(b.max[2] / W.cell);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = x + ',' + z;
      (W.hash[k] = W.hash[k] || []).push(i);
    }
  }
  return W.stats;
}

/** Query nearby colliders for a world position. */
const _near = [];
function nearBoxes(x, z, r, includeTriggers) {
  _near.length = 0;
  const c = W.cell;
  const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
  const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
  const seen = nearBoxes._seen || (nearBoxes._seen = new Set());
  seen.clear();
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
    const list = W.hash[cx + ',' + cz];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const idx = list[i];
      if (seen.has(idx)) continue;
      seen.add(idx);
      const b = W.boxes[idx];
      if (!includeTriggers && !b.solid) continue;
      if (b.solid === false && !b.trigger) continue;
      _near.push(b);
    }
  }
  return _near;
}

/** Submit all static geometry for the current frame (culled against the view sphere). */
function submitWorld(camPos, patternOn) {
  for (const key in W.meshes) {
    const m = W.meshes[key];
    if (m.alpha < 1) {
      submit(m, R.mIdentityWorld || (R.mIdentityWorld = M4.create()), m.mat, m.mat.tint, m.alpha);
    } else {
      submit(m, R.mIdentityWorld || (R.mIdentityWorld = M4.create()), m.mat, m.mat.tint, 1);
    }
  }
}
