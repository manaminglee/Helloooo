import * as THREE from 'three';

function envLight(scene, a = 0x1a1030, b = 0xffd08a) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(b, 1.35);
  key.position.set(2.4, 3.2, 2.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(a, 0.85);
  rim.position.set(-2.2, 1.2, -2);
  scene.add(rim);
  const fill = new THREE.PointLight(0xffffff, 0.4, 12);
  fill.position.set(0, -1.2, 2);
  scene.add(fill);
}

function disposeObject(obj) {
  obj.traverse?.((child) => {
    child.geometry?.dispose?.();
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
    else mat?.dispose?.();
  });
}

function metal(color, roughness = 0.22, metalness = 0.92) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat: 0.55, clearcoatRoughness: 0.2 });
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i += 1) h = Math.imul(h ^ String(s).charCodeAt(i), 16777619);
  return h >>> 0;
}

const PARAM_PALETTES = [
  [0xfbbf24, 0xf59e0b, 0xfde68a],
  [0x22d3ee, 0x67e8f9, 0xa78bfa],
  [0xfb7185, 0xf472b6, 0xfda4af],
  [0xa78bfa, 0xc4b5fd, 0xf5d0fe],
  [0x34d399, 0x6ee7b7, 0xfbbf24],
  [0xf97316, 0xfb923c, 0xfde68a],
];

function createParamScene(sceneId) {
  const h = hashId(sceneId);
  const [c1, c2] = PARAM_PALETTES[h % PARAM_PALETTES.length];
  const variant = h % 4;
  const group = new THREE.Group();
  const extras = [];
  if (variant === 0) {
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), metal(c1, 0.28, 0.7));
    group.add(orb);
    extras.push({ kind: 'refract', obj: orb });
  } else if (variant === 1) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.72), glass(c2));
    group.add(gem);
    extras.push({ kind: 'spark', obj: gem });
  } else if (variant === 2) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 10, 24), metal(c1, 0.25, 0.85));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), metal(c2, 0.2, 0.5));
    group.add(ring, core);
    extras.push({ kind: 'spark', obj: ring }, { kind: 'pulse', obj: core });
  } else {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.05, 8), metal(c1, 0.32, 0.6));
    group.add(cone);
    extras.push({ kind: 'rise', obj: cone });
  }
  return { group, extras };
}

function glass(color = 0x88ddff) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.05,
    metalness: 0.05,
    transmission: 0.78,
    thickness: 1.2,
    ior: 2.2,
    transparent: true,
  });
}

