import * as T from "three";

export function createWindowLandscape() {
  const width = 512;
  const height = 1024;
  const horizon = 605;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const landscape = document.createElement("canvas");
  landscape.width = width;
  landscape.height = height;
  const paint = landscape.getContext("2d")!;
  let seed = 9182;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sky = paint.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#8195a5");
  sky.addColorStop(0.55, "#aab8c0");
  sky.addColorStop(1, "#d4d7d2");
  paint.fillStyle = sky;
  paint.fillRect(0, 0, width, height);
  const grass = paint.createLinearGradient(0, horizon, 0, height);
  grass.addColorStop(0, "#9b9d88");
  grass.addColorStop(0.5, "#7d8368");
  grass.addColorStop(1, "#626b50");
  paint.fillStyle = grass;
  paint.beginPath();
  paint.moveTo(0, horizon + 3);
  paint.bezierCurveTo(160, horizon + 9, 230, horizon - 8, width, horizon - 3);
  paint.lineTo(width, height);
  paint.lineTo(0, height);
  paint.closePath();
  paint.fill();

  const noiseSize = 64;
  const noiseGrid = Float32Array.from({ length: noiseSize * noiseSize }, () =>
    random(),
  );
  function noise(x: number, y: number) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sample = (dx: number, dy: number) =>
      noiseGrid[((iy + dy) & 63) * noiseSize + ((ix + dx) & 63)];
    return T.MathUtils.lerp(
      T.MathUtils.lerp(sample(0, 0), sample(1, 0), sx),
      T.MathUtils.lerp(sample(0, 1), sample(1, 1), sx),
      sy,
    );
  }
  function turbulence(x: number, y: number) {
    return (
      noise(x, y) * 0.53 +
      noise(x * 2.03 + 7, y * 2.03 + 11) * 0.27 +
      noise(x * 4.09 + 13, y * 4.09 + 3) * 0.13 +
      noise(x * 8.21, y * 8.21) * 0.07
    );
  }
  const clouds = Array.from({ length: 5 }, (_, index) => {
    const sprite = document.createElement("canvas");
    sprite.width = 512;
    sprite.height = 192;
    const cloud = sprite.getContext("2d")!;
    const pixels = cloud.createImageData(sprite.width, sprite.height);
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
    cloud.putImageData(pixels, 0, 0);
    const scale = 1.65 - index * 0.22;
    return {
      sprite,
      width: sprite.width * scale,
      height: sprite.height * scale * (1 - index * 0.1),
      x: 250 + index * 173,
      y: -50 + index * 117,
      speed: 4.5 - index * 0.65,
    };
  });
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = T.LinearFilter;
  const viewOrigin = new T.Vector3();
  let viewInitialized = false;
  function updateView(
    eye: T.Vector3,
    windowWidth: number,
    windowHeight: number,
  ) {
    const distance = Math.max(eye.z, 0.5);
    if (!viewInitialized) {
      viewOrigin.set(eye.x / distance, eye.y / distance, distance);
      viewInitialized = true;
    }
    const depth = 1.6;
    const overscan = 1.6;
    const scale = T.MathUtils.clamp(
      (1 + depth / distance) / (1 + depth / viewOrigin.z) / overscan,
      0.55,
      0.82,
    );
    const margin = (1 - scale) / 2;
    const shiftX =
      (depth * (eye.x / distance - viewOrigin.x)) / (windowWidth * overscan);
    const shiftY =
      (depth * (eye.y / distance - viewOrigin.y)) / (windowHeight * overscan);
    texture.repeat.setScalar(scale);
    texture.offset.set(
      // A hard crop clamp froze the view after the camera zoomed in. Ease the
      // offset within the overscan so walking still reveals a shifting vista.
      margin - margin * 0.9 * Math.tanh(shiftX / (margin * 1.8)),
      margin - margin * 0.9 * Math.tanh(shiftY / (margin * 1.8)),
    );
  }
  let lastFrame = -1;
  let lastTime = 0;
  function update(time: number) {
    lastTime = time;
    const frame = Math.floor(time * 24);
    if (frame === lastFrame) return;
    lastFrame = frame;
    context.drawImage(landscape, 0, 0);
    for (const cloud of clouds) {
      const span = width + cloud.width;
      const x = ((cloud.x + time * cloud.speed) % span) - cloud.width;
      context.drawImage(cloud.sprite, x, cloud.y, cloud.width, cloud.height);
    }
    texture.needsUpdate = true;
  }
  const backdrop = new Image();
  backdrop.onload = () => {
    paint.drawImage(backdrop, 0, 0, width, height);
    lastFrame = -1;
    update(lastTime);
  };
  backdrop.src = `${import.meta.env.BASE_URL}textures/window-meadow.webp`;
  texture.addEventListener("dispose", () => {
    backdrop.onload = null;
  });
  update(0);
  return { texture, update, updateView };
}
