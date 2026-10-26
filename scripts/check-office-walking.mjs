import assert from "node:assert/strict";
import { Vector2 } from "three";
import { createOfficeWalking } from "../src/scripts/office-walking.ts";
import { createWalkCycle, WALK_SPEED } from "../src/scripts/character-animation.ts";

for (const fps of [30, 60, 120]) {
  const controls = createOfficeWalking(), dt = 1 / fps;
  const forward = new Vector2(0, 1);
  let previous = 0;
  for (let frame = 0; frame < fps; frame++) {
    controls.update(forward, WALK_SPEED, dt);
    assert(controls.velocity.y >= previous && controls.velocity.y <= WALK_SPEED + 1e-6);
    previous = controls.velocity.y;
    if (frame + 1 === fps / 5) assert(previous > WALK_SPEED * .94, "Starts must remain responsive");
  }
  let yaw = Math.PI - .02;
  const targetYaw = -Math.PI + .02;
  const turn = controls.face(yaw, Math.sin(targetYaw), Math.cos(targetYaw), dt);
  assert(Math.abs(turn - yaw) < .04, "Turns across +/- pi must use the short arc");
  const diagonal = new Vector2(1, 1).normalize();
  for (let frame = 0; frame < fps; frame++) {
    controls.update(diagonal, WALK_SPEED, dt);
    assert(controls.velocity.length() < WALK_SPEED * 1.01, "Diagonal input must not increase speed");
  }
  let drift = 0;
  previous = controls.velocity.length();
  for (let frame = 0; frame < fps; frame++) {
    controls.update(new Vector2(), WALK_SPEED, dt);
    const speed = controls.velocity.length();
    assert(speed <= previous + .00001 && controls.velocity.x >= 0 && controls.velocity.y >= 0);
    drift += speed * dt;
    previous = speed;
  }
  assert(drift < .15, "Release should settle promptly, without a floaty glide");
  assert.equal(controls.velocity.length(), 0);
  controls.update(forward, WALK_SPEED, dt);
  controls.reset();
  controls.update(new Vector2(), WALK_SPEED, dt);
  assert.equal(controls.velocity.length(), 0, "Collisions must clear stored acceleration");
  const gait = createWalkCycle();
  const before = gait.update(.2, dt, true);
  gait.stop();
  const after = gait.update(0, dt, false);
  assert.equal(after.phase, before.phase, "Stopping at furniture must not snap the legs to a new phase");
  assert.equal(after.stride, 0);
}
console.log("PASS: smooth acceleration, prompt stops, shortest turns, equal diagonal speed, collision reset, and pose continuity at 30/60/120 fps.");
