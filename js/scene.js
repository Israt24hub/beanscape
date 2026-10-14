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
  grad.addColorStop(0.00, '#2a1a0e');
  grad.addColorStop(0.42, '#120b06');
  grad.addColorStop(1.00, '#050302');
  g.fillStyle = grad;
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
  const geo = new THREE.SphereGeometry(1, 96, 72);
  const pos = geo.attributes.position;
  const a = 0.74, b = 1.0, c = 0.62;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let x = v.x * a, y = v.y * b, z = v.z * c;
    // crease down the long axis, deepest at the equator
    const across = Math.exp(-(x * x) / 0.035);
    const along = Math.max(0, 1 - (y / b) ** 2 * 0.55);
    const groove = across * along * 0.34;
    z -= Math.sign(z || 1) * groove;
    // flatten the poles a little so it is not an egg
    y *= 1 - 0.06 * Math.exp(-(x * x + z * z) / 0.5);
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function cupGroup(env) {
  const group = new THREE.Group();

  const ceramic = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0,
    color: 0xeae6dd,
    roughness: 0.34,
    metalness: 0.0,
    envMap: env,
    envMapIntensity: 0.45,
    side: THREE.DoubleSide
  });

  const profile = [
    [0.000, 0.000], [0.250, 0.000], [0.278, 0.014], [0.296, 0.072],
    [0.328, 0.270], [0.348, 0.452], [0.352, 0.500],
    [0.336, 0.500],
    [0.318, 0.290], [0.288, 0.095], [0.258, 0.042], [0.000, 0.042]
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), ceramic);
  body.castShadow = false;
  group.add(body);

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.108, 0.026, 18, 72, Math.PI * 1.32),
    ceramic
  );
  handle.position.set(0.345, 0.30, 0);
  handle.rotation.z = -Math.PI * 0.18;
  group.add(handle);

  const saucer = new THREE.Mesh(
    new THREE.LatheGeometry([
      [0.000, -0.034], [0.520, -0.034], [0.560, -0.020],
      [0.566, 0.004], [0.520, 0.000], [0.000, 0.000]
    ].map(([x, y]) => new THREE.Vector2(x, y)), 96),
    ceramic
  );
  group.add(saucer);

  group.userData.ceramic = ceramic;
  return group;
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
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uPull: { value: 0 },   // 0 wide and calm, 1 drawn tight toward the cup
      uFade: { value: 0 },   // overall opacity
      uCam:  { value: new THREE.Vector3() }
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      varying vec3 vWorld;
      void main(){
        vPos = position.xy;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime, uPull, uFade;
      uniform vec3 uCam;
      varying vec2 vPos;
      varying vec3 vWorld;
      ${SNOISE}
      void main(){
        float r = length(vPos);
        float a = atan(vPos.y, vPos.x);
        // the swirl tightens as it nears the centre
        float twist = (3.6 + uPull * 5.0) / (r + 1.4);
        float t = uTime * (0.16 + uPull * 0.26);
        vec2 q = vec2(a * 1.9 + twist + t * 2.2, r * 0.30 - t * 1.5);
        // how much of the noise domain this pixel covers
        float footprint = fwidth(q.x) + fwidth(q.y);
        float detail = 1.0 - smoothstep(0.30, 1.40, footprint);
        float n = fbm(q) * detail;
        float n2 = fbm(q * 2.3 + vec2(n * 0.8, -t)) * detail;

        vec3 deep  = vec3(0.043, 0.025, 0.015);
        vec3 roast = vec3(0.168, 0.086, 0.043);
        vec3 crema = vec3(0.780, 0.520, 0.246);

        vec3 col = mix(deep, roast, smoothstep(-0.55, 0.65, n));
        col = mix(col, crema, smoothstep(0.35, 1.05, n + n2 * 0.55) * 0.75);

        // brighter where the liquid is pulled in toward the cup
        col += crema * uPull * 0.30 * smoothstep(9.0, 1.2, r) * (0.45 + n2 * 0.55);

        float inner = smoothstep(1.00, 5.0, r);          // never cover the cup
        float outer = 1.0 - smoothstep(7.5, 15.0, r);    // dissolve into the dark
        // shallow viewing angles alias badly, so let the surface go at grazing
        vec3 toCam = uCam - vWorld;
        float dist = length(toCam);
        float grazing = smoothstep(0.085, 0.42, abs(toCam.y / dist));
        float near = smoothstep(1.5, 6.5, dist);   // kill the aliased foreground
        float alpha = inner * outer * grazing * near * uFade * detail
                    * (0.60 + 0.40 * smoothstep(-0.8, 0.9, n));
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
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

        vec3 black = vec3(0.028, 0.016, 0.010);
        vec3 body  = vec3(0.090, 0.046, 0.026);
        vec3 crema = vec3(0.741, 0.506, 0.251);

        vec3 col = mix(black, body, smoothstep(-0.4, 0.8, n));
        float cremaMask = smoothstep(0.10, 0.92, n * 0.6 + ripple + uSettle * 0.45);
        col = mix(col, crema, cremaMask * mix(0.35, 0.80, uSettle));

        // crema collects in a ring at the cup wall
        col = mix(col, crema, smoothstep(0.74, 0.99, r) * 0.72 * (0.35 + uSettle * 0.65));

        // a soft specular smear so the surface reads as liquid
        float glint = pow(max(0.0, 1.0 - length(vUv - vec2(-0.26, 0.34))), 3.4);
        col += vec3(1.0, 0.86, 0.66) * glint * 0.30 * (0.5 + uSettle * 0.5);

        col += crema * 0.18 * uMerge * (1.0 - uSettle);

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

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0603, 0.019);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
  const camTarget = new THREE.Vector3(0, 0, 0);

  const env = buildEnvironment(renderer);
  scene.environment = env;

  const sprite = glowSprite();
  const vapour = steamSprite();
  const grain = grainTexture();

  /* --- lights --- */
  scene.add(new THREE.AmbientLight(0x1a0f08, 1.0));

  const key = new THREE.DirectionalLight(0xffd7a2, 1.7);
  key.position.set(2.6, 3.4, 2.4);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc8741f, 1.15);
  rim.position.set(-2.8, 1.4, -2.6);
  scene.add(rim);

  const fill = new THREE.PointLight(0xe3b872, 1.1, 12, 2);
  fill.position.set(0.4, 1.5, 1.8);
  scene.add(fill);

  /* --- 1. the bean --- */
  const beanPivot = new THREE.Group();
  scene.add(beanPivot);

  const beanMat = new THREE.MeshStandardMaterial({
    color: 0x3a2112,
    roughness: 0.58,
    metalness: 0.04,
    bumpMap: grain,
    bumpScale: 0.022,
    envMap: env,
    envMapIntensity: 0.85
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
  const vortexMat = vortexMaterial();
  const vortex = new THREE.Mesh(new THREE.RingGeometry(0.62, 24, 160, 32), vortexMat);
  vortex.rotation.x = -Math.PI / 2;
  vortex.position.y = -0.012;
  vortex.visible = false;
  scene.add(vortex);

  const swirl = vortexPoints(2400, sprite);
  swirl.visible = false;
  scene.add(swirl);

  /* --- the cup: built once, revealed at scene 3, never re-created --- */
  const cup = cupGroup(env);
  const ceramicMat = cup.userData.ceramic;
  cup.visible = false;
  scene.add(cup);

  const coffeeMat = coffeeMaterial();
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.3185, 96), coffeeMat);
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.462;
  cup.add(coffee);

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
  const CAM = {
    bean:  { pos: new THREE.Vector3(0, 0.12, 2.25), look: new THREE.Vector3(0, 0, 0) },
    wide:  { pos: new THREE.Vector3(0, 11.5, 27.5), look: new THREE.Vector3(0, 0, 0) },
    close: { pos: new THREE.Vector3(0, 0.94, 2.10), look: new THREE.Vector3(0, 0.40, 0) },
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

    ceramicMat.opacity = state.cupReveal;
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
    renderer.render(scene, camera);
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
    objects: { beanPivot, bean, motes, shards, embers, vortex, swirl, cup, coffee, steam },
    materials: { ceramic: ceramicMat, coffee: coffeeMat, bean: beanMat, vortex: vortexMat },
    setPhase,
    PHASES,
    start,
    stop,
    tick,
    resize,
    reducedMotion,
    dispose() {
      stop();
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
