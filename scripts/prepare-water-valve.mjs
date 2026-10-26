import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const occt = await require(process.argv[2] || "occt-import-js")();
const source = occt.ReadStepFile(
  fs.readFileSync("scripts/assets/water-shutoff-valve.step"),
  {
    linearUnit: "meter",
    linearDeflectionType: "absolute_value",
    linearDeflection: 0.0003,
    angularDeflection: 0.3,
  },
);
if (!source.success) throw new Error("Valve STEP import failed");
const gltf = {
  asset: {
    version: "2.0",
    copyright:
      "Ball valve - Original MEP CAD by Innerscene. CC0. Flanges removed and lever offset for the reference installation.",
    extras: {
      source:
        "https://www.innerscene.com/tools/library/3d-parts/ball-valve-original-mep-cad-75e8b0f7",
      license: "CC0-1.0",
    },
  },
  scene: 0,
  scenes: [{ nodes: [] }],
  nodes: [],
  meshes: [],
  accessors: [],
  bufferViews: [],
  buffers: [{ byteLength: 0 }],
  materials: [
    {
      name: "Painted shutoff valve",
      pbrMetallicRoughness: {
        baseColorFactor: [0.055, 0.059, 0.053, 1],
        metallicFactor: 0.35,
        roughnessFactor: 0.7,
      },
    },
  ],
};
const chunks = [];
function accessor(array, type, componentType, extrema = false) {
  const itemSize = type === "VEC3" ? 3 : 1;
  const data = Buffer.from(array.buffer);
  const view = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: gltf.buffers[0].byteLength,
    byteLength: data.length,
  });
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
  data.copy(padded);
  chunks.push(padded);
  gltf.buffers[0].byteLength += padded.length;
  const entry = {
    bufferView: view,
    componentType,
    count: array.length / itemSize,
    type,
  };
  if (extrema) {
    entry.min = [Infinity, Infinity, Infinity];
    entry.max = [-Infinity, -Infinity, -Infinity];
    array.forEach((value, i) => {
      entry.min[i % 3] = Math.min(entry.min[i % 3], value);
      entry.max[i % 3] = Math.max(entry.max[i % 3], value);
    });
  }
  gltf.accessors.push(entry);
  return gltf.accessors.length - 1;
}
for (const mesh of source.meshes.filter((mesh) =>
  /pressure body|spindle|lever/.test(mesh.name),
)) {
  const positions = new Float32Array(mesh.attributes.position.array);
  // Offset the hand grip to one side of the pipe, like the reference valve.
  if (/lever/.test(mesh.name))
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] += Math.max(0, Math.min(1, positions[i] / 0.06)) * 0.04;
    }
  const primitive = {
    attributes: {
      POSITION: accessor(positions, "VEC3", 5126, true),
      NORMAL: accessor(
        new Float32Array(mesh.attributes.normal.array),
        "VEC3",
        5126,
      ),
    },
    indices: accessor(new Uint32Array(mesh.index.array), "SCALAR", 5125),
    material: 0,
  };
  gltf.scenes[0].nodes.push(gltf.nodes.length);
  gltf.nodes.push({ name: mesh.name, mesh: gltf.meshes.length });
  gltf.meshes.push({ name: mesh.name, primitives: [primitive] });
}
const json = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
json.copy(jsonChunk);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonChunk.length + bin.length, 8);
header.writeUInt32LE(jsonChunk.length, 12);
header.write("JSON", 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length);
binHeader.write("BIN\0", 4);
fs.writeFileSync(
  "public/models/water-shutoff-valve.glb",
  Buffer.concat([header, jsonChunk, binHeader, bin]),
);
console.log(
  `Valve exported: ${gltf.meshes.length} parts, ${bin.length} geometry bytes`,
);
