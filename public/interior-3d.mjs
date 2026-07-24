import * as THREE from "./vendor/three.module.min.js";

const TAU = Math.PI * 2;

const QUALITY_PRESETS = Object.freeze({
  low: { pixelRatio: .75, shadowSize: 0, particleCount: 72, exposure: 1.02 },
  medium: { pixelRatio: 1, shadowSize: 512, particleCount: 132, exposure: 1.08 },
  high: { pixelRatio: 1.5, shadowSize: 1024, particleCount: 220, exposure: 1.12 },
  ultra: { pixelRatio: 2, shadowSize: 2048, particleCount: 320, exposure: 1.16 }
});

export const LIVE_INTERIOR_PROFILES = Object.freeze({
  "autism-support": { kind: "village", seed: 11, sky: 0xa6c8b9, floor: 0x6e9b68, wall: 0xd8d5b5, accent: 0xf0bf66, secondary: 0x8cb9c5, motion: .72 },
  "autism-education": { kind: "school", seed: 17, sky: 0xa9c9c0, floor: 0xb8d2ae, wall: 0x7eb8a5, accent: 0xf3c86e, secondary: 0xd989a7, motion: .7 },
  "autism-recreation": { kind: "activity", seed: 23, sky: 0xc8b89b, floor: 0xb69a70, wall: 0x9d7c54, accent: 0xf2c64f, secondary: 0xa7d1cb, motion: .76 },
  "autism-legal": { kind: "courthouse", seed: 29, sky: 0xd9b9a7, floor: 0xa16a4d, wall: 0xe7c9b7, accent: 0xe0b74f, secondary: 0x5ea3bd, motion: .68 },
  "autism-activity": { kind: "jungle", seed: 31, sky: 0x8eb99f, floor: 0x537f52, wall: 0x305f43, accent: 0xe6c45b, secondary: 0xa486bd, motion: .74 },
  "adhd-support": { kind: "village", seed: 41, sky: 0x8fb6cb, floor: 0x6e9f59, wall: 0xe2c47d, accent: 0xf08d53, secondary: 0x7ec1c8, motion: 1.08 },
  "adhd-education": { kind: "school", seed: 43, sky: 0x95bdc8, floor: 0xb2cd8c, wall: 0x6ba6a9, accent: 0xf4b94e, secondary: 0xd9758f, motion: 1.04 },
  "adhd-recreation": { kind: "activity", seed: 47, sky: 0xc2a578, floor: 0xb5845d, wall: 0x8e6647, accent: 0xffb640, secondary: 0x76c7ba, motion: 1.12 },
  "adhd-legal": { kind: "courthouse", seed: 53, sky: 0xcf9d88, floor: 0x8f5947, wall: 0xe3b09d, accent: 0xf1c23f, secondary: 0x3e9fc4, motion: .98 },
  "adhd-activity": { kind: "jungle", seed: 59, sky: 0x75aa94, floor: 0x477f46, wall: 0x245a3e, accent: 0xf5bd44, secondary: 0xc27ac5, motion: 1.15 }
});

function seeded(seed, offset = 0) {
  const value = Math.sin(seed * 91.731 + offset * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function colorStyle(color) {
  return new THREE.Color(color).getStyle();
}

function createPatternTexture(type, baseColor, detailColor, seed, anisotropy = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = colorStyle(baseColor);
  context.fillRect(0, 0, 256, 256);
  const detail = colorStyle(detailColor);
  if (type === "wood") {
    for (let line = 0; line < 34; line += 1) {
      const y = seeded(seed, line) * 256;
      context.strokeStyle = detail;
      context.globalAlpha = .08 + seeded(seed + 2, line) * .14;
      context.lineWidth = .6 + seeded(seed + 4, line) * 2;
      context.beginPath();
      context.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) context.lineTo(x, y + Math.sin(x * .055 + line) * (2 + seeded(seed + 7, line) * 5));
      context.stroke();
    }
    for (let knot = 0; knot < 6; knot += 1) {
      context.globalAlpha = .13;
      context.strokeStyle = detail;
      context.beginPath();
      context.ellipse(seeded(seed + 9, knot) * 256, seeded(seed + 11, knot) * 256, 7 + knot, 3 + knot * .5, 0, 0, TAU);
      context.stroke();
    }
  } else if (type === "bark") {
    for (let line = 0; line < 58; line += 1) {
      const x = seeded(seed, line) * 256;
      context.strokeStyle = detail;
      context.globalAlpha = .08 + seeded(seed + 3, line) * .22;
      context.lineWidth = 1 + seeded(seed + 4, line) * 3;
      context.beginPath();
      context.moveTo(x, -8);
      for (let y = 0; y <= 264; y += 20) context.lineTo(x + Math.sin(y * .05 + line) * 5, y);
      context.stroke();
    }
  } else if (type === "leaf" || type === "grass") {
    for (let mark = 0; mark < 760; mark += 1) {
      const x = seeded(seed, mark) * 256;
      const y = seeded(seed + 5, mark) * 256;
      context.strokeStyle = mark % 3 ? detail : colorStyle(0xd6d98a);
      context.globalAlpha = .035 + seeded(seed + 8, mark) * .13;
      context.lineWidth = .5 + seeded(seed + 12, mark);
      context.beginPath();
      context.moveTo(x, y + 3);
      context.quadraticCurveTo(x + 2, y - 2, x + (mark % 2 ? 5 : -5), y - 5);
      context.stroke();
    }
  } else if (type === "stone") {
    context.strokeStyle = detail;
    context.globalAlpha = .16;
    context.lineWidth = 2;
    for (let y = 0; y < 256; y += 42) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(256, y);
      context.stroke();
      const offset = (Math.floor(y / 42) % 2) * 31;
      for (let x = offset; x < 256; x += 62) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + 42);
        context.stroke();
      }
    }
  } else if (type === "fabric" || type === "fur") {
    for (let line = 0; line < 920; line += 1) {
      const x = seeded(seed, line) * 256;
      const y = seeded(seed + 6, line) * 256;
      context.strokeStyle = detail;
      context.globalAlpha = type === "fur" ? .045 + seeded(seed + 3, line) * .12 : .06;
      context.lineWidth = type === "fur" ? .55 : .7;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (type === "fur" ? 5 : 8), y + (line % 2 ? 2 : -2));
      context.stroke();
    }
  } else {
    for (let dot = 0; dot < 1600; dot += 1) {
      context.fillStyle = detail;
      context.globalAlpha = .025 + seeded(seed + 2, dot) * .07;
      const size = .5 + seeded(seed + 8, dot) * 1.5;
      context.fillRect(seeded(seed, dot) * 256, seeded(seed + 5, dot) * 256, size, size);
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(type === "fur" ? 2 : 3, type === "fur" ? 2 : 3);
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createTexturePack(profile, renderer) {
  const anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  return {
    wood: createPatternTexture("wood", 0xa87947, 0x4d2f20, profile.seed + 1, anisotropy),
    darkWood: createPatternTexture("wood", 0x6d432d, 0x261b17, profile.seed + 2, anisotropy),
    plaster: createPatternTexture("plaster", profile.wall, 0x5e6658, profile.seed + 3, anisotropy),
    cork: createPatternTexture("cork", 0xa27d50, 0x4c3828, profile.seed + 4, anisotropy),
    stone: createPatternTexture("stone", 0xc8b9a6, 0x65584d, profile.seed + 5, anisotropy),
    bark: createPatternTexture("bark", 0x68452f, 0x241c18, profile.seed + 6, anisotropy),
    leaf: createPatternTexture("leaf", profile.wall, 0x163c28, profile.seed + 7, anisotropy),
    grass: createPatternTexture("grass", profile.floor, 0x264e32, profile.seed + 8, anisotropy),
    paper: createPatternTexture("paper", 0xe8d7a7, 0x8a7352, profile.seed + 9, anisotropy),
    fabric: createPatternTexture("fabric", profile.secondary, 0x423748, profile.seed + 10, anisotropy),
    fur: createPatternTexture("fur", 0xa9683e, 0x4b2c20, profile.seed + 11, anisotropy)
  };
}

function textured(pack, key, options = {}) {
  const texture = pack?.[key];
  if (!texture) return options;
  return { ...options, map: texture, bumpMap: texture, bumpScale: options.bumpScale ?? .035 };
}

function material(color, options = {}) {
  const parameters = {
    color: options.map ? 0xffffff : color,
    roughness: options.roughness ?? .78,
    metalness: options.metalness ?? .02,
    transparent: options.opacity != null && options.opacity < 1,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    map: options.map || null,
    bumpMap: options.bumpMap || null,
    bumpScale: options.bumpScale ?? 0
  };
  if (!options.physical) return new THREE.MeshStandardMaterial(parameters);
  return new THREE.MeshPhysicalMaterial({
    ...parameters,
    clearcoat: options.clearcoat ?? .04,
    clearcoatRoughness: options.clearcoatRoughness ?? .7,
    sheen: options.sheen ?? 0,
    sheenColor: options.sheenColor ?? color
  });
}

function addBox(parent, size, position, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, options));
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addSphere(parent, radius, position, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, options.segments || 24, options.segments || 24),
    material(color, options)
  );
  mesh.position.set(...position);
  if (options.scale) mesh.scale.set(...options.scale);
  mesh.castShadow = options.castShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radii, height, position, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radii[0], radii[1], height, options.segments || 18),
    material(color, options)
  );
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addPlane(parent, size, position, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material(color, options));
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.castShadow ?? false;
  parent.add(mesh);
  return mesh;
}