export function createHeroScene(sceneId, quality = 'mid') {
  const group = new THREE.Group();
  const extras = [];
  const low = quality === 'low';

  if (sceneId === 'watch_orbit') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.22, 32), metal(0xd4a017));
    const glassTop = new THREE.Mesh(new THREE.CircleGeometry(0.58, 28), glass(0xfde68a));
    glassTop.rotation.x = -Math.PI / 2;
    glassTop.position.y = 0.12;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10), metal(0xf5d78e));
    crown.rotation.z = Math.PI / 2;
    crown.position.set(0.78, 0, 0);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.07, 10, 28), metal(0xb45309, 0.35));
    band.rotation.x = Math.PI / 2;
    group.add(body, glassTop, crown, band);
  } else if (sceneId === 'rose_ascent') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), metal(0x9f1239, 0.55, 0.15));
    body.scale.set(1, 1.15, 0.9);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 14), metal(0xbe123c, 0.5, 0.1));
    head.position.y = 0.72;
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), metal(0xfb7185, 0.3, 0.2));
    heart.position.set(0.28, 0.2, 0.42);
    group.add(body, head, heart);
    extras.push({ kind: 'pulse', obj: heart });
  } else if (sceneId === 'crown_rise') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.9, 0.22, 8), metal(0xf5d78e));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 10, 24), metal(0xd4a017));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    for (let i = 0; i < 5; i += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 6), metal(0xfbbf24));
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.58, 0.38, Math.sin(a) * 0.58);
      group.add(spike);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), glass(0xf472b6));
    gem.position.y = 0.42;
    group.add(base, ring, gem);
    extras.push({ kind: 'spark', obj: gem });
  } else if (sceneId === 'diamond_refract') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), glass(0xa5f3fc));
    const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.38), metal(0xe0f2fe, 0.1, 0.4));
    group.add(gem, inner);
    extras.push({ kind: 'refract', obj: gem });
  } else if (sceneId === 'rider_impact') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.42), metal(0x111827, 0.35, 0.85));
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), metal(0x22d3ee, 0.2, 0.7));
    tank.scale.set(1.6, 0.8, 1);
    tank.position.set(0.15, 0.2, 0);
    const w1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16), metal(0x22d3ee));
    const w2 = w1.clone();
    w1.position.set(-0.5, -0.16, 0);
    w2.position.set(0.55, -0.16, 0);
    group.add(body, tank, w1, w2);
    extras.push({ kind: 'spin', obj: w1 }, { kind: 'spin', obj: w2 }, { kind: 'dash', obj: group });
  } else if (sceneId === 'gold_cascade') {
    const n = low ? 6 : 14;
    for (let i = 0; i < n; i += 1) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), metal(0xfbbf24));
      coin.rotation.x = Math.random();
      coin.position.set((i % 5) * 0.28 - 0.56, (i * 0.12) - 0.4, (i % 3) * 0.2 - 0.2);
      group.add(coin);
      extras.push({ kind: 'fall', obj: coin, seed: i });
    }
  } else if (sceneId === 'car_track') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 0.62), metal(0xef4444, 0.25, 0.8));
    hull.position.y = 0.08;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5), glass(0x7dd3fc));
    cabin.position.set(-0.1, 0.28, 0);
    const w = () => new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), metal(0x111827, 0.4, 0.5));
    [[-0.45, -0.08, 0.28], [0.48, -0.08, 0.28], [-0.45, -0.08, -0.28], [0.48, -0.08, -0.28]].forEach(([x, y, z]) => {
      const wheel = w();
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      group.add(wheel);
      extras.push({ kind: 'spin', obj: wheel });
    });
    group.add(hull, cabin);
    extras.push({ kind: 'dash', obj: group });
  } else if (sceneId === 'castle_rise') {
    const keep = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), metal(0xc4b5fd, 0.45, 0.35));
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.1, 8), metal(0xa78bfa, 0.4, 0.3));
    tower.position.set(0.48, 0.1, 0.28);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.36, 8), metal(0xf472b6, 0.35, 0.4));
    roof.position.set(0.48, 0.78, 0.28);
    group.add(keep, tower, roof);
    extras.push({ kind: 'rise', obj: group });
  } else if (sceneId === 'skyline_glow') {
    [[-0.55, 0.55], [0, 0.9], [0.5, 0.7]].forEach(([x, h], i) => {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.32, h, 0.32), metal(i === 1 ? 0x22d3ee : 0x64748b, 0.35, 0.7));
      tower.position.set(x, h / 2 - 0.2, 0);
      group.add(tower);
      extras.push({ kind: 'pulse', obj: tower });
    });
  } else if (sceneId === 'royal_lion') {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), metal(0xd97706, 0.4, 0.35));
    const mane = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.16, 8, 18), metal(0xb45309, 0.45, 0.4));
    mane.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), metal(0xfbbf24, 0.35, 0.5));
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.4;
    group.add(head, mane, nose);
    extras.push({ kind: 'pulse', obj: mane });
  } else if (sceneId === 'private_jet') {
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 10), metal(0xe2e8f0, 0.2, 0.85));
    fuselage.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 1.1), metal(0x94a3b8, 0.3, 0.7));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.22), metal(0x38bdf8, 0.25, 0.6));
    tail.position.set(-0.7, 0.18, 0);
    group.add(fuselage, wing, tail);
    extras.push({ kind: 'dash', obj: group });
  } else if (sceneId === 'cloud_garden') {
    [-0.4, 0, 0.42].forEach((x, i) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28 + i * 0.04, 12, 10), metal(0xe0f2fe, 0.55, 0.05));
      puff.position.set(x, (i % 2) * 0.12, i * 0.05);
      group.add(puff);
      extras.push({ kind: 'rise', obj: puff });
    });
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), metal(0xfb7185, 0.3, 0.2));
    bloom.position.set(0.1, 0.28, 0.2);
    group.add(bloom);
    extras.push({ kind: 'pulse', obj: bloom });
  } else if (sceneId === 'tide_muse') {
    const wave = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.1, 10, 28), glass(0x67e8f9));
    wave.rotation.x = 0.7;
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), metal(0xf8fafc, 0.15, 0.4));
    group.add(wave, pearl);
    extras.push({ kind: 'spark', obj: wave }, { kind: 'pulse', obj: pearl });
  } else if (sceneId === 'eternal_spire') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 1.6, 8), metal(0xc4b5fd, 0.3, 0.65));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), glass(0xf0abfc));
    tip.position.y = 0.95;
    group.add(shaft, tip);
    extras.push({ kind: 'rise', obj: group }, { kind: 'spark', obj: tip });
  } else {
    const { group: param, extras: more } = createParamScene(sceneId);
    group.add(param);
    extras.push(...more);
  }

  return { group, extras, envLight, disposeObject };
}

export function tickHeroScene(extras, t, sceneId) {
  extras.forEach((ex) => {
    if (ex.kind === 'pulse') ex.obj.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    if (ex.kind === 'spark') ex.obj.rotation.y = t * 2.2;
    if (ex.kind === 'refract') {
      ex.obj.rotation.y = t * 0.8;
      ex.obj.rotation.x = Math.sin(t * 0.6) * 0.25;
    }
    if (ex.kind === 'spin') ex.obj.rotation.x += 0.18;
    if (ex.kind === 'fall') {
      ex.obj.position.y = ((ex.seed * 0.17 + t * 0.7) % 2.2) - 0.9;
      ex.obj.rotation.x = t + ex.seed;
    }
    if (ex.kind === 'dash' && sceneId !== 'gold_cascade') {
      ex.obj.position.x = Math.sin(t * 1.4) * 0.35;
    }
    if (ex.kind === 'rise') ex.obj.position.y = Math.sin(t * 0.9) * 0.12;
  });
}
