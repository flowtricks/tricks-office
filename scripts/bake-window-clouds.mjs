// Bake the original deterministic cloud sprites once instead of generating
// half a million procedural pixels on every phone visit.
import * as T from "three";
import sharp from "sharp";
const atlas = new Uint8ClampedArray(512 * 960 * 4);
let seed = 9182;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noiseSize = 64;
const noiseGrid = Float32Array.from({ length: noiseSize * noiseSize }, () =>
  random(),
);
function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sample = (dx, dy) =>
    noiseGrid[((iy + dy) & 63) * noiseSize + ((ix + dx) & 63)];
  return T.MathUtils.lerp(
    T.MathUtils.lerp(sample(0, 0), sample(1, 0), sx),
    T.MathUtils.lerp(sample(0, 1), sample(1, 1), sx),
    sy,
  );
}
function turbulence(x, y) {
  return (
    noise(x, y) * 0.53 +
    noise(x * 2.03 + 7, y * 2.03 + 11) * 0.27 +
    noise(x * 4.09 + 13, y * 4.09 + 3) * 0.13 +
    noise(x * 8.21, y * 8.21) * 0.07
  );
}
for (let index = 0; index < 5; index++) {
  const sprite = { width: 512, height: 192 };
  const pixels = {
    data: new Uint8ClampedArray(sprite.width * sprite.height * 4),
  };
  const offset = random() * 50;
  const lobes = Array.from({ length: 6 }, (_, lobe) => ({
    x: 0.15 + lobe * 0.14,
    y: 0.42 + random() * 0.23,
    width: 0.13 + random() * 0.1,
    height: 0.15 + random() * 0.17,
  }));
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      const u = x / sprite.width;
      const v = y / sprite.height;
      const nx = u * 7 + offset;
      const ny = v * 4 + offset;
      const detail = turbulence(nx, ny);
      const warpedU = u + (noise(nx * 1.7, ny * 1.7) - 0.5) * 0.09;
      const warpedV = v + (detail - 0.5) * 0.24;
      let envelope = 0;
      for (const lobe of lobes) {
        const dx = (warpedU - lobe.x) / lobe.width;
        const dy = (warpedV - lobe.y) / lobe.height;
        envelope = Math.max(envelope, Math.exp(-(dx * dx + dy * dy) * 1.6));
      }
      const density = T.MathUtils.smoothstep(
        envelope * (0.45 + detail * 0.95),
        0.2,
        0.78,
      );
      const edge =
        T.MathUtils.smoothstep(u, 0, 0.12) *
        (1 - T.MathUtils.smoothstep(u, 0.88, 1));
      const underside = T.MathUtils.smoothstep(v, 0.4, 0.8);
      const light = 240 - underside * 30 - density * 12 + (detail - 0.5) * 16;
      const pixel = (y * sprite.width + x) * 4;
      pixels.data[pixel] = light;
      pixels.data[pixel + 1] = light + 2 + underside * 3;
      pixels.data[pixel + 2] = light + 3 + underside * 6;
      pixels.data[pixel + 3] = density * edge * (0.82 - index * 0.07) * 255;
    }
  }
  for (let row = 0; row < sprite.height; row++)
    atlas.set(
      pixels.data.subarray(row * 512 * 4, (row + 1) * 512 * 4),
      (index * 192 + row) * 512 * 4,
    );
}

await sharp(Buffer.from(atlas), {
  raw: { width: 512, height: 960, channels: 4 },
})
  .webp({ lossless: true })
  .toFile("public/textures/window-clouds.webp");
console.log("Baked the five original cloud sprites into a lossless atlas.");
