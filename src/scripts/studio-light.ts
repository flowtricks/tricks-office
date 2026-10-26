import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function createStudioLight(stand: T.Group) {
  const assembly = new T.Group();
  assembly.name = "Light Dome SE + amaran 100d S";
  stand.scale.set(0.72, 2.35, 0.72);
  stand.updateMatrixWorld(true);
  const hardware = new T.Group();
  stand.traverse((object) => {
    if (!(object instanceof T.Mesh)) return;
    const geometry: T.BufferGeometry = object.geometry.clone();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (!attribute.normalized) continue;
      const values = new Float32Array(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++)
        for (let c = 0; c < attribute.itemSize; c++)
          values[i * attribute.itemSize + c] = attribute.getComponent(i, c);
      geometry.setAttribute(
        name,
        new T.Float32BufferAttribute(values, attribute.itemSize),
      );
    }
    geometry.applyMatrix4(object.matrixWorld);
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const thickness = /legs|braces|tubes/i.test(object.name) ? 0.012 : 0.005;
    for (let i = 0; i < positions.count; i++) {
      positions.setXYZ(
        i,
        positions.getX(i) + normals.getX(i) * thickness,
        Math.max(0.008, positions.getY(i) + normals.getY(i) * thickness),
        positions.getZ(i) + normals.getZ(i) * thickness,
      );
    }
    const part = new T.Mesh(geometry, object.material);
    part.name = object.name;
    hardware.add(part);
    object.geometry.dispose();
  });
  assembly.add(hardware);
  const head = new T.Group();
  head.name = "studio-light-head";
  head.position.set(0, 2.73, 0);
  head.rotation.x = 0.16;
  head.rotation.y = Math.atan2(1.5, 1.2);
  assembly.add(head);
  const fabric = new T.MeshStandardMaterial({
    color: "#141519",
    roughness: 0.94,
    side: T.DoubleSide,
  });
  const plastic = new T.MeshStandardMaterial({
    color: "#24272a",
    roughness: 0.65,
  });
  const black = new T.MeshStandardMaterial({
    color: "#090a0b",
    roughness: 0.8,
  });
  const silver = new T.MeshStandardMaterial({
    color: "#8b9096",
    roughness: 0.48,
    metalness: 0.65,
  });
  function mesh(
    geometry: T.BufferGeometry,
    material: T.Material,
    parent: T.Object3D,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    w: number,
    h: number,
    d: number,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) {
    return mesh(
      new RoundedBoxGeometry(w, h, d, 2, 0.008),
      material,
      head,
      x,
      y,
      z,
    );
  }
  function tube(
    points: T.Vector3[],
    radius: number,
    material: T.Material,
    parent: T.Object3D = head,
  ) {
    return mesh(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points),
        Math.max(8, points.length * 5),
        radius,
        5,
        false,
      ),
      material,
      parent,
    );
  }
  function hoop(
    radius: number,
    z: number,
    thickness: number,
    material: T.Material,
  ) {
    return mesh(
      new T.TorusGeometry(radius, thickness, 6, 64),
      material,
      head,
      0,
      0,
      z,
    );
  }
  function canvasTexture(
    draw: (c: CanvasRenderingContext2D) => void,
    w = 1024,
    h = 256,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d")!);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }
  const weave = canvasTexture(
    (c) => {
      c.fillStyle = "#999";
      c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 256; i += 2) {
        c.fillStyle = i % 4 ? "#777" : "#aaa";
        c.fillRect(i, 0, 1, 256);
        c.fillRect(0, i, 256, 1);
      }
    },
    256,
    256,
  );
  weave.wrapS = weave.wrapT = T.RepeatWrapping;
  weave.repeat.set(5, 3);
  fabric.bumpMap = weave;
  fabric.bumpScale = 0.0015;
  const profile = new T.SplineCurve([
    new T.Vector2(0.12, 0.13),
    new T.Vector2(0.27, 0.34),
    new T.Vector2(0.48, 0.56),
    new T.Vector2(0.7, 0.7),
    new T.Vector2(0.92, 0.74),
  ]);
  const samples = profile.getPoints(32);
  const surface = new T.BufferGeometry(),
    positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const ribs = 16,
    segments = 64;
  for (let j = 0; j < samples.length; j++) {
    const p = samples[j];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const r =
        p.y *
        (1 -
          0.012 * Math.sin((a * ribs) / 2) ** 2 * Math.sin((j / 32) * Math.PI));
      positions.push(Math.cos(a) * r, Math.sin(a) * r, p.x);
      uvs.push(i / segments, j / 32);
      if (j < 32 && i < segments) {
        const k = j * (segments + 1) + i;
        indices.push(
          k,
          k + 1,
          k + segments + 1,
          k + 1,
          k + segments + 2,
          k + segments + 1,
        );
      }
    }
  }
  surface.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  surface.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  surface.setIndex(indices);
  surface.computeVertexNormals();
  mesh(surface, fabric, head);
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    tube(
      samples.map(
        (p) =>
          new T.Vector3(
            Math.cos(a) * (p.y + 0.003),
            Math.sin(a) * (p.y + 0.003),
            p.x,
          ),
      ),
      0.004,
      silver,
    );
  }
  hoop(0.741, 0.92, 0.016, black);
  hoop(0.13, 0.12, 0.017, silver);
  const diffuser = new T.MeshStandardMaterial({
    color: "#fffaf0",
    emissive: "#fff4df",
    emissiveIntensity: 1.3,
    roughness: 1,
    side: T.DoubleSide,
  });
  mesh(new T.CircleGeometry(0.721, 64), diffuser, head, 0, 0, 0.908);
  hoop(
    0.721,
    0.911,
    0.004,
    new T.MeshStandardMaterial({ color: "#ddd9cf", roughness: 1 }),
  );
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    mesh(
      new T.SphereGeometry(0.0018, 4, 3),
      silver,
      head,
      Math.cos(a) * 0.746,
      Math.sin(a) * 0.746,
      0.925,
    );
  }
  const domeLabel = canvasTexture((c) => {
    c.fillStyle = "#bfc2c3";
    c.beginPath();
    c.moveTo(32, 204);
    c.lineTo(90, 45);
    c.lineTo(196, 204);
    c.lineTo(146, 204);
    c.lineTo(95, 120);
    c.lineTo(64, 204);
    c.fill();
    c.fillStyle = "#a82031";
    c.beginPath();
    c.moveTo(70, 45);
    c.lineTo(119, 33);
    c.lineTo(173, 152);
    c.closePath();
    c.fill();
    c.fillStyle = "#c7c9c9";
    c.font = 'italic 94px "Comic Sans MS", cursive';
    c.fillText("Light Dome SE", 225, 165, 775);
  });
  const labelMaterial = new T.MeshStandardMaterial({
    map: domeLabel,
    transparent: true,
    depthWrite: false,
    roughness: 0.9,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  for (const side of [0, Math.PI]) {
    const pos: number[] = [],
      uv: number[] = [],
      ix: number[] = [];
    for (let j = 0; j <= 8; j++)
      for (let i = 0; i <= 20; i++) {
        const t = 0.32 + (i / 20) * 0.6,
          p = profile.getPoint(t),
          a = side + (j / 8 - 0.5) * 0.4;
        pos.push(Math.cos(a) * (p.y + 0.008), Math.sin(a) * (p.y + 0.008), p.x);
        uv.push(
          side === 0 ? 1 - i / 20 : i / 20,
          side === 0 ? j / 8 : 1 - j / 8,
        );
        if (i < 20 && j < 8) {
          const k = j * 21 + i;
          ix.push(k, k + 1, k + 21, k + 1, k + 22, k + 21);
        }
      }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(ix);
    geo.computeVertexNormals();
    mesh(geo, labelMaterial, head);
  }
  // Compact vented COB lamp with the same side markings as the reference.
  box(0.25, 0.25, 0.43, plastic, 0, 0, -0.135);
  box(0.27, 0.27, 0.045, silver, 0, 0, 0.09);
  for (let i = 0; i < 9; i++)
    box(0.258, 0.008, 0.17, black, 0, -0.09 + i * 0.021, -0.24);
  for (let x = 0; x < 7; x++)
    for (let z = 0; z < 10; z++) {
      const hole = mesh(
        new T.CircleGeometry(0.008, 6),
        black,
        head,
        -0.095 + x * 0.031,
        0.126,
        -0.3 + z * 0.032 + (x % 2) * 0.01,
      );
      hole.rotation.x = -Math.PI / 2;
    }
  box(0.2, 0.025, 0.2, plastic, 0, 0.185, -0.19);
  for (const x of [-0.087, 0.087])
    box(0.026, 0.075, 0.025, plastic, x, 0.15, -0.28);
  const rear = box(0.19, 0.15, 0.005, black, 0, 0.02, -0.354);
  const dial = mesh(
    new T.CylinderGeometry(0.026, 0.026, 0.018, 20),
    plastic,
    head,
    0.065,
    -0.075,
    -0.365,
  );
  dial.rotation.x = Math.PI / 2;
  box(
    0.07,
    0.035,
    0.006,
    new T.MeshStandardMaterial({
      color: "#a9c6c5",
      emissive: "#a9c6c5",
      emissiveIntensity: 0.15,
    }),
    -0.035,
    0.035,
    rear.position.z - 0.004,
  );
  const amaranLabel = canvasTexture((c) => {
    c.fillStyle = "#d1d3d4";
    c.font = "bold 142px Arial, sans-serif";
    c.fillText("amaran", 18, 122, 985);
    c.font = "80px Arial, sans-serif";
    c.lineWidth = 2;
    c.strokeStyle = "#d1d3d4";
    c.strokeText("100d", 24, 223);
    c.font = "bold 86px Arial, sans-serif";
    c.fillText("S", 510, 226);
  });
  const amaranMaterial = new T.MeshStandardMaterial({
    map: amaranLabel,
    transparent: true,
    depthWrite: false,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  for (const side of [-1, 1]) {
    const label = mesh(
      new T.PlaneGeometry(0.215, 0.1),
      amaranMaterial,
      head,
      side * 0.126,
      -0.015,
      -0.045,
    );
    label.rotation.y = (side * Math.PI) / 2;
  }
  box(0.11, 0.09, 0.12, plastic, 0, -0.17, -0.12);
  tube(
    [
      new T.Vector3(0.1, -0.1, -0.35),
      new T.Vector3(0.16, -0.3, -0.4),
      new T.Vector3(0.06, -0.75, -0.23),
      new T.Vector3(0.035, -1.5, -0.08),
      new T.Vector3(0.02, -2.68, -0.08),
    ],
    0.007,
    black,
  );
  box(0.09, 0.25, 0.055, black, 0.05, -1.12, -0.15);
  return assembly;
}
