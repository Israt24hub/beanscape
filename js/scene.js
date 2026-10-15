/* Beanscape — the signature bean-to-cup sequence.
 *
 * Six scenes, one continuous camera move, no cuts:
 *   1 bean      a roasted bean turns and shivers in the dark, waiting for a tap
 *   2 burst     it cracks open; shards, embers and vapour spread outward
 *   3 vortex    the camera is already far back: a small cup, ALREADY HOLDING
 *               COFFEE, sits at the centre of a vast swirling vortex
 *   4 approach  the camera closes in; the cup grows; the vortex spirals inward
 *   5 merge     the swirl folds into the coffee already in the cup
 *   6 aroma     the camera settles; steam rises; the headline arrives
 *
 * The cup is built and made visible at the start of scene 3 and is never
 * created, swapped or faded in later — it only ever gets closer.
 */

import * as THREE from '../vendor/three.module.min.js';
import {
  EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass
} from '../vendor/three.module.min.js';

const PHASES = ['idle', 'burst', 'vortex', 'approach', 'merge', 'aroma'];

/* ---------------- procedural textures ---------------- */

function glowSprite() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.00, 'rgba(255,245,225,1)');
  grad.addColorStop(0.25, 'rgba(255,196,110,0.75)');
  grad.addColorStop(0.60, 'rgba(190,104,30,0.22)');
  grad.addColorStop(1.00, 'rgba(120,60,15,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function steamSprite() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.00, 'rgba(255,250,243,0.42)');
  grad.addColorStop(0.40, 'rgba(242,230,214,0.16)');
  grad.addColorStop(1.00, 'rgba(226,212,194,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Value-noise fbm on a canvas, tileable enough for a wrapped material. */
function fbmCanvas(size, octaves, scale, warp = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);

  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y) => {
    const u = (h & 1) ? x : y;
    const v = (h & 2) ? x : y;
    return ((h & 4) ? -u : u) + ((h & 8) ? -v : v);
  };
  const noise = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = (x / size) * scale, py = (y / size) * scale;
      if (warp) {
        px += noise(px * 0.5, py * 0.5) * warp;
        py += noise(px * 0.5 + 31.4, py * 0.5 - 17.2) * warp;
      }
      let v = 0, amp = 0.5, freq = 1;
      for (let o = 0; o < octaves; o++) {
        v += amp * noise(px * freq, py * freq);
        freq *= 2.07;
        amp *= 0.5;
      }
      const n = Math.max(0, Math.min(255, 128 + v * 190));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Sobel a height canvas into a tangent-space normal map. */
function normalFromHeight(heightCanvas, strength = 2.4) {
  const size = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, size, size).data;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const g = out.getContext('2d');
  const img = g.createImageData(size, size);
  const at = (x, y) =>
    src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1)) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      const nx = dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

function canvasTexture(canvas, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grainTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // two octaves of value noise, cheap and good enough for a bump map
    const x = i % size;
    const y = (i / size) | 0;
    const n =
      Math.sin(x * 0.19) * Math.cos(y * 0.23) * 0.5 +
      Math.sin(x * 0.71 + y * 0.37) * 0.3 +
      (Math.random() - 0.5) * 0.55;
    const v = Math.max(0, Math.min(255, 128 + n * 70));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Warm studio environment so the ceramic and crema have something to reflect. */
function buildEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#32200f');
  grad.addColorStop(0.38, '#160d07');
  grad.addColorStop(1.00, '#040202');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);

  // a broad softbox: the large, soft highlight that reads as studio lighting
  const box = g.createLinearGradient(60, 20, 260, 120);
  box.addColorStop(0.0, 'rgba(255,236,206,0.9)');
  box.addColorStop(1.0, 'rgba(255,236,206,0)');
  g.fillStyle = box;
  g.beginPath();
  g.ellipse(170, 62, 120, 46, 0, 0, Math.PI * 2);
  g.fill();

  // a cool bounce opposite it, so shadows are not uniformly orange
  const cool = g.createRadialGradient(430, 190, 0, 430, 190, 150);
  cool.addColorStop(0, 'rgba(120,150,180,0.30)');
  cool.addColorStop(1, 'rgba(120,150,180,0)');
  g.fillStyle = cool;
  g.fillRect(0, 0, 512, 256);
  // a soft warm key and a cooler bounce, so highlights have direction
  const key = g.createRadialGradient(150, 70, 0, 150, 70, 150);
  key.addColorStop(0, 'rgba(255,214,150,0.95)');
  key.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = key;
  g.fillRect(0, 0, 512, 256);
  const bounce = g.createRadialGradient(390, 150, 0, 390, 150, 130);
  bounce.addColorStop(0, 'rgba(200,116,31,0.5)');
  bounce.addColorStop(1, 'rgba(200,116,31,0)');
  g.fillStyle = bounce;
  g.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/* ---------------- geometry ---------------- */

