import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function createOpalC1() {
  const camera = new T.Group();
  camera.name = "Opal C1 white camera";
  const white = new T.MeshStandardMaterial({
    color: "#e8e7df",
    roughness: 0.65,
  });
  const black = new T.MeshStandardMaterial({
    color: "#161719",
    roughness: 0.34,
    metalness: 0.6,
  });
  const rim = new T.MeshStandardMaterial({
    color: "#727575",
    roughness: 0.27,
    metalness: 0.9,
  });
  const glass = new T.MeshPhysicalMaterial({
    color: "#252b32",
    roughness: 0.08,
    metalness: 0.38,
    clearcoat: 1,
  });
  function part(
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const item = new T.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.castShadow = item.receiveShadow = true;
    camera.add(item);
    return item;
  }
  function disc(
    radius: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material = black,
  ) {
    const item = part(
      new T.CylinderGeometry(radius, radius, depth, 64),
      material,
      x,
      y,
      z,
    );
    item.rotation.x = Math.PI / 2;
    return item;
  }
  part(
    new RoundedBoxGeometry(0.29, 0.165, 0.042, 2, 0.0015),
    white,
    0,
    0,
    -0.004,
  );
  const face = new T.Shape();
  face.moveTo(-0.145, -0.0825);
  face.lineTo(0.145, -0.0825);
  face.lineTo(0.145, 0.0825);
  face.lineTo(-0.145, 0.0825);
  face.closePath();
  const weave = document.createElement("canvas");
  weave.width = weave.height = 64;
  const weaveContext = weave.getContext("2d")!;
  weaveContext.fillStyle = "#151719";
  weaveContext.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      weaveContext.fillStyle = (row + col) % 2 ? "#44494a" : "#737776";
      weaveContext.fillRect(col * 8, row * 8 + 2, 6, 3);
    }
  }
  const meshTexture = new T.CanvasTexture(weave);
  meshTexture.colorSpace = T.SRGBColorSpace;
  const grille = new T.MeshStandardMaterial({
    map: meshTexture,
    roughness: 0.85,
  });
  for (const x of [0.021, 0.054, 0.087, 0.12]) {
    for (const y of [-0.046, 0, 0.046]) {
      const hole = new T.Path();
      hole.absarc(x, y, 0.0085, 0, Math.PI * 2, true);
      face.holes.push(hole);
      part(new T.CircleGeometry(0.0085, 24), grille, x, y, 0.0172);
    }
  }
  part(
    new T.ExtrudeGeometry(face, {
      depth: 0.005,
      bevelEnabled: false,
      curveSegments: 24,
    }),
    white,
    0,
    0,
    0.0175,
  );
  disc(0.067, 0.023, -0.073, 0, 0.033);
  disc(0.0655, 0.002, -0.073, 0, 0.045, rim);
  disc(0.0635, 0.002, -0.073, 0, 0.0465);
  disc(0.039, 0.002, -0.073, 0, 0.048, glass);
  for (const radius of [0.036, 0.031, 0.026, 0.021, 0.015]) {
    part(new T.TorusGeometry(radius, 0.0011, 8, 64), rim, -0.073, 0, 0.049);
  }
  disc(0.011, 0.002, -0.073, 0, 0.05, glass);
  const highlight = new T.MeshBasicMaterial({
    color: "#a9bcc3",
    transparent: true,
    opacity: 0.48,
  });
  part(new T.CircleGeometry(0.003, 16), highlight, -0.076, 0.003, 0.0511);
  const lettering = document.createElement("canvas");
  lettering.width = lettering.height = 1024;
  const ctx = lettering.getContext("2d")!;
  ctx.fillStyle = "#dddeda";
  ctx.font = "500 38px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  function arcText(text: string, start: number, step: number, bottom = false) {
    for (let i = 0; i < text.length; i++) {
      const angle = start + i * step;
      ctx.save();
      ctx.translate(512 + Math.sin(angle) * 405, 512 - Math.cos(angle) * 405);
      ctx.rotate(angle + (bottom ? Math.PI : 0));
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
    }
  }
  arcText("OPAL C1", -0.42, 0.14);
  ctx.font = "500 30px Arial";
  arcText("f 1.8 / 3.3 mm", Math.PI + 0.66, -0.11, true);
  const labelTexture = new T.CanvasTexture(lettering);
  labelTexture.colorSpace = T.SRGBColorSpace;
  part(
    new T.PlaneGeometry(0.127, 0.127),
    new T.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
    }),
    -0.073,
    0,
    0.0515,
  );
  part(
    new T.CylinderGeometry(0.047, 0.047, 0.019, 48),
    black,
    -0.073,
    -0.092,
    0,
  );
  part(new T.SphereGeometry(0.028, 32, 24), rim, -0.073, -0.122, 0);
  part(
    new T.CylinderGeometry(0.035, 0.035, 0.053, 48),
    black,
    -0.073,
    -0.158,
    0,
  );
  part(new T.CylinderGeometry(0.02, 0.022, 0.025, 32), rim, -0.073, -0.197, 0);
  const lock = part(
    new T.CylinderGeometry(0.012, 0.012, 0.035, 24),
    black,
    -0.116,
    -0.145,
    0,
  );
  lock.rotation.z = Math.PI / 2;
  return camera;
}

