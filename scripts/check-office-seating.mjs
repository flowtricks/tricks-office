import assert from "node:assert/strict";
import * as T from "three";
import { loadTestChair } from "./load-test-model.mjs";
import {
  createOfficeSeating,
  clearsOfficeChair,
} from "../src/scripts/office-seating.ts";

for (const fps of [30, 60, 120]) {
  const character = new T.Group();
  const { chair, seatHeight } = await loadTestChair();
  chair.position.set(
    2.5 + Math.sin((-100 * Math.PI) / 180) * 1.45,
    0,
    -1.15 + Math.cos((-100 * Math.PI) / 180) * 1.45,
  );
  chair.rotation.y = (80 * Math.PI) / 180;
  const home = chair.position.clone();
  const forward = new T.Vector3(0, 0, 1).applyQuaternion(chair.quaternion);
  character.position.copy(home).addScaledVector(forward, -1.3);
  const walkable = (x, z) =>
    x > -3.5 && z > -2.6 && z < 0.05 && clearsOfficeChair(chair, x, z);
  const desk = new T.Vector3(2.5, 0, -1.15);
  const seating = createOfficeSeating(
    character,
    chair,
    seatHeight,
    desk,
    walkable,
  );
  const toward = new T.Vector2(forward.x, forward.z);
  assert(
    Math.abs(chair.position.distanceTo(home) - 0.64) < 1e-6,
    "Chair starts pulled out",
  );
  character.position.copy(chair.position).addScaledVector(forward, -1.1);
  seating.update(1 / fps, toward, true);
  assert(
    !seating.active,
    "Approaching the chair alone must not trigger sitting",
  );
  const side = new T.Vector3(1, 0, 0).applyQuaternion(chair.quaternion);
  character.position
    .copy(desk)
    .addScaledVector(forward, -1.5)
    .addScaledVector(side, -1.4);
  const stages = new Set();
  let largestStep = 0;
  let scootStarts = 0,
    chairWasMoving = false;
  for (let i = 0; i < fps * 12; i++) {
    const previous = character.position.clone();
    const previousChair = chair.position.clone();
    seating.update(1 / fps, toward, true);
    const chairMoving = chair.position.distanceTo(previousChair) > 0.000001;
    if (chairMoving && !chairWasMoving) scootStarts++;
    chairWasMoving = chairMoving;
    largestStep = Math.max(
      largestStep,
      previous.distanceTo(character.position),
    );
    stages.add(seating.stage);
  }
  assert.equal(
    seating.stage,
    "seated",
    "Holding the approach key must not immediately stand up",
  );
  assert(
    Math.abs(chair.position.distanceTo(home) - 0.12) < 1e-6,
    "Chair should scoot back to the desk",
  );
  for (const stage of ["sit", "scoot"]) assert(stages.has(stage), stage);
  assert(largestStep < 5 / fps, "Choreography should not teleport");
  assert.equal(
    scootStarts,
    1,
    "Sitting should use one uninterrupted push and coast",
  );
  assert(!stages.has("pull"), "There should be no chair-grabbing stage");
  seating.update(1 / fps, new T.Vector2(), true);
  seating.update(1 / fps, toward.clone().negate(), true);
  for (let i = 0; i < fps * 6; i++)
    seating.update(1 / fps, new T.Vector2(), true);
  assert.equal(
    seating.active,
    false,
    "A brief direction press must finish standing and release control",
  );
  assert(
    walkable(character.position.x, character.position.z),
    "Exit must land outside the moving chair collider",
  );
  assert(Math.abs(chair.position.distanceTo(home) - 0.64) < 1e-6);
  const stopped = character.position.clone();
  seating.update(0, new T.Vector2(), true);
  assert(
    stopped.equals(character.position),
    "Paused choreography must not drift",
  );
  seating.update(1 / fps, toward, true);
  assert(
    seating.active,
    "The pulled-out chair must remain usable on the next visit",
  );
  seating.requestExit();
  for (let i = 0; i < fps * 8; i++)
    seating.update(1 / fps, new T.Vector2(), true);
  assert.equal(seating.stage, "seated", "Input during entry must not queue an exit");
  seating.requestExit();
  for (let i = 0; i < fps * 4; i++)
    seating.update(1 / fps, new T.Vector2(), true);
  assert(!seating.active, "A new press after the cooldown should exit");
  console.log(
    `PASS: chair entry, held input, scoot, tap-to-exit, clear landing at ${fps} fps.`,
  );
}
