/* ============================================================================
   20 — RENDER CORE
   Dependency-free WebGL2 renderer:
     • single-pass forward lighting (sun + hemispheric ambient + 8 point lights)
     • 2048² hardware-comparison shadow map with PCF, refit around the player
     • procedural material detail (no texture assets anywhere in this build)
     • optional MSAA → HDR RGBA16F target → bright/blur bloom → graded composite
   ============================================================================ */

const R = {};   // renderer state

/* ---------------------------------------------------------------- shaders */
function compile(type, src, label) {
  const s = R.gl.createShader(type);
  R.gl.shaderSource(s, src);
  R.gl.compileShader(s);
  if (!R.gl.getShaderParameter(s, R.gl.COMPILE_STATUS)) {
    const log = R.gl.getShaderInfoLog(s);
    R.gl.deleteShader(s);
    throw new Error(`Shader compile failed [${label}]:\n${log}\n---\n${src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')}`);
  }
  return s;
}

function program(vsSrc, fsSrc, label, uniforms) {
  const gl = R.gl;
  const p = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, vsSrc, label + '.vs');
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc, label + '.fs');
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Link failed [${label}]: ${gl.getProgramInfoLog(p)}`);
  gl.deleteShader(vs); gl.deleteShader(fs);
  const U = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    if (info.size > 1) {
      // array uniforms need one location per element
      const arr = [];
      for (let k = 0; k < info.size; k++) arr.push(gl.getUniformLocation(p, name + '[' + k + ']'));
      U[name] = arr;
    } else {
      U[name] = gl.getUniformLocation(p, info.name);
    }
  }
  return { p, U, label };
}

/* ------------------------------------------------------- shader sources */
const GLSL_COMMON = `
float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash13(vec3(i,0.0)), b=hash13(vec3(i+vec2(1,0),0.0));
  float c=hash13(vec3(i+vec2(0,1),0.0)), d=hash13(vec3(i+vec2(1,1),0.0));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5; } return s; }
`;

const VS_MAIN = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUV;
layout(location=3) in vec4 aCol;
uniform mat4 uVP;
uniform mat4 uModel;
uniform mat3 uNM;
uniform mat4 uLightVP;
out vec3 vW; out vec3 vN; out vec2 vUV; out vec4 vCol; out vec4 vLS; out float vDepth;
void main(){
  vec4 wp = uModel * vec4(aPos,1.0);
  vW = wp.xyz;
  vN = normalize(uNM * aNrm);
  vUV = aUV;
  vCol = aCol;
  vLS = uLightVP * wp;
  vec4 cp = uVP * wp;
  vDepth = cp.z;
  gl_Position = cp;
}`;

const FS_MAIN = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec2 vUV; in vec4 vCol; in vec4 vLS; in float vDepth;
out vec4 outColor;

uniform vec3  uCam;
uniform vec3  uSunDir, uSunColor;
uniform vec3  uAmbTop, uAmbBot, uFogColor;
uniform float uFogDensity, uTime, uAlpha, uEmissive, uRough, uMetal, uDetail, uPattern, uWet;
uniform vec3  uTint;
uniform sampler2DShadow uShadow;
uniform vec2  uShadowTexel;
uniform int   uLightCount;
uniform vec4  uLightPos[8];
uniform vec4  uLightCol[8];
uniform vec3  uSkyTop, uSkyHorizon;
uniform float uExposure;
${GLSL_COMMON}

float shadowFactor(vec3 N){
  vec3 pc = vLS.xyz / vLS.w * 0.5 + 0.5;
  if (pc.z > 1.0 || pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0) return 1.0;
  float ndl = max(dot(N, uSunDir), 0.0);
  float bias = mix(0.0022, 0.0006, ndl) * 2.0;
  float s = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++)
      s += texture(uShadow, vec3(pc.xy + vec2(float(x), float(y)) * uShadowTexel * 1.4, pc.z - bias));
  return s / 9.0;
}

/* procedural surface detail — replaces texture assets entirely */
vec3 detail(vec3 base, vec3 N){
  if (uDetail < 0.5) return base;
  if (uDetail < 1.5){                      // concrete / plaster grain
    float g = fbm(vW.xz * 1.7 + vW.y * 0.9) * 0.5 + fbm(vW.xy * 3.1) * 0.25;
    float stain = smoothstep(0.55, 0.95, fbm(vW.xz * 0.35));
    return base * (0.86 + g * 0.3) - stain * 0.05;
  }
  if (uDetail < 2.5){                      // polished tile grid
    vec2 g = abs(fract(vW.xz * 1.25) - 0.5);
    float line = smoothstep(0.47, 0.5, max(g.x, g.y));
    float speck = hash13(floor(vec3(vW.xz * 1.25, 0.0)) * 7.1);
    return mix(base * (0.93 + speck * 0.14), base * 0.6, line);
  }
  if (uDetail < 3.5){                      // metal panel seams
    vec2 g = abs(fract(vW.xz * 0.55 + vW.y * 0.0) - 0.5);
    float seam = smoothstep(0.46, 0.5, max(g.x, g.y));
    float brush = vnoise(vec2(vW.x * 40.0, vW.y * 3.0)) * 0.10;
    return base * (0.9 + brush) - seam * 0.14;
  }
  if (uDetail < 4.5){                      // asphalt
    float n = fbm(vW.xz * 7.0);
    float crack = smoothstep(0.62, 0.66, fbm(vW.xz * 1.6 + 11.0));
    return base * (0.78 + n * 0.42) + crack * 0.05;
  }
  if (uDetail < 5.5){                      // carpet / fabric
    float n = fbm(vW.xz * 22.0);
    return base * (0.88 + n * 0.24);
  }
  if (uDetail < 6.5){                      // marble veining
    float v = fbm(vW.xz * 0.9 + fbm(vW.xz * 2.2) * 1.6);
    float vein = smoothstep(0.52, 0.56, v);
    return mix(base, base * 0.72 + vec3(0.05), vein);
  }
  if (uDetail < 7.5){                      // bark / foliage noise
    float n = fbm(vW.xz * 3.0 + vW.y * 4.0);
    return base * (0.75 + n * 0.5);
  }
  if (uDetail < 8.5){                      // glass mullions / window grid
    vec2 g = abs(fract(vUV * 1.0) - 0.5);
    float mull = smoothstep(0.44, 0.5, max(g.x, g.y));
    float lit = hash13(floor(vec3(vUV * 1.0, floor(vW.y * 0.5))));
    return base + vec3(1.0, 0.85, 0.6) * step(0.62, lit) * 0.22 - mull * 0.08;
  }
  return base;
}