/** An ellipsoid with a crease pressed into both flat faces. */
function beanGeometry() {
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const pos = geo.attributes.position;
  // real proportions: roughly 10 long x 7 wide x 5 thick
  const a = 0.70, b = 1.0, c = 0.50;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let x = v.x * a, y = v.y * b, z = v.z * c;

    const t = y / b;                      // -1 at one tip, +1 at the other
    // the crease must vanish at the tips, or the poles pinch into a notch
    const along = Math.max(0, 1 - t * t) ** 0.8;
    const across = Math.exp(-(x * x) / 0.020);
    const groove = across * along * 0.40;
    z -= Math.sign(z || 1) * groove;

    // beans are plumper at the middle and taper to blunt ends
    const taper = 1 - 0.16 * t * t;
    x *= taper;
    z *= taper;

    // one face is slightly flatter than the other, as a real bean is
    if (z > 0) z *= 0.92;

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function cupGroup(env) {
  const group = new THREE.Group();

  // glazed porcelain: a hard clearcoat over a near-white body, with a very
  // faint ripple in the glaze so highlights are not mirror-perfect
  const glazeHeight = fbmCanvas(256, 3, 3.5);
  const glazeNormal = canvasTexture(normalFromHeight(glazeHeight, 0.45), 1);

  const ceramic = new THREE.MeshPhysicalMaterial({
    transparent: true,
    opacity: 0,
    color: 0x4a3a30,
    roughness: 0.30,
    metalness: 0.0,
    normalMap: glazeNormal,
    normalScale: new THREE.Vector2(0.22, 0.22),
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    envMap: env,
    envMapIntensity: 0.62,
    side: THREE.DoubleSide
  });

  const profile = [
    [0.000, 0.000], [0.250, 0.000], [0.278, 0.014], [0.296, 0.072],
    [0.328, 0.270], [0.348, 0.452], [0.352, 0.500],
    [0.336, 0.500],
    [0.318, 0.290], [0.288, 0.095], [0.258, 0.042], [0.000, 0.042]
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), ceramic);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.108, 0.026, 18, 72, Math.PI * 1.32),
    ceramic
  );
  handle.position.set(0.345, 0.30, 0);
  handle.rotation.z = -Math.PI * 0.18;
  handle.castShadow = true;
  group.add(handle);

  const saucerMat = ceramic.clone();
  saucerMat.color = new THREE.Color(0x3a2d26);
  saucerMat.roughness = 0.52;
  saucerMat.clearcoat = 0.4;
  saucerMat.envMapIntensity = 0.3;

  const saucer = new THREE.Mesh(
    new THREE.LatheGeometry([
      [0.000, -0.030], [0.470, -0.030], [0.506, -0.016],
      [0.512, 0.006], [0.470, 0.000], [0.000, 0.000]
    ].map(([x, y]) => new THREE.Vector2(x, y)), 96),
    saucerMat
  );
  saucer.receiveShadow = true;
  group.add(saucer);

  group.userData.ceramic = ceramic;
  group.userData.saucer = saucerMat;
  return group;
}

/** The vortex as a real funnel: a surface of revolution whose radius flares
 *  from just outside the cup rim up to a wide mouth. The camera descends
 *  inside it, which is what makes the shot read as a tunnel rather than a
 *  floor — a flat disc seen from above always looks like ground. */
function funnelGeometry(throat = 0.58, mouth = 26, height = 9, rings = 150) {
  const profile = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    // a hyperbolic flare: tight at the throat, opening fast near the mouth
    const r = throat + (mouth - throat) * Math.pow(t, 2.7);
    profile.push(new THREE.Vector2(r, t * height));
  }
  const geo = new THREE.LatheGeometry(profile, 180);
  geo.computeVertexNormals();
  return geo;
}

/** A tapering stream of liquid falling into the cup. */
function pourGeometry(topR = 0.030, bottomR = 0.017, height = 1.0, segs = 64) {
  const geo = new THREE.CylinderGeometry(topR, bottomR, height, 28, segs, true);
  geo.translate(0, height / 2, 0);   // origin at the bottom, so it grows downward
  return geo;
}

/* ---------------- shaders ---------------- */

