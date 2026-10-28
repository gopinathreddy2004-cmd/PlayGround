import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function v3(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

/* ------------------------------------------------------------------ *
 * Procedural textures
 * ------------------------------------------------------------------ */

export function canvasTexture(width, height, draw, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  texture.anisotropy = 4;
  return texture;
}

function rgb(r, g, b, a = 1) {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function noiseTexture({
  base = [188, 160, 118],
  amount = 26,
  size = 256,
  repeat = [14, 14],
  speckle = 0.08,
  seed = 7,
} = {}) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const rand = seeded(seed);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * 2 * amount;
      const spec = rand() < speckle ? 30 : 0;
      img.data[i] = clamp(base[0] + n + spec, 0, 255);
      img.data[i + 1] = clamp(base[1] + n + spec, 0, 255);
      img.data[i + 2] = clamp(base[2] + n + spec, 0, 255);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rgb(base[0] + 30, base[1] + 26, base[2] + 20, 0.05);
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, rand() * 26 + 4, 0, TAU);
      ctx.fill();
    }
  }, { repeat });
}

export function brickTexture({
  base = [156, 96, 62],
  mortar = [196, 164, 122],
  rows = 12,
  cols = 6,
  repeat = [4, 4],
} = {}) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rand = seeded(11);
    ctx.fillStyle = rgb(...mortar);
    ctx.fillRect(0, 0, w, h);
    const bh = h / rows;
    const bw = w / cols;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * bw + offset + 2;
        const y = r * bh + 2;
        const n = (rand() - 0.5) * 26;
        ctx.fillStyle = rgb(base[0] + n, base[1] + n * 0.8, base[2] + n * 0.6);
        ctx.fillRect(x, y, bw - 4, bh - 4);
        ctx.fillStyle = rgb(255, 255, 255, 0.045);
        ctx.fillRect(x, y, bw - 4, 2);
      }
    }
  }, { repeat });
}

export function marbleTexture({ base = [238, 231, 217], repeat = [3, 3], seed = 4 } = {}) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rand = seeded(seed);
    ctx.fillStyle = rgb(...base);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = rgb(150, 148, 140, 0.06 + rand() * 0.1);
      ctx.lineWidth = 0.6 + rand() * 2.4;
      ctx.beginPath();
      let x = rand() * w;
      let y = rand() * h;
      ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (rand() - 0.5) * 200;
        y += rand() * 90;
        ctx.quadraticCurveTo(x + (rand() - 0.5) * 60, y - 40, x, y);
      }
      ctx.stroke();
    }
  }, { repeat });
}

export function dotTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.38, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { wrap: false });
}

export function glowTexture(inner = 'rgba(255,240,205,1)', outer = 'rgba(255,190,110,0)') {
  return canvasTexture(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  }, { wrap: false });
}

export function flagTexture() {
  return canvasTexture(900, 600, (ctx, w, h) => {
    const band = h / 3;
    ctx.fillStyle = '#de7a2e';
    ctx.fillRect(0, 0, w, band);
    ctx.fillStyle = '#f4efe3';
    ctx.fillRect(0, band, w, band);
    ctx.fillStyle = '#2c6b47';
    ctx.fillRect(0, band * 2, w, band);
    const cx = w / 2;
    const cy = h / 2;
    const r = band * 0.42;
    ctx.strokeStyle = '#1e3a6e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.fillStyle = '#1e3a6e';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, TAU);
    ctx.fill();
  }, { wrap: false });
}

export function sealTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#b98d5f';
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(21);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = rgb(120, 78, 44, 0.1);
      ctx.fillRect(rand() * w, rand() * h, rand() * 40 + 6, rand() * 12 + 2);
    }
    ctx.strokeStyle = 'rgba(60,36,18,0.72)';
    ctx.lineWidth = 6;
    ctx.strokeRect(30, 30, w - 60, h - 60);
    ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      const x = 72 + i * 40;
      ctx.beginPath();
      ctx.moveTo(x, 78);
      ctx.lineTo(x + 10, 96);
      ctx.lineTo(x - 4, 112);
      ctx.lineTo(x + 8, 134);
      ctx.stroke();
    }
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx(w), 210, 44, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx(w) - 58, 300);
    ctx.bezierCurveTo(cx(w) - 90, 380, cx(w) + 90, 380, cx(w) + 58, 300);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.beginPath();
      ctx.arc(cx(w) + Math.cos(a) * 80, 330 + Math.sin(a) * 52, 15, 0, TAU);
      ctx.stroke();
    }
    function cx(_w) { return _w / 2; }
  }, { wrap: false });
}

/* ------------------------------------------------------------------ *
 * Sky, environment, atmosphere
 * ------------------------------------------------------------------ */

