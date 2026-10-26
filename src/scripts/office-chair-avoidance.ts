import * as T from "three";
import { clearsOfficeChair } from "./office-seating.ts";

// Plan only when the chair interrupts a held walking direction. Keep that route
// until the player changes direction, so the preferred side cannot flip each frame.
export function createChairAvoidance(
  chair: T.Object3D,
  walkable: (x: number, z: number) => boolean,
  clearsOtherObjects: (x: number, z: number) => boolean = () => true,
) {
  const heading = new T.Vector2();
  const chairPosition = new T.Vector3();
  let route: T.Vector2[] = [];
  let retry = 0;
  const clearSegment = (a: T.Vector2, b: T.Vector2) => {
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.035));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (
        !walkable(T.MathUtils.lerp(a.x, b.x, t), T.MathUtils.lerp(a.y, b.y, t))
      )
        return false;
    }
    return true;
  };
  function plan(start: T.Vector2, direction: T.Vector2) {
    const spacing = 0.14,
      radius = 28,
      width = radius * 2 + 1;
    const center = radius * width + radius;
    const points = new Map<number, T.Vector2>([[center, start]]);
    const parents = new Map<number, number>();
    const costs = new Map<number, number>([[center, 0]]);
    const queue = [center];
    const chairAhead = new T.Vector2(chair.position.x, chair.position.z)
      .sub(start)
      .dot(direction);
    const destination = start
      .clone()
      .addScaledVector(direction, Math.max(1.4, chairAhead + 1.25));
    let best = center,
      score = Infinity;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const key = queue[cursor],
        point = points.get(key)!;
      const delta = point.clone().sub(start);
      const progress = delta.dot(direction);
      const lateral = Math.abs(delta.x * direction.y - delta.y * direction.x);
      const beyondChair =
        Math.abs(direction.x) > Math.abs(direction.y)
          ? (point.x - chair.position.x) * Math.sign(direction.x)
          : (point.y - chair.position.z) * Math.sign(direction.y);
      if (progress > 0.65 && beyondChair > 0.2 && lateral < 2.4) {
        const candidate = point.distanceTo(destination) + costs.get(key)! * 0.2;
        if (candidate < score) {
          score = candidate;
          best = key;
        }
      }
      const x = key % width,
        z = Math.floor(key / width);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= width) continue;
        const next = nz * width + nx;
        if (points.has(next)) continue;
        const p = new T.Vector2(
          start.x + (nx - radius) * spacing,
          start.y + (nz - radius) * spacing,
        );
        if (!clearSegment(point, p)) continue;
        points.set(next, p);
        parents.set(next, key);
        costs.set(next, costs.get(key)! + spacing);
        queue.push(next);
      }
    }
    const result: T.Vector2[] = [];
    for (let key = best; key !== center; key = parents.get(key)!)
      result.unshift(points.get(key)!);
    // Remove grid corners wherever the full character clearance permits it.
    const smooth: T.Vector2[] = [];
    let anchor = start;
    while (result.length) {
      let end = result.length - 1;
      while (end > 0 && !clearSegment(anchor, result[end])) end--;
      anchor = result[end];
      smooth.push(anchor);
      result.splice(0, end + 1);
    }
    return smooth;
  }
  return {
    update(position: T.Vector3, input: T.Vector2, dt: number) {
      retry = Math.max(0, retry - dt);
      const strength = input.length();
      const direction = input.clone().normalize();
      if (
        strength < 0.01 ||
        heading.dot(direction) < 0.85 ||
        chairPosition.distanceToSquared(chair.position) > 0.0001
      ) {
        route = [];
        retry = 0;
      }
      heading.copy(direction);
      chairPosition.copy(chair.position);
      if (strength < 0.01) return;
      const start = new T.Vector2(position.x, position.z);
      if (!route.length && retry === 0) {
        let blocked = false;
        for (let distance = 0.1; distance <= 0.65; distance += 0.1) {
          const x = position.x + direction.x * distance;
          const z = position.z + direction.y * distance;
          // A nearby chair must not trigger a detour when another object is
          // actually the first obstruction in the player's walking direction.
          if (!clearsOtherObjects(x, z)) break;
          if (
            !clearsOfficeChair(chair, x, z)
          ) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          route = plan(start, direction);
          retry = 0.5;
        }
      }
      while (route.length && start.distanceTo(route[0]) < 0.08) route.shift();
      if (route.length) {
        // Look ahead along a clear section instead of stopping at each waypoint.
        while (route.length > 1 && clearSegment(start, route[1])) route.shift();
        input.copy(route[0]).sub(start).normalize().multiplyScalar(strength);
      }
    },
  };
}
