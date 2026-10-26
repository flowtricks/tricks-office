import assert from "node:assert/strict";
import { Group, Vector2, Vector3 } from "three";
import { createChairAvoidance } from "../src/scripts/office-chair-avoidance.ts";
import { WALK_SPEED } from "../src/scripts/character-animation.ts";
import { createOfficeWalking } from "../src/scripts/office-walking.ts";
import {
  clearsOfficeChair,
  createOfficeSeating,
} from "../src/scripts/office-seating.ts";

function simulate(chair, start, direction, walkable, seconds = 5) {
  const steering = createChairAvoidance(chair, walkable);
  const walking = createOfficeWalking();
  const position = start.clone(),
    velocity = walking.velocity;
  let detour = 0;
  for (let frame = 0; frame < seconds * 60; frame++) {
    const input = direction.clone();
    steering.update(position, input, 1 / 60);
    walking.update(input, WALK_SPEED, 1 / 60);
    for (const axis of ["x", "z"]) {
      const amount = (axis === "x" ? velocity.x : velocity.y) / 60;
      const x = position.x + (axis === "x" ? amount : 0);
      const z = position.z + (axis === "z" ? amount : 0);
      if (walkable(x, z)) position[axis] += amount;
    }
    assert(
      walkable(position.x, position.z),
      "Route must maintain body clearance",
    );
    detour = Math.max(
      detour,
      Math.abs(
        (position.x - start.x) * direction.y -
          (position.z - start.z) * direction.x,
      ),
    );
  }
  const released = new Vector2();
  steering.update(position, released, 1 / 60);
  assert.equal(released.length(), 0, "Release must stop automatic steering");
  const reverse = direction.clone().negate();
  steering.update(position, reverse, 1 / 60);
  assert(
    reverse.dot(direction) < -0.85,
    "Reverse input must cancel the old route",
  );
  return { position, detour };
}

for (const yaw of [0, 0.7, 1.4])
  for (const direction of [
    new Vector2(1, 0),
    new Vector2(-1, 0),
    new Vector2(0, 1),
    new Vector2(0, -1),
  ]) {
    const chair = new Group();
    chair.rotation.y = yaw;
    const start = new Vector3(-direction.x * 2.3, 0, -direction.y * 2.3);
    const result = simulate(chair, start, direction, (x, z) =>
      clearsOfficeChair(chair, x, z),
    );
    assert(
      result.position.x * direction.x + result.position.z * direction.y > 2,
      "Must pass the chair",
    );
    assert(result.detour > 1, "Must go around the chair, not through it");
  }
// The actual room is narrow, with the desk blocking the far side of the chair.
const chair = new Group();
chair.rotation.y = (Math.PI * 80) / 180;
chair.position.set(1.071, 0, -1.402);
const character = new Group();
character.position.set(-1.55, 0, -0.8);
const desk = new Vector3(2.5, 0, -1.15);
const seating = createOfficeSeating(character, chair, 0.85, desk, () => true);
const deskWidth =
  Math.abs(Math.cos((-100 * Math.PI) / 180)) * 3.1 +
  Math.abs(Math.sin((-100 * Math.PI) / 180)) * 1.5;
const walkable = (x, z) =>
  x > -3.5 &&
  x < 3.55 &&
  z > -2.6 &&
  z < 0.05 &&
  clearsOfficeChair(chair, x, z) &&
  !(Math.abs(x - 2.5) < deskWidth / 2 + 0.65);
const result = simulate(
  chair,
  character.position,
  new Vector2(1, 0),
  walkable,
  3,
);
assert(
  result.position.x > 0.5,
  `Room route must make progress around the chair: ${result.position.toArray()}`,
);
assert(result.detour > 0.4, "Room route must use the open aisle");
const diagonal = simulate(
  chair,
  character.position,
  new Vector2(Math.cos(0.5), -Math.sin(0.5)),
  walkable,
  4,
);
assert(
  diagonal.position.x > 0.5,
  `Camera-relative walking must route through the open aisle: ${diagonal.position.toArray()}`,
);

// Exit consists of one planted drive followed by a coast, never repeated kicks.
const forward = new Vector3(0, 0, 1).applyQuaternion(chair.quaternion);
const sideways = new Vector3(1, 0, 0).applyQuaternion(chair.quaternion);
character.position
  .copy(desk)
  .addScaledVector(forward, -1.5)
  .addScaledVector(sideways, -1.4);
for (let i = 0; i < 180; i++)
  seating.update(
    1 / 60,
    i < 2 ? new Vector2(forward.x, forward.z) : new Vector2(),
    true,
  );
assert.equal(seating.stage, "seated");
const tucked = chair.position.clone();
seating.requestExit();
let drives = 0,
  pushing = false;
for (let i = 0; i < 180; i++) {
  const previous = chair.position.clone();
  const motion = seating.update(1 / 60, new Vector2(), true);
  const active =
    seating.stage === "push-back" &&
    motion.pose.footLift < 0.00001 &&
    chair.position.distanceTo(previous) > 0.00001;
  if (active && !pushing) drives++;
  pushing = active;
}
assert.equal(drives, 1, "Getting up must use exactly one planted push");
assert(
  Math.abs(chair.position.distanceTo(tucked) - 0.52) < 0.001,
  "Chair should roll out only 0.52 units",
);
assert.equal(seating.active, false);
console.log(
  "PASS: chair avoidance from all directions, narrow room clearance, input cancellation, single exit push, and shorter chair travel.",
);