export function createSky({
  top = 0x24384c,
  bottom = 0xf3c08a,
  sunDir = [0.4, 0.12, -0.8],
  sunColor = 0xffd7a0,
  sunPower = 420,
  sunStrength = 1.15,
  glow = 0.16,
  exponent = 0.62,
} = {}) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
      sunColor: { value: new THREE.Color(sunColor) },
      sunDir: { value: new THREE.Vector3(...sunDir).normalize() },
      sunPower: { value: sunPower },
      sunStrength: { value: sunStrength },
      glow: { value: glow },
      exponent: { value: exponent },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float sunPower;
      uniform float sunStrength;
      uniform float glow;
      uniform float exponent;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottomColor, topColor, pow(h, exponent));
        float sun = pow(max(dot(dir, normalize(sunDir)), 0.0), sunPower);
        col = mix(col, sunColor, clamp(sun * sunStrength, 0.0, 1.0));
        float horizon = pow(1.0 - clamp(abs(dir.y), 0.0, 1.0), 7.0);
        col += sunColor * horizon * glow;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(220, 48, 32), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export function makeEnvironment(renderer, { top, bottom, sun, sunColor = '#ffe2b0', ground = '#6b5840' }) {
  const texture = canvasTexture(512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(0.52, bottom);
    grad.addColorStop(0.56, ground);
    grad.addColorStop(1, ground);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const sx = ((sun.x * 0.5 + 0.5) % 1) * w;
    const g = ctx.createRadialGradient(sx, h * 0.42, 0, sx, h * 0.42, 120);
    g.addColorStop(0, sunColor);
    g.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { wrap: false, srgb: true });
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return env;
}

export function setupScene(renderer, camera, opts = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(opts.fog ?? 0x2a2118, opts.fogDensity ?? 0.014);
  scene.add(createSky({ ...opts, sunDir: opts.skySunDir ?? opts.sunDir ?? [0.4, 0.12, -0.8] }));
  const env = makeEnvironment(renderer, {
    top: opts.envTop ?? '#1b2733',
    bottom: opts.envBottom ?? '#f0bf88',
    sun: new THREE.Vector3(...(opts.sunDir ?? [0.4, 0.2, -0.8])),
    sunColor: opts.envSun ?? '#ffe0b0',
    ground: opts.envGround ?? '#5b4a34',
  });
  scene.environment = env;
  scene.environmentIntensity = opts.envIntensity ?? 0.55;

  const hemi = new THREE.HemisphereLight(opts.hemiSky ?? 0xbdd2e6, opts.hemiGround ?? 0x5a452c, opts.hemi ?? 0.55);
  scene.add(hemi);

  const fill = new THREE.DirectionalLight(opts.fillColor ?? 0xffd9b8, opts.fillIntensity ?? 0.55);
  fill.position.copy(new THREE.Vector3(...(opts.fillDir ?? [0.4, 0.5, 1])).normalize().multiplyScalar(38));
  scene.add(fill);

  if (opts.sunDir) {
    const sun = new THREE.DirectionalLight(opts.sunColor ?? 0xffd8a8, opts.sunIntensity ?? 2.1);
    const d = new THREE.Vector3(...opts.sunDir).normalize();
    sun.position.copy(d.multiplyScalar(42));
    sun.castShadow = opts.shadows !== false;
    sun.shadow.mapSize.set(opts.shadowSize ?? 1024, opts.shadowSize ?? 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    const s = opts.shadowExtent ?? 30;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.userData.sun = sun;
  }
  return scene;
}

export function ground({
  size = 160,
  color = '#a98f6b',
  texture,
  roughness = 0.95,
  y = 0,
  receiveShadow = true,
} = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: texture ?? null,
    roughness,
    metalness: 0.02,
  });
  if (texture) mat.color.set('#ffffff');
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(size, 72), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

