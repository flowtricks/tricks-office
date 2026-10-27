import assert from "node:assert/strict";
import * as T from "three";
import {
  isAppleTouchDevice,
  officePixelRatio,
  officeRenderSupport,
} from "../src/scripts/office-render-support.ts";

assert.equal(
  isAppleTouchDevice(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    5,
  ),
  true,
);
assert.equal(
  isAppleTouchDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5),
  true,
);
assert.equal(
  isAppleTouchDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 0),
  false,
);
for (const [width, height] of [
  [393, 852],
  [852, 393],
  [1024, 1366],
  [1366, 1024],
]) {
  const ratio = officePixelRatio(width, height, 3, true);
  assert.ok(width * height * ratio ** 2 <= 2_000_000.01);
}
assert.equal(officePixelRatio(1440, 900, 2, false), 2);
assert.ok(Number.isFinite(officePixelRatio(0, 0, 3, true)));

function rendererStub({
  hdr = true,
  color = [4, 2],
  depth = [4, 2],
  rejectMSAA = false,
} = {}) {
  let target;
  return {
    extensions: { has: () => hdr },
    setRenderTarget(value) {
      target = value;
    },
    getContext: () => ({
      RENDERBUFFER: 1,
      RGBA16F: 2,
      RGBA8: 3,
      DEPTH_COMPONENT24: 4,
      SAMPLES: 5,
      FRAMEBUFFER: 6,
      FRAMEBUFFER_COMPLETE: 7,
      getInternalformatParameter: (_, format) =>
        new Int32Array(format === 4 ? depth : color),
      checkFramebufferStatus: () => (rejectMSAA && target.samples > 0 ? 0 : 7),
    }),
  };
}
assert.deepEqual(officeRenderSupport(rendererStub(), true), {
  type: T.HalfFloatType,
  samples: 0,
});
assert.deepEqual(
  officeRenderSupport(rendererStub({ color: [2], depth: [4, 2] }), false),
  { type: T.HalfFloatType, samples: 2 },
);
assert.equal(
  officeRenderSupport(rendererStub({ color: [], depth: [4] }), false).samples,
  0,
);
assert.equal(
  officeRenderSupport(rendererStub({ rejectMSAA: true }), false).samples,
  0,
);
assert.equal(
  officeRenderSupport(rendererStub({ hdr: false }), false).type,
  T.UnsignedByteType,
);
console.log(
  "Render compatibility checks passed: iPhone/iPad detection, Retina memory budget, format-specific MSAA, framebuffer fallback.",
);