export function createElgatoArm() {
  const arm = new T.Group();
  arm.name = "Elgato Wave Mic Arm LP";
  const black = new T.MeshStandardMaterial({
    color: "#181a1d",
    roughness: 0.52,
    metalness: 0.55,
  });
  const cover = new T.MeshStandardMaterial({
    color: "#25282b",
    roughness: 0.65,
    metalness: 0.3,
  });
  const rubber = new T.MeshStandardMaterial({
    color: "#090a0b",
    roughness: 0.96,
  });
  const steel = new T.MeshStandardMaterial({
    color: "#787d82",
    roughness: 0.4,
    metalness: 0.9,
  });
  function part(
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    arm.add(mesh);
    return mesh;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material = black,
  ) {
    return part(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.15),
      material,
      x,
      y,
      z,
    );
  }
  function cylinder(
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material = black,
  ) {
    return part(
      new T.CylinderGeometry(radius, radius, height, 24),
      material,
      x,
      y,
      z,
    );
  }
  function bar(
    a: T.Vector3,
    b: T.Vector3,
    width: number,
    height: number,
    material = black,
  ) {
    const center = a.clone().add(b).multiplyScalar(0.5);
    const mesh = box(
      width,
      height,
      a.distanceTo(b),
      center.x,
      center.y,
      center.z,
      material,
    );
    mesh.quaternion.setFromUnitVectors(
      new T.Vector3(0, 0, 1),
      b.clone().sub(a).normalize(),
    );
    return mesh;
  }
  // A padded C-clamp straddles the desktop; dimensions follow Elgato's LP drawing.
  box(0.13, 0.025, 0.16, 0, 0.0125, 0.015);
  box(0.13, 0.19, 0.025, 0, -0.07, -0.077);
  box(0.13, 0.025, 0.14, 0, -0.16, -0.01);
  box(0.115, 0.009, 0.115, 0, 0, 0.025, rubber);
  cylinder(0.012, 0.12, 0, -0.14, 0.025, steel);
  cylinder(0.045, 0.014, 0, -0.103, 0.025, rubber);
  cylinder(0.025, 0.035, 0, -0.21, 0.025);
  box(0.12, 0.022, 0.03, 0, -0.23, 0.025);
  const clamp = new T.Group();
  clamp.name = "Side-edge desk clamp";
  for (const child of [...arm.children]) clamp.add(child);
  clamp.rotation.y = Math.PI / 2;
  arm.add(clamp);
  cylinder(0.044, 0.16, 0, 0.1, 0);
  cylinder(0.054, 0.027, 0, 0.175, 0);
  const base = new T.Vector3(0, 0.18, 0);
  const elbow = new T.Vector3(0.7, 0.18, -0.12);
  bar(base, elbow, 0.072, 0.064);
  bar(
    base.clone().add(new T.Vector3(0.05, 0.034, 0)),
    elbow.clone().add(new T.Vector3(-0.055, 0.034, 0)),
    0.055,
    0.006,
    cover,
  );
  cylinder(0.051, 0.14, elbow.x, 0.23, elbow.z);
  const upperStart = new T.Vector3(elbow.x, 0.32, elbow.z);
  const upperEnd = new T.Vector3(1.44, 0.01, 0.70);
  bar(upperStart, upperEnd, 0.071, 0.061);
  bar(
    upperStart.clone().add(new T.Vector3(0, 0.033, 0.055)),
    upperEnd.clone().add(new T.Vector3(0, 0.033, -0.055)),
    0.054,
    0.006,
    cover,
  );
  const pivot = cylinder(0.046, 0.087, elbow.x, 0.32, elbow.z);
  pivot.rotation.z = Math.PI / 2;
  const screw = cylinder(0.018, 0.094, elbow.x, 0.32, elbow.z, steel);
  screw.rotation.z = Math.PI / 2;
  cylinder(0.032, 0.05, upperEnd.x, upperEnd.y + 0.02, upperEnd.z);
  const socket = new T.Group();
  socket.name = "SM7B mount";
  socket.position.set(upperEnd.x, upperEnd.y + 0.045, upperEnd.z);
  arm.add(socket);
  const label = document.createElement("canvas");
  label.width = 512;
  label.height = 128;
  const context = label.getContext("2d")!;
  context.fillStyle = "#b7babe";
  context.font = "500 68px Arial";
  context.textAlign = "center";
  context.fillText("elgato", 256, 88);
  const texture = new T.CanvasTexture(label);
  texture.colorSpace = T.SRGBColorSpace;
  const logo = part(
    new T.PlaneGeometry(0.21, 0.052),
    new T.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.8,
    }),
    0.27,
    0.18,
    0.038,
  );
  logo.rotation.y = -0.024;
  return { arm, socket };
}