void main(){
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vW);
  vec3 alb = detail(vCol.rgb * uTint, N);

  // hemisphere ambient + sky bounce
  float hemi = N.y * 0.5 + 0.5;
  vec3 ambient = mix(uAmbBot, uAmbTop, hemi);
  vec3 col = alb * ambient;

  // wet-surface sheen (rain)
  float rough = clamp(uRough - uWet * 0.55, 0.045, 1.0);

  // sun
  float ndl = max(dot(N, uSunDir), 0.0);
  if (ndl > 0.0){
    float sh = shadowFactor(N);
    vec3 H = normalize(uSunDir + V);
    float a2 = rough * rough; float d = max(dot(N, H), 0.0);
    float denom = (d * d * (a2 - 1.0) + 1.0);
    float spec = (a2 / (3.14159 * denom * denom)) * (1.0 - rough * 0.72);
    vec3 F0 = mix(vec3(0.04), alb, uMetal);
    vec3 fres = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    col += uSunColor * ndl * sh * (alb * (1.0 - uMetal) + fres * spec * 26.0);
  }

  // point lights (interior fixtures, headlights, neon)
  for (int i = 0; i < 8; i++){
    if (i >= uLightCount) break;
    vec3 Lp = uLightPos[i].xyz - vW;
    float dist = length(Lp);
    float rad = uLightPos[i].w;
    if (dist > rad) continue;
    vec3 L = Lp / max(dist, 1e-4);
    float att = pow(clamp(1.0 - dist / rad, 0.0, 1.0), 2.0);
    float l_ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float a2 = rough * rough; float dd = max(dot(N, H), 0.0);
    float den = (dd * dd * (a2 - 1.0) + 1.0);
    float spec = (a2 / (3.14159 * den * den)) * (1.0 - rough * 0.72);
    vec3 lc = uLightCol[i].rgb * uLightCol[i].a * att;
    col += lc * (alb * l_ndl * 0.85 + vec3(spec) * 18.0 * l_ndl);
    col += lc * alb * 0.12;                       // soft fill
  }

  // fake environment reflection for glass / metal
  if (uMetal > 0.05 || uAlpha < 0.985){
    vec3 Rv = reflect(-V, N);
    float t = clamp(Rv.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 env = mix(uSkyHorizon, uSkyTop, smoothstep(0.42, 0.9, t));
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    col += env * fres * mix(0.35, 1.1, uMetal) * (1.0 - uRough * 0.55);
  }

  // emissive
  col += alb * uEmissive * (1.0 + 0.08 * sin(uTime * 2.0 + vW.x));

  // pattern-sight overlay: cyan wire-glow on tagged geometry
  if (uPattern > 0.001){
    float grid = smoothstep(0.86, 1.0, max(abs(fract(vW.x * 2.0) - 0.5), abs(fract(vW.z * 2.0) - 0.5)));
    float edge = pow(1.0 - abs(dot(N, V)), 2.0);
    col = mix(col, vec3(0.20, 0.95, 1.0), uPattern * (0.30 + edge * 0.55 + grid * 0.4));
    col += vec3(0.1, 0.7, 0.9) * uPattern * edge * 0.8;
  }

  // exponential-squared fog
  float dist = length(uCam - vW);
  float f = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));

  float a = uAlpha * vCol.a;
  outColor = vec4(col * uExposure, a);
}`;

const VS_DEPTH = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP; uniform mat4 uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos,1.0); }`;

const FS_DEPTH = `#version 300 es
precision mediump float;
void main(){}`;

