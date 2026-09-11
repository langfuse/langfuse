// All animation uses trace time, so a paused or scrubbed score stays reproducible.
const noise = `
float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.1, .2, .3));
  p *= 17.;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
    mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
    mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  return .56 * noise3(p) + .28 * noise3(p * 2.07) + .14 * noise3(p * 4.13);
}
vec3 spectrum(float t) {
  return .52 + .48 * cos(6.28318 * (t + vec3(.05, .36, .62)));
}
`;

export const towerVertex = `
attribute vec4 aTrace;
varying vec3 vPosition, vWorld, vNormal;
varying vec4 vTrace;
uniform float uTime, uPressure;
void main() {
  vPosition = position;
  vTrace = aTrace;
  vec3 p = position;
  float twist = sin(p.y * 1.1 + uTime * .42 + aTrace.x * 18.) * .035 * uPressure;
  p.xz = mat2(cos(twist), -sin(twist), sin(twist), cos(twist)) * p.xz;
  mat4 world = modelMatrix * instanceMatrix;
  vec4 w = world * vec4(p, 1.);
  vWorld = w.xyz;
  vNormal = normalize(mat3(world) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const towerFragment = `
uniform float uTime, uEnergy, uPulse, uPressure, uVerify, uTension;
uniform sampler2D uAtlas;
varying vec3 vPosition, vWorld, vNormal;
varying vec4 vTrace;
${noise}
void main() {
  vec3 p = vPosition;
  vec3 n = normalize(vNormal);
  vec3 eye = normalize(cameraPosition - vWorld);
  float fresnel = pow(1. - abs(dot(n, eye)), 2.4);
  float flow = fbm(p * 3. + vec3(0., uTime * -.35, vTrace.x * 12.));
  float marbling = sin((p.y * 4. + flow * 5. + uTime * .2) * 5.);
  float engraving = smoothstep(.93, .99, sin(p.y * 110. + flow * 12.));
  vec3 alloy = mix(vec3(.06,.09,.13), vec3(.38,.19,.07), .5 + .5 * marbling);
  vec3 iridescence = spectrum(flow * .8 + fresnel * .45 + vTrace.y);
  alloy = mix(alloy, iridescence * .42, .32 + uVerify * .24);
  vec2 textUv = vec2(fract((p.x + p.z) * .27 + vTrace.x), 
    1. - (mod(floor((p.y + 3.) * 3.) + floor(vTrace.x * 16.), 16.) +
    fract((p.y + 3.) * 3.)) / 16.);
  float letters = texture2D(uAtlas, textUv).r;
  float scan = pow(.5 + .5 * sin(p.y * 3. - uTime * 3. + vTrace.x * 20.), 18.);
  vec3 lightA = normalize(vec3(3., 4., 6.));
  vec3 lightB = normalize(vec3(-4., 1., -2.));
  float diffuse = .2 + .9 * max(dot(n, lightA), 0.) + .5 * max(dot(n, lightB), 0.);
  float spec = pow(max(dot(n, normalize(lightA + eye)), 0.), 38.) * 1.1;
  float rimSpec = pow(max(dot(n, normalize(lightB + eye)), 0.), 22.) * .6;
  vec3 neon = mix(vec3(.07, .92, .85), vec3(.67, .17, 1.), vTrace.y);
  neon = mix(neon, vec3(1., .16, .04), smoothstep(.82, 1., uTension) * .6);
  vec3 color = alloy * diffuse + vec3(1., .76, .46) * spec + neon * rimSpec;
  color += neon * (fresnel * (.3 + uEnergy * .15) + scan * .22);
  color += mix(vec3(1., .52, .13), neon, uVerify) *
    (letters * (.4 + uPressure * 1.3) + engraving * .08) * (.65 + uPulse * .35);
  float fog = exp(-length(cameraPosition - vWorld) * .012);
  gl_FragColor = vec4(color * fog, 1.);
}
`;

export const tunnelVertex = `
varying vec3 vPosition;
void main() {
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

export const tunnelFragment = `
uniform float uTime, uEnergy, uPressure, uVerify, uPulse;
varying vec3 vPosition;
${noise}
void main() {
  vec3 p = normalize(vPosition);
  float angle = atan(p.y, p.x);
  float radius = length(p.xy);
  float depth = 1. / max(.07, radius);
  float spiral = angle * (6. + floor(uVerify * 3.)) + depth * .7 - uTime * .32;
  float cloud = fbm(p * 7. + vec3(0., 0., uTime * .06));
  float ribs = pow(.5 + .5 * sin(spiral), 28.);
  float bands = pow(.5 + .5 * sin(depth * 3. - uTime * 1.8), 32.);
  vec3 ink = mix(vec3(.004,.009,.022), vec3(.025,.013,.055), cloud);
  vec3 cyan = vec3(.015, .32, .36);
  vec3 violet = vec3(.28, .035, .34);
  vec3 col = ink + mix(cyan, violet, cloud) * cloud * .35;
  col += (ribs * .16 + bands * ribs * .6) *
    mix(vec3(.05,.5,.6), vec3(.7,.25,.07), uPressure) * (.5 + uEnergy);
  col += pow(max(0., 1. - radius * 3.), 5.) * vec3(.12,.055,.19);
  gl_FragColor = vec4(col, 1.);
}
`;

export const paperVertex = `
attribute vec4 aTrace;
varying vec2 vUv;
varying float vRow;
uniform float uTime, uPressure;
void main() {
  vUv = uv;
  vRow = floor(aTrace.x * 16.);
  vec3 p = position;
  p.z += sin(p.x * 3. + uTime + aTrace.x * 30.) * .1 * uPressure;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.);
}
`;

export const paperFragment = `
uniform sampler2D uAtlas;
uniform float uPressure, uVerify;
varying vec2 vUv;
varying float vRow;
void main() {
  float letters = texture2D(uAtlas, vec2(vUv.x, 1. - (vRow + 1. - vUv.y) / 16.)).r;
  vec2 edge = min(vUv, 1. - vUv);
  float border = 1. - smoothstep(.006, .014, min(edge.x, edge.y));
  float rules = step(.96, fract(vUv.y * 11.)) * .15;
  vec3 ink = mix(vec3(.15,.67,.63), vec3(.83,.47,.17), uPressure);
  gl_FragColor = vec4(ink * (letters * 1.7 + border * .55 + rules), 
    clamp(letters * .8 + border * .35 + rules + .018, 0., .85));
}
`;

export const particleVertex = `
attribute float aSeed;
varying float vAlpha, vSeed;
uniform float uTime, uPressure, uPixelRatio;
void main() {
  vec3 p = position;
  p.z = -90. + mod(p.z + uTime * (3. + uPressure * 2.), 110.);
  float a = uTime * .025 + p.z * .008;
  p.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xy;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((25. + aSeed * 65.) / max(1., -mv.z), 1., 7.) * uPixelRatio;
  vAlpha = smoothstep(0., 8., -mv.z) * (.25 + aSeed * .6);
  vSeed = aSeed;
}
`;

export const particleFragment = `
varying float vAlpha, vSeed;
void main() {
  float d = length(gl_PointCoord - .5);
  float light = exp(-d * d * 22.);
  gl_FragColor = vec4(mix(vec3(.08,.7,.77), vec3(.9,.48,.2), vSeed), light * vAlpha);
}
`;

export const prismShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uPressure: { value: 0 },
    uPulse: { value: 0 },
    uAspect: { value: 1 },
    uSides: { value: 6 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAmount, uPressure, uPulse, uAspect, uSides;
    varying vec2 vUv;
    vec2 mirrored(vec2 uv) { return 1. - abs(mod(uv, 2.) - 1.); }
    void main() {
      vec2 p = (vUv - .5) * vec2(uAspect, 1.);
      float r = length(p);
      float sector = 6.283185 / uSides;
      float a = atan(p.y, p.x) + uTime * .025;
      a = abs(mod(a + sector * .5, sector) - sector * .5);
      vec2 kaleido = vec2(cos(a), sin(a)) * r;
      float rotation = sin(uTime * .07) * .5;
      kaleido = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation)) * kaleido;
      vec2 folded = kaleido / vec2(uAspect, 1.) + .5;
      vec2 uv = mirrored(folded);
      vec2 chroma = normalize(p + .00001) * (.0003 + uPressure * .0006 + uPulse * .0002);
      vec3 col;
      col.r = texture2D(tDiffuse, mirrored(uv + chroma)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, mirrored(uv - chroma)).b;
      col = mix(texture2D(tDiffuse, vUv).rgb, col, uAmount);
      float vignette = 1. - smoothstep(.25, .95, r) * .65;
      float grain = fract(sin(dot(vUv * 1000. + floor(uTime * 24.), vec2(12.9898,78.233))) * 43758.5453);
      col = col * vignette + (grain - .5) * .006;
      gl_FragColor = vec4(col, 1.);
    }
  `,
};
