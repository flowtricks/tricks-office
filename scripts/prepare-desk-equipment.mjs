import { execFileSync } from "node:child_process";

for (const [name, ratio, textureSize] of [["macbook-pro-14-m5", "0.5", "1024"]]) {
  execFileSync(
    "npx",
    [
      "--yes",
      "@gltf-transform/cli@4.5.1",
      "optimize",
      `scripts/assets/${name}-source.glb`,
      `public/models/${name}.glb`,
      "--texture-size",
      textureSize,
      "--compress",
      "meshopt",
      "--simplify-ratio",
      ratio,
      "--simplify-error",
      "0.0001",
    ],
    { stdio: "inherit" },
  );
}
