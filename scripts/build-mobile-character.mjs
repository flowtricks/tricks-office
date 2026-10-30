import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile("public/models/reference-character.glb");
const jsonLength = source.readUInt32LE(12);
const document = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
const binary = source.subarray(28 + jsonLength);
assert.equal(document.buffers.length, 1);
const images = new Map(document.images.map(image => [image.bufferView, image]));
const chunks = [];
let byteOffset = 0, beforePixels = 0, afterPixels = 0;
for (const [index, view] of document.bufferViews.entries()) {
  assert.equal(view.buffer, 0);
  assert.ok(!view.extensions, "Compressed buffer views need their own offset relocation");
  let bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const image = images.get(index);
  if (image) {
    const metadata = await sharp(bytes).metadata();
    beforePixels += metadata.width * metadata.height;
    bytes = await sharp(bytes).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).webp({ lossless: true }).toBuffer();
    const resized = await sharp(bytes).metadata();
    afterPixels += resized.width * resized.height;
    image.mimeType = "image/webp";
  }
  view.byteOffset = byteOffset;
  view.byteLength = bytes.length;
  const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
  chunks.push(bytes, padding);
  byteOffset += bytes.length + padding.length;
}
document.buffers[0].byteLength = byteOffset;
const json = Buffer.from(JSON.stringify(document));
const jsonPadding = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + jsonPadding.length + byteOffset, 8);
header.writeUInt32LE(json.length + jsonPadding.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(byteOffset, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);
await writeFile("public/models/reference-character-mobile.glb", Buffer.concat([header, json, jsonPadding, binaryHeader, ...chunks]));
console.log(`Mobile character: texture pixels ${beforePixels.toLocaleString()} → ${afterPixels.toLocaleString()}; geometry and rig unchanged.`);
