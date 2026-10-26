import * as T from "three";

export function prepareCharacter(model: T.Object3D, roomLightLevel = { value: 1 }) {
  model.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(material => material.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof T.MeshStandardMaterial)) continue;
      const eye = object.name === "LeftEye" || object.name === "RightEye";
      const blink = eye ? (object.userData.blink = { value: 0 }) : undefined;
      material.envMapIntensity = .3;
      material.onBeforeCompile = shader => {
        shader.uniforms.roomLightLevel = roomLightLevel;
        shader.fragmentShader = "uniform float roomLightLevel;\n" + shader.fragmentShader;
        if (eye && blink) {
          shader.uniforms.eyeClosure = blink;
          shader.uniforms.eyeCenter = { value: new T.Vector2(...object.userData.eyeCenter as [number, number]) };
          shader.uniforms.eyeRadius = { value: new T.Vector2(...object.userData.eyeRadius as [number, number]) };
          shader.uniforms.eyelidColor = { value: new T.Color("#fbb787") };
          shader.vertexShader = "varying vec3 vEyeRestPosition;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvEyeRestPosition = position;");
          shader.fragmentShader = `
            uniform float eyeClosure;
            uniform vec2 eyeCenter;
            uniform vec2 eyeRadius;
            uniform vec3 eyelidColor;
            varying vec3 vEyeRestPosition;
          ` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
            #include <map_fragment>
            vec2 eyePoint = (vEyeRestPosition.xy - eyeCenter) / eyeRadius;
            float eyeShape = 1.0 - smoothstep(1.0, 1.16, length(eyePoint));
            float lidEdge = mix(1.3, -1.3, eyeClosure);
            float lidCover = smoothstep(lidEdge - 0.035, lidEdge + 0.035, eyePoint.y)
              * eyeShape * step(0.001, eyeClosure);
            float creaseY = -0.32 + 0.12 * eyePoint.x * eyePoint.x;
            float crease = exp(-pow((eyePoint.y - creaseY) / 0.045, 2.0))
              * max(0.0, 1.0 - eyePoint.x * eyePoint.x) * smoothstep(0.8, 1.0, eyeClosure);
            diffuseColor.rgb = mix(diffuseColor.rgb, eyelidColor * (1.0 - crease * 0.35), lidCover);
          `);
          shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.88, lidCover);");
          shader.fragmentShader = shader.fragmentShader.replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - lidCover;");
        }
        shader.fragmentShader = shader.fragmentShader.replace(
          "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
          `
          vec3 characterIrradiance = totalDiffuse / max(diffuseColor.rgb, vec3(0.02));
          float characterLight = dot(characterIrradiance, vec3(0.2126, 0.7152, 0.0722));
          float characterFill = mix(0.75 * roomLightLevel, min(characterLight, 3.0), 0.65) * 1.25;
          float skinTone = smoothstep(0.25, 0.55, diffuseColor.r)
            * smoothstep(0.04, 0.14, diffuseColor.r - diffuseColor.g);
          vec3 characterTint = mix(vec3(1.0), vec3(1.25, 0.82, 0.67), skinTone);
          totalDiffuse = diffuseColor.rgb * characterFill * characterTint;
          totalSpecular *= 0.40;
          vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
          `,
        );
      };
      material.customProgramCacheKey = () => eye ? "character-eyelids-v1" : "character-neutral-fill-v1";
      for (const texture of [material.map, material.roughnessMap, material.normalMap]) {
        if (texture) texture.anisotropy = 8;
      }
    }
  });
}
