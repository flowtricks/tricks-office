import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createFootContacts,
  createFootstepShuffle,
} from "../src/scripts/office-audio.ts";
for (const fps of [30, 60, 120]) {
  const contact = createFootContacts();
  let count = 0;
  for (let i = 1; i <= fps * 2; i++)
    count += contact((i / fps) * Math.PI * 4, 1, true);
  assert.equal(count, 8, `One contact per half-cycle at ${fps} fps`);
  assert.equal(
    contact(Math.PI * 8, 0, true),
    0,
    "Standing still cannot repeat a contact",
  );
  assert.equal(
    contact(0, 0, false),
    0,
    "Reset/pick-up cannot trigger a footstep",
  );
  assert.equal(
    contact(Math.PI * 2, 1, false),
    0,
    "No airborne or seated steps",
  );
}
const settling = createFootContacts();
settling(Math.PI - 0.1, 0.5, true);
assert.equal(
  settling(Math.PI, 0, true),
  1,
  "Final settling foot lands as stride reaches zero",
);
const pick = createFootstepShuffle(10);
let previous = -1;
for (let cycle = 0; cycle < 20; cycle++) {
  const used = new Set();
  for (let step = 0; step < 10; step++) {
    const index = pick();
    assert.notEqual(
      index,
      previous,
      "Consecutive contacts use different recordings",
    );
    used.add(index);
    previous = index;
  }
  assert.equal(used.size, 10, "Use every footstep before reshuffling");
}
const hashes = new Set();
let bytes = 0;
for (let i = 1; i <= 10; i++) {
  const wav = readFileSync(
    `public/audio/footsteps/step-${String(i).padStart(2, "0")}.wav`,
  );
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.ok(wav.length > 10_000 && wav.length < 30_000);
  bytes += wav.length;
  hashes.add(createHash("sha256").update(wav).digest("hex"));
}
assert.equal(hashes.size, 10);
assert.ok(bytes < 210_000);
console.log(
  "PASS: contact sync at 30/60/120 fps, final step, airborne/reset suppression, non-repeating shuffle, ten distinct lightweight clips.",
);