const VS_QUAD = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 outColor;
uniform vec3 uRay[9];          // inverse view-projection corners handled via dirs
uniform vec3 uCam;
uniform vec3 uSunDir, uSunColor, uSkyTop, uSkyHorizon, uGround;
uniform float uTime, uCloud, uStars, uFogDensity, uExposure, uFlash;
${GLSL_COMMON}
uniform mat4 uInvVP;
void main(){
  vec4 p = uInvVP * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(p.xyz / p.w - uCam);
  float h = dir.y;
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(-0.02, 0.55, h));
  sky = mix(sky, uGround, smoothstep(0.0, -0.18, h));

  float sd = max(dot(dir, uSunDir), 0.0);
  sky += uSunColor * pow(sd, 900.0) * 26.0;                 // disc
  sky += uSunColor * pow(sd, 14.0) * 0.42;                  // inner glow
  sky += uSunColor * pow(sd, 2.5) * 0.16 * uCloud;          // scattering

  // moon opposite the sun
  float md = max(dot(dir, -uSunDir), 0.0);
  sky += vec3(0.85,0.9,1.0) * pow(md, 2600.0) * 9.0 * (1.0 - uCloud);

  if (h > 0.0){
    // clouds
    vec2 cuv = dir.xz / max(dir.y, 0.06) * 0.42;
    float c = fbm(cuv * 0.9 + vec2(uTime * 0.008, uTime * 0.004));
    float c2 = fbm(cuv * 2.3 - vec2(uTime * 0.02, 0.0));
    float cover = smoothstep(0.62 - uCloud * 0.42, 0.92 - uCloud * 0.28, c * 0.7 + c2 * 0.3);
    float lum = mix(0.22, 1.0, smoothstep(-0.1, 0.5, dir.y));
    vec3 cc = mix(uSkyHorizon * 1.25, vec3(1.0), lum * 0.7);
    cc = mix(cc * 0.42, cc, smoothstep(0.0, 0.5, c2 + 0.35));
    sky = mix(sky, cc * (0.55 + pow(sd, 3.0) * 0.9), cover * uCloud * smoothstep(0.0, 0.14, h));

    // stars
    if (uStars > 0.01){
      vec2 suv = dir.xz / max(dir.y, 0.1) * 22.0;
      float st = hash13(floor(vec3(suv, 1.0)));
      float tw = 0.6 + 0.4 * sin(uTime * 2.2 + st * 40.0);
      sky += vec3(0.9, 0.95, 1.0) * step(0.9965, st) * tw * uStars * smoothstep(0.02, 0.3, h) * (1.0 - uCloud);
    }
  }
  sky += vec3(uFlash);                                       // lightning
  outColor = vec4(sky * uExposure, 1.0);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 outColor;
uniform sampler2D uTex; uniform float uThresh, uKnee;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = max(max(c.r, c.g), c.b);
  float s = clamp((l - uThresh) / max(uKnee, 1e-4), 0.0, 1.0);
  outColor = vec4(c * s * s, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 outColor;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 s = texture(uTex, vUV).rgb * 0.227027;
  s += (texture(uTex, vUV + uDir * 1.3846).rgb + texture(uTex, vUV - uDir * 1.3846).rgb) * 0.316216;
  s += (texture(uTex, vUV + uDir * 3.2308).rgb + texture(uTex, vUV - uDir * 3.2308).rgb) * 0.070270;
  outColor = vec4(s, 1.0);
}`;

const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 outColor;
uniform sampler2D uScene, uBloom;
uniform float uTime, uBloomAmt, uVignette, uGrain, uChroma, uSat, uContrast, uScan, uFlash, uFade;
uniform vec3  uTint; uniform vec2 uRes; uniform float uDesat;
${GLSL_COMMON}
vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
void main(){
  vec2 uv = vUV;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  // lens chromatic aberration grows toward frame edges
  vec2 off = d * uChroma * (0.35 + r2 * 2.4);
  vec3 c;
  c.r = texture(uScene, uv + off).r;
  c.g = texture(uScene, uv).g;
  c.b = texture(uScene, uv - off).b;

  c += texture(uBloom, uv).rgb * uBloomAmt;

  c = aces(c * 1.05);
  c = pow(c, vec3(1.0 / 2.2));

  // grade
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = mix(c, c * uTint, 0.55);
  c = (c - 0.5) * uContrast + 0.5;

  // pattern-sight desaturation + scanlines
  if (uDesat > 0.001){
    float l2 = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(l2) * vec3(0.55, 1.05, 1.25), uDesat * 0.72);
    float sc = sin((uv.y * uRes.y) * 1.4 + uTime * 6.0) * 0.5 + 0.5;
    c += vec3(0.0, 0.12, 0.16) * sc * uScan;
    float sweep = exp(-pow((uv.y - fract(uTime * 0.18)) * 9.0, 2.0));
    c += vec3(0.05, 0.28, 0.34) * sweep * uScan * 0.55;
  }

  // vignette
  c *= 1.0 - uVignette * smoothstep(0.16, 0.86, r2 * 1.55);

  // film grain
  if (uGrain > 0.001){
    float g = hash13(vec3(gl_FragCoord.xy, floor(uTime * 24.0)));
    c += (g - 0.5) * uGrain;
  }

  c += uFlash;
  c *= uFade;
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const VS_PART = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aVel;
layout(location=2) in vec4 aCol;
uniform mat4 uVP; uniform vec3 uCam; uniform float uLen;
out vec4 vCol; out float vFog;
uniform vec3 uFogColor; uniform float uFogDensity;
void main(){
  vec4 cp = uVP * vec4(aPos, 1.0);
  vFog = 1.0 - exp(-pow(length(uCam - aPos) * uFogDensity, 2.0));
  gl_Position = cp;
  vCol = aCol;
}`;

