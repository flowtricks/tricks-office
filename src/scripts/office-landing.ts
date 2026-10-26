export type FloorObstacle = { x: number; z: number; w: number; d: number };

// The nearest point outside a union of axis-aligned furniture footprints lies
// on an edge, an edge intersection, or the requested point itself.
export function nearestLanding(
  x: number,
  z: number,
  obstacles: FloorObstacle[],
) {
  const clearance = 0.67;
  const bounds = {
    left: -3.8 + clearance,
    right: 3.85 - clearance,
    back: -2.9 + clearance,
    front: 0.35 - clearance,
  };
  const boxes = obstacles.map((b) => ({
    left: b.x - b.w / 2 - clearance,
    right: b.x + b.w / 2 + clearance,
    back: b.z - b.d / 2 - clearance,
    front: b.z + b.d / 2 + clearance,
  }));
  const clampX = (v: number) =>
    Math.max(bounds.left, Math.min(bounds.right, v));
  const clampZ = (v: number) =>
    Math.max(bounds.back, Math.min(bounds.front, v));
  const xs = [
    clampX(x),
    bounds.left,
    bounds.right,
    ...boxes.flatMap((b) => [b.left - 0.001, b.right + 0.001]).map(clampX),
  ];
  const zs = [
    clampZ(z),
    bounds.back,
    bounds.front,
    ...boxes.flatMap((b) => [b.back - 0.001, b.front + 0.001]).map(clampZ),
  ];
  let best: { x: number; z: number } | undefined;
  let distance = Infinity;
  for (const cx of xs)
    for (const cz of zs) {
      if (
        boxes.some(
          (b) => cx > b.left && cx < b.right && cz > b.back && cz < b.front,
        )
      )
        continue;
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < distance) {
        best = { x: cx, z: cz };
        distance = d;
      }
    }
  return best;
}