export function stars(count = 1600, radius = 150, color = 0xdfe9ff, opacity = 0.85) {
  const rand = seeded(33);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * TAU;
    const v = Math.acos(rand() * 2 - 1);
    const r = radius * (0.8 + rand() * 0.2);
    positions[i * 3] = Math.sin(v) * Math.cos(u) * r;
    positions[i * 3 + 1] = Math.abs(Math.cos(v)) * r * 0.7 + 5;
    positions[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: dotTexture(),
    color,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

export function dust({
  count = 260,
  area = [24, 8, 24],
  color = 0xffd9a0,
  size = 0.07,
  opacity = 0.55,
  center = [0, 2, 0],
  speed = 0.5,
  seed = 12,
  additive = true,
} = {}) {
  const rand = seeded(seed);
  const base = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (rand() - 0.5) * area[0] + center[0];
    base[i * 3 + 1] = rand() * area[1] + center[1];
    base[i * 3 + 2] = (rand() - 0.5) * area[2] + center[2];
    speeds[i] = speed * (0.35 + rand() * 0.9);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  const mat = new THREE.PointsMaterial({
    map: dotTexture(),
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.userData.update = (t) => {
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const y = base[i * 3 + 1] + ((t * speeds[i]) % area[1]);
      pos[i * 3] = base[i * 3] + Math.sin(t * 0.35 + i) * 0.22;
      pos[i * 3 + 1] = ((y - center[1]) % area[1]) + center[1];
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.28 + i * 1.7) * 0.22;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}

export function glowSprite(color = 0xffd9a0, size = 8, opacity = 0.7) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  return sprite;
}

/* ------------------------------------------------------------------ *
 * Camera choreography
 * ------------------------------------------------------------------ */

export function shot(camera, t, keys, { drift = 0.03, driftSpeed = 0.32 } = {}) {
  let a = keys[0];
  let b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      a = keys[i];
      b = keys[i + 1];
      break;
    }
  }
  const span = Math.max(0.0001, b.t - a.t);
  const k = easeInOut(clamp((t - a.t) / span));
  camera.position.set(
    lerp(a.pos[0], b.pos[0], k) + Math.sin(t * driftSpeed) * drift,
    lerp(a.pos[1], b.pos[1], k) + Math.sin(t * driftSpeed * 1.7 + 1.2) * drift * 0.55,
    lerp(a.pos[2], b.pos[2], k) + Math.cos(t * driftSpeed * 0.8) * drift
  );
  camera.lookAt(
    lerp(a.look[0], b.look[0], k),
    lerp(a.look[1], b.look[1], k),
    lerp(a.look[2], b.look[2], k)
  );
}

/* ------------------------------------------------------------------ *
 * Reusable geometry
 * ------------------------------------------------------------------ */

export function makeChakra({ radius = 2, tube = 0.06, spokes = 24, color = 0x1e3a6e, metalness = 0.1, emissive = 0x000000 } = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness: 0.42,
    emissive,
    emissiveIntensity: emissive ? 0.7 : 0,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 96), mat);
  group.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.1, radius * 0.1, tube * 4, 20), mat);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);
  if (spokes > 0) {
    const geo = new THREE.BoxGeometry(radius * 0.86, tube * 1.5, tube * 1.5);
    geo.translate(radius * 0.47, 0, 0);
    const inst = new THREE.InstancedMesh(geo, mat, spokes);
    const m = new THREE.Matrix4();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU;
      m.makeRotationZ(a);
      inst.setMatrixAt(i, m);
    }
    group.add(inst);
  }
  return group;
}

export function archShape(w = 1, h = 2, spring = 0.62) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * spring);
  s.quadraticCurveTo(w / 2, h * 0.88, 0, h);
  s.quadraticCurveTo(-w / 2, h * 0.88, -w / 2, h * spring);
  s.closePath();
  return s;
}

const INDIA = [
  [74.0, 34.6], [76.5, 35.6], [79.5, 32.6], [83.5, 28.9], [87.5, 27.6],
  [91.5, 28.1], [95.2, 29.0], [97.2, 27.1], [94.2, 24.0], [93.0, 22.0],
  [91.3, 22.6], [89.0, 21.4], [86.9, 20.7], [85.2, 19.1], [82.2, 16.4],
  [80.4, 13.1], [80.0, 10.0], [78.4, 8.1], [77.4, 8.1], [76.0, 9.6],
  [74.4, 12.2], [73.4, 16.0], [72.8, 20.1], [72.5, 22.6], [70.0, 21.0],
  [68.4, 23.6], [68.0, 25.1], [70.1, 27.2], [72.1, 29.1], [74.0, 31.2],
];

export function indiaShape(scale = 0.62) {
  const s = new THREE.Shape();
  INDIA.forEach(([lon, lat], i) => {
    const x = (lon - 82.4) * scale;
    const y = (lat - 22.0) * scale;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  return s;
}

export function indiaMesh({ scale = 0.62, depth = 0.22, color = 0x8a6a34, edge = 0xf3cd80, emissive = 0x3a2a10 } = {}) {
  const group = new THREE.Group();
  const shape = indiaShape(scale);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color,
    metalness: 0.55,
    roughness: 0.42,
    emissive,
    emissiveIntensity: 0.5,
  }));
  mesh.castShadow = true;
  group.add(mesh);
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 24),
    new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.55 })
  );
  group.add(lines);
  return group;
}

export function crenellations({ width = 20, count = 14, size = 0.5, height = 0.6, material }) {
  const geo = new THREE.BoxGeometry(size, height, size * 1.1);
  const inst = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(-width / 2 + (i / (count - 1)) * width, height / 2, 0);
    inst.setMatrixAt(i, m);
  }
  return inst;
}

export function textTexture(text, { color = '#f3e9d7', font = '600 84px "Cormorant Garamond", Georgia, serif', width = 1024, height = 256, letter = 0 } = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (letter) {
      const chars = [...text];
      const widths = chars.map((c) => ctx.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0) + letter * (chars.length - 1);
      let x = w / 2 - total / 2;
      chars.forEach((c, i) => {
        ctx.fillText(c, x + widths[i] / 2, h / 2);
        x += widths[i] + letter;
      });
    } else {
      ctx.fillText(text, w / 2, h / 2);
    }
  }, { wrap: false });
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          if (m[k] && m[k].isTexture) m[k].dispose();
        }
        m.dispose();
      }
    }
  });
}