const FS_PART = `#version 300 es
precision highp float;
in vec4 vCol; in float vFog; out vec4 outColor;
uniform vec3 uFogColor;
void main(){ outColor = vec4(mix(vCol.rgb, uFogColor, clamp(vFog,0.0,1.0)) * vCol.a, vCol.a); }`;

/* ------------------------------------------------------------ geometry */
/** Interleaved vertex: pos(3) nrm(3) uv(2) col(4) = 12 floats */
const VSTRIDE = 12;

function boxTemplate() {
  // 6 faces × 4 verts, CCW outward
  const f = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];
  const verts = [], idx = [];
  f.forEach((face, fi) => {
    const base = fi * 4;
    face.v.forEach((p, i) => {
      const u = i === 1 || i === 2 ? 1 : 0, vv = i >= 2 ? 1 : 0;
      verts.push(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, face.n[0], face.n[1], face.n[2], u, vv, 1, 1, 1, 1);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { verts: new Float32Array(verts), idx: new Uint16Array(idx) };
}

/** Unit cylinder along Y (radius .5, height 1). */
function cylinderTemplate(segs = 12) {
  const verts = [], idx = [];
  const ring = (y, ny) => {
    const base = verts.length / VSTRIDE;
    for (let i = 0; i < segs; i++) {
      const a = i / segs * TAU, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
      verts.push(cx, y, cz, cx * 2 * 0.9, ny, cz * 2 * 0.9, i / segs, y + 0.5, 1, 1, 1, 1);
    }
    return base;
  };
  const b0 = ring(-0.5, 0), b1 = ring(0.5, 0);
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    idx.push(b0 + i, b0 + j, b1 + j, b0 + i, b1 + j, b1 + i);
  }
  // caps
  for (const [y, dir] of [[0.5, 1], [-0.5, -1]]) {
    const c = verts.length / VSTRIDE;
    verts.push(0, y, 0, 0, dir, 0, 0.5, 0.5, 1, 1, 1, 1);
    const r = verts.length / VSTRIDE;
    for (let i = 0; i < segs; i++) {
      const a = i / segs * TAU;
      verts.push(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5, 0, dir, 0, Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5, 1, 1, 1, 1);
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      if (dir > 0) idx.push(c, r + i, r + j); else idx.push(c, r + j, r + i);
    }
  }
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) };
}

/** UV sphere (radius .5). */
function sphereTemplate(rings = 10, segs = 14) {
  const verts = [], idx = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings, phi = v * PI;
    for (let x = 0; x <= segs; x++) {
      const u = x / segs, th = u * TAU;
      const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
      verts.push(nx * 0.5, ny * 0.5, nz * 0.5, nx, ny, nz, u, v, 1, 1, 1, 1);
    }
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < segs; x++) {
    const a = y * (segs + 1) + x, b = a + segs + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) };
}

function makeMesh(geo, u32) {
  const gl = R.gl;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, geo.verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VSTRIDE * 4, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VSTRIDE * 4, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, VSTRIDE * 4, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, VSTRIDE * 4, 32);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: geo.idx.length, type: u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
}

/* --------------------------------------------------- mesh batch builder */
/** Accumulates transformed boxes into one big buffer. */
class Batch {
  constructor(maxBoxes, u32 = true, tmpl) {
    this.tmpl = tmpl || boxTemplate();
    this.vPer = this.tmpl.verts.length / VSTRIDE;
    this.iPer = this.tmpl.idx.length;
    this.max = maxBoxes;
    this.verts = new Float32Array(maxBoxes * this.vPer * VSTRIDE);
    this.idx = u32 ? new Uint32Array(maxBoxes * this.iPer) : new Uint16Array(maxBoxes * this.iPer);
    this.n = 0;
  }
  reset() { this.n = 0; }
  /** Push one transformed primitive instance. m = mat4 (Float32Array). */
  push(m, r, g, b, a, uvScale = 1) {
    if (this.n >= this.max) return;
    const t = this.tmpl.verts, vi = this.n * this.vPer * VSTRIDE;
    const v = this.verts, NV = this.vPer;
    for (let i = 0; i < NV; i++) {
      const s = i * VSTRIDE, d = vi + s;
      const px = t[s], py = t[s + 1], pz = t[s + 2];
      v[d] = m[0] * px + m[4] * py + m[8] * pz + m[12];
      v[d + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13];
      v[d + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
      const nx = t[s + 3], ny = t[s + 4], nz = t[s + 5];
      v[d + 3] = m[0] * nx + m[4] * ny + m[8] * nz;
      v[d + 4] = m[1] * nx + m[5] * ny + m[9] * nz;
      v[d + 5] = m[2] * nx + m[6] * ny + m[10] * nz;
      v[d + 6] = t[s + 6] * uvScale;
      v[d + 7] = t[s + 7] * uvScale;
      v[d + 8] = r; v[d + 9] = g; v[d + 10] = b; v[d + 11] = a;
    }
    const ti = this.tmpl.idx, ii = this.n * this.iPer, base = this.n * this.vPer;
    for (let i = 0; i < this.iPer; i++) this.idx[ii + i] = ti[i] + base;
    this.n++;
  }
  /** Convenience: push an AABB defined by centre + half extents. */
  pushAABB(cx, cy, cz, hx, hy, hz, col, yaw = 0, uvScale = 1) {
    M4.compose(R.tmpM, cx, cy, cz, yaw, 0, 0, hx * 2, hy * 2, hz * 2);
    this.push(R.tmpM, col[0], col[1], col[2], col[3] === undefined ? 1 : col[3], uvScale);
  }
  upload(mesh) {
    const gl = R.gl;
    if (!this.n) { mesh.count = 0; return; }
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, this.n * this.vPer * VSTRIDE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.idx, 0, this.n * this.iPer);
    gl.bindVertexArray(null);
    mesh.count = this.n * this.iPer;
    mesh.type = (this.idx instanceof Uint32Array) ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }
}

