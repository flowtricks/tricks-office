import * as T from "three";

export function prepareOfficeChair(source: T.Group) {
  const chair = new T.Group();
  chair.name = "White ergonomic mesh office chair";
  const white = new T.MeshStandardMaterial({
    color: "#dadbd5",
    roughness: 0.65,
  });
  const black = new T.MeshStandardMaterial({
    color: "#17191c",
    roughness: 0.87,
  });
  const chrome = new T.MeshStandardMaterial({
    color: "#bec3c6",
    roughness: 0.22,
    metalness: 0.85,
  });
  const weave = document.createElement("canvas");
  weave.width = weave.height = 16;
  const ctx = weave.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 4, 16);
  ctx.fillRect(0, 0, 16, 4);
  const alpha = new T.CanvasTexture(weave);
  alpha.wrapS = alpha.wrapT = T.RepeatWrapping;
  alpha.repeat.set(38, 48);
  const meshFabric = new T.MeshStandardMaterial({
    color: "#777e7c",
    roughness: 0.95,
    alphaMap: alpha,
    alphaTest: 0.4,
    side: T.DoubleSide,
  });
  source.updateMatrixWorld(true);
  source.traverse((object) => {
    if (!(object instanceof T.Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const name = object.name;
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const height = (position.getY(i) + 0.495392509) * 1.52;
      position.setY(
        i,
        position.getY(i) -
          (0.38 * T.MathUtils.smoothstep(height, 0.3, 0.65)) / 1.52,
      );
    }
    // Lower the adjustable armrests to support the smaller character's elbows.
    if (/Arms_|Armrest_base|Hard_cushions/.test(name)) {
      for (let i = 0; i < position.count; i++)
        position.setY(i, position.getY(i) - 0.15 / 1.52);
    }
    geometry.computeVertexNormals();
    // Tighten the oversized caster base to the footprint of the reference chair.
    if (/Etoile|Roulette/.test(name)) {
      for (let i = 0; i < position.count; i++)
        position.setXYZ(
          i,
          position.getX(i) * 0.55,
          position.getY(i),
          position.getZ(i) * 0.55,
        );
      geometry.computeVertexNormals();
    }
    let material: T.Material = black;
    if (
      /Structure_|Back_outline_frame|Arms_|Joints_|Back_to_mechanism|Mechanism_base/.test(
        name,
      )
    )
      material = white;
    if (/Etoile|_Metal_|^Cylinder_Material|^Cylinder002/.test(name))
      material = chrome;
    if (/Back_mesh/.test(name)) {
      material = meshFabric;
      const uv = new Float32Array(position.count * 2);
      for (let i = 0; i < position.count; i++) {
        uv[i * 2] = position.getZ(i) / 0.615;
        uv[i * 2 + 1] = position.getY(i) / 0.807;
      }
      geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
    }
    const mesh = new T.Mesh(geometry, material);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    chair.add(mesh);
  });
  // The downloaded chair faces +X; the office furniture convention faces +Z.
  chair.rotation.y = -Math.PI / 2;
  chair.scale.setScalar(1.52);
  chair.position.y = 0.495392509 * 1.52;
  return chair;
}