function addLine(parent, points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(line);
  return line;
}

function addRoom(scene, profile, pack, { outdoor = false } = {}) {
  const room = new THREE.Group();
  scene.add(room);
  addBox(room, [16, .25, 13], [0, -.12, 0], profile.floor, textured(pack, outdoor ? "grass" : "wood", { receiveShadow: true, roughness: .72, bumpScale: .055 }));
  if (!outdoor) {
    const wallOptions = textured(pack, "plaster", { receiveShadow: true, roughness: .94, bumpScale: .025 });
    addBox(room, [16, 8.6, .22], [0, 4.18, -5.35], profile.wall, wallOptions);
    addBox(room, [.22, 8.6, 11], [-7.4, 4.18, -.05], profile.wall, wallOptions);
    addBox(room, [.22, 8.6, 11], [7.4, 4.18, -.05], profile.wall, wallOptions);
    for (let index = 0; index < 5; index += 1) {
      addBox(room, [2.1, .05, 11], [-5.2 + index * 2.6, 8.42, -.05], index % 2 ? profile.accent : 0xf0dfb6, textured(pack, "wood", {
        opacity: .88,
        castShadow: false,
        roughness: .62
      }));
    }
  }
  return room;
}

function addMotes(scene, profile, count, motion) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (seeded(profile.seed, index) - .5) * 13;
    positions[index * 3 + 1] = .5 + seeded(profile.seed + 2, index) * 7;
    positions[index * 3 + 2] = -4 + seeded(profile.seed + 4, index) * 10;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: profile.accent, size: .055, transparent: true, opacity: .48, depthWrite: false })
  );
  scene.add(points);
  motion.push((time) => {
    points.rotation.y = Math.sin(time * .00012 * profile.motion) * .08;
    points.position.y = Math.sin(time * .00028 * profile.motion) * .12;
  });
}

function addSceneLighting(scene, profile, motion) {
  const fill = new THREE.PointLight(profile.secondary, profile.kind === "jungle" ? 30 : 24, 18, 2);
  fill.position.set(-4.8, 4.5, 3.8);
  scene.add(fill);
  const warm = new THREE.PointLight(profile.accent, profile.kind === "courthouse" ? 38 : 28, 16, 2);
  warm.position.set(4.8, 5.8, 1.8);
  scene.add(warm);
  motion.push((time) => {
    fill.intensity = (profile.kind === "jungle" ? 28 : 22) + Math.sin(time * .00078 * profile.motion + 1.8) * 2.5;
    warm.intensity = (profile.kind === "courthouse" ? 36 : 26) + Math.cos(time * .00092 * profile.motion) * 2.2;
  });
  if (profile.kind === "school") {
    for (let index = 0; index < 3; index += 1) {
      const fixture = addBox(scene, [2.2, .1, .42], [-4 + index * 4, 7.9, -.2], 0xf7edcf, {
        emissive: 0xffe3a5,
        emissiveIntensity: .72,
        roughness: .32,
        castShadow: false
      });
      const light = new THREE.PointLight(0xffd99b, 26, 9, 2);
      light.position.copy(fixture.position).add(new THREE.Vector3(0, -.35, 0));
      scene.add(light);
      motion.push((time) => { light.intensity = 24 + Math.sin(time * .001 + index * 1.7) * 1.8; });
    }
    const windowLight = new THREE.SpotLight(0xbfe8dd, 52, 24, .54, .68, 1.5);
    windowLight.position.set(-6.2, 6.6, 5.6);
    windowLight.target.position.set(-.8, 1, -1.8);
    windowLight.castShadow = true;
    windowLight.shadow.mapSize.set(1024, 1024);
    scene.add(windowLight, windowLight.target);
  }
  if (profile.kind === "activity") {
    const noticeGlow = new THREE.SpotLight(0xffd782, 48, 20, .62, .8, 1.3);
    noticeGlow.position.set(0, 7.1, 3.8);
    noticeGlow.target.position.set(0, 3.3, -4.8);
    scene.add(noticeGlow, noticeGlow.target);
  }
  if (profile.kind === "courthouse") {
    const benchLight = new THREE.SpotLight(0xffd29a, 62, 23, .48, .72, 1.35);
    benchLight.position.set(-3.6, 7.8, 4.2);
    benchLight.target.position.set(0, 1.4, -3.4);
    benchLight.castShadow = true;
    benchLight.shadow.mapSize.set(1024, 1024);
    scene.add(benchLight, benchLight.target);
  }
  if (profile.kind === "village") {
    for (const [x, z, phase] of [[-4.7, -2.4, 0], [4.4, -2, 1.2], [-3.9, 2.2, 2.4], [4.1, 2.4, 3.6]]) {
      const lantern = new THREE.PointLight(0xffb65a, 18, 6.5, 2);
      lantern.position.set(x, 2.1, z + 1.2);
      scene.add(lantern);
      motion.push((time) => { lantern.intensity = 16 + Math.sin(time * .0022 * profile.motion + phase) * 3; });
    }
  }
  if (profile.kind === "jungle") {
    for (let index = 0; index < 3; index += 1) {
      const dapple = new THREE.SpotLight(index % 2 ? 0xb7d77c : 0xffdfa1, 54, 25, .34, .92, 1.1);
      dapple.position.set(-6 + index * 5.5, 10, 3 - index);
      dapple.target.position.set(-2 + index * 2.2, 0, -1 + index);
      dapple.castShadow = index === 1;
      if (dapple.castShadow) dapple.shadow.mapSize.set(1024, 1024);
      scene.add(dapple, dapple.target);
      const baseX = dapple.target.position.x;
      motion.push((time) => {
        dapple.target.position.x = baseX + Math.sin(time * .00038 * profile.motion + index) * 1.25;
        dapple.intensity = 48 + Math.cos(time * .00055 * profile.motion + index) * 7;
      });
    }
  }
}

