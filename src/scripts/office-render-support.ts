import * as T from "three";

/** iPadOS can advertise itself as a Mac. All iOS browsers use WebKit. */
export function isAppleTouchDevice(userAgent: string, maxTouchPoints: number) {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  );
}

export function officePixelRatio(
  width: number,
  height: number,
  dpr: number,
  appleTouch: boolean,
) {
  // Bound offscreen allocations on Retina iPhones/iPads without changing framing.
  return Math.min(
    dpr,
    appleTouch ? 1.75 : 2,
    appleTouch ? Math.sqrt(1_500_000 / Math.max(1, width * height)) : 2,
  );
}

export function officeRenderSupport(
  renderer: T.WebGLRenderer,
  appleTouch: boolean,
) {
  // Three r186 requires WebGL 2.
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const hdr =
    renderer.extensions.has("EXT_color_buffer_float") ||
    renderer.extensions.has("EXT_color_buffer_half_float");
  const type = hdr ? T.HalfFloatType : T.UnsignedByteType;
  const colorSamples = gl.getInternalformatParameter(
    gl.RENDERBUFFER,
    hdr ? gl.RGBA16F : gl.RGBA8,
    gl.SAMPLES,
  ) as Int32Array;
  const depthSamples = gl.getInternalformatParameter(
    gl.RENDERBUFFER,
    gl.DEPTH_COMPONENT24,
    gl.SAMPLES,
  ) as Int32Array;
  // MAX_SAMPLES alone does not describe RGBA16F support. WebKit's HDR resolve
  // is also unreliable on some iOS GPUs; SMAA still smooths the final image.
  const candidates = appleTouch
    ? [0]
    : [...colorSamples]
        .filter((n) => n <= 4 && depthSamples.includes(n))
        .sort((a, b) => b - a)
        .concat(0);
  for (const samples of candidates) {
    const probe = new T.WebGLRenderTarget(4, 4, { type, samples });
    renderer.setRenderTarget(probe);
    const complete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(null);
    probe.dispose();
    if (complete) return { type, samples };
  }
  return { type: T.UnsignedByteType, samples: 0 };
}
