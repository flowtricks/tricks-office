import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

async function readGlb(path) {
  const bytes = await readFile(path);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  return { document: JSON.parse(bytes.subarray(20, 20 + length).toString()), binary: bytes.subarray(28 + length) };
}
const original = await readGlb("public/models/reference-character.glb");
const mobile = await readGlb("public/models/reference-character-mobile.glb");
const imageViews = new Set(original.document.images.map(image => image.bufferView));
for (const key of ["nodes", "meshes", "skins", "animations", "accessors", "materials", "textures", "extensionsUsed", "extensionsRequired"]) {
  assert.deepEqual(mobile.document[key], original.document[key], `${key} must remain unchanged`);
}
const data = (glb, index) => {
  const view = glb.document.bufferViews[index];
  return glb.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
};
let beforePixels = 0, afterPixels = 0;
for (let i = 0; i < original.document.bufferViews.length; i++) {
  if (!imageViews.has(i)) assert.deepEqual(data(mobile, i), data(original, i), `Geometry/rig buffer ${i} changed`);
  else {
    const before = await sharp(data(original, i)).metadata();
    const after = await sharp(data(mobile, i)).metadata();
    assert.ok(after.width <= 1024 && after.height <= 1024);
    assert.equal(after.width / after.height, before.width / before.height);
    beforePixels += before.width * before.height;
    afterPixels += after.width * after.height;
  }
}
assert.ok(afterPixels <= beforePixels / 8);
console.log('PASS: mobile character keeps geometry, rig, materials, and UVs; texture memory reduced by 87.5%.');