function makeDynamicMesh(maxPrims, vPer, iPer, u32) {
  const gl = R.gl;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, maxPrims * vPer * VSTRIDE * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VSTRIDE * 4, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VSTRIDE * 4, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, VSTRIDE * 4, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, VSTRIDE * 4, 32);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, maxPrims * iPer * (u32 ? 4 : 2), gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, vb, ib, count: 0, type: u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, max: maxPrims };
}

/* --------------------------------------------------------- framebuffers */
function makeTarget(w, h, hdr, depth, msaa) {
  const gl = R.gl;
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const t = { fbo, w, h, tex: null, rbo: null, depth: null, msaa: !!msaa };
  const fmt = hdr && R.hdrOK ? gl.RGBA16F : gl.RGBA8;
  const type = hdr && R.hdrOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  if (msaa) {
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, fmt, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    const db = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, db);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db);
    t.rbo = rb; t.depth = db;
  } else {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t.tex = tex;
    if (depth) {
      const db = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, db);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db);
      t.depth = db;
    }
  }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (st !== gl.FRAMEBUFFER_COMPLETE) return null;
  return t;
}

function disposeTarget(t) {
  if (!t) return;
  const gl = R.gl;
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.rbo) gl.deleteRenderbuffer(t.rbo);
  if (t.depth) gl.deleteRenderbuffer(t.depth);
  gl.deleteFramebuffer(t.fbo);
}

/* ------------------------------------------------------------- init GL */
function initRenderer(canvas, quality) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: true, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser. DOUBLE GAME requires WebGL2.');
  R.gl = gl;
  R.canvas = canvas;
  R.hdrOK = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  R.maxAniso = 0;
  R.dprMax = quality >= 2 ? 2 : (quality === 1 ? 1.5 : 1);

  R.progMain = program(VS_MAIN, FS_MAIN, 'main');
  R.progDepth = program(VS_DEPTH, FS_DEPTH, 'depth');
  R.progSky = program(VS_QUAD, FS_SKY, 'sky');
  R.progBright = program(VS_QUAD, FS_BRIGHT, 'bright');
  R.progBlur = program(VS_QUAD, FS_BLUR, 'blur');
  R.progComp = program(VS_QUAD, FS_COMP, 'comp');
  R.progPart = program(VS_PART, FS_PART, 'part');

  // fullscreen triangle
  R.quadVAO = gl.createVertexArray();
  gl.bindVertexArray(R.quadVAO);
  const qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  R.meshBox = makeMesh(boxTemplate(), false);
  R.meshCyl = makeMesh(cylinderTemplate(14), true);
  R.meshSphere = makeMesh(sphereTemplate(10, 14), true);

  // shadow map
  R.shadowSize = quality >= 1 ? 2048 : 1024;
  R.shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, R.shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, R.shadowSize, R.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  R.shadowFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadowFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, R.shadowTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // dynamic batches — one per primitive shape / blend mode
  const boxT = boxTemplate(), cylT = cylinderTemplate(12);
  R.dynBatches = [];
  const addBatch = (name, max, tmpl, u32, mat) => {
    const b = new Batch(max, u32, tmpl);
    const m = makeDynamicMesh(max, b.vPer, b.iPer, u32);
    R.dynBatches.push({ name, batch: b, mesh: m, mat });
    return b;
  };
  R.dyn = addBatch('opaque', 3000, boxT, false, W.mats.metal);
  R.dynCyl = addBatch('cyl', 90, cylT, true, W.mats.rubber);
  R.dyn2 = addBatch('glass', 200, boxT, false, W.mats.glass);
  R.dynMesh = R.dynBatches[0].mesh;
  R.dyn2Mesh = R.dynBatches[2].mesh;

  R.tmpM = M4.create();
  R.tmpM2 = M4.create();
  R.mVP = M4.create();
  R.mProj = M4.create();
  R.mView = M4.create();
  R.mInvVP = M4.create();
  R.mLightVP = M4.create();
  R.mLightProj = M4.create();
  R.mLightView = M4.create();
  R.nm3 = new Float32Array(9);
  R.mTmp = M4.create();
  R.mTmp2 = M4.create();

  R.lights = [];
  R.scene = [];           // opaque draw list
  R.trans = [];           // transparent draw list
  R.quality = quality;
  R.frame = 0;
  return R;
}