function addCapybara(parent, profile, pack, position, accessory, motion) {
  const group = new THREE.Group();
  group.userData.isAnimal = true;
  group.position.set(...position);
  parent.add(group);
  const bodyColor = profile.kind === "courthouse" ? 0x9b6244 : profile.kind === "activity" ? 0x8f542f : 0xa7663b;
  const furOptions = textured(pack, "fur", {
    physical: true,
    roughness: .82,
    sheen: .34,
    sheenColor: 0xd89a6b,
    clearcoat: .015,
    bumpScale: .055,
    segments: 34
  });
  const body = addSphere(group, .72, [0, .9, 0], bodyColor, { ...furOptions, scale: [1.55, .88, .82] });
  const head = addSphere(group, .5, [.95, 1.22, .04], bodyColor, { ...furOptions, scale: [1, .92, .9] });
  addSphere(group, .23, [1.31, 1.1, .2], 0x6e3e2d, { ...furOptions, scale: [1.2, .75, .68], bumpScale: .035 });
  const leftEar = addSphere(group, .13, [.78, 1.67, -.25], bodyColor, furOptions);
  const rightEar = addSphere(group, .13, [1.12, 1.66, -.2], bodyColor, furOptions);
  const eye = new THREE.Group();
  eye.position.set(1.17, 1.39, .432);
  addSphere(eye, .066, [0, 0, 0], 0x4c3025, { physical: true, roughness: .62, scale: [1.08, 1, .3], segments: 28 });
  addSphere(eye, .041, [0, -.002, .034], 0x211814, { physical: true, roughness: .2, clearcoat: .74, scale: [.9, 1, .28], segments: 28 });
  const eyeCatchlight = addSphere(eye, .011, [-.012, .015, .047], 0xfff3d6, {
    emissive: 0xffebc4,
    emissiveIntensity: .45,
    roughness: .08,
    castShadow: false,
    segments: 18
  });
  const eyelid = addSphere(eye, .052, [0, .044, .032], bodyColor, {
    ...furOptions,
    scale: [1.12, .3, .24],
    segments: 28
  });
  group.add(eye);
  const nose = addSphere(group, .072, [1.505, 1.145, .31], 0x4a3028, {
    physical: true,
    roughness: .78,
    clearcoat: .02,
    scale: [.72, .5, .92],
    segments: 28
  });
  const legs = [];
  for (const [legIndex, x] of [-.58, .42].entries()) {
    for (const z of [-.3, .3]) {
      const leg = addCylinder(group, [.13, .16], .52, [x, .36, z], 0x75452f, textured(pack, "fur", { physical: true, roughness: .9, bumpScale: .045, segments: 22 }));
      legs.push({ leg, phase: legIndex * Math.PI + (z > 0 ? Math.PI : 0), baseY: leg.position.y });
      addSphere(group, .14, [x + .02, .1, z + .04], 0x5c382c, { ...furOptions, scale: [1.05, .55, 1.15], segments: 22 });
    }
  }
  addLine(group, [[1.43, 1.17, .38], [1.78, 1.23, .48]], 0x3b2923, .55);
  addLine(group, [[1.43, 1.12, .39], [1.78, 1.08, .5]], 0x3b2923, .55);
  if (accessory === "book") {
    const book = new THREE.Group();
    book.position.set(.25, 1.05, .72);
    book.rotation.set(-.22, 0, -.12);
    addBox(book, [.55, .06, .72], [-.27, 0, 0], profile.secondary, textured(pack, "paper", { roughness: .92, bumpScale: .018 }));
    addBox(book, [.55, .06, .72], [.27, 0, 0], profile.accent, textured(pack, "paper", { roughness: .92, bumpScale: .018 }));
    group.add(book);
    motion.push((time) => { book.rotation.z = -.12 + Math.sin(time * .0014 * profile.motion) * .035; });
  }
  if (accessory === "top-hat") {
    addCylinder(group, [.4, .4], .09, [.93, 1.84, 0], 0x171515, textured(pack, "fabric", { roughness: .74, bumpScale: .025 }));
    addCylinder(group, [.28, .34], .55, [.93, 2.14, 0], 0x1c1919, textured(pack, "fabric", { roughness: .74, bumpScale: .025 }));
  }
  if (accessory === "tie") {
    const tie = new THREE.Mesh(new THREE.ConeGeometry(.14, .55, 3), material(profile.secondary, textured(pack, "fabric", { roughness: .72 })));
    tie.position.set(.68, .86, .69);
    tie.rotation.set(Math.PI, 0, -.08);
    group.add(tie);
  }
  if (accessory === "flower") {
    addCylinder(group, [.025, .025], .65, [1.45, 1.7, .25], 0x487b4d, { rotation: [0, 0, -.32] });
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * TAU;
      addSphere(group, .11, [1.27 + Math.cos(angle) * .14, 2 + Math.sin(angle) * .14, .25], profile.secondary, { scale: [1.15, .75, .5] });
    }
    addSphere(group, .075, [1.27, 2, .3], profile.accent);
  }
  if (accessory === "racket") {
    const racket = new THREE.Group();
    racket.position.set(1.45, 1.55, .18);
    racket.rotation.z = -.34;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.28, .045, 12, 32), material(profile.secondary, { physical: true, roughness: .28, metalness: .35, clearcoat: .45 }));
    racket.add(ring);
    addCylinder(racket, [.035, .045], .65, [0, -.48, 0], 0x8c5a36, textured(pack, "wood", { roughness: .62 }));
    group.add(racket);
  }
  const baseX = group.position.x;
  const baseY = group.position.y;
  motion.push((time) => {
    const stride = time * .00125 * profile.motion + profile.seed;
    group.position.x = baseX + Math.sin(stride * .42) * .035;
    group.position.y = baseY + Math.sin(stride * 2) * .035 + Math.sin(stride * .55) * .018;
    group.rotation.y = Math.sin(stride * .48) * .045;
    body.rotation.z = Math.sin(stride * 2) * .012;
    head.rotation.z = Math.sin(stride * .8 + .7) * .028;
    leftEar.scale.y = .96 + Math.sin(stride * 1.6) * .05;
    rightEar.scale.y = .96 + Math.sin(stride * 1.6 + .8) * .05;
    const blink = Math.pow(Math.max(0, Math.sin(stride * .19 + profile.seed)), 34);
    eye.scale.y = 1 - blink * .82;
    eyeCatchlight.visible = blink < .55;
    eyelid.position.y = .044 - blink * .018;
    nose.scale.y = .78 + Math.sin(stride * 1.4) * .025;
    legs.forEach(({ leg, phase, baseY: legY }) => {
      leg.position.y = legY + Math.max(0, Math.sin(stride * 2 + phase)) * .025;
      leg.rotation.z = Math.sin(stride * 2 + phase) * .035;
    });
  });
  return group;
}

