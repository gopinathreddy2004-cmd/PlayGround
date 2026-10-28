import * as THREE from 'three';
import {
  TAU, clamp, lerp, seeded, v3,
  noiseTexture, brickTexture, marbleTexture, sealTexture, flagTexture, textTexture, canvasTexture,
  createSky, makeEnvironment, setupScene, ground, stars, dust, glowSprite, shot,
  makeChakra, archShape, indiaMesh, crenellations,
} from './lib.js';

const SERIF = '"Cormorant Garamond", Georgia, serif';
const DEVA = '"Tiro Devanagari", "Noto Sans Devanagari", serif';

function camera(aspect = 16 / 9) {
  return new THREE.PerspectiveCamera(37, aspect, 0.1, 400);
}

function shadowAll(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return root;
}

function mulMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.05,
    ...opts,
  });
}

function ribbon(points, width, mat, y = 0.02) {
  const curve = new THREE.CatmullRomCurve3(points);
  const samples = curve.getPoints(90);
  const verts = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const n = samples[Math.min(samples.length - 1, i + 1)];
    const prev = samples[Math.max(0, i - 1)];
    const tangent = new THREE.Vector3().subVectors(n, prev).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2);
    verts.push(p.x + side.x, y, p.z + side.z);
    verts.push(p.x - side.x, y, p.z - side.z);
    uvs.push(0, i / samples.length, 1, i / samples.length);
    if (i < samples.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function flameTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const shape = new Path2D();
    shape.moveTo(w / 2, h - 8);
    shape.bezierCurveTo(w * 0.12, h * 0.72, w * 0.2, h * 0.34, w / 2, h * 0.04);
    shape.bezierCurveTo(w * 0.8, h * 0.34, w * 0.88, h * 0.72, w / 2, h - 8);
    ctx.save();
    ctx.clip(shape);
    const g = ctx.createRadialGradient(w / 2, h * 0.74, 2, w / 2, h * 0.62, h * 0.5);
    g.addColorStop(0, 'rgba(255,246,214,0.96)');
    g.addColorStop(0.24, 'rgba(255,214,128,0.92)');
    g.addColorStop(0.52, 'rgba(255,142,40,0.78)');
    g.addColorStop(0.8, 'rgba(220,80,20,0.36)');
    g.addColorStop(1, 'rgba(170,46,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }, { wrap: false });
}

function flame(scale = 1) {
  const group = new THREE.Group();
  const tex = flameTexture();
  const specs = [
    { x: 0, y: 0.95, sx: 1.05, sy: 2.15, color: 0xff7d1e, opacity: 0.85, phase: 0 },
    { x: -0.24, y: 0.72, sx: 0.6, sy: 1.5, color: 0xffa13a, opacity: 0.7, phase: 1.7 },
    { x: 0.22, y: 0.8, sx: 0.66, sy: 1.65, color: 0xff9028, opacity: 0.7, phase: 3.4 },
    { x: 0, y: 0.52, sx: 0.4, sy: 0.86, color: 0xffeab4, opacity: 0.95, phase: 0.8 },
  ];
  const sprites = specs.map((spec) => {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(spec.x, spec.y - 0.2, spec.phase * 0.01);
    sprite.scale.set(spec.sx, spec.sy, 1);
    sprite.userData.spec = spec;
    group.add(sprite);
    return sprite;
  });
  group.userData.sprites = sprites;
  group.userData.update = (t) => {
    sprites.forEach((sprite, i) => {
      const spec = sprite.userData.spec;
      const flick = 1 + Math.sin(t * (7.5 + i * 1.7) + spec.phase) * 0.11;
      sprite.scale.set(spec.sx * (1 + Math.sin(t * 5 + i) * 0.05), spec.sy * flick, 1);
      sprite.position.x = spec.x + Math.sin(t * 2.6 + spec.phase) * 0.045;
      sprite.position.y = spec.y - 0.2 + Math.sin(t * 3.4 + spec.phase) * 0.03;
      sprite.material.opacity = spec.opacity * (0.86 + Math.sin(t * (9 + i) + spec.phase) * 0.12);
    });
  };
  group.scale.setScalar(scale);
  return group;
}

function person({ h = 1.1, color = 0x4a3424, robe = null } = {}) {
  const g = new THREE.Group();
  const bodyMat = mulMat(color, { roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * h, 0.17 * h, h * 0.52, 7), bodyMat);
  body.position.y = h * 0.37;
  g.add(body);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.155 * h, 8, 6), bodyMat);
  shoulders.position.y = h * 0.55;
  shoulders.scale.set(1, 0.5, 0.72);
  g.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095 * h, 10, 8), mulMat(0x3a2718));
  head.position.y = h * 0.69;
  g.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018 * h, 0.05 * h, 5), mulMat(0x3a2718));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, h * 0.69, 0.09 * h);
  g.add(nose);
  if (robe) {
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.19 * h, h * 0.52, 9, 1, true), mulMat(robe, { side: THREE.DoubleSide }));
    r.position.y = h * 0.3;
    g.add(r);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.028 * h, 0.034 * h, h * 0.34, 5), bodyMat);
    arm.position.set(side * 0.11 * h, h * 0.44, 0.01);
    arm.rotation.z = side * 0.55;
    g.add(arm);
  }
  return g;
}

function tree({ h = 2.4, trunk = 0x5a4128, leaf = 0x50603a, spread = 0.7 } = {}) {
  const g = new THREE.Group();
  const rand = seeded(Math.round(h * 97) + Math.round(spread * 31));
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.13, h * 0.55, 6), mulMat(trunk, { roughness: 0.95 }));
  t.position.y = h * 0.27;
  g.add(t);
  const blobs = 6;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + rand() * 0.5;
    const r = spread * (0.3 + rand() * 0.45);
    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(spread * (0.55 + rand() * 0.3), 1),
      mulMat(leaf, { roughness: 0.98, flatShading: true })
    );
    canopy.position.set(Math.cos(a) * r, h * (0.6 + rand() * 0.28), Math.sin(a) * r);
    canopy.scale.y = 0.72;
    canopy.castShadow = true;
    g.add(canopy);
  }
  return g;
}

/* ================================================================== *
 * 01 · INDUS VALLEY
 * ================================================================== */

