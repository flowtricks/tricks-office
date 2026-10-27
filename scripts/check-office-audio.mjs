import assert from "node:assert/strict";
import {
  createFootstepAudio,
  createAlexaReplyAudio,
  createShelfHoverAudio,
  createCharacterLiftAudio,
  createObjectPressAudio,
  createShelfTransitionAudio,
  createDeskAudio,
} from "../src/scripts/office-audio.ts";
import { createShelfFocusTargets } from "../src/scripts/office-shelf-focus.ts";
import * as T from "three";

const requests = [],
  started = [],
  stopped = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  requests.push(url);
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
};
const context = {
  state: "running",
  destination: {},
  decodeAudioData: async (data) => ({ data }),
  createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
  createBufferSource: () => {
    const source = {
      buffer: undefined,
      onended: undefined,
      connect() {},
      disconnect() {},
      start() {
        started.push(source);
      },
      stop() {
        stopped.push(source);
        source.onended?.();
      },
    };
    return source;
  },
};
try {
  const abort = new AbortController();
  const steps = createFootstepAudio(context, abort.signal);
  assert.equal(requests.length, 0, "No audio fetching before unmute");
  await Promise.all([steps.load(), steps.load()]);
  assert.equal(
    requests.length,
    10,
    "Concurrent loads share one fetch per clip",
  );
  steps.play();
  steps.play();
  assert.notEqual(started[0].buffer, started[1].buffer);
  steps.stop();
  assert.equal(stopped.length, 2, "Mute stops active effects immediately");
  const reply = createAlexaReplyAudio(context, abort.signal);
  await reply.load();
  const beforeReply = started.length;
  reply.play();
  reply.stop();
  await Promise.resolve();
  assert.equal(
    started.length,
    beforeReply,
    "Mute cancels a pending Alexa response",
  );
  reply.play();
  await Promise.resolve();
  assert.equal(started.length, beforeReply + 1);
  const hover = createShelfHoverAudio(context, abort.signal);
  await hover.load();
  hover.play();
  hover.play();
  assert.ok(
    stopped.includes(started.at(-2)),
    "Rapid hover changes do not stack click sounds",
  );
  const lift = createCharacterLiftAudio(context, abort.signal);
  await lift.load();
  lift.grab();
  const grabbed = started.at(-1);
  lift.land();
  assert.notEqual(
    started.at(-1).buffer,
    grabbed.buffer,
    "Grab and landing use different halves",
  );
  assert.ok(
    stopped.includes(grabbed),
    "Landing replaces any unfinished grab sound",
  );
  const press = createObjectPressAudio(context, abort.signal);
  await press.load();
  press.play();
  assert.notEqual(started.at(-1).buffer, grabbed.buffer);
  const transition = createShelfTransitionAudio(context, abort.signal);
  await transition.load();
  transition.play();
  transition.play();
  assert.ok(
    stopped.includes(started.at(-2)),
    "Reversing the camera transition replaces the previous whoosh",
  );
  const desk = createDeskAudio(context, abort.signal);
  await desk.load();
  const beforeDesk = started.length;
  desk.setPlaying(true);
  desk.setPlaying(true);
  assert.equal(
    started.length,
    beforeDesk + 1,
    "Holding a desk button uses one loop, not a new sound every frame",
  );
  assert.equal(started.at(-1).loop, true);
  const motor = started.at(-1);
  desk.setPlaying(false);
  assert.ok(
    stopped.includes(motor),
    "Release stops the desk motor immediately",
  );
  context.state = "suspended";
  const beforeSuspend = started.length;
  steps.play();
  hover.play();
  lift.grab();
  lift.land();
  press.play();
  assert.equal(started.length, beforeSuspend);
  abort.abort();
  context.state = "running";
  steps.play();
  assert.equal(
    started.length,
    beforeSuspend,
    "Disposed scene cannot play audio",
  );

  const lifecycle = new AbortController();
  const picking = createShelfFocusTargets([], lifecycle.signal, new T.Scene());
  const first = {},
    second = {};
  assert.equal(picking.setHovered(first), true);
  assert.equal(
    picking.setHovered(first),
    false,
    "Same object does not retrigger hover sound",
  );
  assert.equal(picking.setHovered(second), true);
  assert.equal(picking.setHovered(), false);
  assert.equal(picking.setHovered(second), true, "Reentering plays again");
  lifecycle.abort();
} finally {
  globalThis.fetch = realFetch;
}
console.log(
  "PASS: lazy shared loads, varied clips, immediate mute, cancelled reply, suspended/disposed silence, and one hover sound per entry.",
);