/* ------------------------------------------------------ resize targets */
function resizeRenderer(w, h, dpr) {
  const gl = R.gl;
  R.vw = Math.max(2, Math.floor(w));
  R.vh = Math.max(2, Math.floor(h));
  R.dpr = Math.min(dpr || 1, R.dprMax);
  R.pw = Math.max(2, Math.floor(R.vw * R.dpr));
  R.ph = Math.max(2, Math.floor(R.vh * R.dpr));
  R.canvas.width = R.pw; R.canvas.height = R.ph;

  disposeTarget(R.tScene); disposeTarget(R.tResolve);
  disposeTarget(R.tBloomA); disposeTarget(R.tBloomB);

  const msaa = R.quality >= 1 ? 4 : 0;
  R.tScene = makeTarget(R.pw, R.ph, true, msaa ? false : true, msaa);
  if (!R.tScene) {                                   // HDR/MSAA unsupported → fall back
    R.tScene = makeTarget(R.pw, R.ph, false, true, 0);
    R.hdrOK = false;
  }
  if (msaa && R.tScene.msaa) R.tResolve = makeTarget(R.pw, R.ph, true, false, 0);
  if (!R.tResolve) R.tSceneMSAA = false;

  const bw = Math.max(2, R.pw >> 2), bh = Math.max(2, R.ph >> 2);
  R.tBloomA = makeTarget(bw, bh, true, false, 0) || makeTarget(bw, bh, false, false, 0);
  R.tBloomB = makeTarget(bw, bh, true, false, 0) || makeTarget(bw, bh, false, false, 0);
  R.bloomW = bw; R.bloomH = bh;
  gl.viewport(0, 0, R.pw, R.ph);
}

/* ------------------------------------------------------------- drawing */
function setMatUniforms(P, mat, tint, alpha) {
  const gl = R.gl, U = P.U;
  gl.uniform1f(U.uRough, mat.rough);
  gl.uniform1f(U.uMetal, mat.metal);
  gl.uniform1f(U.uEmissive, mat.emissive || 0);
  gl.uniform1f(U.uDetail, mat.detail || 0);
  gl.uniform1f(U.uAlpha, alpha === undefined ? 1 : alpha);
  gl.uniform1f(U.uPattern, mat.pattern || 0);
  gl.uniform3f(U.uTint, tint[0], tint[1], tint[2]);
}

function bindSceneCommon(P) {
  const gl = R.gl, U = P.U, st = R.state;
  gl.uniform3f(U.uCam, st.camPos[0], st.camPos[1], st.camPos[2]);
  gl.uniform3f(U.uSunDir, st.sunDir[0], st.sunDir[1], st.sunDir[2]);
  gl.uniform3f(U.uSunColor, st.sunColor[0], st.sunColor[1], st.sunColor[2]);
  gl.uniform3f(U.uAmbTop, st.ambTop[0], st.ambTop[1], st.ambTop[2]);
  gl.uniform3f(U.uAmbBot, st.ambBot[0], st.ambBot[1], st.ambBot[2]);
  gl.uniform3f(U.uFogColor, st.fogColor[0], st.fogColor[1], st.fogColor[2]);
  gl.uniform1f(U.uFogDensity, st.fogDensity);
  gl.uniform1f(U.uTime, st.time);
  gl.uniform1f(U.uWet, st.wet);
  gl.uniform1f(U.uExposure, st.exposure);
  gl.uniform3f(U.uSkyTop, st.skyTop[0], st.skyTop[1], st.skyTop[2]);
  gl.uniform3f(U.uSkyHorizon, st.skyHorizon[0], st.skyHorizon[1], st.skyHorizon[2]);
  const n = Math.min(8, st.lights.length);
  gl.uniform1i(U.uLightCount, n);
  for (let i = 0; i < 8; i++) {
    const L = st.lights[i];
    if (L) {
      gl.uniform4f(U.uLightPos[i], L.x, L.y, L.z, L.radius);
      gl.uniform4f(U.uLightCol[i], L.r, L.g, L.b, L.intensity);
    } else {
      gl.uniform4f(U.uLightPos[i], 0, -9999, 0, 1);
      gl.uniform4f(U.uLightCol[i], 0, 0, 0, 0);
    }
  }
}

function drawMeshList(P, list, doShadow) {
  const gl = R.gl;
  let lastMesh = null, lastMat = null;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (d.mesh !== lastMesh) { gl.bindVertexArray(d.mesh.vao); lastMesh = d.mesh; }
    gl.uniformMatrix4fv(P.U.uModel, false, d.model);
    if (doShadow) { gl.drawElements(gl.TRIANGLES, d.mesh.count, d.mesh.type, 0); continue; }
    M4.normalMat3(R.nm3, d.model);
    gl.uniformMatrix3fv(P.U.uNM, false, R.nm3);
    if (d.mat !== lastMat) { setMatUniforms(P, d.mat, d.tint, d.alpha); lastMat = d.mat; }
    gl.drawElements(gl.TRIANGLES, d.mesh.count, d.mesh.type, 0);
  }
}

