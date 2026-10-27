import * as T from "three";

export type ShelfFocusTarget = {
  name: string;
  center: T.Vector3;
  size: T.Vector3;
  mesh: T.Mesh;
  glow: T.Group;
  yaw: number;
  pitch: number;
};

/** Retain precise picking silhouettes before static decor is batched together. */
export function createShelfFocusTargets(
  objects: T.Object3D[],
  signal: AbortSignal,
  scene: T.Scene,
) {
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  const vertex = new T.Vector3();
  const targets = objects.map((object): ShelfFocusTarget => {
    object.updateWorldMatrix(true, true);
    const positions: number[] = [];
    object.traverse((child) => {
      if (!(child instanceof T.Mesh)) return;
      const attribute = child.geometry.getAttribute("position");
      const index = child.geometry.index;
      for (let i = 0; i < (index?.count ?? attribute.count); i++) {
        vertex
          .fromBufferAttribute(attribute, index ? index.getX(i) : i)
          .applyMatrix4(child.matrixWorld);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const center = geometry.boundingBox!.getCenter(new T.Vector3());
    const size = geometry.boundingBox!.getSize(new T.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    const glow = new T.Group();
    glow.position.copy(center);
    scene.add(glow);
    // Keep the real shelf object live, rather than baking it into the wall.
    // This lets its surface and its silhouette move together on hover.
    glow.attach(object);
    const pickMesh = new T.Mesh(geometry, material);
    pickMesh.position.copy(center);
    pickMesh.updateMatrixWorld(true);
    const target: ShelfFocusTarget = {
      name: object.name || "Shelf object",
      center,
      size,
      mesh: pickMesh,
      glow,
      yaw: object.userData.inspectionYaw ?? 0.8,
      pitch: object.userData.inspectionPitch ?? 0.13,
    };
    return target;
  });
  const meshes = targets.map((target) => target.mesh);
  let hovered: ShelfFocusTarget | undefined;
  const amounts = new Map(targets.map((target) => [target, 0]));
  signal.addEventListener(
    "abort",
    () => {
      targets.forEach((target) => {
        target.mesh.geometry.dispose();
        target.glow.traverse((child) => {
          if (child instanceof T.Mesh)
            (Array.isArray(child.material)
              ? child.material
              : [child.material]
            ).forEach((m) => m.dispose());
        });
        target.glow.removeFromParent();
      });
      material.dispose();
    },
    { once: true },
  );
  return {
    setHovered(target?: ShelfFocusTarget) {
      const entered = !!target && target !== hovered;
      hovered = target;
      return entered;
    },
    update(dt: number, reduced: boolean, visible: boolean) {
      for (const target of targets) {
        const goal = hovered === target && visible ? 1 : 0;
        const amount = reduced
          ? goal
          : T.MathUtils.lerp(
              amounts.get(target)!,
              goal,
              1 - Math.exp(-dt * (goal ? 12 : 8)),
            );
        amounts.set(target, amount);
        target.glow.visible = visible;
        const lift = reduced ? 0 : amount * 0.035;
        target.glow.position.copy(target.center);
        target.glow.position.y += lift;
        target.mesh.position.copy(target.glow.position);
        target.mesh.quaternion.copy(target.glow.quaternion);
        target.mesh.updateMatrixWorld(true);
      }
    },
    pick(raycaster: T.Raycaster, nearestHit: () => T.Intersection | undefined) {
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit) return;
      const visibleHit = nearestHit();
      // Do not select a shelf object through the character or other furniture.
      if (visibleHit && visibleHit.distance + 0.035 < hit.distance) return;
      return targets.find((target) => target.mesh === hit.object);
    },
  };
}

export function shelfFocusDistance(
  target: ShelfFocusTarget,
  camera: T.PerspectiveCamera,
) {
  const halfFov = T.MathUtils.degToRad(camera.fov / 2);
  // Shelf fronts face +X, so their horizontal extent is predominantly world Z.
  const frame = Math.max(target.size.y, target.size.z / camera.aspect);
  return Math.max(
    1.15,
    (frame * 0.88) / Math.tan(halfFov) + target.size.x * 0.5,
  );
}
