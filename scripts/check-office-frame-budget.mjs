import assert from "node:assert/strict";
import { createOfficeFrameBudget } from "../src/scripts/office-frame-budget.ts";
import { officePixelRatio } from "../src/scripts/office-render-support.ts";

for (const mobile of [false, true]) for (const refresh of [30, 60, 90, 120, 144, 165, 240]) {
  const budget = createOfficeFrameBudget(mobile);
  let rendered = 0,
    shadows = 0;
  for (let frame = 0; frame < refresh * 10; frame++) {
    const now = (frame * 1000) / refresh;
    if (!budget.renderDue(now)) continue;
    rendered++;
    if (budget.shadowsDue(now)) shadows++;
  }
  assert.equal(rendered, Math.min(refresh, 60) * 10, `${refresh} Hz display retains 60 fps animation`);
  assert.equal(shadows, 300, "Shadow maps update at 30 Hz");
}
// A background gap must resume immediately without a burst of catch-up renders.
const resumed = createOfficeFrameBudget(false);
assert.equal(resumed.renderDue(0), true);
assert.equal(resumed.renderDue(60_000), true);
assert.equal(resumed.renderDue(60_001), false);
assert.equal(resumed.renderDue(60_017), true);
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
  desktop.renderDue((i * 1000) / 120);
  desktop.sample(40);
}
assert.equal(desktop.resolutionScale, 1);
const oldPhonePixels = 393 * 852 * 2 ** 2;
const newPhonePixels = 393 * 852 * officePixelRatio(393, 852, 3, true) ** 2;
assert.ok(newPhonePixels / oldPhonePixels <= 0.766);
console.log(
  "PASS: 60 fps desktop/mobile pacing at 30–240 Hz, 30 Hz shadows, adaptive mobile quality recovery; Retina detail retained.",
);