const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865,0.366025404,-0.577350269,0.024390244);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;
  vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x=a0.x*x0.x+h.x*x0.y;
  g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p){
  float s=0.0, amp=0.5;
  for(int i=0;i<3;i++){ s+=amp*snoise(p); p*=2.03; amp*=0.5; }
  return s;
}`;

function vortexMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,          // we are inside the funnel looking at its wall
    uniforms: {
      uTime:   { value: 0 },
      uPull:   { value: 0 },       // 0 calm, 1 drawn tight toward the cup
      uFade:   { value: 0 },
      uCam:    { value: new THREE.Vector3() },
      uHeight: { value: 12 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vH;
      varying float vAngle;
      varying float vRadius;
      void main(){
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vH = position.y;
        vRadius = length(position.xz);
        vAngle = atan(position.z, position.x);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uPull, uFade, uHeight;
      uniform vec3 uCam;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vH, vAngle, vRadius;
      ${SNOISE}

      void main(){
        float t  = clamp(vH / uHeight, 0.0, 1.0);   // 0 at the throat, 1 at the mouth
        float spin = uTime * (0.22 + uPull * 0.38);

        // the swirl winds tighter as it nears the throat, and the whole sheet
        // slides downward: liquid being drawn into the cup
        float twist = (2.6 + uPull * 4.2) / (vRadius * 0.35 + 0.8);
        vec2 q = vec2(vAngle * 2.3 + twist + spin * 2.0, t * 5.5 - spin * 2.6);

        // damp the detail where a pixel spans too much of the noise field,
        // otherwise the grazing wall aliases into coloured banding
        float footprint = fwidth(q.x) + fwidth(q.y);
        float detail = 1.0 - smoothstep(0.35, 1.6, footprint);

        float n  = fbm(q) * detail;
        float n2 = fbm(q * 2.4 + vec2(n * 0.9, -spin)) * detail;

        vec3 black = vec3(0.010, 0.005, 0.003);
        vec3 roast = vec3(0.072, 0.034, 0.017);
        vec3 crema = vec3(0.56, 0.35, 0.15);

        vec3 col = mix(black, roast, smoothstep(-0.6, 0.7, n));
        // crema shows only in the brightest streaks, as it does on real coffee
        col = mix(col, crema, smoothstep(0.72, 1.35, n + n2 * 0.6) * 0.30);

        // glossy liquid: a fresnel sheen along the wall, strongest where the
        // surface turns away. This is most of what sells it as liquid.
        vec3 viewDir = normalize(uCam - vWorld);
        vec3 nrm = faceforward(vNormalW, -viewDir, vNormalW);
        float fres = pow(1.0 - clamp(dot(viewDir, nrm), 0.0, 1.0), 3.2);
        col += crema * fres * 0.16 * (0.35 + n2 * 0.65);

        // a brighter band near the throat, where the liquid accelerates
        col += crema * uPull * 0.13 * (1.0 - smoothstep(0.0, 0.42, t)) * (0.35 + n2 * 0.65);

        float nearThroat = smoothstep(0.0, 0.07, t);          // never cover the cup
        float mouthFade  = 1.0 - smoothstep(0.62, 1.0, t);    // dissolve into darkness
        float dist = length(uCam - vWorld);
        float nearCam = smoothstep(0.55, 3.2, dist);          // no aliased foreground

        float alpha = nearThroat * mouthFade * nearCam * uFade * detail * 0.62
                    * (0.42 + 0.58 * smoothstep(-0.5, 1.0, n));
        if (alpha < 0.004) discard;

        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/** The falling stream. Narrow, dark, with a moving highlight down one side. */
function pourMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 0 }    // 0 none, 1 full stream
    },
    vertexShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uFlow;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        // a slight wobble so the column is not a rigid cylinder
        float w = sin(p.y * 7.0 - uTime * 9.0) * 0.004
                + sin(p.y * 13.0 + uTime * 6.0) * 0.002;
        p.x += w;
        p.z += w * 0.6;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uFlow;
      varying vec2 vUv;
      void main(){
        // streaks running down the stream read as moving liquid
        float streak = sin(vUv.y * 46.0 - uTime * 17.0) * 0.5 + 0.5;
        vec3 dark = vec3(0.030, 0.014, 0.007);
        vec3 lit  = vec3(0.34, 0.20, 0.09);
        // one narrow specular edge, as a round wet column catches
        float edge = pow(max(0.0, 1.0 - abs(vUv.x - 0.28) * 5.5), 3.4);
        vec3 col = mix(dark, lit, streak * 0.16 + edge * 0.75);
        float a = uFlow * smoothstep(0.0, 0.08, vUv.y);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

function coffeeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uMerge: { value: 0 },    // surface activity as the vortex folds in
      uSettle: { value: 0 },   // crema knits together and calms
      uOpacity: { value: 0 }   // revealed with the cup, then never touched again
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vView;
      void main(){
        vUv = uv * 2.0 - 1.0;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uMerge, uSettle, uOpacity;
      varying vec2 vUv;
      varying vec3 vView;
      ${SNOISE}
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = atan(vUv.y, vUv.x);

        float spin = uTime * mix(0.75, 0.14, uSettle);
        vec2 q = vec2(a * 2.4 + 2.4 / (r + 0.35) + spin * 1.8, r * 2.6 - spin);
        float n = fbm(q * 1.5);

        // concentric ripples, strongest while the swirl is still arriving
        float amp = mix(0.12, 0.55, uMerge) * (1.0 - uSettle * 0.78);
        float ripple = sin(r * 26.0 - uTime * 3.4 + n * 2.2) * amp;

        vec3 black = vec3(0.012, 0.007, 0.004);
        vec3 body  = vec3(0.038, 0.020, 0.012);
        vec3 crema = vec3(0.60, 0.38, 0.17);

        vec3 col = mix(black, body, smoothstep(-0.4, 0.8, n));
        // crema is a thin, broken film — mostly you see dark coffee through it
        float cremaMask = smoothstep(0.45, 1.05, n * 0.6 + ripple + uSettle * 0.35);
        col = mix(col, crema, cremaMask * mix(0.12, 0.34, uSettle));

        // it collects in a ring where surface tension holds it at the wall
        col = mix(col, crema, smoothstep(0.86, 1.0, r) * 0.55 * (0.3 + uSettle * 0.7));

        // a soft specular smear so the surface reads as liquid
        float glint = pow(max(0.0, 1.0 - length(vUv - vec2(-0.26, 0.34))), 3.4);
        col += vec3(1.0, 0.88, 0.70) * glint * 0.46 * (0.5 + uSettle * 0.5);

        col += crema * 0.09 * uMerge * (1.0 - uSettle);

        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/* ---------------- particle systems ---------------- */

function makePoints(count, sprite, blending = THREE.AdditiveBlending) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.PointsMaterial({
    size: 0.05,
    map: sprite,
    transparent: true,
    depthWrite: false,
    blending,
    sizeAttenuation: true
  });
  return new THREE.Points(geo, mat);
}

function vortexPoints(count, sprite) {
  const geo = new THREE.BufferGeometry();
  const angle = new Float32Array(count);
  const radius = new Float32Array(count);
  const speed = new Float32Array(count);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    angle[i] = Math.random() * Math.PI * 2;
    radius[i] = 1.6 + Math.pow(Math.random(), 0.62) * 20.5;
    speed[i] = 0.06 + Math.random() * 0.16;
    size[i] = 0.05 + Math.random() * 0.15;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPull: { value: 0 },
      uFade: { value: 0 },
      uScale: { value: 1 },
      uSprite: { value: sprite }
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uPull, uScale;
      attribute float aAngle, aRadius, aSpeed, aSize, aSeed;
      varying float vAlpha;
      void main(){
        // radius collapses toward the rim of the cup as uPull rises
        float k = clamp(uPull * (1.0 + 0.7 * aSeed), 0.0, 1.0);
        float r = mix(aRadius, 0.30 + aSeed * 0.12, k);
        float a = aAngle + uTime * aSpeed * (1.0 + uPull * 3.2) + 2.2 / (r + 0.9);
        float drift = sin(uTime * 0.7 + aSeed * 6.283) * 0.16 * (1.0 - uPull);
        float y = mix(drift, 0.465, uPull);
        vec4 mv = modelViewMatrix * vec4(cos(a) * r, y, sin(a) * r, 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = aSize * mix(1.0, 0.16, uPull);
        gl_PointSize = clamp(sz * uScale / max(0.0001, -mv.z), 0.0, 26.0);
        float edge = smoothstep(1.2, 3.0, aRadius) * (1.0 - smoothstep(15.0, 22.0, aRadius));
        vAlpha = edge * (1.0 - uPull * 0.55) * smoothstep(0.7, 3.2, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform sampler2D uSprite;
      uniform float uFade;
      varying float vAlpha;
      void main(){
        vec4 tex = texture2D(uSprite, gl_PointCoord);
        float a = tex.a * vAlpha * uFade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(tex.rgb, a);
        #include <colorspace_fragment>
      }`
  });

  return new THREE.Points(geo, mat);
}