function buildSchool(scene, profile, motion, pack) {
  const room = addRoom(scene, profile, pack);
  addBox(room, [7.5, 3.1, .18], [0, 4.25, -5.16], 0x315849, { physical: true, roughness: .88, clearcoat: .035 });
  addBox(room, [8.1, .22, .34], [0, 2.62, -4.98], 0xd2b16f, textured(pack, "wood", { roughness: .64, bumpScale: .045 }));
  addBox(room, [2.1, 4.5, .48], [5.85, 2.26, -4.72], 0x9a6b36, textured(pack, "wood", { roughness: .62, bumpScale: .05 }));
  for (let shelf = 0; shelf < 3; shelf += 1) {
    addBox(room, [1.85, .12, .6], [5.85, .75 + shelf * 1.25, -4.37], 0x7f512d, textured(pack, "darkWood", { roughness: .66 }));
  }
  const windowGlass = addPlane(room, [4.3, 3.2], [-7.24, 4.35, .2], 0xaedbd5, {
    rotation: [0, Math.PI / 2, 0],
    physical: true,
    roughness: .08,
    metalness: .05,
    opacity: .42,
    emissive: 0xaedbd5,
    emissiveIntensity: .18
  });
  windowGlass.material.depthWrite = false;
  const windowFrameOptions = textured(pack, "wood", { roughness: .62 });
  for (const y of [2.7, 6]) addBox(room, [.18, .16, 4.65], [-7.12, y, .2], 0xe7d2a1, windowFrameOptions);
  for (const z of [-1.95, 2.35]) addBox(room, [.18, 3.45, .16], [-7.12, 4.35, z], 0xe7d2a1, windowFrameOptions);
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const x = -4.2 + column * 3.35;
      const z = -1 + row * 3.25;
      addBox(room, [2.2, .18, 1.35], [x, 1.42, z], 0xe0ba69, textured(pack, "wood", {
        physical: true,
        roughness: .5,
        clearcoat: .1,
        clearcoatRoughness: .58,
        bumpScale: .045
      }));
      for (const legX of [-.85, .85]) {
        addBox(room, [.12, 1.35, .12], [x + legX, .7, z - .46], 0x3f5158, { physical: true, roughness: .28, metalness: .62, clearcoat: .25 });
        addBox(room, [.12, 1.35, .12], [x + legX, .7, z + .46], 0x3f5158, { physical: true, roughness: .28, metalness: .62, clearcoat: .25 });
      }
      const chairZ = z + 1.15;
      addBox(room, [1.05, .16, .82], [x, .84, chairZ], 0xc99b57, textured(pack, "wood", { physical: true, roughness: .54, clearcoat: .08 }));
      addBox(room, [1.05, .9, .13], [x, 1.28, chairZ + .38], 0xc99b57, textured(pack, "wood", { physical: true, roughness: .54, clearcoat: .08 }));
      for (const chairX of [-.4, .4]) {
        addBox(room, [.09, .78, .09], [x + chairX, .4, chairZ - .25], 0x3f5158, { roughness: .26, metalness: .65 });
        addBox(room, [.09, 1.25, .09], [x + chairX, .62, chairZ + .28], 0x3f5158, { roughness: .26, metalness: .65 });
      }
      const book = new THREE.Group();
      book.position.set(x, 1.62, z);
      const left = addPlane(book, [.62, .8], [-.32, 0, 0], column % 2 ? profile.secondary : profile.accent, textured(pack, "paper", { rotation: [-Math.PI / 2, 0, .04], roughness: .92, bumpScale: .015 }));
      const right = addPlane(book, [.62, .8], [.32, 0, 0], column % 2 ? profile.accent : profile.secondary, textured(pack, "paper", { rotation: [-Math.PI / 2, 0, -.04], roughness: .92, bumpScale: .015 }));
      room.add(book);
      motion.push((time) => {
        const flap = Math.sin(time * .0011 * profile.motion + row + column) * .06;
        left.rotation.y = flap;
        right.rotation.y = -flap;
      });
    }
  }
  const clock = new THREE.Group();
  clock.position.set(-5.6, 5.7, -5);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(.58, .58, .12, 48), material(0xf2e2b7, textured(pack, "paper", { physical: true, roughness: .74, clearcoat: .06 })));
  face.rotation.x = Math.PI / 2;
  clock.add(face);
  const hand = addBox(clock, [.035, .42, .035], [0, .15, .08], 0x35423d);
  clock.add(hand);
  room.add(clock);
  motion.push((time) => { hand.rotation.z = -time * .00005 * profile.motion; });
  for (let index = 0; index < 6; index += 1) {
    const mobile = addSphere(room, .12 + index % 2 * .04, [-5 + index * 1.75, 6.5 - index % 2 * .45, -1.2], index % 2 ? profile.accent : profile.secondary, { segments: 8 });
    const baseX = mobile.position.x;
    motion.push((time) => { mobile.position.x = baseX + Math.sin(time * .001 * profile.motion + index) * .18; });
  }
  addCapybara(room, profile, pack, [4.65, 0, 1.2], "book", motion);
}

function buildActivity(scene, profile, motion, pack) {
  const room = addRoom(scene, profile, pack);
  addBox(room, [9.8, 5.8, .24], [0, 4.15, -5.12], 0xa17e52, textured(pack, "cork", { roughness: .96, bumpScale: .075 }));
  addBox(room, [10.35, .2, .38], [0, 1.15, -4.98], 0x7c5837, textured(pack, "darkWood", { roughness: .64, bumpScale: .05 }));
  const noteColors = [profile.accent, profile.secondary, 0xe8d9a8, 0xcf8fb2, 0xd4a858];
  for (let index = 0; index < 13; index += 1) {
    const note = addPlane(
      room,
      [.85 + seeded(profile.seed, index) * .55, .7 + seeded(profile.seed + 4, index) * .55],
      [-4.1 + (index % 5) * 2.05, 2.2 + Math.floor(index / 5) * 1.45, -4.95],
      noteColors[index % noteColors.length],
      textured(pack, index % 4 === 0 ? "fabric" : "paper", { castShadow: true, roughness: .9, bumpScale: .02 })
    );
    const startZ = note.rotation.z = (seeded(profile.seed + 7, index) - .5) * .18;
    motion.push((time) => {
      note.rotation.z = startZ + Math.sin(time * .00125 * profile.motion + index) * .025;
      note.rotation.y = Math.sin(time * .0014 * profile.motion + index * .7) * .025;
    });
  }
  const envelope = new THREE.Group();
  envelope.position.set(0, 1.5, .6);
  envelope.rotation.x = -.16;
  addBox(envelope, [3.8, .12, 2.35], [0, 0, 0], 0xe9d6a5, textured(pack, "paper", { roughness: .9, bumpScale: .022 }));
  const flap = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.7, 3), material(0xdcbf83, textured(pack, "paper", { roughness: .9, bumpScale: .022 })));
  flap.position.set(0, .18, -.8);
  flap.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  envelope.add(flap);
  room.add(envelope);
  motion.push((time) => {
    envelope.position.y = 1.5 + Math.sin(time * .0008 * profile.motion) * .08;
    flap.rotation.y = Math.sin(time * .0011 * profile.motion) * .08;
  });
  const lightGroup = new THREE.Group();
  room.add(lightGroup);
  const lightPoints = [];
  for (let index = 0; index < 12; index += 1) {
    const x = -6 + index * 1.08;
    const y = 7.2 - Math.sin(index / 11 * Math.PI) * .65;
    lightPoints.push([x, y, -4.7]);
    const bulb = addSphere(lightGroup, .105, [x, y, -4.68], index % 2 ? profile.accent : profile.secondary, {
      physical: true,
      emissive: index % 2 ? profile.accent : profile.secondary,
      emissiveIntensity: .65,
      roughness: .12,
      clearcoat: .7,
      segments: 24
    });
    motion.push((time) => { bulb.material.emissiveIntensity = .45 + (Math.sin(time * .002 * profile.motion + index) + 1) * .35; });
  }
  addLine(lightGroup, lightPoints, 0x4c4438, .72);
  addCapybara(room, profile, pack, [3.8, 0, 2], "top-hat", motion);
}

