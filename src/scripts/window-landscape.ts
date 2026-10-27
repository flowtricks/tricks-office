import * as T from "three";

export function createWindowLandscape(
  baseUrl = import.meta.env.BASE_URL,
  loader = new T.TextureLoader(),
) {
  const width = 512;
  const height = 1024;
  const pending: Promise<void>[] = [];
  function loadTexture(path: string) {
    let texture!: T.Texture;
    pending.push(
      new Promise<void>((resolve, reject) => {
        texture = loader.load(
          `${baseUrl}textures/${path}`,
          () => resolve(),
          undefined,
          reject,
        );
      }),
    );
    texture.generateMipmaps = false;
    texture.minFilter = T.LinearFilter;
    return texture;
  }
  // Same sprites and placement as the original procedural clouds, baked once.
  const clouds = Array.from({ length: 5 }, (_, index) => {
    const scale = 1.65 - index * 0.22;
    return {
      width: 512 * scale,
      height: 192 * scale * (1 - index * 0.1),
      x: 250 + index * 173,
      y: -50 + index * 117,
      speed: 4.5 - index * 0.65,
    };
  });
  // Upload once; animation only changes uniforms. The former 512×1024 canvas
  // upload cost ~48 MiB/second at 24 fps, in addition to its canvas repaint.
  const texture = loadTexture("window-meadow.webp");
  texture.colorSpace = T.NoColorSpace; // Composite in sRGB, like the original 2D canvas.
  const cloudAtlas = loadTexture("window-clouds.webp");
  const placements = clouds.map(() => new T.Vector4());
  function applyToMaterial(material: T.MeshBasicMaterial) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.officeCloudAtlas = { value: cloudAtlas };
      shader.uniforms.officeClouds = { value: placements };
      shader.fragmentShader =
        `
        uniform sampler2D officeCloudAtlas;
        uniform vec4 officeClouds[${clouds.length}];
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        vec4 landscapeColor = texture2D(map, vMapUv);
        vec2 canvasPoint = vec2(vMapUv.x, 1.0 - vMapUv.y);
        ${clouds
          .map(
            (_, i) => `{
          vec2 cloudUV = (canvasPoint - officeClouds[${i}].xy) / officeClouds[${i}].zw;
          if (all(greaterThanEqual(cloudUV, vec2(0.0))) && all(lessThanEqual(cloudUV, vec2(1.0)))) {
            // Half-texel inset prevents neighboring sprites bleeding into a cloud.
            vec2 atlasUV = vec2(clamp(cloudUV.x, 0.5 / 512.0, 511.5 / 512.0),
              1.0 - (${i}.0 + clamp(cloudUV.y, 0.5 / 192.0, 191.5 / 192.0)) / ${clouds.length}.0);
            vec4 cloudColor = texture2D(officeCloudAtlas, atlasUV);
            landscapeColor.rgb = mix(landscapeColor.rgb, cloudColor.rgb, cloudColor.a);
          }
        }`,
          )
          .join("\n")}
        diffuseColor *= sRGBTransferEOTF(landscapeColor);
      `,
      );
    };
    material.customProgramCacheKey = () => "office-gpu-clouds-v1";
  }
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
  function update(time: number) {
    clouds.forEach((cloud, i) => {
      const span = width + cloud.width;
      const x = ((cloud.x + time * cloud.speed) % span) - cloud.width;
      placements[i].set(
        x / width,
        cloud.y / height,
        cloud.width / width,
        cloud.height / height,
      );
    });
  }
  texture.addEventListener("dispose", () => cloudAtlas.dispose());
  update(0);
  return {
    texture,
    update,
    updateView,
    applyToMaterial,
    ready: Promise.all(pending),
  };
}
