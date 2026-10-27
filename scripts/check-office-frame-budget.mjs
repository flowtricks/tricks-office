import assert from "node:assert/strict";
import { createOfficeFrameBudget } from "../src/scripts/office-frame-budget.ts";
import { officePixelRatio } from "../src/scripts/office-render-support.ts";

for (const refresh of [60, 120]) {
  const budget = createOfficeFrameBudget(true);
  let rendered = 0,
    shadows = 0;
  for (let frame = 0; frame < refresh * 10; frame++) {
    const now = (frame * 1000) / refresh;
    if (!budget.renderDue(now)) continue;
    rendered++;
    if (budget.shadowsDue(now)) shadows++;
  }
  assert.equal(rendered, 600, `${refresh} Hz display retains 60 fps animation`);
  assert.equal(shadows, 300, "Shadow maps update at 30 Hz");
}
const mobile = createOfficeFrameBudget(true);
for (let i = 0; i < 150; i++) mobile.sample(1000 / 30);
assert.equal(
  mobile.resolutionScale,
  0.8,
  "Sustained slow frames reduce pixel workload",
);
for (let i = 0; i < 1800; i++) mobile.sample(1000 / 60);
assert.equal(
  mobile.resolutionScale,
  1,
  "Sustained smooth frames restore detail",
);
for (let i = 0; i < 100; i++) mobile.sample(2000);
assert.equal(
  mobile.resolutionScale,
  1,
  "Background/loading pauses do not reduce quality",
);
const desktop = createOfficeFrameBudget(false);
for (let i = 0; i < 1200; i++) {
  assert.equal(desktop.renderDue((i * 1000) / 120), true);
  desktop.sample(40);
}
assert.equal(desktop.resolutionScale, 1);
const oldPhonePixels = 393 * 852 * 2 ** 2;
const newPhonePixels = 393 * 852 * officePixelRatio(393, 852, 3, true) ** 2;
assert.ok(newPhonePixels / oldPhonePixels <= 0.766);
console.log(
  "PASS: 60 fps pacing, 50% fewer mobile shadow renders, adaptive quality recovery, 23% fewer default iPhone render pixels.",
);
