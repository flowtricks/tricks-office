import assert from "node:assert/strict";
import * as T from "three";
import sharp from "sharp";
import { createWindowLandscape } from "../src/scripts/window-landscape.ts";

const loaded = [];
const landscape = createWindowLandscape("/", {
  load(url, onLoad) {
    const texture = new T.Texture();
    loaded.push({ url, texture });
    queueMicrotask(() => onLoad(texture));
    return texture;
  },
});
await landscape.ready;
assert.equal(loaded.length, 2);
const versions = loaded.map(({ texture }) => texture.version);
const material = new T.MeshBasicMaterial({ map: landscape.texture });
landscape.applyToMaterial(material);
const shader = { uniforms: {}, fragmentShader: "#include <map_fragment>" };
material.onBeforeCompile(shader);
const positions = shader.uniforms.officeClouds.value;
for (let frame = 0; frame < 7200; frame++) landscape.update(frame / 60);
assert.deepEqual(
  loaded.map(({ texture }) => texture.version),
  versions,
  "Two minutes of animated clouds must not trigger any texture reuploads",
);
const time = 7199 / 60;
for (let i = 0; i < 5; i++) {
  const cloudWidth = 512 * (1.65 - i * 0.22);
  const oldX =
    ((250 + i * 173 + time * (4.5 - i * 0.65)) % (512 + cloudWidth)) -
    cloudWidth;
  assert.ok(
    Math.abs(positions[i].x * 512 - oldX) < 1e-8,
    "Original cloud speed and wrapping preserved",
  );
}
landscape.updateView(new T.Vector3(0, 1, 3), 1.3, 3);
const before = landscape.texture.offset.clone();
landscape.updateView(new T.Vector3(1, 1, 3), 1.3, 3);
assert.notEqual(
  landscape.texture.offset.x,
  before.x,
  "Walking still shifts window parallax",
);
let disposed = false;
loaded[1].texture.addEventListener("dispose", () => {
  disposed = true;
});
landscape.texture.dispose();
assert.ok(disposed, "Cloud atlas is released with the scene");
const atlas = await sharp("public/textures/window-clouds.webp").metadata();
assert.equal(atlas.width, 512);
assert.equal(atlas.height, 960);
assert.ok(atlas.hasAlpha);
console.log(
  "PASS: zero animated texture uploads, original cloud motion, working parallax, atlas cleanup and dimensions.",
);
