import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";

export function retainCutawayLights(source: T.Object3D, scene: T.Scene) {
  const lights: T.Light[] = [];
  source.traverse(object => { if (object instanceof T.Light) lights.push(object); });
  for (const light of lights) scene.attach(light);
}

/** Merge rigid, opaque parts without changing triangles, materials, or moving controls. */
export function batchRigidMeshes(root: T.Object3D, excluded = new Set<T.Object3D>()) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const matrix = new T.Matrix4();
  const batches = new Map<string, T.Mesh[]>();
  const retired = new Set<T.BufferGeometry>();
  function visit(object: T.Object3D) {
    if (excluded.has(object) || !object.visible) return;
    if (object instanceof T.Mesh && !(object instanceof T.SkinnedMesh) &&
        !Array.isArray(object.material) && !object.material.transparent &&
        !object.morphTargetInfluences && object.geometry.drawRange.count === Infinity) {
      const layout = Object.entries((object.geometry as T.BufferGeometry).attributes).sort(([a], [b]) => a.localeCompare(b))
        .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`).join("|");
      const key = `${object.material.uuid}/${object.castShadow}/${object.receiveShadow}/${object.renderOrder}/${object.layers.mask}/${layout}`;
      const list = batches.get(key) ?? [];
      list.push(object);
      batches.set(key, list);
    }
    for (const child of object.children) visit(child);
  }
  visit(root);
  for (const objects of batches.values()) {
    if (objects.length < 2) continue;
    const copies = objects.map(object => {
      const geometry = object.geometry.clone();
      matrix.multiplyMatrices(inverse, object.matrixWorld);
      geometry.applyMatrix4(matrix);
      if (!geometry.index) geometry.setIndex(Array.from({length: geometry.attributes.position.count}, (_, i) => i));
      return geometry;
    });
    const geometry = mergeGeometries(copies, false);
    copies.forEach(copy => copy.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const first = objects[0];
    const mesh = new T.Mesh(geometry, first.material);
    mesh.name = `${root.name || "Office object"} rigid batch`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.layers.mask = first.layers.mask;
    root.add(mesh);
    for (const object of objects) {
      // Preserve any independently controlled descendants in their original space.
      for (const child of [...object.children]) root.attach(child);
      retired.add(object.geometry);
      object.removeFromParent();
    }
  }
  return retired;
}

/** Exact triangle picking, with spatial indexing only for non-deforming geometry. */
export function accelerateOfficePicking(scene: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>();
  scene.traverse(object => {
    if (!(object instanceof T.Mesh) || object instanceof T.SkinnedMesh) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute("position");
    if (!position || position.usage === T.DynamicDrawUsage || position.count < 192) return;
    if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
    object.raycast = acceleratedRaycast;
    geometries.add(geometry);
  });
  return () => { for (const geometry of geometries) geometry.boundsTree = undefined; };
}