function buildIndus(renderer) {
  const cam = camera();
  const scene = setupScene(renderer, cam, {
    top: 0x3d566b, bottom: 0xf2b878, sunDir: [0.55, 0.55, 0.5],
    skySunDir: [-0.55, 0.08, -0.83], sunColor: 0xffd9a8, sunIntensity: 2.2, hemi: 0.62,
    fillColor: 0xffd8ad, fillIntensity: 0.7, fillDir: [0.3, 0.5, 1],
    fog: 0xb98f63, fogDensity: 0.011, shadows: true, shadowExtent: 28,
    envTop: '#5d7284', envBottom: '#f3c08a', envGround: '#8d7350', envIntensity: 0.6,
    envSun: '#ffe0ae', sunPower: 500, sunStrength: 1.2, glow: 0.24,
  });
  const sand = noiseTexture({ base: [186, 154, 111], amount: 22, repeat: [22, 22], seed: 2 });
  scene.add(ground({ size: 140, texture: sand, roughness: 1 }));

  const bricks = brickTexture({ base: [163, 104, 68], mortar: [198, 166, 126], repeat: [2, 1.2] });
  const brickMat = new THREE.MeshStandardMaterial({ map: bricks, roughness: 0.92, color: 0xffffff });

  const riverMat = new THREE.MeshStandardMaterial({
    color: 0x4f9198, roughness: 0.18, metalness: 0.28, side: THREE.DoubleSide,
    emissive: 0x0d2a2c, emissiveIntensity: 0.55, envMapIntensity: 1.4,
  });
  const river = ribbon([
    v3(-72, 0, 13), v3(-40, 0, 11), v3(-22, 0, 8.5), v3(-4, 0, 7.4), v3(14, 0, 8.6), v3(32, 0, 11.4), v3(46, 0, 10.4), v3(72, 0, 9.2),
  ], 8.2, riverMat);
  scene.add(river);
  const riverBank = new THREE.Mesh(new THREE.PlaneGeometry(176, 9.5), mulMat(0x7f6647, { roughness: 1 }));
  riverBank.rotation.x = -Math.PI / 2;
  riverBank.position.set(3, -0.03, 9.4);
  riverBank.receiveShadow = true;
  scene.add(riverBank);

  const rand = seeded(19);
  const city = new THREE.Group();
  const town = new THREE.Group();
  const count = 210;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const houses = new THREE.InstancedMesh(geo, brickMat, count);
  const roofSlab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mulMat(0xc08e63, { roughness: 0.94 }), count);
  const roofMatrices = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  let i = 0;
  for (let gx = 0; gx < 16 && i < count; gx++) {
    for (let gz = 0; gz < 13 && i < count; gz++) {
      const x = -18 + gx * 2.32 + (rand() - 0.5) * 0.32;
      const z = -15.5 + gz * 2.12 + (rand() - 0.5) * 0.32;
      if (z > 2.4) continue;
      if (x > -9 && x < -1.5 && z > -9 && z < -2.4) continue;
      if (x > 0.8 && x < 8.4 && z > -8 && z < 0.6) continue;
      if (rand() < 0.19) continue;
      const w = 0.8 + rand() * 0.65;
      const d = 0.8 + rand() * 0.65;
      const h = 0.5 + rand() * 1.55;
      q.setFromAxisAngle(v3(0, 1, 0), (rand() - 0.5) * 0.12);
      m.compose(v3(x, h / 2, z), q, v3(w, h, d));
      houses.setMatrixAt(i, m);
      color.setHSL(0.06 + rand() * 0.03, 0.32, 0.4 + rand() * 0.16);
      houses.setColorAt(i, color);
      roofMatrices.push([x, h + 0.035, z, w * 1.12, d * 1.12, q.clone()]);
      i++;
    }
  }
  houses.count = i;
  houses.castShadow = true;
  houses.receiveShadow = true;
  town.add(houses);
  roofSlot(roofMatrices);
  function roofSlot(list) {
    const mm = new THREE.Matrix4();
    list.forEach(([x, y, z, w, d, quat], n) => {
      mm.compose(v3(x, y, z), quat, v3(w, 0.07, d));
      roofSlab.setMatrixAt(n, mm);
    });
    roofSlab.count = list.length;
    roofSlab.castShadow = true;
    roofSlab.receiveShadow = true;
    town.add(roofSlab);
  }

  const stairGeo = new THREE.BoxGeometry(0.4, 0.22, 0.4);
  const stairs = new THREE.InstancedMesh(stairGeo, brickMat, 40);
  for (let s = 0; s < 40; s++) {
    const x = -17 + rand() * 25;
    const z = -15 + rand() * 17;
    m.compose(v3(x, 0.11, z), q.identity(), v3(1, 1, 1));
    stairs.setMatrixAt(s, m);
  }
  town.add(stairs);
  city.add(town);

  const citadel = new THREE.Mesh(new THREE.BoxGeometry(9, 1.4, 7), brickMat);
  citadel.position.set(-4, 0.7, -6);
  citadel.receiveShadow = citadel.castShadow = true;
  city.add(citadel);

  const granary = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 3.2), brickMat);
  granary.position.set(-5.8, 2.15, -7);
  city.add(granary);
  const granaryRoof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 3.5), mulMat(0x6f4c31));
  granaryRoof.position.set(-5.8, 2.95, -7);
  city.add(granaryRoof);

  const bath = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.6, 5.8), brickMat);
  platform.position.y = 0.3;
  bath.add(platform);
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x1f5559, roughness: 0.08, metalness: 0.72 });
  const pool = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 3.8), poolMat);
  pool.position.y = 0.66;
  bath.add(pool);
  for (let s = 0; s < 5; s++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(5.2 - s * 0.15, 0.12, 0.5), brickMat);
    step.position.set(0, 0.1 + s * 0.12, -2.3 + s * 0.28);
    bath.add(step);
  }
  for (const [x, z, w, d] of [[0, -2.15, 7.8, 0.35], [0, 2.15, 7.8, 0.35], [-3.75, 0, 0.35, 4.2], [3.75, 0, 0.35, 4.2]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.62, d), brickMat);
    wall.position.set(x, 0.92, z);
    bath.add(wall);
  }
  bath.position.set(3.4, 0, -3.6);
  city.add(bath);

  for (let p = 0; p < 2; p++) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.2), brickMat);
    plinth.position.set(5 + p * 3.2, 0.25, -9 + p * 1.5);
    city.add(plinth);
    const building = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.7), brickMat);
    building.position.set(5 + p * 3.2, 1.3, -9 + p * 1.5);
    city.add(building);
  }
  shadowAll(city);
  scene.add(city);

  for (let t = 0; t < 9; t++) {
    const tr = tree({ h: 1.6 + rand() * 1.2, leaf: 0x5b6440 });
    tr.position.set(-30 + rand() * 24, 0, 3 + rand() * 8);
    scene.add(tr);
  }

  for (let p = 0; p < 26; p++) {
    const fig = person({ h: 1 + rand() * 0.2, color: 0x5c3f2a, robe: rand() < 0.5 ? 0x7d5b3a : null });
    fig.position.set(-15 + rand() * 22, 0, -14 + rand() * 16);
    scene.add(fig);
  }

  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 48), new THREE.MeshStandardMaterial({
    map: sealTexture(), roughness: 0.66, metalness: 0.08, color: 0xffffff,
  }));
  seal.rotation.x = Math.PI / 2;
  seal.position.set(10.6, 2.0, 4.4);
  seal.rotation.z = -0.16;
  seal.castShadow = true;
  scene.add(seal);
  const sealGlow = glowSprite(0xffc978, 2.4, 0.22);
  sealGlow.position.copy(seal.position);
  scene.add(sealGlow);

  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 0.8), mulMat(0x5b4026, { roughness: 0.95 }));
  hull.position.y = 0.12;
  boat.add(hull);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), mulMat(0xd9c39b, { side: THREE.DoubleSide }));
  sail.position.set(0.1, 0.9, 0);
  sail.rotation.y = 0.4;
  boat.add(sail);
  boat.position.set(-9, 0.05, 7.6);
  boat.scale.setScalar(0.8);
  boat.rotation.y = -0.2;
  scene.add(boat);

  const reedGeo = new THREE.ConeGeometry(0.035, 0.85, 4);
  const reeds = new THREE.InstancedMesh(reedGeo, mulMat(0x7f7a42, { roughness: 1 }), 150);
  const rm = new THREE.Matrix4();
  for (let r = 0; r < 150; r++) {
    const x = -22 + rand() * 46;
    const near = rand() < 0.55;
    const z = near ? 4.7 + rand() * 0.8 : 11.6 + rand() * 1.1;
    rm.compose(v3(x, 0.42, z), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), rand() * TAU), v3(0.7 + rand() * 0.6, 0.7 + rand() * 0.9, 0.7 + rand() * 0.6));
    reeds.setMatrixAt(r, rm);
  }
  scene.add(reeds);

  for (const gx of [-13, 12.5]) {
    for (let st = 0; st < 4; st++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 0.85), brickMat);
      step.position.set(gx, 0.1 - st * 0.02, 5.2 - st * 0.75);
      step.receiveShadow = true;
      scene.add(step);
    }
  }

  const motes = dust({ count: 170, area: [38, 10, 34], center: [0, 2, -2], color: 0xffd9a0, size: 0.06, opacity: 0.32, speed: 0.5 });
  scene.add(motes);
  const birds = dust({ count: 16, area: [30, 12, 24], center: [0, 10, -12], color: 0x2b2018, size: 0.07, opacity: 0.45, speed: 0.25, additive: false });
  scene.add(birds);

  const sunGlow = glowSprite(0xffcf90, 26, 0.5);
  sunGlow.position.set(-30, 4, -46);
  scene.add(sunGlow);

  const waterGlints = [];
  for (let g = 0; g < 26; g++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), new THREE.MeshBasicMaterial({
      color: 0xffe2b0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(-24 + rand() * 50, 0.05, 6.5 + rand() * 5);
    scene.add(s);
    waterGlints.push(s);
  }

  const keys = [
    { t: 0, pos: [26, 12, 28], look: [-1, 2.2, -4] },
    { t: 7, pos: [17, 5.4, 16], look: [-2, 2.2, -5] },
    { t: 14, pos: [11, 4.4, 15.5], look: [-1.5, 2.1, -5.5] },
  ];

  return {
    scene, camera: cam, duration: 14,
    update(t) {
      shot(cam, t, keys, { drift: 0.05 });
      motes.userData.update(t);
      birds.userData.update(t * 2.4);
      seal.rotation.z = Math.sin(t * 0.4) * 0.05 - 0.16;
      seal.position.y = 2.0 + Math.sin(t * 0.7) * 0.1;
      sealGlow.position.y = seal.position.y;
      sealGlow.material.opacity = 0.22 + Math.sin(t * 0.9) * 0.04;
      boat.position.y = 0.03 + Math.sin(t * 1.4) * 0.045;
      boat.rotation.z = Math.sin(t * 1.1) * 0.02;
      waterGlints.forEach((s, idx) => {
        s.material.opacity = 0.18 + Math.abs(Math.sin(t * 1.6 + idx * 1.7)) * 0.42;
      });
    },
  };
}

