import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function part(
  parent: T.Object3D,
  geometry: T.BufferGeometry,
  material: T.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function curve(
  parent: T.Object3D,
  points: T.Vector3[],
  radius: number,
  material: T.Material,
) {
  return part(
    parent,
    new T.TubeGeometry(
      new T.CatmullRomCurve3(points),
      Math.max(12, points.length * 6),
      radius,
      5,
      false,
    ),
    material,
  );
}

function lathe(parent: T.Object3D, profile: number[][], material: T.Material) {
  return part(
    parent,
    new T.LatheGeometry(
      profile.map(([r, y]) => new T.Vector2(r, y)),
      48,
    ),
    material,
  );
}

function combine(parent: T.Group) {
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  parent.updateMatrixWorld(true);
  const meshes: T.Mesh[] = [];
  parent.traverse((object) => {
    if (
      !(object instanceof T.Mesh) ||
      object.userData.reactiveLeaf ||
      object.parent?.userData.reactiveBranch ||
      Array.isArray(object.material) ||
      object.material.transparent
    )
      return;
    const geometry = (
      object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone()
    ).applyMatrix4(object.matrixWorld);
    const geometries = batches.get(object.material) ?? [];
    geometries.push(geometry);
    batches.set(object.material, geometries);
    meshes.push(object);
  });
  const originals = new Set(meshes.map((object) => object.geometry));
  for (const object of meshes) object.removeFromParent();
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    if (geometry) part(parent, geometry, material);
    for (const source of geometries) source.dispose();
  }
  for (const geometry of originals) geometry.dispose();
}

