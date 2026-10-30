import assert from "node:assert/strict";
import * as T from "three";
import {
  isAppleTouchDevice,
  officePixelRatio,
  officeRenderSupport,
  warmOfficeRenderer,
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
  assert.ok(width * height * ratio ** 2 <= 1_000_000.01);
  assert.ok(ratio <= 1.5);
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

const scene = new T.Scene();
const sharedTexture = new T.Texture();
scene.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ map: sharedTexture, roughnessMap: sharedTexture })));
const target = new T.WebGLRenderTarget();
const priorTarget = new T.WebGLRenderTarget();
const camera = new T.PerspectiveCamera();
let currentTarget = priorTarget, uploads = 0, yields = 0, compilations = 0, cancelled = false;
const warmupRenderer = {
  getRenderTarget: () => currentTarget,
  setRenderTarget: value => { currentTarget = value; },
  initTexture: texture => { assert.equal(texture, sharedTexture); uploads++; },
  compileAsync: async () => { assert.equal(currentTarget, target); compilations++; return scene; },
};
const nextFrame = async () => { yields++; };
assert.equal(await warmOfficeRenderer(warmupRenderer, scene, camera, target, true, () => cancelled, nextFrame), true);
assert.equal(uploads, 1, 'Shared textures upload once');
assert.equal(yields, 1, 'Mobile uploads yield before compilation');
assert.equal(currentTarget, priorTarget, 'Warmup restores the render target');
cancelled = true;
assert.equal(await warmOfficeRenderer(warmupRenderer, scene, camera, target, true, () => cancelled, nextFrame), false);
assert.equal(compilations, 1, 'Lost/disposed contexts do not start compilation');
cancelled = false;
assert.equal(await warmOfficeRenderer(warmupRenderer, scene, camera, target, true, () => cancelled, async () => { cancelled = true; }), false);
assert.equal(compilations, 1, 'Context loss during an upload stops warmup');
cancelled = false;
warmupRenderer.compileAsync = async () => { cancelled = true; return scene; };
assert.equal(await warmOfficeRenderer(warmupRenderer, scene, camera, target, false, () => cancelled), false);
assert.equal(currentTarget, priorTarget, 'Context loss during compilation preserves target restoration');
console.log('PASS: staged mobile uploads, compositor shader warmup, and context-loss cancellation.');