/* ================================================================== *
 * 02 · VEDIC AGE
 * ================================================================== */

function buildVedic(renderer) {
  const cam = camera();
  const scene = setupScene(renderer, cam, {
    top: 0x263a57, bottom: 0xf5a95f, sunDir: [0.35, 0.45, 0.82],
    skySunDir: [0.08, 0.05, -1], sunColor: 0xffc078, sunIntensity: 1.7, hemi: 0.62,
    fillColor: 0xffd7b0, fillIntensity: 0.7, fillDir: [0.2, 0.45, 1],
    fog: 0x8c5e3c, fogDensity: 0.016, shadows: true, shadowExtent: 22,
    envTop: '#3d4f6b', envBottom: '#f6b06a', envGround: '#4b3a27', envIntensity: 0.65,
    envSun: '#ffcf94', sunPower: 900, sunStrength: 1.1, glow: 0.24,
  });
  const grass = noiseTexture({ base: [103, 100, 62], amount: 18, repeat: [18, 18], seed: 5 });
  scene.add(ground({ size: 150, texture: grass, roughness: 1 }));

  const rand = seeded(31);
  for (let h = 0; h < 9; h++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(8 + rand() * 12, 2 + rand() * 4, 7), mulMat(0x4d4a33, { roughness: 1 }));
    hill.position.set(-60 + rand() * 120, 0.5, -35 - rand() * 30);
    scene.add(hill);
  }

  const sun = new THREE.Mesh(new THREE.SphereGeometry(4.6, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffd9a2 }));
  sun.position.set(1, 5.6, -58);
  scene.add(sun);
  const sunHalo = glowSprite(0xffc37a, 46, 0.5);
  sunHalo.position.copy(sun.position);
  scene.add(sunHalo);

  const altar = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({
    map: brickTexture({ base: [136, 82, 52], mortar: [178, 143, 102], repeat: [2, 1] }),
    roughness: 0.95,
  });
  for (let i = 0; i < 3; i++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(3.4 - i * 0.6, 0.34, 3.4 - i * 0.6), brick);
    tier.position.y = 0.17 + i * 0.34;
    tier.castShadow = tier.receiveShadow = true;
    altar.add(tier);
  }
  const fire = flame(1.0);
  fire.position.y = 1.08;
  altar.add(fire);
  const emberLight = new THREE.PointLight(0xff9a44, 6, 14, 2);
  emberLight.position.set(0, 2, 0);
  altar.add(emberLight);
  scene.add(altar);

  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * TAU + 0.3;
    const p = person({ h: 1.0, color: 0x4d3521, robe: 0x8a6a42 });
    p.position.set(Math.cos(a) * 3.5, 0, Math.sin(a) * 3.5);
    p.rotation.y = -a + Math.PI / 2;
    scene.add(p);
  }

  for (let h = 0; h < 7; h++) {
    const hut = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 1.1, 9), mulMat(0x8a6c48, { roughness: 1 }));
    base.position.y = 0.55;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.4, 9), mulMat(0x6d5735, { roughness: 1 }));
    roof.position.y = 1.7;
    hut.add(base, roof);
    hut.position.set(-22 + rand() * 44, 0, -18 - rand() * 16);
    hut.rotation.y = rand() * TAU;
    hut.scale.setScalar(0.72 + rand() * 0.25);
    scene.add(hut);
  }
  for (let t = 0; t < 14; t++) {
    const a = (t / 14) * TAU + rand() * 0.35;
    const r = 13 + rand() * 13;
    const tr = tree({ h: 2.1 + rand() * 1.7, leaf: 0x4c5533 });
    tr.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 3);
    scene.add(tr);
  }

  const tuftGeo = new THREE.ConeGeometry(0.055, 0.38, 4);
  const tufts = new THREE.InstancedMesh(tuftGeo, mulMat(0x5c6338, { roughness: 1 }), 240);
  const tm = new THREE.Matrix4();
  for (let i = 0; i < 240; i++) {
    const a = rand() * TAU;
    const r = 5 + rand() * 26;
    tm.compose(v3(Math.cos(a) * r, 0.17, Math.sin(a) * r - 3), new THREE.Quaternion(), v3(0.7 + rand() * 0.8, 0.7 + rand() * 1.2, 0.7 + rand() * 0.8));
    tufts.setMatrixAt(i, tm);
  }
  scene.add(tufts);

  const mantraTex = textTexture('agnim īḷe', { color: '#fff0d2', font: `italic 500 72px ${SERIF}`, width: 1024, height: 192 });
  const mantra = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.16), new THREE.MeshBasicMaterial({
    map: mantraTex, transparent: true, opacity: 0.66, depthWrite: false,
  }));
  mantra.position.set(0, 3.45, -2.6);
  scene.add(mantra);

  const vedaTex = textTexture('ṚG VEDA  ·  1500 BCE', { color: '#ffe9c4', font: `600 40px Inter, sans-serif`, width: 1024, height: 128, letter: 10 });
  const veda = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.58), new THREE.MeshBasicMaterial({
    map: vedaTex, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  veda.position.set(0, 2.82, -2.6);
  scene.add(veda);

  const smoke = dust({ count: 130, area: [1.8, 9, 1.8], center: [0, 1.5, 0], color: 0x9b8a76, size: 0.16, opacity: 0.3, speed: 0.85, additive: false });
  scene.add(smoke);
  const sparks = dust({ count: 130, area: [2.4, 5, 2.4], center: [0, 1.5, 0], color: 0xffb05a, size: 0.06, opacity: 0.9, speed: 1.5 });
  scene.add(sparks);
  const pollen = dust({ count: 220, area: [30, 8, 26], center: [0, 2, 0], color: 0xffd08a, size: 0.065, opacity: 0.45, speed: 0.35 });
  scene.add(pollen);

  const keys = [
    { t: 0, pos: [8.4, 1.5, 10.2], look: [0, 1.7, 0] },
    { t: 5.5, pos: [5.8, 2.4, 7.2], look: [0, 1.8, 0] },
    { t: 12, pos: [-4.6, 3.4, 8.8], look: [0, 2.2, 0] },
  ];

  return {
    scene, camera: cam, duration: 12,
    update(t) {
      shot(cam, t, keys, { drift: 0.035 });
      smoke.userData.update(t);
      sparks.userData.update(t * 1.8);
      pollen.userData.update(t);
      fire.userData.update(t);
      emberLight.intensity = 7 + Math.sin(t * 13) * 1.6 + Math.sin(t * 27) * 0.9;
      mantra.position.y = 3.45 + Math.sin(t * 0.5 + 1) * 0.08;
      sun.position.y = 5.6 + t * 0.04;
      sunHalo.position.y = sun.position.y;
      sunHalo.material.opacity = 0.5 + Math.sin(t * 0.4) * 0.05;
    },
  };
}

/* ================================================================== *
 * 03 · MAURYA EMPIRE
 * ================================================================== */

function buildMaurya(renderer) {
  const cam = camera();
  const scene = setupScene(renderer, cam, {
    top: 0x17233a, bottom: 0xd8945a, sunDir: [0.7, 0.55, 0.45],
    skySunDir: [0.78, 0.12, -0.6], sunColor: 0xffc184, sunIntensity: 2.0, hemi: 0.62,
    fillColor: 0xffcfa0, fillIntensity: 0.75, fillDir: [0.4, 0.4, 1],
    fog: 0x634330, fogDensity: 0.013, shadows: true, shadowExtent: 26,
    envTop: '#283550', envBottom: '#d79a63', envGround: '#43301f', envIntensity: 0.65,
    envSun: '#ffd49b', sunPower: 700, sunStrength: 1.1, glow: 0.2,
  });
  scene.add(stars(700, 150, 0xdfe9ff, 0.38));
  const soil = noiseTexture({ base: [108, 90, 65], amount: 20, repeat: [20, 20], seed: 8 });
  scene.add(ground({ size: 150, texture: soil, roughness: 1, color: 0xb29a76 }));

  const stone = new THREE.MeshStandardMaterial({
    color: 0xc09762, roughness: 0.44, metalness: 0.16,
    map: marbleTexture({ base: [196, 156, 105], repeat: [2, 2], seed: 8 }),
  });

  const rand = seeded(47);
  for (let h = 0; h < 8; h++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(10 + rand() * 14, 3 + rand() * 5, 6), mulMat(0x6b533a, { roughness: 1 }));
    hill.position.set(-70 + rand() * 140, 0.4, -46 - rand() * 28);
    scene.add(hill);
  }

  const pillar = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), stone);
  plinth.position.y = 0.25;
  pillar.add(plinth);
  const plinth2 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 2.1), stone);
  plinth2.position.y = 0.72;
  pillar.add(plinth2);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.36, 8.4, 40), stone);
  shaft.position.y = 5.1;
  pillar.add(shaft);
  const bellProfile = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    bellProfile.push(new THREE.Vector2(0.95 - Math.pow(t, 1.7) * 0.6, t * 1.15));
  }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellProfile, 40), stone);
  bell.position.y = 9.25;
  pillar.add(bell);
  const abacus = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.0, 0.36, 40), stone);
  abacus.position.y = 10.55;
  pillar.add(abacus);
  const chakraSmall = makeChakra({ radius: 0.42, tube: 0.03, color: 0xc99b5c, metalness: 0.5, emissive: 0x3a2408 });
  chakraSmall.rotation.x = Math.PI / 2;
  chakraSmall.position.y = 10.56;
  chakraSmall.rotation.z = Math.PI / 2;
  pillar.add(chakraSmall);

  const lionMat = new THREE.MeshStandardMaterial({ color: 0xd0a869, roughness: 0.4, metalness: 0.28 });
  for (let i = 0; i < 4; i++) {
    const lion = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.23, 0.44, 8), lionMat);
    body.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lionMat);
    head.position.set(0, 0.52, 0.06);
    const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 7), lionMat);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.5, 0.2);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 6, 12), lionMat);
    mane.position.set(0, 0.52, 0.02);
    const earL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), lionMat);
    earL.position.set(-0.12, 0.66, 0.02);
    const earR = earL.clone();
    earR.position.x = 0.12;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.1), lionMat);
    leg.position.set(-0.1, 0.06, 0.16);
    const leg2 = leg.clone();
    leg2.position.x = 0.1;
    lion.add(body, head, muzzle, mane, earL, earR, leg, leg2);
    lion.position.y = 10.95;
    lion.rotation.y = (i / 4) * TAU;
    lion.position.x = Math.sin((i / 4) * TAU) * 0.34;
    lion.position.z = Math.cos((i / 4) * TAU) * 0.34;
    lion.scale.setScalar(0.85);
    pillar.add(lion);
  }
  pillar.position.set(-3.4, 0, 1.2);
  pillar.rotation.y = 0.22;
  shadowAll(pillar);
  scene.add(pillar);
  const pillarLight = new THREE.PointLight(0xffb15e, 12, 16, 2);
  pillarLight.position.set(-1.5, 3.2, 4);
  scene.add(pillarLight);

  const haloChakra = makeChakra({
    radius: 2.9, tube: 0.07, spokes: 24, color: 0xa8722e, metalness: 0.6, emissive: 0x8d5217,
  });
  haloChakra.position.set(2.6, 5.6, -6.2);
  haloChakra.rotation.z = -0.08;
  scene.add(haloChakra);
  const halo = glowSprite(0xffb95e, 15, 0.34);
  halo.position.copy(haloChakra.position);
  scene.add(halo);

  const map = indiaMesh({ scale: 0.098, depth: 0.06, color: 0xb98a3e, edge: 0xffdd94, emissive: 0x5a3f14 });
  map.position.set(9.2, 3.5, 0.4);
  map.rotation.x = Math.PI / 2 - 0.14;
  scene.add(map);
  const mapGlow = glowSprite(0xffb95e, 5.5, 0.11);
  mapGlow.position.set(9.2, 3.3, 0.3);
  scene.add(mapGlow);

  const spears = new THREE.Group();
  const spearGeo = new THREE.CylinderGeometry(0.012, 0.02, 3.4, 5);
  const spearMat = mulMat(0x3b2f22, { roughness: 0.7 });
  const spearInst = new THREE.InstancedMesh(spearGeo, spearMat, 90);
  const flagGeo = new THREE.PlaneGeometry(0.34, 0.5);
  const flagMat = mulMat(0xb4602e, { side: THREE.DoubleSide, roughness: 0.9 });
  const flagInst = new THREE.InstancedMesh(flagGeo, flagMat, 90);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 90; i++) {
    const x = -16 + (i % 15) * 1.9 + rand() * 0.5;
    const z = -14 - Math.floor(i / 15) * 1.7 + rand() * 0.4;
    m.compose(v3(x, 1.7, z), q.identity(), v3(1, 1, 1));
    spearInst.setMatrixAt(i, m);
    m.compose(v3(x + 0.19, 3.15, z), q.identity(), v3(1, 1, 1));
    flagInst.setMatrixAt(i, m);
  }
  spears.add(spearInst, flagInst);
  scene.add(spears);

  for (let s = 0; s < 6; s++) {
    const stoneBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.1, 5), stone);
    stoneBlock.position.set(10.5 + rand() * 3.5, 0.42, -4.5 + rand() * 4);
    stoneBlock.scale.setScalar(0.7 + rand() * 0.25);
    stoneBlock.rotation.set(rand() * 0.2, rand() * TAU, rand() * 0.15);
    scene.add(stoneBlock);
  }

  const motes = dust({ count: 200, area: [30, 10, 28], center: [0, 3, -2], color: 0xffcf94, size: 0.07, opacity: 0.4, speed: 0.4 });
  scene.add(motes);

  const keys = [
    { t: 0, pos: [19, 7.2, 27], look: [-0.5, 5.4, -2] },
    { t: 7, pos: [13.5, 5.8, 21], look: [0, 5.4, -2] },
    { t: 14, pos: [7.5, 5.4, 20.5], look: [2.2, 5.8, -3] },
  ];

  return {
    scene, camera: cam, duration: 14,
    update(t) {
      shot(cam, t, keys, { drift: 0.045 });
      motes.userData.update(t);
      haloChakra.rotation.z = -0.08 + t * 0.14;
      chakraSmall.rotation.z = Math.PI / 2 + t * 0.3;
      halo.material.opacity = 0.34 + Math.sin(t * 0.8) * 0.06;
      map.position.y = 3.5 + Math.sin(t * 0.55) * 0.1;
      map.rotation.z = Math.sin(t * 0.3) * 0.035;
      mapGlow.position.y = map.position.y - 0.2;
      flagInst.rotation.y = Math.sin(t * 1.4) * 0.04;
    },
  };
}