function buildCourthouse(scene, profile, motion, pack) {
  const room = addRoom(scene, profile, pack);
  addBox(room, [16, .11, 13], [0, .01, 0], 0xc6b49e, textured(pack, "stone", { receiveShadow: true, roughness: .88, bumpScale: .06 }));
  for (const x of [-5.9, 5.9]) {
    addCylinder(room, [.48, .62], 6.5, [x, 3.25, -4.5], 0xead5c4, textured(pack, "stone", { segments: 32, roughness: .86, bumpScale: .055 }));
    addCylinder(room, [.72, .72], .35, [x, .2, -4.5], 0xc89f82, textured(pack, "stone", { segments: 32, roughness: .86 }));
    addCylinder(room, [.75, .6], .42, [x, 6.55, -4.5], 0xc89f82, textured(pack, "stone", { segments: 32, roughness: .86 }));
  }
  addBox(room, [7.2, 2.1, 1.2], [0, 1.05, -3.7], 0x71422e, textured(pack, "darkWood", { physical: true, roughness: .54, clearcoat: .12, bumpScale: .055 }));
  addBox(room, [8.1, .35, 1.55], [0, 2.25, -3.65], 0x8d5638, textured(pack, "wood", { physical: true, roughness: .48, clearcoat: .16, bumpScale: .05 }));
  for (const x of [-3.9, 3.9]) {
    addBox(room, [2.6, 1.2, 1.05], [x, .62, -.9], 0x845039, textured(pack, "darkWood", { physical: true, roughness: .58, clearcoat: .08 }));
  }
  const scales = new THREE.Group();
  scales.position.set(0, 4.9, -4.78);
  addCylinder(scales, [.08, .1], 2.2, [0, -.2, 0], profile.accent, { physical: true, metalness: .7, roughness: .2, clearcoat: .5, segments: 32 });
  const beam = addBox(scales, [2.8, .1, .1], [0, .62, 0], profile.accent, { physical: true, metalness: .72, roughness: .2, clearcoat: .55 });
  for (const side of [-1, 1]) {
    addLine(beam, [[side * 1.2, 0, 0], [side * 1.2, -.85, 0]], profile.accent);
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(.45, .25, .12, 32), material(profile.accent, { physical: true, metalness: .72, roughness: .2, clearcoat: .5 }));
    pan.position.set(side * 1.2, -.9, 0);
    beam.add(pan);
  }
  room.add(scales);
  motion.push((time) => { beam.rotation.z = Math.sin(time * .0011 * profile.motion) * .14; });
  const gavel = new THREE.Group();
  gavel.position.set(1.6, 2.62, -3.3);
  addCylinder(gavel, [.2, .2], 1.15, [0, 0, 0], 0x5f3628, textured(pack, "darkWood", { rotation: [0, 0, Math.PI / 2], physical: true, roughness: .42, clearcoat: .22, segments: 32 }));
  addCylinder(gavel, [.36, .36], .65, [-.62, 0, 0], 0x75432d, textured(pack, "wood", { rotation: [0, 0, Math.PI / 2], physical: true, roughness: .42, clearcoat: .22, segments: 32 }));
  room.add(gavel);
  motion.push((time) => {
    const cycle = Math.max(0, Math.sin(time * .0016 * profile.motion + 1.2));
    gavel.rotation.z = -.18 - Math.pow(cycle, 8) * .35;
  });
  const flag = new THREE.Group();
  flag.position.set(5.25, .25, -2.7);
  addCylinder(flag, [.055, .07], 6.6, [0, 3.3, 0], 0x745240);
  const cloth = addPlane(flag, [1.6, 2.25], [.85, 5.2, .02], profile.secondary, textured(pack, "fabric", { castShadow: true, roughness: .9, bumpScale: .035 }));
  room.add(flag);
  motion.push((time) => { cloth.rotation.y = Math.sin(time * .0015 * profile.motion) * .16; });
  const ray = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 8, 24, 1, true),
    material(0xffedc4, { opacity: .08, emissive: 0xffe6a0, emissiveIntensity: .12, roughness: 1 })
  );
  ray.position.set(-3.2, 4, 1);
  ray.rotation.z = -.34;
  ray.material.depthWrite = false;
  room.add(ray);
  motion.push((time) => { ray.rotation.z = -.34 + Math.sin(time * .00042 * profile.motion) * .045; });
  addCapybara(room, profile, pack, [-4.2, 0, 2], "tie", motion);
}

function addHouse(parent, profile, pack, x, z, scale, index, motion) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  parent.add(group);
  addBox(group, [2.15, 2.5, 2], [0, 1.25, 0], index % 2 ? 0xd8c68d : 0xc9b990, textured(pack, index % 2 ? "plaster" : "stone", { roughness: .88, bumpScale: .055 }));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.65, 1.35, 4), material(index % 2 ? 0xc65c21 : 0xe27625, textured(pack, "wood", { roughness: .66, bumpScale: .055 })));
  roof.position.set(0, 3.05, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  addBox(group, [.58, 1.25, .08], [0, .65, 1.03], 0x604034, textured(pack, "darkWood", { physical: true, roughness: .54, clearcoat: .08 }));
  for (const wx of [-.65, .65]) {
    const windowMesh = addBox(group, [.38, .48, .06], [wx, 1.65, 1.05], 0x9ed3da, {
      physical: true,
      emissive: profile.accent,
      emissiveIntensity: .12,
      roughness: .12,
      clearcoat: .7
    });
    motion.push((time) => {
      windowMesh.material.emissiveIntensity = .12 + (Math.sin(time * .0009 * profile.motion + index + wx) + 1) * .12;
    });
  }
  const chimney = addBox(group, [.32, 1.1, .36], [.72, 3.25, -.25], 0x8b705e, textured(pack, "stone", { roughness: .9, bumpScale: .055 }));
  const puffs = [];
  for (let puffIndex = 0; puffIndex < 4; puffIndex += 1) {
    const puff = addSphere(group, .2 + puffIndex * .035, [.72, 3.85 + puffIndex * .45, -.25], 0xdce3dc, { opacity: .48, castShadow: false });
    puffs.push(puff);
  }
  motion.push((time) => {
    puffs.forEach((puff, puffIndex) => {
      const cycle = (time * .00018 * profile.motion + puffIndex * .23 + index * .13) % 1;
      puff.position.y = 3.8 + cycle * 2;
      puff.position.x = .72 + Math.sin(cycle * TAU + index) * .22;
      puff.scale.setScalar(.7 + cycle * .75);
      puff.material.opacity = .5 * (1 - cycle);
    });
    chimney.rotation.y = Math.sin(time * .0005 + index) * .005;
  });
}