/* --------------------------------------------------- main frame render */
function renderFrame(cam, opts) {
  const gl = R.gl, st = R.state;
  R.frame++;
  const P = R.progMain;

  st.camPos = cam.pos;
  M4.copy(R.mProj, cam.proj); M4.copy(R.mView, cam.view);
  M4.mul(R.mVP, R.mProj, R.mView);
  M4.invert(R.mInvVP, R.mVP);

  /* ---------- shadow pass ---------- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadowFBO);
  gl.viewport(0, 0, R.shadowSize, R.shadowSize);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);       // front-face culling reduces acne
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(2.2, 4.0);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(R.progDepth.p);
  gl.uniformMatrix4fv(R.progDepth.U.uLightVP, false, R.mLightVP);
  drawMeshList(R.progDepth, R.opaque, true);
  const IDENT = R.mIdentity || (R.mIdentity = M4.create());
  for (const db of R.dynBatches) {
    if (db.name === 'glass' || !db.mesh.count) continue;
    gl.bindVertexArray(db.mesh.vao);
    gl.uniformMatrix4fv(R.progDepth.U.uModel, false, IDENT);
    gl.drawElements(gl.TRIANGLES, db.mesh.count, db.mesh.type, 0);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.cullFace(gl.BACK);

  /* ---------- scene pass ---------- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.tScene.fbo);
  gl.viewport(0, 0, R.pw, R.ph);
  gl.clearColor(st.fogColor[0], st.fogColor[1], st.fogColor[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

  // sky
  gl.depthMask(false); gl.disable(gl.CULL_FACE);
  gl.useProgram(R.progSky.p);
  const U = R.progSky.U;
  gl.uniformMatrix4fv(U.uInvVP, false, R.mInvVP);
  gl.uniform3f(U.uCam, st.camPos[0], st.camPos[1], st.camPos[2]);
  gl.uniform3f(U.uSunDir, st.sunDir[0], st.sunDir[1], st.sunDir[2]);
  gl.uniform3f(U.uSunColor, st.sunColor[0], st.sunColor[1], st.sunColor[2]);
  gl.uniform3f(U.uSkyTop, st.skyTop[0], st.skyTop[1], st.skyTop[2]);
  gl.uniform3f(U.uSkyHorizon, st.skyHorizon[0], st.skyHorizon[1], st.skyHorizon[2]);
  gl.uniform3f(U.uGround, st.groundColor[0], st.groundColor[1], st.groundColor[2]);
  gl.uniform1f(U.uTime, st.time); gl.uniform1f(U.uCloud, st.cloud);
  gl.uniform1f(U.uStars, st.stars); gl.uniform1f(U.uFogDensity, st.fogDensity);
  gl.uniform1f(U.uExposure, st.exposure); gl.uniform1f(U.uFlash, st.flash);
  gl.bindVertexArray(R.quadVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.depthMask(true); gl.enable(gl.CULL_FACE);

  // opaque
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.U.uVP, false, R.mVP);
  gl.uniformMatrix4fv(P.U.uLightVP, false, R.mLightVP);
  gl.uniform2f(P.U.uShadowTexel, 1 / R.shadowSize, 1 / R.shadowSize);
  bindSceneCommon(P);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, R.shadowTex);
  gl.uniform1i(P.U.uShadow, 0);
  drawMeshList(P, R.opaque, false);

  // dynamic geometry (actors, vehicles, props) — pre-baked world-space vertices
  const IDENT3 = R.mIdentity3 || (R.mIdentity3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  gl.uniformMatrix4fv(P.U.uModel, false, R.mIdentity);
  gl.uniformMatrix3fv(P.U.uNM, false, IDENT3);
  for (const db of R.dynBatches) {
    if (db.name === 'glass' || !db.mesh.count) continue;
    gl.bindVertexArray(db.mesh.vao);
    setMatUniforms(P, db.mat, [1, 1, 1], 1);
    gl.drawElements(gl.TRIANGLES, db.mesh.count, db.mesh.type, 0);
  }

  // rain / spray lines
  if (opts.particles && opts.particles.count) drawParticles(cam);

  // transparent
  if (R.trans.length || R.dyn2Mesh.count) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    R.trans.sort((a, b) => b.dist - a.dist);
    drawMeshList(P, R.trans, false);
    if (R.dyn2Mesh.count) {
      gl.bindVertexArray(R.dyn2Mesh.vao);
      gl.uniformMatrix4fv(P.U.uModel, false, R.mIdentity);
      gl.uniformMatrix3fv(P.U.uNM, false, R.mIdentity3);
      setMatUniforms(P, R.dyn2MeshMat || (R.dyn2MeshMat = W.mats.glass), [1, 1, 1], 1);
      gl.drawElements(gl.TRIANGLES, R.dyn2Mesh.count, R.dyn2Mesh.type, 0);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /* ---------- resolve MSAA ---------- */
  let src = R.tScene;
  if (R.tScene.msaa && R.tResolve) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.tScene.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.tResolve.fbo);
    gl.blitFramebuffer(0, 0, R.pw, R.ph, 0, 0, R.pw, R.ph, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    src = R.tResolve;
  }

  /* ---------- bloom ---------- */
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(R.quadVAO);
  const bA = R.tBloomA, bB = R.tBloomB;
  gl.bindFramebuffer(gl.FRAMEBUFFER, bA.fbo);
  gl.viewport(0, 0, R.bloomW, R.bloomH);
  gl.useProgram(R.progBright.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
  gl.uniform1i(R.progBright.U.uTex, 0);
  gl.uniform1f(R.progBright.U.uThresh, opts.bloomThresh === undefined ? 0.82 : opts.bloomThresh);
  gl.uniform1f(R.progBright.U.uKnee, 0.55);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.useProgram(R.progBlur.p);
  gl.uniform1i(R.progBlur.U.uTex, 0);
  for (let i = 0; i < 2; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, bB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bA.tex);
    gl.uniform2f(R.progBlur.U.uDir, (1 + i) / R.bloomW, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bA.fbo);
    gl.bindTexture(gl.TEXTURE_2D, bB.tex);
    gl.uniform2f(R.progBlur.U.uDir, 0, (1 + i) / R.bloomH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- composite ---------- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, R.pw, R.ph);
  gl.useProgram(R.progComp.p);
  const C = R.progComp.U;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(C.uScene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bA.tex); gl.uniform1i(C.uBloom, 1);
  gl.uniform1f(C.uTime, st.time);
  gl.uniform1f(C.uBloomAmt, opts.bloom);
  gl.uniform1f(C.uVignette, opts.vignette);
  gl.uniform1f(C.uGrain, opts.grain);
  gl.uniform1f(C.uChroma, opts.chroma);
  gl.uniform1f(C.uSat, opts.sat);
  gl.uniform1f(C.uContrast, opts.contrast);
  gl.uniform1f(C.uScan, opts.scan);
  gl.uniform1f(C.uDesat, opts.desat);
  gl.uniform1f(C.uFlash, st.flash * 0.6);
  gl.uniform1f(C.uFade, opts.fade === undefined ? 1 : opts.fade);
  gl.uniform3f(C.uTint, st.grade[0], st.grade[1], st.grade[2]);
  gl.uniform2f(C.uRes, R.pw, R.ph);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE0);
  gl.enable(gl.DEPTH_TEST);

  R.opaque.length = 0; R.trans.length = 0;
  for (const db of R.dynBatches) { db.batch.reset(); db.mesh.count = 0; }
}

