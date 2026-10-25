// GLSL for D.I.K.S.H.A's 3D presence. Colours go above 1.0 on purpose: the bloom pass
// turns anything that bright into glow.

// 3D simplex noise by Ian McEwan and Ashima Arts (MIT licence), plus an HSL helper
const common = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// hue, saturation and lightness all 0 to 1
vec3 hsl(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}
`

// 4D simplex noise, from the same Ashima Arts library (MIT licence). The orb samples it at
// (surface point, flow), so the plasma changes in place instead of sliding across the surface.
const noise4 = /* glsl */ `
float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float permute(float x) { return mod289(((x * 34.0) + 1.0) * x); }
float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

vec4 grad4(float j, vec4 ip) {
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p, s;
  p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
  return p;
}

float snoise(vec4 v) {
  const vec4 C = vec4(0.138196601125011, 0.276393202250021, 0.414589803375032, -0.447213595499958);
  vec4 i = floor(v + dot(v, vec4(0.309016994374947451)));
  vec4 x0 = v - i + dot(i, C.xxxx);
  vec4 i0;
  vec3 isX = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);
  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;
  vec4 i3 = clamp(i0, 0.0, 1.0);
  vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);
  vec4 x1 = x0 - i1 + C.xxxx;
  vec4 x2 = x0 - i2 + C.yyyy;
  vec4 x3 = x0 - i3 + C.zzzz;
  vec4 x4 = x0 + C.wwww;
  i = mod289(i);
  float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
  vec4 j1 = permute(permute(permute(permute(
             i.w + vec4(i1.w, i2.w, i3.w, 1.0))
           + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
           + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
           + i.x + vec4(i1.x, i2.x, i3.x, 1.0));
  vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
  vec4 p0 = grad4(j0, ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4, p4));
  vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * (dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2)))
               + dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4))));
}
`

// the orb: a sphere whose surface churns like plasma, harder the louder she is. uFlow is the
// fourth coordinate of the noise; it runs faster while she thinks or talks.
export const orbVertex = /* glsl */ `
${common}
${noise4}
uniform float uFlow;
uniform float uLevel;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
varying float vNoise;

void main() {
  float slow = snoise(vec4(normal * 1.2, uFlow));
  float fast = snoise(vec4(normal * 2.4, uFlow * 2.3 + 10.0)) * 0.2;
  vec3 p = position + normal * (slow + fast) * (0.03 + uLevel * 0.1);
  vNoise = slow;
  vPos = p;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vView = normalize(-view.xyz);
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * view;
}
`

export const orbFragment = /* glsl */ `
${common}
${noise4}
uniform float uFlow;
uniform float uLevel;
uniform float uHue;
uniform float uGlow;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
varying float vNoise;

void main() {
  // bright at the edges, like light caught in a glass ball
  float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 2.2);
  vec3 deep = hsl(uHue + 0.06, 0.9, 0.1);
  vec3 body = hsl(uHue, 0.95, 0.42);
  vec3 edge = hsl(uHue - 0.07, 1.0, 0.72);
  vec3 colour = mix(deep, body, smoothstep(-0.7, 0.9, vNoise));
  // thin veins of light that split, merge and close up in place. the warp bends them so they
  // curl rather than run in straight bands.
  vec3 warp = vec3(snoise(vec4(vPos * 0.9, uFlow * 0.6)), snoise(vec4(vPos * 0.9 + 7.0, uFlow * 0.6)), 0.0) * 0.35;
  float vein = pow(1.0 - abs(snoise(vec4(vPos * 1.7 + warp, uFlow * 0.8))), 18.0);
  colour += edge * vein * (0.45 + uLevel * 1.4);
  colour += edge * rim * (1.3 + uLevel * 2.2);
  gl_FragColor = vec4(colour * uGlow, 1.0);
}
`

// a flat card that always faces the camera; used by the halo and the wake-up shockwave
export const facingVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// soft coloured light behind the orb, so she lights up the space around her
export const haloFragment = /* glsl */ `
${common}
uniform float uHue;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = pow(max(1.0 - d, 0.0), 2.6);
  gl_FragColor = vec4(hsl(uHue, 0.9, 0.55) * glow * uStrength, 1.0);
}
`

// an expanding ring of light. uProgress runs 0 to 1; uSize is the card's half-width in world units.
export const shockFragment = /* glsl */ `
${common}
uniform float uHue;
uniform float uProgress;
uniform float uSize;
varying vec2 vUv;
void main() {
  if (uProgress <= 0.0 || uProgress >= 1.0) discard;
  float eased = 1.0 - pow(1.0 - uProgress, 3.0);
  float radius = mix(0.9, uSize * 0.95, eased);
  float d = length(vUv - 0.5) * 2.0 * uSize;
  float ring = exp(-pow((d - radius) / (0.05 + eased * 0.12), 2.0));
  float fade = pow(1.0 - uProgress, 1.5);
  gl_FragColor = vec4(hsl(uHue - 0.04, 0.9, 0.75) * ring * fade * 2.2, 1.0);
}
`

// an orbit with a comet of light running round it. torus uv.x goes once around the ring.
export const ringVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const ringFragment = /* glsl */ `
${common}
uniform float uPhase;
uniform float uOffset;
uniform float uHue;
uniform float uLevel;
uniform float uGlow;
varying vec2 vUv;
void main() {
  float head = fract(vUv.x - uPhase + uOffset);
  float trail = pow(head, 7.0);
  float strength = 0.1 + trail * (1.8 + uLevel * 2.5);
  gl_FragColor = vec4(hsl(uHue, 0.85, 0.66) * strength * uGlow, 1.0);
}
`

// dust: round, softly lit specks that drift around her and twinkle
export const dustVertex = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uPixelRatio;
attribute float aSeed;
varying float vTwinkle;
void main() {
  vec3 p = position;
  float angle = uTime * (0.03 + aSeed * 0.07);
  float c = cos(angle);
  float s = sin(angle);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p *= 1.0 + sin(uTime * 1.3 + aSeed * 30.0) * 0.025 + uLevel * 0.12;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.5 + aSeed * 3.5) * uPixelRatio * (9.0 / -view.z);
  vTwinkle = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 60.0));
  gl_Position = projectionMatrix * view;
}
`

export const dustFragment = /* glsl */ `
${common}
uniform float uHue;
uniform float uGlow;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float speck = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(hsl(uHue + 0.12, 0.7, 0.7) * speck * speck * vTwinkle * 0.9 * uGlow, 1.0);
}
`