// SM7B proportions and yoke from Shure's published product drawing; front is +Z.
export function createShureSM7B() {
  const microphone = new T.Group();
  microphone.name = "Shure SM7B recreation";
  const body = new T.MeshStandardMaterial({
    color: "#202124",
    roughness: 0.62,
    metalness: 0.35,
  });
  const foam = new T.MeshStandardMaterial({ color: "#101113", roughness: 1 });
  const metal = new T.MeshStandardMaterial({
    color: "#343639",
    roughness: 0.5,
    metalness: 0.65,
  });
  const grain = document.createElement("canvas");
  grain.width = grain.height = 128;
  const ctx = grain.getContext("2d")!;
  const pixels = ctx.createImageData(128, 128);
  let seed = 712;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 90 + (seed % 120);
    pixels.data.set([value, value, value, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  foam.bumpMap = new T.CanvasTexture(grain);
  foam.bumpMap.wrapS = foam.bumpMap.wrapT = T.RepeatWrapping;
  foam.bumpScale = 0.0015;
  function add(
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    microphone.add(mesh);
    return mesh;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ) {
    return add(new RoundedBoxGeometry(w, h, d, 2, 0.006), body, x, y, z);
  }
  function cylinder(
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    material = body,
  ) {
    const mesh = add(
      new T.CylinderGeometry(radius, radius, length, 32),
      material,
      x,
      y,
      z,
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  // U-shaped suspension bracket and the two captive adjustment knobs.
  box(0.18, 0.026, 0.045, 0, 0.014, -0.04);
  for (const side of [-1, 1]) {
    box(0.018, 0.14, 0.046, side * 0.082, 0.078, -0.04);
    const knob = cylinder(0.025, 0.035, side * 0.095, 0.14, -0.04, metal);
    knob.rotation.set(0, 0, Math.PI / 2);
    const cap = cylinder(0.012, 0.037, side * 0.095, 0.14, -0.04);
    cap.rotation.set(0, 0, Math.PI / 2);
  }
  const bracketParts = new Set(microphone.children);
  cylinder(0.064, 0.185, 0, 0.14, -0.045);
  cylinder(0.066, 0.016, 0, 0.14, -0.145, metal);
  cylinder(0.057, 0.008, 0, 0.14, -0.157);
  const windscreen = add(
    new T.CapsuleGeometry(0.068, 0.126, 8, 32),
    foam,
    0,
    0.14,
    0.119,
  );
  windscreen.rotation.x = Math.PI / 2;
  // Rear response switches and XLR socket next to the stand mount.
  for (const x of [-0.024, 0.024]) box(0.013, 0.038, 0.008, x, 0.14, -0.163);
  cylinder(0.023, 0.06, 0.045, 0.055, -0.115, metal);
  cylinder(0.018, 0.007, 0.045, 0.055, -0.15, foam);
  const label = document.createElement("canvas");
  label.width = 512;
  label.height = 128;
  const labelCtx = label.getContext("2d")!;
  labelCtx.fillStyle = "#dededb";
  labelCtx.font = "bold 62px Arial";
  labelCtx.textAlign = "center";
  labelCtx.fillText("SHURE", 256, 58);
  labelCtx.font = "32px Arial";
  labelCtx.fillText("SM7B", 256, 106);
  const texture = new T.CanvasTexture(label);
  texture.colorSpace = T.SRGBColorSpace;
  for (const side of [-1, 1]) {
    const logo = add(
      new T.PlaneGeometry(0.09, 0.025),
      new T.MeshStandardMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        roughness: 0.8,
      }),
      side * 0.0645,
      0.15,
      -0.082,
    );
    logo.rotation.y = (side * Math.PI) / 2;
  }
  const capsule = new T.Group();
  capsule.position.set(0, 0.14, -0.04);
  for (const part of [...microphone.children]) {
    if (bracketParts.has(part)) continue;
    part.position.sub(capsule.position);
    capsule.add(part);
  }
  capsule.rotation.x = -Math.PI / 7;
  microphone.add(capsule);
  microphone.scale.setScalar(1.6);
  return microphone;
}