function buildVillage(scene, profile, motion, pack) {
  const room = addRoom(scene, profile, pack, { outdoor: true });
  scene.background = new THREE.Color(profile.sky);
  const path = addPlane(room, [4.4, 13], [0, .02, -.2], 0xb7a47a, textured(pack, "stone", { rotation: [-Math.PI / 2, 0, 0], roughness: .94, bumpScale: .07 }));
  path.receiveShadow = true;
  const positions = [
    [-4.8, -2.8, .92], [4.5, -2.4, 1.02], [-4.1, 1.9, .82], [4.15, 2.1, .88], [0, -3.7, .72]
  ];
  positions.forEach(([x, z, scale], index) => addHouse(room, profile, pack, x, z, scale, index, motion));
  for (let index = 0; index < 18; index += 1) {
    const x = (index % 2 ? 1 : -1) * (2.5 + seeded(profile.seed, index) * 3.5);
    const z = -4.5 + seeded(profile.seed + 3, index) * 9;
    addCylinder(room, [.025, .035], .45, [x, .24, z], 0x4f7848);
    addSphere(room, .12, [x, .52, z], index % 3 ? profile.secondary : profile.accent, { scale: [1, .7, 1], castShadow: false });
  }
  const banner = new THREE.Group();
  banner.position.set(0, 5.8, -4.15);
  for (let index = 0; index < 9; index += 1) {
    const flag = new THREE.Mesh(new THREE.ConeGeometry(.24, .5, 3), material(index % 2 ? profile.accent : profile.secondary));
    flag.position.set(-2.5 + index * .62, Math.sin(index) * .12, 0);
    flag.rotation.z = Math.PI;
    banner.add(flag);
    motion.push((time) => { flag.rotation.y = Math.sin(time * .0014 * profile.motion + index) * .2; });
  }
  addLine(banner, [[-2.9, .2, 0], [2.9, .2, 0]], 0x5a4637);
  room.add(banner);
  addCapybara(room, profile, pack, [1.6, 0, 1.5], "flower", motion);
}

function addTree(parent, profile, pack, x, z, scale, index, motion) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  parent.add(group);
  addCylinder(group, [.42, .7], 4.7, [0, 2.35, 0], 0x67442f, textured(pack, "bark", {
    physical: true,
    segments: 24,
    roughness: .94,
    bumpScale: .09
  }));
  for (let branchIndex = 0; branchIndex < 5; branchIndex += 1) {
    const angle = branchIndex / 5 * TAU + index;
    addCylinder(
      group,
      [.1, .17],
      2.3,
      [Math.cos(angle) * .68, 3.35 + branchIndex * .22, Math.sin(angle) * .68],
      0x67442f,
      textured(pack, "bark", {
        rotation: [Math.sin(angle) * .82, 0, Math.cos(angle) * .82],
        segments: 16,
        roughness: .94,
        bumpScale: .075
      })
    );
  }
  const crown = new THREE.Group();
  crown.position.y = 4.8;
  group.add(crown);
  for (let leafIndex = 0; leafIndex < 13; leafIndex += 1) {
    const angle = leafIndex / 13 * TAU;
    const leaf = addSphere(
      crown,
      .82 + seeded(profile.seed + index, leafIndex) * .22,
      [Math.cos(angle) * 1.2, (leafIndex % 4) * .35, Math.sin(angle) * .98],
      leafIndex % 2 ? profile.wall : 0x3f7547,
      textured(pack, "leaf", {
        physical: true,
        scale: [1.22, .68, .9],
        segments: 20,
        roughness: .72,
        sheen: .28,
        sheenColor: 0xa9d777,
        clearcoat: .05,
        bumpScale: .05
      })
    );
    leaf.castShadow = true;
  }
  const start = crown.rotation.z;
  motion.push((time) => {
    crown.rotation.z = start + Math.sin(time * .00085 * profile.motion + index) * .055;
    crown.rotation.x = Math.cos(time * .0007 * profile.motion + index) * .025;
  });
  return group;
}

function buildJungle(scene, profile, motion, pack) {
  const room = addRoom(scene, profile, pack, { outdoor: true });
  scene.background = new THREE.Color(profile.sky);
  for (let index = 0; index < 8; index += 1) {
    const side = index % 2 ? 1 : -1;
    addTree(room, profile, pack, side * (4.7 + seeded(profile.seed, index) * 1.65), -4 + Math.floor(index / 2) * 2.65, .8 + seeded(profile.seed + 3, index) * .3, index, motion);
  }
  const stage = addCylinder(room, [3.15, 3.15], .48, [-1.8, .24, -1.7], 0x8b623f, textured(pack, "wood", {
    physical: true,
    segments: 48,
    roughness: .58,
    clearcoat: .08,
    bumpScale: .07
  }));
  stage.receiveShadow = true;
  for (const x of [-4.5, .9]) {
    addCylinder(room, [.15, .2], 3.6, [x, 2, -2.6], 0x65452f, textured(pack, "bark", { segments: 20, roughness: .94, bumpScale: .08 }));
  }
  addBox(room, [5.6, .18, .2], [-1.8, 3.75, -2.6], 0x65452f, textured(pack, "bark", { roughness: .94, bumpScale: .08 }));
  for (let index = 0; index < 9; index += 1) {
    const charm = addSphere(room, .11, [-4.25 + index * .62, 3.3 - (index % 3) * .18, -2.5], index % 2 ? profile.accent : profile.secondary, {
      physical: true,
      segments: 18,
      roughness: .3,
      clearcoat: .42,
      metalness: .08
    });
    const baseY = charm.position.y;
    motion.push((time) => {
      charm.position.y = baseY + Math.sin(time * .00135 * profile.motion + index) * .12;
      charm.rotation.y += .008 * profile.motion;
    });
  }
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(2.25, 40),
    material(0x4d9d99, { physical: true, opacity: .78, metalness: .12, roughness: .1, clearcoat: .9, clearcoatRoughness: .12 })
  );
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(3.6, .03, 2.15);
  room.add(pond);
  const rings = [];
  for (let index = 0; index < 4; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.24, .29, 32),
      new THREE.MeshBasicMaterial({ color: 0xc9eee2, transparent: true, opacity: .35, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(3.6, .06 + index * .005, 2.15);
    room.add(ring);
    rings.push(ring);
  }
  motion.push((time) => {
    pond.material.opacity = .67 + Math.sin(time * .001 * profile.motion) * .08;
    rings.forEach((ring, index) => {
      const cycle = (time * .00022 * profile.motion + index * .25) % 1;
      ring.scale.setScalar(.6 + cycle * 6);
      ring.material.opacity = .4 * (1 - cycle);
    });
  });
  const vines = [];
  for (let index = 0; index < 7; index += 1) {
    const vine = addCylinder(room, [.025, .045], 2.2 + index % 3 * .5, [-6 + index * 2, 6.7, -4.7], 0x3f7547, textured(pack, "leaf", {
      rotation: [0, 0, .08],
      physical: true,
      roughness: .78,
      sheen: .2,
      bumpScale: .035,
      segments: 14
    }));
    vines.push(vine);
  }
  motion.push((time) => {
    vines.forEach((vine, index) => { vine.rotation.z = .08 + Math.sin(time * .0009 * profile.motion + index) * .1; });
  });
  for (let index = 0; index < 18; index += 1) {
    const firefly = addSphere(room, .045, [0, 0, 0], profile.accent, {
      emissive: profile.accent,
      emissiveIntensity: 1.5,
      roughness: .1,
      castShadow: false
    });
    motion.push((time) => {
      const speed = time * .00022 * profile.motion + index;
      firefly.position.set(
        Math.sin(speed * (1.1 + index % 3 * .1)) * (2.6 + index % 4),
        1.1 + (Math.sin(speed * 1.8 + index) + 1) * 1.9,
        Math.cos(speed * 1.3 + index) * 3.4
      );
      firefly.material.emissiveIntensity = .8 + (Math.sin(speed * 8) + 1) * .65;
    });
  }
  for (let index = 0; index < 22; index += 1) {
    const fern = new THREE.Mesh(
      new THREE.ConeGeometry(.12 + seeded(profile.seed, index) * .08, .65 + seeded(profile.seed + 2, index) * .4, 5),
      material(0x4c8b53, textured(pack, "leaf", { physical: true, roughness: .76, sheen: .2, bumpScale: .035 }))
    );
    fern.position.set((seeded(profile.seed + 4, index) - .5) * 12.5, .38, -4.5 + seeded(profile.seed + 8, index) * 9.5);
    fern.rotation.z = (seeded(profile.seed + 11, index) - .5) * .45;
    fern.castShadow = true;
    room.add(fern);
    const baseZ = fern.rotation.z;
    motion.push((time) => { fern.rotation.z = baseZ + Math.sin(time * .0009 * profile.motion + index) * .055; });
  }
  addCapybara(room, profile, pack, [-.2, 0, 2.2], "racket", motion);
}