function leafGeometry(length: number, width: number, curl: number) {
  const rows = 20,
    columns = 8;
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const spread = Math.pow(Math.sin(Math.PI * t), 0.72);
    for (let column = 0; column <= columns; column++) {
      const s = (column / columns) * 2 - 1;
      positions.push(
        s * width * 0.5 * spread,
        t * length,
        length *
          (curl * t * t +
            0.065 * Math.abs(s) * spread +
            0.008 * Math.sin(t * 65) * s * s),
      );
      uv.push(0.568 + t * 0.03 + s * 0.098 * spread, 1 - (0.35 - t * 0.3));
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column,
          b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export async function createOfficeBotanicals() {
  const loader = new T.TextureLoader();
  const [color, normal] = await Promise.all([
    loader.loadAsync("/textures/plants/leaf-color.jpg"),
    loader.loadAsync("/textures/plants/leaf-normal.jpg"),
  ]);
  color.colorSpace = T.SRGBColorSpace;
  color.anisotropy = normal.anisotropy = 4;
  const foliage = new T.MeshPhysicalMaterial({
    map: color,
    normalMap: normal,
    normalScale: new T.Vector2(0.35, 0.35),
    roughness: 0.7,
    side: T.DoubleSide,
    clearcoat: 0.08,
    clearcoatRoughness: 0.5,
  });
  const young = foliage.clone();
  young.color.set("#c5d3a2");
  const pale = foliage.clone();
  pale.color.set("#c7c1a0");
  pale.roughness = 0.85;
  const dry = foliage.clone();
  dry.color.set("#af8e5a");
  dry.roughness = 0.95;
  const bark = new T.MeshStandardMaterial({
    color: "#6d6244",
    roughness: 0.94,
  });
  const vine = new T.MeshStandardMaterial({ color: "#96966b", roughness: 0.9 });
  const soil = new T.MeshStandardMaterial({ color: "#29231d", roughness: 1 });
  const ceramic = new T.MeshStandardMaterial({
    color: "#dedbd0",
    roughness: 0.73,
  });
  const potBlack = new T.MeshStandardMaterial({
    color: "#161819",
    roughness: 0.78,
  });
  let seed = 7391;
  const random = () =>
    (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;

  function pot(
    parent: T.Group,
    radius: number,
    height: number,
    material: T.Material,
  ) {
    lathe(
      parent,
      [
        [0, 0],
        [radius * 0.78, 0],
        [radius * 0.84, 0.008],
        [radius * 0.99, height - 0.015],
        [radius, height - 0.005],
        [radius * 0.98, height],
        [radius * 0.9, height],
        [radius * 0.89, height - 0.04],
        [radius * 0.7, 0.025],
        [0, 0.025],
      ],
      material,
    );
    part(
      parent,
      new T.CylinderGeometry(radius * 0.89, radius * 0.89, 0.01, 32),
      soil,
      0,
      height - 0.035,
      0,
    );
    for (let i = 0; i < 18; i++) {
      const a = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius * 0.8;
      const pebble = part(
        parent,
        new T.IcosahedronGeometry(0.007 + random() * 0.005, 0),
        bark,
        Math.cos(a) * r,
        height - 0.027,
        Math.sin(a) * r,
      );
      pebble.scale.y = 0.45;
    }
  }

  function floorPlant() {
    const tree = new T.Group();
    tree.name = "Reference broad-leaf ficus in black planter";
    pot(tree, 0.245, 0.55, potBlack);
    for (let stem = 0; stem < 3; stem++) {
      const height = [2.9, 2.45, 2.1][stem];
      const offset = new T.Vector3(
        [0.03, -0.17, 0.18][stem],
        0,
        [0, 0.07, -0.07][stem],
      );
      curve(
        tree,
        [
          new T.Vector3(0, 0.5, 0),
          new T.Vector3(offset.x * 0.4, height * 0.5, offset.z * 0.4),
          new T.Vector3(offset.x, height, offset.z),
        ],
        0.012 - stem * 0.002,
        bark,
      );
      const count = [14, 11, 8][stem];
      for (let i = 0; i < count; i++) {
        const y = 0.73 + (i * (height - 0.8)) / count;
        const a = i * 2.38 + stem * 1.9;
        const start = new T.Vector3(
          (offset.x * y) / height,
          y,
          (offset.z * y) / height,
        );
        const end = start
          .clone()
          .add(new T.Vector3(Math.cos(a) * 0.105, 0.065, Math.sin(a) * 0.105));
        curve(
          tree,
          [
            start,
            start
              .clone()
              .lerp(end, 0.5)
              .add(new T.Vector3(0, 0.015, 0)),
            end,
          ],
          0.004,
          bark,
        );
        const length = 0.4 + random() * 0.14;
        const leaf = part(
          tree,
          leafGeometry(
            length,
            length * (0.57 + random() * 0.1),
            -0.2 + random() * 0.13,
          ),
          i > count - 3 ? young : foliage,
        );
        leaf.position.copy(end);
        leaf.userData.reactiveLeaf = true;
        leaf.rotation.set(
          -0.95 - random() * 0.32,
          Math.PI * 1.5 - a,
          -0.22 + random() * 0.44,
          "YXZ",
        );
      }
    }
    combine(tree);
    return tree;
  }

  function trailingPlant(variant = 0) {
    const plant = new T.Group();
    plant.name = "Reference trailing vine in ivory ceramic pot";
    pot(plant, 0.135, 0.235, ceramic);
    lathe(
      plant,
      [
        [0.105, 0],
        [0.143, 0],
        [0.145, 0.012],
        [0.139, 0.018],
        [0.105, 0.018],
      ],
      ceramic,
    );
    for (let strand = 0; strand < 12; strand++) {
      const a = strand * 2.399 + variant * 0.7;
      const front = Math.sin(a) > -0.2;
      const drop = front ? 0.24 + random() * 0.49 : 0.12 + random() * 0.18;
      const reach = 0.16 + random() * 0.075;
      const dx = Math.cos(a),
        dz = Math.sin(a);
      const points = [
        new T.Vector3(dx * 0.04, 0.215, dz * 0.04),
        new T.Vector3(dx * 0.11, 0.26 + random() * 0.04, dz * 0.11),
        new T.Vector3(dx * reach, 0.1, 0.34),
        new T.Vector3(dx * reach, 0.01, 0.37),
        new T.Vector3(dx * (reach + 0.025), -drop * 0.45, 0.39),
        new T.Vector3(
          dx * reach + Math.sin(strand) * 0.045,
          -drop,
          0.4 + Math.sin(strand) * 0.02,
        ),
      ];
      const branch = new T.Group();
      branch.position.copy(points[0]);
      branch.userData.reactiveBranch = true;
      branch.userData.reactiveDirection = points[points.length - 1]
        .clone()
        .sub(points[0])
        .normalize()
        .toArray();
      branch.userData.reactiveTip = points[points.length - 1]
        .clone()
        .sub(points[0])
        .toArray();
      plant.add(branch);
      const path = new T.CatmullRomCurve3(
        points.map((point) => point.clone().sub(branch.position)),
      );
      part(branch, new T.TubeGeometry(path, 32, 0.0018, 4, false), vine);
      const count = 11 + Math.floor(drop * 14);
      for (let i = 0; i < count; i++) {
        const t = (i + 0.4) / count;
        if (t > 0.8 && random() < 0.3) continue;
        const point = path.getPoint(t);
        const side = i % 2 ? 1 : -1;
        const size = (0.058 + random() * 0.026) * (1 - 0.35 * t);
        const leaf = part(
          branch,
          leafGeometry(size, size * 0.7, -0.1 + random() * 0.28),
          random() < 0.13 ? dry : strand % 3 ? pale : young,
        );
        leaf.position.copy(point);
        leaf.userData.reactiveLeaf = true;
        leaf.rotation.set(
          0.2 + random() * 0.5,
          a + side * 0.7,
          side * (0.65 + random() * 0.7),
          "YXZ",
        );
      }
    }
    combine(plant);
    return plant;
  }
  return {
    floorPlant: floorPlant(),
    trailingPlants: [trailingPlant(), trailingPlant(1)],
  };
}

export function createReferenceShelfLamp(hanging: boolean) {
  const lamp = new T.Group();
  lamp.name = hanging
    ? "Reference curved black globe lamp"
    : "Reference glass-cylinder Edison lamp";
  const black = new T.MeshStandardMaterial({
    color: "#19191b",
    roughness: 0.45,
    metalness: 0.55,
  });
  const brass = new T.MeshStandardMaterial({
    color: "#6c6048",
    roughness: 0.36,
    metalness: 0.8,
  });
  const glass = new T.MeshPhysicalMaterial({
    color: "#fff3db",
    transparent: true,
    opacity: 0.08,
    roughness: 0.06,
    metalness: 0,
    side: T.DoubleSide,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.2,
  });
  const rim = new T.MeshStandardMaterial({
    color: "#d7caaa",
    transparent: true,
    opacity: 0.45,
    roughness: 0.12,
    metalness: 0.3,
    depthWrite: false,
  });
  const filament = new T.MeshStandardMaterial({
    color: "#ffe9a2",
    emissive: "#ffb343",
    emissiveIntensity: 20,
    toneMapped: false,
    roughness: 0.4,
  });
  const radius = hanging ? 0.112 : 0.095;
  lathe(
    lamp,
    [
      [0, 0],
      [radius * 0.92, 0],
      [radius, 0.008],
      [radius, 0.035],
      [radius * 0.94, 0.041],
      [0, 0.041],
    ],
    black,
  );
  const bulb = new T.Group();
  lamp.add(bulb);
  if (hanging) {
    curve(
      lamp,
      [
        new T.Vector3(-0.064, 0.035, 0),
        new T.Vector3(-0.064, 0.52, 0),
        new T.Vector3(-0.061, 0.592, 0),
        new T.Vector3(-0.024, 0.629, 0),
        new T.Vector3(0.042, 0.625, 0),
        new T.Vector3(0.072, 0.59, 0),
        new T.Vector3(0.073, 0.547, 0),
      ],
      0.007,
      black,
    );
    part(
      lamp,
      new T.CylinderGeometry(0.029, 0.029, 0.111, 32),
      black,
      0.073,
      0.5,
      0,
    );
    bulb.position.set(0.073, 0.445, 0);
    bulb.rotation.z = Math.PI;
    for (const x of [-0.084, 0.084])
      part(
        lamp,
        new T.CylinderGeometry(0.009, 0.009, 0.013, 16),
        black,
        x,
        0.047,
        0.015,
      );
  } else {
    part(
      lamp,
      new T.CylinderGeometry(0.035, 0.035, 0.065, 32),
      black,
      0,
      0.074,
      0,
    );
    bulb.position.y = 0.105;
    const shade = part(
      lamp,
      new T.CylinderGeometry(0.093, 0.093, 0.36, 64, 1, true),
      glass,
      0,
      0.224,
      0,
    );
    shade.castShadow = false;
    shade.renderOrder = 3;
    for (const y of [0.045, 0.404]) {
      const edge = part(
        lamp,
        new T.TorusGeometry(0.093, 0.0018, 6, 64),
        rim,
        0,
        y,
        0,
      );
      edge.rotation.x = Math.PI / 2;
      edge.castShadow = false;
    }
    for (const a of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      curve(
        lamp,
        [
          new T.Vector3(0, 0.085, 0),
          new T.Vector3(Math.cos(a) * 0.1, 0.085, Math.sin(a) * 0.1),
        ],
        0.0025,
        brass,
      );
      part(
        lamp,
        new T.SphereGeometry(0.006, 12, 8),
        black,
        Math.cos(a) * 0.1,
        0.085,
        Math.sin(a) * 0.1,
      );
    }
  }
  part(
    bulb,
    new T.CylinderGeometry(0.023, 0.023, 0.032, 24),
    brass,
    0,
    0.016,
    0,
  );
  for (let i = 0; i < 5; i++) {
    const thread = part(
      bulb,
      new T.TorusGeometry(0.023, 0.0018, 5, 24),
      brass,
      0,
      0.004 + i * 0.005,
      0,
    );
    thread.rotation.x = Math.PI / 2;
  }
  const profile = hanging
    ? [
        [0.021, 0.03],
        [0.026, 0.043],
        [0.039, 0.054],
        [0.058, 0.071],
        [0.071, 0.099],
        [0.074, 0.123],
        [0.067, 0.153],
        [0.049, 0.176],
        [0.024, 0.19],
        [0, 0.194],
      ]
    : [
        [0.021, 0.03],
        [0.024, 0.05],
        [0.033, 0.078],
        [0.049, 0.12],
        [0.054, 0.17],
        [0.049, 0.202],
        [0.032, 0.219],
        [0, 0.225],
      ];
  const bulbGlass = lathe(bulb, profile, glass);
  bulbGlass.castShadow = false;
  bulbGlass.renderOrder = 2;
  part(
    bulb,
    new T.CylinderGeometry(0.004, 0.007, 0.08, 12),
    rim,
    0,
    0.065,
    0,
  ).castShadow = false;
  for (let wire = 0; wire < 4; wire++) {
    const a = (wire / 4) * Math.PI * 2;
    const points = Array.from({ length: 41 }, (_, i) => {
      const t = i / 40;
      const r = Math.sin(Math.PI * t) * (hanging ? 0.034 : 0.028);
      return new T.Vector3(
        Math.cos(a) * r + Math.sin(t * 180) * 0.0011,
        0.055 + Math.sin((Math.PI * t) / 2) * (hanging ? 0.104 : 0.139),
        Math.sin(a) * r,
      );
    });
    curve(bulb, points, 0.0025, filament);
  }
  const light = new T.PointLight("#ffac48", hanging ? 1.5 : 1.8, 0.55, 2);
  light.position.copy(
    hanging ? new T.Vector3(0.073, 0.33, 0.04) : new T.Vector3(0, 0.25, 0.04),
  );
  lamp.add(light);
  curve(
    lamp,
    [
      new T.Vector3(0, 0.02, -radius),
      new T.Vector3(-0.05, 0.012, -0.17),
      new T.Vector3(-0.13, 0.008, -0.22),
    ],
    0.003,
    black,
  );
  combine(lamp);
  return lamp;
}
