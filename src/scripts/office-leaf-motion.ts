import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Foliage = {
  anchor: T.Vector3;
  center: T.Vector3;
  direction: T.Vector3;
  bend: T.Vector2;
  velocity: T.Vector2;
  tip?: T.Vector3;
  axis?: T.Vector3;
  tangent?: T.Vector3;
  slices: { rest: T.BufferGeometry; offset: number; batch: T.BufferGeometry }[];
  group: T.Group;
};

/** Clift's pointer repulsion and damped spring, applied to batched leaf vertices. */
export function createLeafMotion(
  plants: T.Group[],
  scene: T.Scene,
  camera: T.PerspectiveCamera,
  element: HTMLElement,
  signal: AbortSignal,
) {
  const leaves: Foliage[] = [];
  const groups: T.Group[] = [];
  for (const plant of plants) {
    plant.updateWorldMatrix(true, true);
    const group = new T.Group();
    group.name = `${plant.name} interactive foliage`;
    groups.push(group);
    scene.add(group);
    const batches = new Map<
      T.Material,
      { meshes: T.Mesh[]; geometries: T.BufferGeometry[]; units: Foliage[] }
    >();
    plant.traverse((object) => {
      if (
        (!object.userData.reactiveLeaf && !object.userData.reactiveBranch) ||
        object.parent?.userData.reactiveBranch
      )
        return;
      const unit: Foliage = {
        anchor: new T.Vector3().setFromMatrixPosition(object.matrixWorld),
        center: new T.Box3().setFromObject(object).getCenter(new T.Vector3()),
        direction: new T.Vector3()
          .fromArray(object.userData.reactiveDirection ?? [0, 1, 0])
          .transformDirection(object.matrixWorld),
        tip: object.userData.reactiveTip
          ? new T.Vector3()
              .fromArray(object.userData.reactiveTip)
              .applyMatrix4(object.matrixWorld)
          : undefined,
        bend: new T.Vector2(),
        velocity: new T.Vector2(),
        axis: object.userData.reactiveBranch
          ? new T.Vector3(0, 0, 1).transformDirection(object.matrixWorld)
          : undefined,
        tangent: object.userData.reactiveBranch
          ? new T.Vector3(1, 0, 0).transformDirection(object.matrixWorld)
          : undefined,
        slices: [],
        group,
      };
      leaves.push(unit);
      object.traverse((source) => {
        if (!(source instanceof T.Mesh) || Array.isArray(source.material))
          return;
        const batch = batches.get(source.material) ?? {
          meshes: [],
          geometries: [],
          units: [],
        };
        batch.meshes.push(source);
        batch.geometries.push(
          source.geometry.clone().applyMatrix4(source.matrixWorld),
        );
        batch.units.push(unit);
        batches.set(source.material, batch);
      });
    });
    for (const [material, batch] of batches) {
      const geometry = mergeGeometries(batch.geometries)!;
      for (const name of ["position", "normal"]) {
        const attribute = geometry.getAttribute(name);
        if (attribute instanceof T.BufferAttribute)
          attribute.setUsage(T.DynamicDrawUsage);
      }
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      geometry.computeBoundingSphere();
      geometry.boundingSphere!.radius += 1.2;
      group.add(mesh);
      let offset = 0;
      batch.meshes.forEach((source, i) => {
        const rest = batch.geometries[i];
        batch.units[i].slices.push({
          rest,
          offset,
          batch: geometry,
        });
        offset += rest.getAttribute("position").count;
        source.removeFromParent();
        source.geometry.dispose();
      });
    }
  }
  const pointer = new T.Vector2();
  let active = false;
  let moving = false;
  const clear = () => {
    active = false;
  };
  element.addEventListener(
    "pointermove",
    (event) => {
      active = event.pointerType !== "touch" && event.buttons === 0;
      const rect = element.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
    },
    { signal },
  );
  element.addEventListener("pointerleave", clear, { signal });
  element.addEventListener("pointerdown", clear, { signal });
  window.addEventListener("blur", clear, { signal });
  const screen = new T.Vector3(),
    right = new T.Vector3(),
    up = new T.Vector3();
  const bent = new T.Vector3(),
    vertex = new T.Vector3(),
    normal = new T.Vector3();
  const force = new T.Vector2(),
    rotation = new T.Quaternion();
  const anchorScreen = new T.Vector3(),
    tipScreen = new T.Vector3();
  const segment = new T.Vector2(),
    relative = new T.Vector2();
  signal.addEventListener(
    "abort",
    () => {
      for (const leaf of leaves)
        for (const slice of leaf.slices) slice.rest.dispose();
    },
    { once: true },
  );
  return {
    setShelfVisible(visible: boolean) {
      for (let i = 1; i < groups.length; i++) groups[i].visible = visible;
    },
    update(dt: number, enabled: boolean) {
      if ((!active || !enabled) && !moving) return;
      moving = false;
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const width = element.clientWidth,
        height = element.clientHeight;
      const steps = Math.max(1, Math.ceil(dt * 120)),
        step = dt / steps;
      for (const leaf of leaves) {
        force.set(0, 0);
        if (active && enabled && leaf.group.visible) {
          screen.copy(leaf.center).project(camera);
          const depth = -vertex
            .copy(leaf.center)
            .applyMatrix4(camera.matrixWorldInverse).z;
          const radius = T.MathUtils.clamp(
            (height * (leaf.tip ? 0.24 : 0.42)) /
              (2 *
                Math.tan(T.MathUtils.degToRad(camera.fov / 2)) *
                Math.max(depth, 0.1)),
            leaf.tip ? 18 : 24,
            leaf.tip ? 50 : 85,
          );
          force.set(
            ((screen.x - pointer.x) * width) / 2,
            ((screen.y - pointer.y) * height) / 2,
          );
          if (leaf.tip) {
            // A brush anywhere along a hanging vine moves its stem and leaves
            // together, with the attachment point at the pot held fixed.
            anchorScreen.copy(leaf.anchor).project(camera);
            tipScreen.copy(leaf.tip).project(camera);
            segment.set(
              ((tipScreen.x - anchorScreen.x) * width) / 2,
              ((tipScreen.y - anchorScreen.y) * height) / 2,
            );
            relative.set(
              ((pointer.x - anchorScreen.x) * width) / 2,
              ((pointer.y - anchorScreen.y) * height) / 2,
            );
            const t = T.MathUtils.clamp(
              relative.dot(segment) / Math.max(segment.lengthSq(), 1e-6),
              0,
              1,
            );
            force.copy(segment).multiplyScalar(t).sub(relative);
          }
          const distance = force.length();
          if (distance < radius && screen.z > -1 && screen.z < 1) {
            if (distance < 0.01) force.set(1, 0);
            force
              .normalize()
              .multiplyScalar(
                Math.pow(1 - distance / radius, 2) * (leaf.tip ? 0.28 : 1.25),
              );
          } else force.set(0, 0);
        }
        const oldX = leaf.bend.x,
          oldY = leaf.bend.y;
        if (!enabled) {
          leaf.bend.set(0, 0);
          leaf.velocity.set(0, 0);
        } else
          for (let i = 0; i < steps; i++) {
            leaf.velocity.x +=
              ((force.x - leaf.bend.x) * 160 -
                leaf.velocity.x * (leaf.tip ? 20 : 13)) *
              step;
            leaf.velocity.y +=
              ((force.y - leaf.bend.y) * 160 -
                leaf.velocity.y * (leaf.tip ? 20 : 13)) *
              step;
            leaf.bend.addScaledVector(leaf.velocity, step);
          }
        if (
          force.lengthSq() === 0 &&
          leaf.bend.lengthSq() + leaf.velocity.lengthSq() < 1e-8
        ) {
          leaf.bend.set(0, 0);
          leaf.velocity.set(0, 0);
        }
        moving ||= leaf.bend.lengthSq() + leaf.velocity.lengthSq() > 0;
        if (oldX === leaf.bend.x && oldY === leaf.bend.y) continue;
        bent
          .copy(leaf.direction)
          .addScaledVector(right, leaf.bend.x)
          .addScaledVector(up, leaf.bend.y)
          .normalize();
        rotation.setFromUnitVectors(leaf.direction, bent);
        if (leaf.axis && leaf.tangent) {
          rotation.setFromAxisAngle(
            leaf.axis,
            right.dot(leaf.tangent) * leaf.bend.x +
              up.dot(leaf.tangent) * leaf.bend.y,
          );
        }
        for (const slice of leaf.slices) {
          const restPosition = slice.rest.getAttribute("position"),
            restNormal = slice.rest.getAttribute("normal");
          const position = slice.batch.getAttribute("position"),
            normals = slice.batch.getAttribute("normal");
          for (let i = 0; i < restPosition.count; i++) {
            vertex
              .fromBufferAttribute(restPosition, i)
              .sub(leaf.anchor)
              .applyQuaternion(rotation)
              .add(leaf.anchor);
            normal.fromBufferAttribute(restNormal, i).applyQuaternion(rotation);
            position.setXYZ(slice.offset + i, vertex.x, vertex.y, vertex.z);
            normals.setXYZ(slice.offset + i, normal.x, normal.y, normal.z);
          }
          // Upload only the leaves that bent, not every plant vertex.
          if (position instanceof T.BufferAttribute) position.addUpdateRange(slice.offset * 3, restPosition.count * 3);
          if (normals instanceof T.BufferAttribute) normals.addUpdateRange(slice.offset * 3, restNormal.count * 3);
          position.needsUpdate = normals.needsUpdate = true;
        }
      }
    },
  };
}