/* ================================================================== *
 * 04 · GUPTA GOLDEN AGE
 * ================================================================== */

function buildGupta(renderer) {
  const cam = camera();
  const scene = setupScene(renderer, cam, {
    top: 0x202744, bottom: 0xe5a665, sunDir: [0.45, 0.5, 0.72],
    skySunDir: [0.55, 0.3, -0.72], sunColor: 0xffcf90, sunIntensity: 1.9, hemi: 0.64,
    fillColor: 0xffd9ad, fillIntensity: 0.75, fillDir: [0.3, 0.5, 1],
    fog: 0x7b5636, fogDensity: 0.011, shadows: true, shadowExtent: 28,
    envTop: '#3b4166', envBottom: '#eab070', envGround: '#5b452d', envIntensity: 0.65,
    envSun: '#ffdca4', sunPower: 800, sunStrength: 1.2, glow: 0.2,
  });
  scene.add(stars(800, 150, 0xdfe9ff, 0.35));

  const court = canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#a2825b';
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(12);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(${70 + rand() * 80},${55 + rand() * 60},${40 + rand() * 40},0.12)`;
      ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 6, 2 + rand() * 6);
    }
    const cx = w / 2;
    const cy = h / 2;
    for (let ring = 0; ring < 4; ring++) {
      ctx.strokeStyle = 'rgba(70,44,22,0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 90 + ring * 80, 0, TAU);
      ctx.stroke();
      for (let p = 0; p < 16; p++) {
        const a = (p / 16) * TAU;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (90 + ring * 80), cy + Math.sin(a) * (90 + ring * 80), 9, 0, TAU);
        ctx.stroke();
      }
    }
  }, { wrap: false });
  const groundMesh = ground({ size: 130, texture: court, roughness: 1, color: 0xe8d7bd });
  scene.add(groundMesh);

  const sand = new THREE.MeshStandardMaterial({
    color: 0xd9b98a, roughness: 0.62, metalness: 0.1,
    map: marbleTexture({ base: [214, 188, 148], repeat: [2, 2], seed: 15 }),
  });
  const sandDark = new THREE.MeshStandardMaterial({
    color: 0xc49a6a, roughness: 0.72, metalness: 0.08,
    map: marbleTexture({ base: [198, 164, 120], repeat: [2, 2], seed: 17 }),
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0xa87c4c, roughness: 0.75, metalness: 0.06 });

  const temple = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(9, 0.55, 9), sandDark);
  platform.position.y = 0.27;
  temple.add(platform);
  const platformTrim = new THREE.Mesh(new THREE.BoxGeometry(9.35, 0.16, 9.35), trim);
  platformTrim.position.y = 0.12;
  temple.add(platformTrim);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 6.4), sand);
  plinth.position.y = 1.05;
  temple.add(plinth);
  const plinthTrim = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 6.8), trim);
  plinthTrim.position.y = 1.56;
  temple.add(plinthTrim);
  const sanctum = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.1, 4.6), sand);
  sanctum.position.y = 3.15;
  temple.add(sanctum);
  const sanctumBand = new THREE.Mesh(new THREE.BoxGeometry(4.86, 0.2, 4.86), trim);
  sanctumBand.position.y = 1.78;
  temple.add(sanctumBand);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(5.05, 0.3, 5.05), sandDark);
  cornice.position.y = 4.78;
  temple.add(cornice);

  for (const [x, z] of [[-2.05, 2.06], [2.05, 2.06], [-2.05, -2.06], [2.05, -2.06]]) {
    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.9, 0.3), sandDark);
    pilaster.position.set(x, 3.3, z);
    temple.add(pilaster);
  }

  const door = new THREE.Mesh(
    new THREE.ExtrudeGeometry(archShape(1.5, 2.3, 0.6), { depth: 0.16, bevelEnabled: false }),
    mulMat(0x251710, { roughness: 0.9 })
  );
  door.position.set(0, 1.62, 2.3);
  temple.add(door);

  for (const side of [-1, 1]) {
    const niche = new THREE.Mesh(
      new THREE.ExtrudeGeometry(archShape(0.7, 1.35, 0.6), { depth: 0.1, bevelEnabled: false }),
      mulMat(0x3a2416, { roughness: 0.9 })
    );
    niche.position.set(side * 1.55, 1.62, 2.28);
    temple.add(niche);
    const nicheFrame = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.12), sandDark);
    nicheFrame.position.set(side * 1.55, 3.04, 2.3);
    temple.add(nicheFrame);
  }

  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const size = 4.3 - Math.pow(t, 0.92) * 3.0;
    const block = new THREE.Mesh(new THREE.BoxGeometry(size, 0.3, size), i % 3 === 0 ? sandDark : sand);
    block.position.y = 4.98 + i * 0.285;
    temple.add(block);
    if (i % 3 === 0) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(size + 0.08, 0.07, size + 0.08), trim);
      rib.position.y = block.position.y - 0.1;
      temple.add(rib);
    }
  }
  const amalaka = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.34, 32), sandDark);
  amalaka.position.y = 10.12;
  temple.add(amalaka);
  const amalakaRim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.09, 8, 40), trim);
  amalakaRim.rotation.x = Math.PI / 2;
  amalakaRim.position.y = 10.12;
  temple.add(amalakaRim);
  const kalashaMat = new THREE.MeshStandardMaterial({
    color: 0xe5bd74, metalness: 0.82, roughness: 0.24, emissive: 0x6a4414, emissiveIntensity: 0.45,
  });
  const kalasha = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), kalashaMat);
  kalasha.position.y = 10.55;
  temple.add(kalasha);
  const kalashaRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 6, 16), kalashaMat);
  kalashaRing.rotation.x = Math.PI / 2;
  kalashaRing.position.y = 10.8;
  temple.add(kalashaRing);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.62, 10), kalashaMat);
  finial.position.y = 10.98;
  temple.add(finial);

  const miniShrine = (x, z, s = 1) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.5, 1.25), sand);
    base.position.y = 0.75;
    g.add(base);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 1.4), trim);
    band.position.y = 1.5;
    g.add(band);
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const size = 1.1 - t * 0.72;
      const block = new THREE.Mesh(new THREE.BoxGeometry(size, 0.22, size), i % 2 ? sand : sandDark);
      block.position.y = 1.68 + i * 0.22;
      g.add(block);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 18), sandDark);
    cap.position.y = 3.0;
    g.add(cap);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 8), kalashaMat);
    top.position.y = 3.24;
    g.add(top);
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    return g;
  };

  for (const [x, z] of [[-3.55, -3.55], [3.55, -3.55], [-3.55, 3.55], [3.55, 3.55]]) {
    temple.add(miniShrine(x, z, 0.82));
  }

  for (let s = 0; s < 4; s++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.1 - s * 0.18, 0.28, 0.42), s % 2 ? sandDark : sand);
    step.position.set(0, 1.5 - s * 0.27, 3.45 + s * 0.4);
    temple.add(step);
  }
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.7 + s * 0.34, 0.18, 0.48), s % 2 ? sandDark : sand);
    step.position.set(0, 0.46 - s * 0.17, 5.0 + s * 0.42);
    temple.add(step);
  }

  temple.position.set(0, 0, -3);
  shadowAll(temple);
  scene.add(temple);

  const path = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 11), new THREE.MeshStandardMaterial({
    color: 0xc3a276, roughness: 0.9,
    map: marbleTexture({ base: [196, 166, 128], repeat: [1, 4], seed: 19 }),
  }));
  path.position.set(0, 0.03, 8.2);
  path.receiveShadow = true;
  scene.add(path);

  const doorLight = new THREE.PointLight(0xff9a42, 5, 7, 2);
  doorLight.position.set(0, 2.2, -0.45);
  scene.add(doorLight);
  const doorGlow = glowSprite(0xff9a42, 1.8, 0.34);
  doorGlow.position.set(0, 2.0, -0.4);
  scene.add(doorGlow);

  const zero = makeChakra({ radius: 1.5, tube: 0.14, spokes: 0, color: 0xd8a34a, metalness: 0.7, emissive: 0x8a5210 });
  zero.position.set(6.4, 4.7, 1.8);
  zero.rotation.y = -0.35;
  scene.add(zero);
  const zeroGlow = glowSprite(0xffc46a, 7, 0.24);
  zeroGlow.position.copy(zero.position);
  scene.add(zeroGlow);

  const numerals = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  const numeralGroup = new THREE.Group();
  numerals.forEach((n, i) => {
    const tex = textTexture(n, { color: '#ffd998', font: `400 150px ${DEVA}`, width: 256, height: 256 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    const a = (i / numerals.length) * TAU;
    mesh.position.set(Math.cos(a) * 2.5, Math.sin(a) * 1.1, Math.sin(a) * 2.5);
    mesh.lookAt(0, mesh.position.y, 0);
    numeralGroup.add(mesh);
  });
  numeralGroup.position.set(6.4, 4.7, 1.8);
  scene.add(numeralGroup);

  const armillary = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xd8ab60, metalness: 0.75, roughness: 0.3, emissive: 0x4a2f0d, emissiveIntensity: 0.35 });
  for (let r = 0; r < 3; r++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5 + r * 0.18, 0.035, 8, 96), ringMat);
    if (r === 0) ring.rotation.x = Math.PI / 2;
    if (r === 1) ring.rotation.y = Math.PI / 2;
    if (r === 2) ring.rotation.z = Math.PI / 2;
    armillary.add(ring);
  }
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), new THREE.MeshStandardMaterial({
    color: 0x2b3a52, metalness: 0.4, roughness: 0.2, emissive: 0x1c2c46, emissiveIntensity: 0.8,
  }));
  armillary.add(sphere);
  armillary.position.set(-6.4, 3.6, 1.8);
  scene.add(armillary);

  for (const side of [-1, 1]) {
    const lamp = new THREE.PointLight(0xff7a26, 4.5, 9, 2);
    lamp.position.set(side * 3.4, 1.8, 2.1);
    scene.add(lamp);
    const flameGlow = glowSprite(0xff5208, 1.0, 0.45);
    flameGlow.position.set(side * 3.4, 1.62, 2.1);
    scene.add(flameGlow);
    const flameCore = glowSprite(0xff9a3c, 0.3, 0.7);
    flameCore.position.set(side * 3.4, 1.64, 2.1);
    scene.add(flameCore);
    const flameTip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 6), new THREE.MeshBasicMaterial({ color: 0xff8a24 }));
    flameTip.position.set(side * 3.4, 1.64, 2.1);
    scene.add(flameTip);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xb08040, metalness: 0.7, roughness: 0.35 }));
    bowl.position.set(side * 3.4, 1.3, 2.1);
    scene.add(bowl);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 8), bowl.material);
    stem.position.set(side * 3.4, 0.6, 2.1);
    scene.add(stem);
  }

  const groveRand = seeded(23);
  for (let t = 0; t < 12; t++) {
    const tr = tree({ h: 2.4 + groveRand() * 1.8, leaf: 0x4f5535, spread: 0.9 });
    tr.position.set(-26 + groveRand() * 52, 0, -22 - groveRand() * 14);
    scene.add(tr);
  }
  for (let h = 0; h < 5; h++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(11 + groveRand() * 12, 2.5 + groveRand() * 3.5, 7), mulMat(0x6b5638, { roughness: 1 }));
    hill.position.set(-55 + groveRand() * 110, 0.4, -42 - groveRand() * 14);
    scene.add(hill);
  }

  const pollen = dust({ count: 260, area: [30, 12, 28], center: [0, 3, -2], color: 0xffd79a, size: 0.07, opacity: 0.55, speed: 0.35 });
  scene.add(pollen);

  const keys = [
    { t: 0, pos: [17, 6.6, 25], look: [0, 5.2, -2.6] },
    { t: 6, pos: [8, 3.8, 17], look: [0, 5.4, -2.6] },
    { t: 12, pos: [-12, 6.4, 20], look: [0.4, 5.0, -2.4] },
  ];

  return {
    scene, camera: cam, duration: 12,
    update(t) {
      shot(cam, t, keys, { drift: 0.04 });
      pollen.userData.update(t);
      zero.rotation.z = t * 0.2;
      zero.position.y = 4.7 + Math.sin(t * 0.6) * 0.14;
      zeroGlow.position.y = zero.position.y;
      numeralGroup.rotation.y = t * 0.28;
      numeralGroup.position.y = 4.7 + Math.sin(t * 0.6) * 0.14;
      armillary.rotation.y = t * 0.32;
      armillary.rotation.x = Math.sin(t * 0.3) * 0.18;
      temple.children.forEach((c) => {
        if (c.material && c.material.emissive) c.material.emissiveIntensity = 0.3 + Math.sin(t * 0.5) * 0.05;
      });
    },
  };
}

/* ================================================================== *
 * 05 · MUGHAL ERA
 * ================================================================== */

function buildMughal(renderer) {
  const cam = camera();
  const scene = setupScene(renderer, cam, {
    top: 0x2f3d59, bottom: 0xf2ae8e, sunDir: [0.6, 0.55, 0.5],
    skySunDir: [-0.62, 0.18, -0.7], sunColor: 0xffceb0, sunIntensity: 1.8, hemi: 0.66,
    fillColor: 0xffd6c2, fillIntensity: 0.7, fillDir: [0.2, 0.5, 1],
    fog: 0xc58f76, fogDensity: 0.008, shadows: true, shadowExtent: 32,
    envTop: '#56617a', envBottom: '#f6c2a6', envGround: '#4c5a3a', envIntensity: 0.75,
    envSun: '#ffe3c8', sunPower: 700, sunStrength: 1.2, glow: 0.2,
  });

  const lawn = noiseTexture({ base: [77, 94, 58], amount: 12, repeat: [16, 16], seed: 9 });
  scene.add(ground({ size: 150, texture: lawn, roughness: 1, color: 0xc8cfb9 }));

  const marbleMap = marbleTexture({ base: [240, 234, 222], repeat: [2, 2], seed: 6 });
  const marble = new THREE.MeshStandardMaterial({
    map: marbleMap, color: 0xffffff, roughness: 0.34, metalness: 0.06,
    envMapIntensity: 0.9,
  });
  const darkMarble = new THREE.MeshStandardMaterial({ color: 0x2b2320, roughness: 0.6 });

  const taj = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(15, 0.9, 11), marble);
  plinth.position.y = 0.45;
  taj.add(plinth);

  const base = new THREE.Mesh(new THREE.BoxGeometry(8.6, 5.4, 7.4), marble);
  base.position.y = 3.6;
  taj.add(base);

  const cornice = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.28, 7.9), marble);
  cornice.position.y = 6.38;
  taj.add(cornice);

  const archMain = new THREE.Mesh(
    new THREE.ExtrudeGeometry(archShape(2.6, 4.0, 0.58), { depth: 0.18, bevelEnabled: false }),
    darkMarble
  );
  archMain.position.set(0, 1.9, 3.7);
  taj.add(archMain);
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 0.4), marble);
  frameTop.position.set(0, 6.2, 3.82);
  taj.add(frameTop);
  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 0.4), marble);
    frame.position.set(side * 2.1, 4, 3.82);
    taj.add(frame);
    const archSide = new THREE.Mesh(
      new THREE.ExtrudeGeometry(archShape(1.5, 3.0, 0.58), { depth: 0.14, bevelEnabled: false }),
      darkMarble
    );
    archSide.position.set(side * 3.05, 2.2, 3.72);
    archSide.rotation.y = 0;
    taj.add(archSide);
  }
  for (const side of [-1, 1]) {
    const backArch = archMain.clone();
    backArch.position.z = -3.7;
    backArch.rotation.y = Math.PI;
    taj.add(backArch);
  }

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 1.15, 40), marble);
  drum.position.y = 7.1;
  taj.add(drum);

  const profile = [
    [2.4, 0], [2.52, 0.3], [2.46, 0.8], [2.2, 1.6], [1.85, 2.4],
    [1.4, 3.2], [0.9, 3.85], [0.45, 4.3], [0.16, 4.5], [0, 4.55],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const dome = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), marble);
  dome.position.y = 7.65;
  taj.add(dome);

  const finialMat = new THREE.MeshStandardMaterial({ color: 0xc9a45e, metalness: 0.8, roughness: 0.28 });
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 8), finialMat);
  finial.position.y = 12.55;
  taj.add(finial);
  const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), finialMat);
  finialBall.position.y = 12.1;
  taj.add(finialBall);

  for (const [x, z] of [[-4.1, -3.4], [4.1, -3.4], [-4.1, 3.4], [4.1, 3.4]]) {
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.6, 20), marble);
    pl.position.set(x, 6.9, z);
    taj.add(pl);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 1.25, 20), marble);
    body.position.set(x, 7.8, z);
    taj.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 12, 0, TAU, 0, Math.PI / 2), marble);
    cap.position.set(x, 8.35, z);
    cap.scale.y = 1.15;
    taj.add(cap);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 8), finialMat);
    spike.position.set(x, 9.15, z);
    taj.add(spike);
    for (let p = 0; p < 4; p++) {
      const a = (p / 4) * TAU + Math.PI / 4;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.2, 6), marble);
      pil.position.set(x + Math.cos(a) * 0.62, 7.8, z + Math.sin(a) * 0.62);
      taj.add(pil);
    }
  }

  for (const [x, z] of [[-6.8, -6.2], [6.8, -6.2], [-6.8, 6.2], [6.8, 6.2]]) {
    const minaret = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.42, 11.4, 20), marble);
    shaft.position.y = 6.6;
    minaret.add(shaft);
    for (let b = 0; b < 3; b++) {
      const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.14, 20), marble);
      balcony.position.y = 3.4 + b * 3.4;
      minaret.add(balcony);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.56, 18, 12, 0, TAU, 0, Math.PI / 2), marble);
    top.position.y = 12.35;
    top.scale.y = 1.3;
    minaret.add(top);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 8), finialMat);
    spike.position.y = 13.1;
    minaret.add(spike);
    minaret.position.set(x, 0.9, z);
    taj.add(minaret);
  }

  taj.position.set(0, 0, -12);
  shadowAll(taj);
  scene.add(taj);

  const pool = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 19), new THREE.MeshStandardMaterial({
    color: 0x4f9aa8, roughness: 0.08, metalness: 0.62, envMapIntensity: 1.4,
    emissive: 0x123238, emissiveIntensity: 0.5,
  }));
  pool.position.set(0, 0.05, 0.6);
  scene.add(pool);
  for (const [x, z, w, d] of [[-2.4, 0.6, 0.6, 19.6], [2.4, 0.6, 0.6, 19.6], [0, -9.1, 4.8, 0.6], [0, 10.3, 4.8, 0.6]]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), marble);
    rim.position.set(x, 0.02, z);
    scene.add(rim);
  }

  for (const side of [-1, 1]) {
    const path = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 26), new THREE.MeshStandardMaterial({ color: 0xd9c8a8, roughness: 0.9 }));
    path.position.set(side * 7.5, 0.02, 1);
    scene.add(path);
  }

  const rand = seeded(53);
  const cypressGeo = new THREE.ConeGeometry(0.55, 4.2, 7);
  const cypressMat = mulMat(0x364a33, { roughness: 1 });
  const cypressCount = 26;
  const cypresses = new THREE.InstancedMesh(cypressGeo, cypressMat, cypressCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < cypressCount; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -8 + Math.floor(i / 2) * 1.35;
    const s2 = 0.55 + rand() * 0.22;
    m.compose(v3(side * (6.3 + rand() * 0.8), 1.5, z), q.identity(), v3(s2, s2, s2));
    cypresses.setMatrixAt(i, m);
  }
  cypresses.castShadow = true;
  scene.add(cypresses);

  const hedgeMat = mulMat(0x3f5233, { roughness: 1 });
  for (const side of [-1, 1]) {
    for (let seg = 0; seg < 3; seg++) {
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.2), hedgeMat);
      hedge.position.set(side * 11, 0.25, -6 + seg * 6);
      scene.add(hedge);
    }
  }

  const jetMat = new THREE.MeshBasicMaterial({ color: 0xd8f1f4, transparent: true, opacity: 0.35 });
  const fountains = [];
  for (let f = 0; f < 4; f++) {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.9, 6), jetMat);
    jet.position.set(0, 0.5, -6 + f * 3.2);
    scene.add(jet);
    fountains.push(jet);
    const splash = glowSprite(0xcdeff5, 0.6, 0.13);
    splash.position.set(0, 0.95, -6 + f * 3.2);
    scene.add(splash);
    fountains.push(splash);
  }

  const birds = new THREE.Group();
  const birdMat = new THREE.LineBasicMaterial({ color: 0x2a2320, transparent: true, opacity: 0.7 });
  for (let b = 0; b < 14; b++) {
    const geo = new THREE.BufferGeometry().setFromPoints([v3(-0.22, 0, 0), v3(0, 0.1, 0), v3(0.22, 0, 0)]);
    const bird = new THREE.Line(geo, birdMat);
    bird.position.set(-14 + rand() * 28, 11 + rand() * 5, -20 + rand() * 16);
    bird.userData.phase = rand() * TAU;
    bird.userData.base = bird.position.clone();
    birds.add(bird);
  }
  scene.add(birds);

  const motes = dust({ count: 200, area: [34, 12, 30], center: [0, 4, -6], color: 0xffe0c0, size: 0.07, opacity: 0.4, speed: 0.3 });
  scene.add(motes);

  const keys = [
    { t: 0, pos: [0, 2.8, 23], look: [0, 5.0, -10] },
    { t: 7, pos: [7, 3.1, 18.5], look: [0, 5.2, -10] },
    { t: 14, pos: [0, 3.4, 14.5], look: [0, 5.2, -11] },
  ];

  return {
    scene, camera: cam, duration: 14,
    update(t) {
      shot(cam, t, keys, { drift: 0.03, driftSpeed: 0.22 });
      motes.userData.update(t);
      birds.children.forEach((b, i) => {
        b.position.x = b.userData.base.x + Math.sin(t * 0.4 + b.userData.phase) * 0.5;
        b.position.y = b.userData.base.y + Math.sin(t * 1.1 + b.userData.phase) * 0.25;
        b.rotation.z = Math.sin(t * 3 + i) * 0.35;
      });
      fountains.forEach((f, i) => {
        if (f.isSprite) {
          f.material.opacity = 0.2 + Math.abs(Math.sin(t * 2.2 + i)) * 0.2;
        } else {
          f.scale.y = 0.85 + Math.sin(t * 2 + i) * 0.18;
        }
      });
      pool.material.roughness = 0.06 + Math.sin(t * 0.5) * 0.01;
    },
  };
}

/* ================================================================== *
 * 06 · FREEDOM & REPUBLIC
 * ================================================================== */

function buildFreedom(renderer) {
  const cam = camera();
  const scene = setupScene(renderer, cam, {
    top: 0x101a2f, bottom: 0xd9783e, sunDir: [0.35, 0.5, 0.8],
    skySunDir: [0.02, 0.07, -1], sunColor: 0xffb87a, sunIntensity: 1.5, hemi: 0.62,
    fillColor: 0xffbf88, fillIntensity: 0.95, fillDir: [0.2, 0.5, 1],
    fog: 0x5c3a2c, fogDensity: 0.012, shadows: true, shadowExtent: 28,
    envTop: '#22304e', envBottom: '#e08c52', envGround: '#3b2c22', envIntensity: 0.7,
    envSun: '#ffd7a0', sunPower: 900, sunStrength: 0.9, glow: 0.22,
  });
  scene.add(stars(1100, 150, 0xdfe9ff, 0.55));
  const plaza = noiseTexture({ base: [72, 62, 51], amount: 14, repeat: [22, 22], seed: 14 });
  scene.add(ground({ size: 150, texture: plaza, roughness: 1, color: 0x9c9184 }));

  const sandstone = new THREE.MeshStandardMaterial({
    color: 0x8f4a34, roughness: 0.85, metalness: 0.05,
    map: brickTexture({ base: [126, 61, 44], mortar: [104, 52, 38], repeat: [5, 2] }),
  });
  const wall = new THREE.Group();
  const wallBody = new THREE.Mesh(new THREE.BoxGeometry(30, 6.4, 2), sandstone);
  wallBody.position.y = 3.2;
  wall.add(wallBody);
  const battlement = crenellations({ width: 30, count: 22, size: 0.65, height: 0.75, material: sandstone });
  battlement.position.set(0, 6.4, 0.6);
  wall.add(battlement);
  for (const side of [-1, 1]) {
    const bastion = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 8.4, 12), sandstone);
    bastion.position.set(side * 15.4, 4.2, 0);
    wall.add(bastion);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.8, 12), sandstone);
    cap.position.set(side * 15.4, 9.2, 0);
    wall.add(cap);
  }
  const archMat = new THREE.MeshStandardMaterial({ color: 0x2a1610, roughness: 0.95 });
  for (let i = 0; i < 7; i++) {
    const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape(2.1, 3.8, 0.6), { depth: 0.2, bevelEnabled: false }), archMat);
    arch.position.set(-12 + i * 4, 0.55, 0.96);
    wall.add(arch);
  }
  wall.position.set(0, 0, -10);
  shadowAll(wall);
  scene.add(wall);

  for (let i = 0; i < 7; i++) {
    const torch = glowSprite(0xff4a0a, 1.2, 0.45);
    torch.position.set(-12 + i * 4, 1.45, -8.75);
    scene.add(torch);
    const torchCore = glowSprite(0xff9a3c, 0.3, 0.7);
    torchCore.position.copy(torch.position);
    scene.add(torchCore);
    const torchLight = new THREE.PointLight(0xff7a26, 2.4, 6, 2);
    torchLight.position.set(-12 + i * 4, 1.55, -8.6);
    scene.add(torchLight);
  }

  const chakraSun = makeChakra({
    radius: 5.3, tube: 0.14, spokes: 24, color: 0x9c5a1c, metalness: 0.65, emissive: 0xff8a24,
  });
  chakraSun.position.set(4.8, 9.6, -16);
  scene.add(chakraSun);
  const chakraGlow = glowSprite(0xff9b3c, 28, 0.44);
  chakraGlow.position.copy(chakraSun.position);
  scene.add(chakraGlow);
  const chakraLight = new THREE.PointLight(0xff9a3c, 20, 36, 2);
  chakraLight.position.set(3.5, 8.5, -13);
  scene.add(chakraLight);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4f3a24, roughness: 0.6, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 13, 10), poleMat);
  pole.position.set(-7.0, 6.5, -7.4);
  scene.add(pole);
  const poleFinial = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({
    color: 0xd8b26a, metalness: 0.9, roughness: 0.25,
  }));
  poleFinial.position.set(-7.0, 13.1, -7.4);
  scene.add(poleFinial);

  const flagW = 8.4;
  const flagH = 5.6;
  const flagGeo = new THREE.PlaneGeometry(flagW, flagH, 46, 28);
  flagGeo.translate(flagW / 2, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({
    map: flagTexture(), side: THREE.DoubleSide, roughness: 0.86, metalness: 0,
    emissive: 0x351808, emissiveIntensity: 0.35,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(-7.0, 10.2, -7.4);
  flag.rotation.y = 0.16;
  scene.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  const crowd = new THREE.Group();
  const rand = seeded(61);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 7, 6), mulMat(0x181410, { roughness: 1 }), 520);
  const bodies = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.52, 6), mulMat(0x211a14, { roughness: 1 }), 520);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 520; i++) {
    const x = (rand() - 0.5) * 34;
    const z = 2 + rand() * 15;
    const h = 0.9 + rand() * 0.25;
    m.compose(v3(x, h * 0.5 + 0.36, z), q.identity(), v3(1, 1, 1));
    heads.setMatrixAt(i, m);
    m.compose(v3(x, h * 0.5, z), q.identity(), v3(1, 1, 1));
    bodies.setMatrixAt(i, m);
  }
  crowd.add(heads, bodies);

  const flaglets = new THREE.Group();
  const fletGeo = new THREE.PlaneGeometry(0.5, 0.32);
  for (let i = 0; i < 46; i++) {
    const tex = i % 3 === 0 ? 0xde7a2e : i % 3 === 1 ? 0xc9c2ae : 0x2c6b47;
    const f = new THREE.Mesh(fletGeo, mulMat(tex, { side: THREE.DoubleSide, roughness: 1 }));
    const x = (rand() - 0.5) * 30;
    const z = 3 + rand() * 13;
    f.position.set(x, 2.2 + rand() * 0.3, z);
    f.rotation.y = (rand() - 0.5) * 0.5;
    flaglets.add(f);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.2, 4), poleMat);
    stick.position.set(x - 0.24, 1.1, z);
    flaglets.add(stick);
  }
  crowd.add(flaglets);
  scene.add(crowd);

  for (let t = 0; t < 6; t++) {
    const tr = tree({ h: 2.2 + rand() * 1.6, leaf: 0x37402b, spread: 0.9 });
    tr.position.set((t % 2 ? 1 : -1) * (20 + rand() * 6), 0, -2 + rand() * 10);
    scene.add(tr);
  }

  const marigold = dust({ count: 260, area: [30, 14, 22], center: [0, 3, 2], color: 0xffa53c, size: 0.08, opacity: 0.75, speed: 0.9 });
  scene.add(marigold);
  const haze = dust({ count: 170, area: [36, 12, 26], center: [0, 4, -2], color: 0xffc38a, size: 0.16, opacity: 0.18, speed: 0.2, additive: false });
  scene.add(haze);

  const keys = [
    { t: 0, pos: [0, 3.8, 21], look: [0, 6.7, -9] },
    { t: 7, pos: [7.5, 4.4, 15], look: [0, 6.9, -9] },
    { t: 15, pos: [0, 5.2, 10.5], look: [0, 7.7, -10] },
  ];

  return {
    scene, camera: cam, duration: 15,
    update(t) {
      shot(cam, t, keys, { drift: 0.05, driftSpeed: 0.24 });
      marigold.userData.update(t);
      haze.userData.update(t);
      chakraSun.rotation.z = t * 0.09;
      chakraGlow.material.opacity = 0.44 + Math.sin(t * 0.9) * 0.07;
      chakraLight.intensity = 20 + Math.sin(t * 1.1) * 3;

      const pos = flagGeo.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        const x = flagBase[i];
        const y = flagBase[i + 1];
        const k = clamp(x / flagW);
        pos[i + 2] =
          Math.sin(x * 1.15 - t * 2.4) * 0.28 * k +
          Math.sin(y * 0.9 + t * 1.7) * 0.16 * k +
          Math.sin(x * 2.3 + y * 1.4 - t * 3.3) * 0.05 * k;
        pos[i] = flagBase[i] - k * k * 0.12 * Math.sin(t * 1.2);
      }
      flagGeo.attributes.position.needsUpdate = true;
      flagGeo.computeVertexNormals();

      crowd.position.y = Math.sin(t * 1.6) * 0.03;
      flaglets.rotation.y = Math.sin(t * 0.8) * 0.03;
    },
  };
}

/* ================================================================== *
 * 07 · EPILOGUE
 * ================================================================== */

function buildEpilogue(renderer) {
  const cam = camera();
  const scene = setupScene(renderer, cam, {
    top: 0x060b16, bottom: 0x1c2b3f, sunDir: [0.2, 0.3, -0.9],
    sunColor: 0x8fb6e0, sunIntensity: 1.0, hemi: 0.42,
    fillColor: 0xa9c8ea, fillIntensity: 1.05, fillDir: [0.45, 0.35, 1],
    fog: 0x0a1220, fogDensity: 0.006, shadows: false,
    envTop: '#0b1424', envBottom: '#22344c', envGround: '#0c1119', envIntensity: 1.05,
    envSun: '#9fc4ee', sunPower: 400, sunStrength: 0.5, glow: 0.08,
  });
  scene.add(stars(2600, 165));
  const starDust = dust({ count: 400, area: [70, 50, 70], center: [0, 8, -10], color: 0xa9c3e8, size: 0.09, opacity: 0.6, speed: 0.15 });
  scene.add(starDust);

  const R = 3.3;
  const globe = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), new THREE.MeshStandardMaterial({
    color: 0x1d4a66, metalness: 0.38, roughness: 0.42,
    emissive: 0x0f3450, emissiveIntensity: 0.85,
  }));
  globe.add(sphere);

  const graticule = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x8fb8dd, transparent: true, opacity: 0.3 });
  for (let li = -2; li <= 2; li++) {
    const la = (li * 30 * Math.PI) / 180;
    const r = R * Math.cos(la);
    const pts = [];
    for (let a = 0; a <= 72; a++) {
      const th = (a / 72) * TAU;
      pts.push(v3(Math.cos(th) * r, R * Math.sin(la), Math.sin(th) * r));
    }
    graticule.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  for (let lo = 0; lo < 6; lo++) {
    const th = (lo / 6) * Math.PI;
    const pts = [];
    for (let a = 0; a <= 72; a++) {
      const ph = (a / 72) * TAU;
      pts.push(v3(Math.cos(ph) * R * Math.sin(th), Math.cos(th) * R, Math.sin(ph) * R * Math.sin(th)));
    }
    graticule.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  globe.add(graticule);

  const india = indiaMesh({ scale: 0.066, depth: 0.03, color: 0xd3a54a, edge: 0xffe29a, emissive: 0x9a6a1c });
  const lat = 22.5;
  const lon = 79;
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const p = v3(-R * Math.sin(phi) * Math.cos(theta), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(theta)).multiplyScalar(1.07);
  india.position.copy(p);
  const normal = p.clone().normalize();
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const zAxis = north.clone().negate();
  const xAxis = new THREE.Vector3().crossVectors(normal, zAxis).normalize();
  india.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, normal, zAxis));
  globe.add(india);
  const indiaGlow = glowSprite(0xffc76a, 2.4, 0.55);
  indiaGlow.position.copy(p.clone().multiplyScalar(1.03));
  globe.add(indiaGlow);

  const hotspot = (lat2, lon2) => {
    const ph = ((90 - lat2) * Math.PI) / 180;
    const th = ((lon2 + 180) * Math.PI) / 180;
    return v3(-R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th));
  };

  const arcs = new THREE.Group();
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xe8b968, transparent: true, opacity: 0.65 });
  const destinations = [
    hotspot(51.5, -0.1),
    hotspot(40.7, -74),
    hotspot(35.7, 139.7),
    hotspot(-1.3, 36.8),
  ];
  const arcCurves = [];
  destinations.forEach((dest, i) => {
    const start = p.clone().multiplyScalar(1.01);
    const mid = start.clone().add(dest).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.5);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, dest.clone().multiplyScalar(1.01));
    arcCurves.push(curve);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.022, 5, false), arcMat);
    arcs.add(tube);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdda0 }));
    dot.position.copy(dest);
    arcs.add(dot);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.25 }));
    halo.position.copy(dest);
    arcs.add(halo);
    arcs.userData.dots ??= [];
    arcs.userData.dots.push(dot);
  });
  globe.add(arcs);

  const orbiters = [];
  for (let i = 0; i < 3; i++) {
    const r = 4.35 + i * 0.45;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 120), new THREE.MeshBasicMaterial({
      color: 0xa9c3e8, transparent: true, opacity: 0.18,
    }));
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.4;
    ring.rotation.y = i * 0.7;
    globe.add(ring);
    const sat = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a8 }));
    globe.add(sat);
    orbiters.push({ sat, r, speed: 0.16 + i * 0.05, phase: i * 2.1 });
  }

  globe.position.set(0, 5.6, 0);
  globe.rotation.set(-0.08, 2.5, -0.1);
  scene.add(globe);
  const globeGlow = glowSprite(0x4f86c2, 17, 0.22);
  globeGlow.position.set(0, 5.6, 0);
  scene.add(globeGlow);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.045, 48, 32), new THREE.MeshBasicMaterial({
    color: 0x7fb0e0, transparent: true, opacity: 0.14, side: THREE.BackSide,
  }));
  globe.add(atmo);

  const keys = [
    { t: 0, pos: [22, 10.5, 25], look: [0, 5.8, 0] },
    { t: 7, pos: [-20, 11.5, 19], look: [0, 5.8, 0] },
  ];

  return {
    scene, camera: cam, duration: 7,
    update(t) {
      shot(cam, t, keys, { drift: 0.03, driftSpeed: 0.2 });
      starDust.userData.update(t);
      globe.rotation.y = 2.5 + t * 0.012;
      graticule.rotation.y = t * 0.008;
      indiaGlow.material.opacity = 0.5 + Math.sin(t * 1.4) * 0.12;
      arcCurves.forEach((curve, i) => {
        const dot = arcs.userData.dots[i];
        const k = (t * 0.35 + i * 0.2) % 1;
        dot.position.copy(curve.getPoint(k));
      });
      orbiters.forEach(({ sat, r, speed, phase }) => {
        const a = t * speed + phase;
        sat.position.set(Math.cos(a) * r, Math.sin(a * 0.7) * 1.6, Math.sin(a) * r);
      });
    },
  };
}

export function buildScenes(renderer) {
  return [buildIndus, buildVedic, buildMaurya, buildGupta, buildMughal, buildFreedom, buildEpilogue].map((f) => f(renderer));
}