function drawParticles(cam) {
  const gl = R.gl, P = R.progPart;
  const pt = R.partMesh;
  gl.bindVertexArray(pt.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pt.vb);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, R.partData, 0, R.partCount * 10);
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.U.uVP, false, R.mVP);
  gl.uniform3f(P.U.uCam, cam.pos[0], cam.pos[1], cam.pos[2]);
  gl.uniform3f(P.U.uFogColor, R.state.fogColor[0], R.state.fogColor[1], R.state.fogColor[2]);
  gl.uniform1f(P.U.uFogDensity, R.state.fogDensity);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.LINES, 0, R.partCount * 2);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

function initParticleBuffer(maxDrops) {
  const gl = R.gl;
  R.partData = new Float32Array(maxDrops * 2 * 10);   // 2 verts × (pos3 vel3 col4)
  R.partMax = maxDrops;
  R.partCount = 0;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, R.partData.byteLength, gl.DYNAMIC_DRAW);
  const STR = 40;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STR, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STR, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STR, 24);
  gl.bindVertexArray(null);
  R.partMesh = { vao, vb };
}

/** Push one line segment particle. */
function pushLine(x0, y0, z0, x1, y1, z1, r, g, b, a) {
  if (R.partCount >= R.partMax) return;
  const o = R.partCount * 20, d = R.partData;
  d[o] = x0; d[o + 1] = y0; d[o + 2] = z0; d[o + 3] = 0; d[o + 4] = 0; d[o + 5] = 0;
  d[o + 6] = r; d[o + 7] = g; d[o + 8] = b; d[o + 9] = a;
  d[o + 10] = x1; d[o + 11] = y1; d[o + 12] = z1; d[o + 13] = 0; d[o + 14] = 0; d[o + 15] = 0;
  d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = a;
  R.partCount++;
}

/* ---------------------------------------------------------- submission */
/** Queue an opaque mesh. model is a Float32Array(16). */
function submit(mesh, model, mat, tint, alpha) {
  const list = (alpha !== undefined && alpha < 1) ? R.trans : R.opaque;
  const m = new Float32Array(model);
  const e = { mesh, model: m, mat, tint, alpha: alpha === undefined ? 1 : alpha, dist: 0 };
  if (list === R.trans) {
    const dx = m[12] - R.state.camPos[0], dy = m[13] - R.state.camPos[1], dz = m[14] - R.state.camPos[2];
    e.dist = dx * dx + dy * dy + dz * dz;
  }
  list.push(e);
}

function submitDyn(box, mat) { R.dyn.upload(R.dynMesh); }

/** Set shadow frustum to tightly fit a world-space radius around a focus point. */
function updateShadowFrustum(focus, radius, sunDir) {
  const ext = Math.max(18, radius);
  const dist = ext * 2.6;
  const lx = focus[0] + sunDir[0] * dist, ly = focus[1] + sunDir[1] * dist, lz = focus[2] + sunDir[2] * dist;
  M4.lookAt(R.mLightView, [lx, ly, lz], focus, [0, 1, 0]);
  // snap to texel grid to kill shimmering
  const texel = (ext * 2) / R.shadowSize;
  const p = [0, 0, 0];
  M4.xformPoint(p, R.mLightView, focus);
  p[0] = Math.round(p[0] / texel) * texel;
  p[1] = Math.round(p[1] / texel) * texel;
  const snapped = [0, 0, 0];
  M4.invert(R.mTmp, R.mLightView);
  M4.xformPoint(snapped, R.mTmp, p);
  M4.lookAt(R.mLightView,
    [snapped[0] + sunDir[0] * dist, snapped[1] + sunDir[1] * dist, snapped[2] + sunDir[2] * dist],
    snapped, [0, 1, 0]);
  M4.ortho(R.mLightProj, -ext, ext, -ext, ext, 0.5, dist * 2.4);
  M4.mul(R.mLightVP, R.mLightProj, R.mLightView);
}