const BUILDERS = Object.freeze({
  school: buildSchool,
  activity: buildActivity,
  courthouse: buildCourthouse,
  village: buildVillage,
  jungle: buildJungle
});

export class LiveBuildingInterior {
  constructor({ canvas, container }) {
    this.canvas = canvas;
    this.container = container;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.motion = [];
    this.texturePack = null;
    this.frame = 0;
    this.active = false;
    this.reducedMotion = false;
    this.quality = "high";
    this.environment = { isDay: true, weather: "clear", season: "summer", windSpeed: 0, currentMinutes: 720 };
    this.environmentState = { night: 0, precipitation: 0, fog: 0, storm: 0 };
    this.environmentTarget = { ...this.environmentState };
    this.lights = null;
    this.weatherField = null;
    this.lastWeatherFrame = 0;
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.pulse = 0;
    this.profile = null;
    this.baseCamera = new THREE.Vector3(8.8, 6.35, 12.8);
    this.lookTarget = new THREE.Vector3(0, 2.35, -.5);
    this.boundResize = () => this.resize();
    this.boundPointerMove = (event) => this.pointerMove(event);
    this.boundPointerLeave = () => { this.pointer.tx = 0; this.pointer.ty = 0; };
    this.boundPointerDown = () => { this.pulse = 1; };
    this.boundVisibility = () => this.syncLoop();
    this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(this.boundResize) : null;
    this.resizeObserver?.observe(canvas);
    canvas?.addEventListener("pointermove", this.boundPointerMove, { passive: true });
    canvas?.addEventListener("pointerleave", this.boundPointerLeave, { passive: true });
    canvas?.addEventListener("pointerdown", this.boundPointerDown, { passive: true });
    document.addEventListener("visibilitychange", this.boundVisibility);
  }

