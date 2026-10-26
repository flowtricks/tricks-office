import fs from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function loadTestModel(file) {
  const bytes = fs.readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  delete gltf.images;
  delete gltf.textures;
  delete gltf.materials;
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) delete primitive.material;
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 32),
  ]);
  const tail = bytes.subarray(20 + jsonLength);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(20 + padded.length + tail.length, 8);
  header.writeUInt32LE(padded.length, 12);
  const packed = Buffer.concat([header, padded, tail]);
  return await new GLTFLoader().parseAsync(
    packed.buffer.slice(
      packed.byteOffset,
      packed.byteOffset + packed.byteLength,
    ),
    "",
  );
}

export async function loadTestChair() {
  const T = await import("three");
  const { prepareOfficeChair } = await import("../src/scripts/office-chair.ts");
  globalThis.document ??= {
    createElement: () => ({ getContext: () => ({ fillRect() {} }) }),
  };
  const chair = new T.Group();
  chair.add(
    prepareOfficeChair(
      (await loadTestModel("public/models/office-chair.glb")).scene,
    ),
  );
  chair.updateWorldMatrix(true, true);
  const seat = chair.getObjectByName("Seat_mesh_Mesh_0");
  const bounds = new T.Box3().setFromObject(seat);
  const precise = new T.Box3().setFromObject(seat, true);
  if (Math.abs(bounds.max.y - precise.max.y) > 0.000001)
    throw new Error("Seat bounds do not match its rendered geometry");
  const vertex = new T.Vector3();
  let baseRadius = 0,
    baseHeight = 0;
  chair.traverse((mesh) => {
    if (!mesh.isMesh || !/Etoile|Roulette/.test(mesh.name)) return;
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      baseRadius = Math.max(baseRadius, Math.hypot(vertex.x, vertex.z));
      baseHeight = Math.max(baseHeight, vertex.y);
    }
  });
  return { chair, seatHeight: bounds.max.y, baseRadius, baseHeight };
}