/* ---------------- the film grade ---------------- */

const GradeShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uVignette:  { value: 0.80 },
    uGrain:     { value: 0.013 },
    uAberration:{ value: 0.0016 },
    uDefocus:   { value: 0.55 },
    uResolution:{ value: new THREE.Vector2(1, 1) }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uDefocus;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p){
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main(){
      vec2 uv = vUv;
      vec2 fromCentre = uv - 0.5;
      float r = length(fromCentre);

      // chromatic aberration grows toward the edge, as a real lens does
      float ab = uAberration * r * r;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + fromCentre * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - fromCentre * ab).b;

      // cheap radial defocus: blur grows with distance from the centre, so the
      // subject stays sharp and the surround falls away like a wide aperture
      float blur = smoothstep(0.22, 0.75, r) * uDefocus;
      if (blur > 0.001) {
        // step in pixels, converted to uv, so the blur is round on any aspect
        vec2 px = vec2(blur * 3.0) / max(uResolution, vec2(1.0));
        vec3 acc = col;
        acc += texture2D(tDiffuse, uv + vec2( px.x, 0.0)).rgb;
        acc += texture2D(tDiffuse, uv + vec2(-px.x, 0.0)).rgb;
        acc += texture2D(tDiffuse, uv + vec2( 0.0, px.y)).rgb;
        acc += texture2D(tDiffuse, uv + vec2( 0.0,-px.y)).rgb;
        acc += texture2D(tDiffuse, uv + px * 0.7).rgb;
        acc += texture2D(tDiffuse, uv - px * 0.7).rgb;
        col = mix(col, acc / 7.0, clamp(blur, 0.0, 1.0));
      }

      // vignette
      col *= 1.0 - smoothstep(0.30, 0.92, r) * uVignette * 0.85;

      // a faint warm lift in the shadows, the way warm-lit film behaves
      col += vec3(0.021, 0.011, 0.004) * (1.0 - smoothstep(0.0, 0.35, length(col)));

      // animated grain, scaled down in the highlights where film is cleaner
      float g = hash(floor(uv * uResolution / 1.5) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (1.0 - smoothstep(0.25, 0.95, length(col)));

      gl_FragColor = vec4(col, 1.0);
    }`
};

/* ---------------- the scene ---------------- */

export function createScene(canvas, { onPhase = () => {}, reducedMotion = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  // A rough tier: small viewports and low core counts get a cheaper scene.
  const lowPower =
    (navigator.hardwareConcurrency || 8) <= 4 ||
    Math.min(window.innerWidth, window.innerHeight) < 560;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0603, 0.019);


  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
  const camTarget = new THREE.Vector3(0, 0, 0);

  // Post chain: bloom gives the warm halo around every hot highlight, the
  // grade adds vignette, aberration, defocus and grain. Both are what make
  // the difference between "a 3D render" and "a photograph".
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.65, 0.86);
  bloom.enabled = !lowPower;    // the most expensive pass by a wide margin
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  if (lowPower) grade.uniforms.uDefocus.value = 0;   // the blur taps are costly
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const env = buildEnvironment(renderer);
  scene.environment = env;

  const sprite = glowSprite();
  const vapour = steamSprite();
  const grain = grainTexture();

  /* --- lights --- */
  scene.add(new THREE.AmbientLight(0x140b05, 0.55));

  const key = new THREE.DirectionalLight(0xffe2bb, 1.75);
  key.position.set(2.4, 3.6, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  key.shadow.camera.left = -2.2;
  key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 2.2;
  key.shadow.camera.bottom = -2.2;
  key.shadow.bias = -0.0012;
  key.shadow.radius = 3;
  scene.add(key);

  // strong warm rim from behind: this is what separates the subject from the
  // dark background and reads as "cinematic" more than any other single light
  const rim = new THREE.DirectionalLight(0xff9d3c, 2.0);
  rim.position.set(-2.4, 1.8, -3.0);
  scene.add(rim);

  const rim2 = new THREE.DirectionalLight(0xffb259, 1.1);
  rim2.position.set(3.0, 0.9, -2.2);
  scene.add(rim2);

  // a low practical just under the rim, so the crema glows from inside
  const fill = new THREE.PointLight(0xffc27a, 0.9, 9, 2);
  fill.position.set(0.3, 0.85, 1.4);
  scene.add(fill);

  const cool = new THREE.DirectionalLight(0x8fb3d9, 0.16);
  cool.position.set(-2.0, -1.2, 2.4);
  scene.add(cool);

  /* --- 1. the bean --- */
  const beanPivot = new THREE.Group();
  scene.add(beanPivot);

  // roasted beans are porous and faintly oily: fine pores in the normal map,
  // and a roughness map so the raised grain catches a sheen the pits do not
  const poreHeight = fbmCanvas(512, 5, 9, 0.6);
  const beanNormal = canvasTexture(normalFromHeight(poreHeight, 1.6), 4);
  const beanRough = canvasTexture(fbmCanvas(512, 4, 6), 2);

  const beanMat = new THREE.MeshPhysicalMaterial({
    color: 0x42291a,
    roughness: 0.85,
    metalness: 0.0,
    normalMap: beanNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: beanRough,

    envMap: env,
    envMapIntensity: 0.28
  });
  const bean = new THREE.Mesh(beanGeometry(), beanMat);
  bean.scale.setScalar(0.42);
  beanPivot.add(bean);

  const motes = makePoints(220, sprite);
  motes.material.size = 0.035;
  {
    const p = motes.geometry.attributes.position.array;
    for (let i = 0; i < 220; i++) {
      const r = 0.55 + Math.random() * 1.15;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      p[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      p[i * 3 + 1] = Math.cos(ph) * r * 0.8;
      p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    motes.geometry.attributes.position.needsUpdate = true;
  }
  motes.material.opacity = 0.75;
  beanPivot.add(motes);

  /* --- 2. the burst --- */
  const shards = new THREE.Group();
  shards.visible = false;
  scene.add(shards);
  const shardData = [];
  const shardGeo = new THREE.IcosahedronGeometry(0.085, 0);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(shardGeo, beanMat);
    m.scale.set(0.6 + Math.random() * 0.9, 0.4 + Math.random() * 0.8, 0.5 + Math.random() * 0.8);
    shards.add(m);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    shardData.push({
      dir: new THREE.Vector3(
        Math.sin(ph) * Math.cos(th),
        Math.cos(ph) * 0.75 + 0.18,
        Math.sin(ph) * Math.sin(th)
      ),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(7),
      speed: 1.6 + Math.random() * 2.6
    });
  }

  const embers = makePoints(620, sprite);
  embers.material.size = 0.055;
  embers.visible = false;
  scene.add(embers);
  const emberData = [];
  for (let i = 0; i < 620; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    emberData.push({
      dir: new THREE.Vector3(
        Math.sin(ph) * Math.cos(th),
        Math.cos(ph) * 0.8 + 0.1,
        Math.sin(ph) * Math.sin(th)
      ),
      speed: 1.2 + Math.random() * 4.2
    });
  }

  /* --- 3. the vortex --- */
  const FUNNEL_H = 9;
  const vortexMat = vortexMaterial();
  vortexMat.uniforms.uHeight.value = FUNNEL_H;
  const vortex = new THREE.Mesh(funnelGeometry(0.58, 26, FUNNEL_H), vortexMat);
  vortex.position.y = 0.0;      // throat sits at the cup's rim height
  vortex.visible = false;
  scene.add(vortex);

  const swirl = vortexPoints(lowPower ? 900 : 2400, sprite);
  swirl.visible = false;
  scene.add(swirl);

  /* --- the cup: built once, revealed at scene 3, never re-created --- */
  const cup = cupGroup(env);
  const ceramicMat = cup.userData.ceramic;
  const saucerMat = cup.userData.saucer;
  cup.visible = false;
  scene.add(cup);

  const coffeeMat = coffeeMaterial();
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.3185, 96), coffeeMat);
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.462;
  cup.add(coffee);

  /* --- 5. the pour --- */
  const POUR_H = 1.15;
  const pourMat = pourMaterial();
  const pour = new THREE.Mesh(pourGeometry(0.030, 0.017, POUR_H), pourMat);
  pour.position.y = 0.462;      // bottom of the stream at the coffee surface
  pour.visible = false;
  scene.add(pour);

  // splash thrown up where the stream meets the surface
  const splash = makePoints(260, sprite);
  splash.material.size = 0.016;
  splash.visible = false;
  scene.add(splash);
  const splashData = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    splashData.push({
      angle: a,
      speed: 0.25 + Math.random() * 0.75,
      lift: 0.5 + Math.random() * 1.5,
      t: Math.random(),
      rate: 0.9 + Math.random() * 1.5
    });
  }

  /* --- 6. steam --- */
  const steam = makePoints(440, vapour, THREE.NormalBlending);
  steam.material.size = 0.030;
  steam.material.vertexColors = true;
  steam.geometry.setAttribute(
    'color', new THREE.BufferAttribute(new Float32Array(440 * 3), 3)
  );
  steam.material.opacity = 0;
  steam.visible = false;
  scene.add(steam);
  const steamData = [];
  for (let i = 0; i < 440; i++) {
    steamData.push({
      t: Math.random(),
      speed: 0.14 + Math.random() * 0.2,
      radius: Math.random() * 0.085,
      angle: Math.random() * Math.PI * 2,
      wobble: 0.5 + Math.random() * 1.6
    });
  }

  /* ---------------- camera waypoints ---------------- */
  /* Waypoints for one continuous descent. The camera starts close on the
     bean, rises high inside the funnel's mouth, then falls down its axis
     toward the cup at the throat. The cup grows because the camera is
     genuinely approaching it, not because anything is being scaled. */
  const CAM = {
    bean:  { pos: new THREE.Vector3(0, 0.12, 2.25), look: new THREE.Vector3(0, 0, 0) },
    mouth: { pos: new THREE.Vector3(0, 9.2, 7.4),   look: new THREE.Vector3(0, 1.2, 0) },
    mid:   { pos: new THREE.Vector3(0, 3.4, 3.0),   look: new THREE.Vector3(0, 0.55, 0) },
    close: { pos: new THREE.Vector3(0, 1.26, 2.55), look: new THREE.Vector3(0, 0.46, 0) },
    rest:  { pos: new THREE.Vector3(0, 1.00, 2.32), look: new THREE.Vector3(0, 0.50, 0) }
  };
  camera.position.copy(CAM.bean.pos);
  camTarget.copy(CAM.bean.look);

  /* ---------------- state ---------------- */
  const state = {
    phase: 'idle',
    beanScale: 1,
    beanOpacity: 1,
    burst: 0,
    vortexFade: 0,
    swirlFade: 0,
    cupReveal: 0,
    pull: 0,
    merge: 0,
    settle: 0,
    pour: 0,
    steamFade: 0
  };

  function setPhase(next) {
    if (state.phase === next) return;
    state.phase = next;
    onPhase(next);
  }

  /* ---------------- render loop ---------------- */
  let lastTime = 0;
  let raf = 0;
  let running = false;
  let elapsed = 0;

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 1;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    const dpr = renderer.getPixelRatio();
    grade.uniforms.uResolution.value.set(w * dpr, h * dpr);
    camera.aspect = w / h;
    // keep the wide shot readable on tall phone screens
    camera.fov = h > w ? 56 : 42;
    camera.updateProjectionMatrix();
    // projection factor in device pixels, so gl_PointSize is world-accurate
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    swirl.material.uniforms.uScale.value =
      buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }

  /** One simulation + render step. Split out so tests can step deterministically. */
  function tick(dt) {
    elapsed += dt;

    // --- the scene graph is a pure function of state ---
    beanPivot.visible = state.beanScale > 0.01;
    const bursting = state.burst > 0.001 && state.burst < 0.999;
    shards.visible = bursting;
    embers.visible = bursting;
    vortex.visible = state.vortexFade > 0.002;
    swirl.visible = state.swirlFade > 0.002;
    cup.visible = state.cupReveal > 0.002;
    steam.visible = state.steamFade > 0.002;
    pour.visible = state.pour > 0.002;
    splash.visible = state.pour > 0.02;

    ceramicMat.opacity = state.cupReveal;
    saucerMat.opacity = state.cupReveal;
    coffeeMat.uniforms.uOpacity.value = state.cupReveal;

    // bean idle: a slow turn plus a small shiver, inviting a tap
    if (beanPivot.visible) {
      beanPivot.rotation.y += dt * 0.55;
      beanPivot.rotation.z = Math.sin(elapsed * 2.6) * 0.035;
      beanPivot.position.y = Math.sin(elapsed * 1.1) * 0.045;
      bean.scale.setScalar(0.42 * state.beanScale);
      beanMat.opacity = state.beanOpacity;
      motes.rotation.y -= dt * 0.22;
    }

    if (shards.visible) {
      const t = state.burst;
      shards.children.forEach((m, i) => {
        const d = shardData[i];
        m.position.copy(d.dir).multiplyScalar(d.speed * t * 1.5);
        m.position.y -= t * t * 1.4;
        m.rotation.x += dt * d.spin.x;
        m.rotation.y += dt * d.spin.y;
        m.rotation.z += dt * d.spin.z;
        m.scale.setScalar(Math.max(0.0001, 1 - t * 0.85));
      });
    }

    if (embers.visible) {
      const t = state.burst;
      const p = embers.geometry.attributes.position.array;
      for (let i = 0; i < emberData.length; i++) {
        const d = emberData[i];
        const travel = d.speed * t;
        p[i * 3] = d.dir.x * travel;
        p[i * 3 + 1] = d.dir.y * travel - t * t * 0.9;
        p[i * 3 + 2] = d.dir.z * travel;
      }
      embers.geometry.attributes.position.needsUpdate = true;
      embers.material.opacity = Math.max(0, 1 - t * 0.78);
    }

    vortexMat.uniforms.uTime.value = elapsed;
    vortexMat.uniforms.uPull.value = state.pull;
    vortexMat.uniforms.uCam.value.copy(camera.position);
    vortexMat.uniforms.uFade.value = state.vortexFade;

    const su = swirl.material.uniforms;
    su.uTime.value = elapsed;
    su.uPull.value = state.pull;
    su.uFade.value = state.swirlFade;

    pourMat.uniforms.uTime.value = elapsed;
    pourMat.uniforms.uFlow.value = state.pour;
    if (pour.visible) {
      // the column grows down into the cup rather than appearing whole
      pour.scale.y = Math.min(1, state.pour * 1.6);
      pour.position.y = 0.462 + POUR_H * (1 - pour.scale.y) * 0.0;
    }

    if (splash.visible) {
      const p = splash.geometry.attributes.position.array;
      for (let i = 0; i < splashData.length; i++) {
        const sp = splashData[i];
        sp.t += dt * sp.rate;
        if (sp.t > 1) sp.t -= 1;
        const k = sp.t;
        const r = 0.035 + k * sp.speed * 0.3;
        // up fast, then fall back under gravity
        const y = 0.47 + (sp.lift * 0.17) * k - 1.5 * k * k * 0.14;
        p[i * 3] = Math.cos(sp.angle) * r;
        p[i * 3 + 1] = Math.max(0.462, y);
        p[i * 3 + 2] = Math.sin(sp.angle) * r;
      }
      splash.geometry.attributes.position.needsUpdate = true;
      splash.material.opacity = state.pour * 0.55;
    }

    coffeeMat.uniforms.uTime.value = elapsed;
    coffeeMat.uniforms.uMerge.value = state.merge;
    coffeeMat.uniforms.uSettle.value = state.settle;

    if (steam.visible) {
      const p = steam.geometry.attributes.position.array;
      const col = steam.geometry.attributes.color.array;
      for (let i = 0; i < steamData.length; i++) {
        const s = steamData[i];
        s.t += dt * s.speed;
        if (s.t > 1) s.t -= 1;
        const rise = s.t;
        const spread = 0.02 + rise * 0.13;
        p[i * 3] = Math.cos(s.angle + rise * s.wobble * 2.4) * (s.radius + spread);
        p[i * 3 + 1] = 0.47 + rise * 0.56;
        p[i * 3 + 2] = Math.sin(s.angle + rise * s.wobble * 2.0) * (s.radius + spread);
        // born faint, brightest low, gone by the top
        const life = Math.sin(rise * Math.PI) * (1 - rise * 0.45) * 0.8;
        col[i * 3] = life;
        col[i * 3 + 1] = life * 0.93;
        col[i * 3 + 2] = life * 0.86;
      }
      steam.geometry.attributes.position.needsUpdate = true;
      steam.geometry.attributes.color.needsUpdate = true;
      steam.material.opacity = state.steamFade * 0.55;
    }

    camera.lookAt(camTarget);
    grade.uniforms.uTime.value = elapsed;
    composer.render();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    tick(dt);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    lastTime = performance.now();
    frame();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  /* ---------------- public surface for the timeline ---------------- */
  return {
    THREE,
    renderer,
    scene,
    camera,
    camTarget,
    state,
    CAM,
    objects: { beanPivot, bean, motes, shards, embers, vortex, swirl, cup, coffee, steam, pour, splash },
    materials: { ceramic: ceramicMat, coffee: coffeeMat, bean: beanMat, vortex: vortexMat },
    post: { composer, bloom, grade },
    setPhase,
    PHASES,
    start,
    stop,
    tick,
    resize,
    reducedMotion,
    dispose() {
      stop();
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      env.dispose();
      sprite.dispose();
      vapour.dispose();
      grain.dispose();
    }
  };
}