  ensureRenderer() {
    if (this.renderer || !this.canvas) return Boolean(this.renderer);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
      const preset = QUALITY_PRESETS[this.quality];
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
      this.renderer.shadowMap.enabled = preset.shadowSize > 0;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = preset.exposure;
      return true;
    } catch {
      this.canvas.classList.add("webgl-unavailable");
      return false;
    }
  }

  open(building, { reducedMotion = false, quality = this.quality, environment = this.environment } = {}) {
    this.quality = QUALITY_PRESETS[quality] ? quality : "high";
    if (!this.ensureRenderer()) return false;
    this.applyQuality();
    const profile = LIVE_INTERIOR_PROFILES[building?.id];
    if (!profile) return false;
    this.disposeScene();
    this.profile = profile;
    this.reducedMotion = Boolean(reducedMotion);
    this.motion = [];
    this.texturePack = createTexturePack(profile, this.renderer);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(profile.sky);
    this.scene.fog = new THREE.Fog(profile.sky, 14, 30);
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 80);
    this.camera.position.copy(this.baseCamera);
    this.camera.lookAt(this.lookTarget);
    const ambient = new THREE.AmbientLight(0xb9c9c3, .46);
    this.scene.add(ambient);
    const hemisphere = new THREE.HemisphereLight(profile.sky, 0x3a3028, 1.35);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffefd1, 2.45);
    sun.position.set(-5.5, 10, 8);
    sun.castShadow = QUALITY_PRESETS[this.quality].shadowSize > 0;
    sun.shadow.mapSize.set(
      Math.max(512, QUALITY_PRESETS[this.quality].shadowSize),
      Math.max(512, QUALITY_PRESETS[this.quality].shadowSize)
    );
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -.00045;
    this.scene.add(sun);
    const accentLight = new THREE.PointLight(profile.accent, 22, 18, 2);
    accentLight.position.set(4, 5.8, 3.5);
    this.scene.add(accentLight);
    const cameraFill = new THREE.PointLight(0xb7d5d2, 13, 28, 2);
    cameraFill.position.set(6.8, 6.2, 11);
    this.scene.add(cameraFill);
    this.motion.push((time) => {
      const nightLift = 1 + this.environmentState.night * .22;
      accentLight.intensity = (20 + Math.sin(time * .0009 * profile.motion) * 2.2 + this.pulse * 7) * nightLift;
    });
    this.lights = { ambient, hemisphere, sun, accent: accentLight, cameraFill };
    BUILDERS[profile.kind]?.(this.scene, profile, this.motion, this.texturePack);
    this.syncAnimalVisibility();
    addSceneLighting(this.scene, profile, this.motion);
    addMotes(this.scene, profile, profile.kind === "jungle" ? 52 : 28, this.motion);
    this.createWeatherField();
    this.setEnvironment(environment, { immediate: true });
    this.active = true;
    this.canvas.classList.add("active");
    this.container?.classList.add("live-3d-ready");
    this.resize();
    this.render(performance.now());
    this.syncLoop();
    return true;
  }

  setReducedMotion(reducedMotion) {
    this.reducedMotion = Boolean(reducedMotion);
    this.syncAnimalVisibility();
    this.syncLoop();
    if (this.active) this.render(performance.now());
  }

  syncAnimalVisibility() {
    this.scene?.traverse((object) => {
      if (object.userData?.isAnimal) object.visible = !this.reducedMotion;
    });
  }

  setQuality(quality) {
    this.quality = QUALITY_PRESETS[quality] ? quality : "high";
    this.applyQuality();
    if (this.active) this.render(performance.now());
  }

  applyQuality() {
    if (!this.renderer) return;
    const preset = QUALITY_PRESETS[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    this.renderer.shadowMap.enabled = preset.shadowSize > 0;
    if (this.lights?.sun) {
      this.lights.sun.castShadow = preset.shadowSize > 0;
      if (preset.shadowSize > 0 && this.lights.sun.shadow.mapSize.x !== preset.shadowSize) {
        this.lights.sun.shadow.map?.dispose?.();
        this.lights.sun.shadow.map = null;
        this.lights.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
      }
    }
    this.weatherField?.geometry.setDrawRange(0, preset.particleCount);
    this.resize();
  }

  setEnvironment(environment = {}, { immediate = false } = {}) {
    const weather = environment.weatherKind || environment.weather || this.environment.weather || "clear";
    this.environment = { ...this.environment, ...environment, weather };
    const precipitation = ["rain", "snow", "storm"].includes(weather) ? 1 : 0;
    this.environmentTarget = {
      night: this.environment.isDay === false ? 1 : 0,
      precipitation,
      fog: weather === "fog" ? 1 : weather === "storm" ? .74 : weather === "rain" || weather === "snow" ? .48 : weather === "cloudy" ? .18 : 0,
      storm: weather === "storm" ? 1 : 0
    };
    if (immediate || !this.active) this.environmentState = { ...this.environmentTarget };
    if (this.active && this.reducedMotion) this.render(performance.now());
  }

  createWeatherField() {
    if (!this.scene || !this.profile) return;
    const count = QUALITY_PRESETS.ultra.particleCount;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (seeded(this.profile.seed + 71, index) - .5) * 20;
      positions[index * 3 + 1] = seeded(this.profile.seed + 73, index) * 13;
      positions[index * 3 + 2] = (seeded(this.profile.seed + 79, index) - .5) * 15;
      speeds[index] = .55 + seeded(this.profile.seed + 83, index) * .95;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, QUALITY_PRESETS[this.quality].particleCount);
    const weatherMaterial = new THREE.PointsMaterial({
      color: 0xb9d9e5,
      size: .045,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true
    });
    const points = new THREE.Points(geometry, weatherMaterial);
    points.frustumCulled = false;
    this.scene.add(points);
    this.weatherField = { points, geometry, material: weatherMaterial, positions, speeds };
  }

  updateAtmosphere(time) {
    if (!this.scene || !this.profile) return;
    const easing = this.reducedMotion ? 1 : .026;
    for (const key of Object.keys(this.environmentState)) {
      this.environmentState[key] += (this.environmentTarget[key] - this.environmentState[key]) * easing;
    }
    const { night, fog, storm } = this.environmentState;
    const daylight = new THREE.Color(this.profile.sky);
    const nightSky = new THREE.Color(this.profile.kind === "jungle" ? 0x102c25 : 0x18243a);
    const stormSky = new THREE.Color(0x48545a);
    const seasonTint = new THREE.Color({
      spring: 0xa9caa6,
      summer: 0xd6c777,
      autumn: 0xbc805c,
      winter: 0xb9cad8
    }[this.environment.season] || 0xffffff);
    const sky = daylight.clone().lerp(seasonTint, .07).lerp(nightSky, night * .7).lerp(stormSky, storm * .55);
    const lightningPhase = Math.sin(time * .00043 + this.profile.seed * 3.1);
    const lightning = storm > .25 && lightningPhase > .992 ? Math.pow((lightningPhase - .992) / .008, 2) : 0;
    sky.lerp(new THREE.Color(0xdde7ef), lightning * .58);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = THREE.MathUtils.lerp(14, 6.5, fog);
    this.scene.fog.far = THREE.MathUtils.lerp(30, 18, fog);
    if (this.lights) {
      this.lights.ambient.color.set(night > .5 ? 0x8aa9bd : 0xb9c9c3);
      this.lights.ambient.intensity = .46 + night * .34 - storm * .08 + lightning * .55;
      this.lights.hemisphere.color.copy(daylight).lerp(new THREE.Color(0x52617b), night);
      this.lights.hemisphere.intensity = 1.35 - night * .28 - storm * .22 + lightning * 2.4;
      this.lights.sun.color.set(night > .5 ? 0x91a9d4 : 0xffefd1);
      this.lights.sun.intensity = 2.45 - night * .92 - storm * .62 + lightning * 4.8;
      this.lights.cameraFill.color.set(night > .5 ? 0x83aec3 : 0xc0d6ce);
      this.lights.cameraFill.intensity = 13 + night * 11 + storm * 4;
    }
    const baseExposure = QUALITY_PRESETS[this.quality].exposure;
    const targetExposure = baseExposure - night * .045 - storm * .055 + lightning * .18;
    this.renderer.toneMappingExposure += (targetExposure - this.renderer.toneMappingExposure) * (this.reducedMotion ? 1 : .04);
  }

  updateWeather(time) {
    const field = this.weatherField;
    if (!field) return;
    const weather = this.environment.weather || "clear";
    const strength = this.environmentState.precipitation;
    field.points.visible = strength > .015;
    if (!field.points.visible) {
      this.lastWeatherFrame = time;
      return;
    }
    const isSnow = weather === "snow";
    const delta = Math.min(48, Math.max(0, time - (this.lastWeatherFrame || time)));
    this.lastWeatherFrame = time;
    const wind = Math.max(-1.2, Math.min(1.2, Number(this.environment.windSpeed || 0) / 24));
    field.material.color.set(isSnow ? 0xf5f7f2 : 0xa9cfdf);
    field.material.size = isSnow ? .105 : .04;
    field.material.opacity = strength * (isSnow ? .74 : .58);
    const count = QUALITY_PRESETS[this.quality].particleCount;
    for (let index = 0; index < count; index += 1) {
      const position = index * 3;
      field.positions[position] += (wind + (isSnow ? Math.sin(time * .0007 + index) * .3 : .08)) * delta * .004;
      field.positions[position + 1] -= field.speeds[index] * delta * (isSnow ? .0017 : .009);
      if (field.positions[position + 1] < -.2) {
        field.positions[position] = (seeded(this.profile.seed + Math.floor(time / 80), index) - .5) * 20;
        field.positions[position + 1] = 12;
        field.positions[position + 2] = (seeded(this.profile.seed + 97 + Math.floor(time / 110), index) - .5) * 15;
      }
    }
    field.geometry.attributes.position.needsUpdate = true;
  }

  pointerMove(event) {
    if (!this.active || this.reducedMotion) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.tx = ((event.clientX - rect.left) / rect.width - .5) * 2;
    this.pointer.ty = ((event.clientY - rect.top) / rect.height - .5) * 2;
  }

  resize() {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.active) this.render(performance.now());
  }

  syncLoop() {
    const shouldRun = this.active && !this.reducedMotion && !document.hidden;
    if (shouldRun && !this.frame) this.frame = requestAnimationFrame((time) => this.animate(time));
    if (!shouldRun && this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  animate(time) {
    this.frame = 0;
    if (!this.active || this.reducedMotion || document.hidden) return;
    this.pointer.x += (this.pointer.tx - this.pointer.x) * .035;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * .035;
    this.pulse *= .94;
    this.motion.forEach((update) => update(time));
    this.render(time);
    this.frame = requestAnimationFrame((next) => this.animate(next));
  }

  render(time) {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.updateAtmosphere(time);
    this.updateWeather(time);
    const drift = this.reducedMotion ? 0 : Math.sin(time * .00016 * (this.profile?.motion || 1)) * .08;
    this.camera.position.set(
      this.baseCamera.x + this.pointer.x * .46 + drift,
      this.baseCamera.y - this.pointer.y * .22,
      this.baseCamera.z + this.pointer.y * .18 - this.pulse * .16
    );
    this.camera.lookAt(this.lookTarget.x + this.pointer.x * .14, this.lookTarget.y - this.pointer.y * .09, this.lookTarget.z);
    this.renderer.render(this.scene, this.camera);
  }

  close() {
    this.active = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas?.classList.remove("active");
    this.container?.classList.remove("live-3d-ready");
    this.disposeScene();
  }

  disposeScene() {
    if (this.scene) {
      this.scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((entry) => entry.dispose?.());
        else object.material?.dispose?.();
      });
      this.scene.clear();
      this.scene = null;
    }
    if (this.texturePack) {
      Object.values(this.texturePack).forEach((texture) => texture.dispose?.());
      this.texturePack = null;
    }
    this.camera = null;
    this.motion = [];
    this.lights = null;
    this.weatherField = null;
    this.lastWeatherFrame = 0;
  }
}
