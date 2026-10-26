import fs from "node:fs";
import { execFileSync } from "node:child_process";
const bytes = fs.readFileSync("scripts/assets/studio-softbox-source.glb");
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
for (const node of gltf.nodes) {
  if (
    node.mesh !== undefined &&
    !/^Light stand|Tilting bracket/.test(node.name)
  )
    delete node.mesh;
}
gltf.asset.copyright =
  "Studio softbox by Innerscene, CC0. Stand extracted for the office scene.";
const json = Buffer.from(JSON.stringify(gltf));
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
json.copy(padded);
const binaryChunk = bytes.subarray(20 + jsonLength);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + padded.length + binaryChunk.length, 8);
header.writeUInt32LE(padded.length, 12);
header.write("JSON", 16);
fs.writeFileSync(
  "/tmp/studio-stand.glb",
  Buffer.concat([header, padded, binaryChunk]),
);
execFileSync(
  "npx",
  [
    "--yes",
    "@gltf-transform/cli@4.5.1",
    "optimize",
    "/tmp/studio-stand.glb",
    "public/models/studio-light-stand.glb",
    "--texture-size",
    "256",
    "--compress",
    "meshopt",
  ],
  { stdio: "inherit" },
);
