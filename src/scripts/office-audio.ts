/** Contacts match the animator: right foot at PI, left foot at 2 PI. */
export function createFootContacts() {
  let previousPhase = 0;
  let previousStride = 0;
  return (phase: number, stride: number, grounded: boolean) => {
    const contacts =
      grounded &&
      phase >= previousPhase &&
      Math.max(stride, previousStride) > 0.02
        ? Math.max(
            0,
            Math.floor((phase + 1e-7) / Math.PI) -
              Math.floor((previousPhase + 1e-7) / Math.PI),
          )
        : 0;
    previousPhase = phase;
    previousStride = grounded ? stride : 0;
    return contacts;
  };
}

/** Use every recording before reshuffling, with no repeat across bag boundaries. */
export function createFootstepShuffle(count: number, random = Math.random) {
  let bag: number[] = [],
    previous = -1;
  return () => {
    if (!bag.length) {
      bag = Array.from({ length: count }, (_, i) => i);
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (count > 1 && bag[bag.length - 1] === previous) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    previous = bag.pop()!;
    return previous;
  };
}

function createClipAudio(
  context: AudioContext,
  signal: AbortSignal,
  urls: string[],
  volume: number,
) {
  let buffers: AudioBuffer[] = [];
  let pending: Promise<void> | undefined;
  const voices = new Set<AudioBufferSourceNode>();
  const output = context.createGain();
  output.gain.value = volume;
  output.connect(context.destination);
  const stop = () => {
    for (const voice of voices) voice.stop();
    voices.clear();
  };
  signal.addEventListener(
    "abort",
    () => {
      stop();
      output.disconnect();
      buffers = [];
    },
    { once: true },
  );
  return {
    load() {
      if (buffers.length || signal.aborted) return Promise.resolve();
      if (pending) return pending;
      pending = Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url, { signal });
          if (!response.ok) throw new Error(`Office audio: ${response.status}`);
          return context.decodeAudioData(await response.arrayBuffer());
        }),
      )
        .then((result) => {
          if (!signal.aborted) buffers = result;
        })
        .catch((error) => {
          if (!signal.aborted)
            console.warn("Office sound could not load", error);
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
    play(index = 0, loop = false) {
      if (!buffers.length || signal.aborted || context.state !== "running")
        return false;
      const source = context.createBufferSource();
      source.buffer = buffers[index];
      source.loop = loop;
      source.connect(output);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
      };
      voices.add(source);
      source.start();
      return true;
    },
    stop,
  };
}

export function createFootstepAudio(
  context: AudioContext,
  signal: AbortSignal,
) {
  const clips = createClipAudio(
    context,
    signal,
    Array.from(
      { length: 10 },
      (_, i) => `/audio/footsteps/step-${String(i + 1).padStart(2, "0")}.wav`,
    ),
    0.8,
  );
  const pick = createFootstepShuffle(10);
  return { load: clips.load, stop: clips.stop, play: () => clips.play(pick()) };
}

export function createAlexaReplyAudio(
  context: AudioContext,
  signal: AbortSignal,
) {
  const clip = createClipAudio(context, signal, ["/audio/alexa-okay.m4a"], 1);
  let request = 0;
  return {
    load: clip.load,
    play() {
      const current = ++request;
      // A slow first fetch may finish late; muting cancels that pending reply.
      void clip.load().then(() => {
        if (request === current) clip.play();
      });
    },
    stop() {
      request++;
      clip.stop();
    },
  };
}

export function createShelfHoverAudio(
  context: AudioContext,
  signal: AbortSignal,
) {
  const clip = createClipAudio(context, signal, ["/audio/click.wav"], 0.65);
  return {
    load: clip.load,
    stop: clip.stop,
    play() {
      clip.stop();
      clip.play();
    },
  };
}

export function createCharacterLiftAudio(
  context: AudioContext,
  signal: AbortSignal,
) {
  const clips = createClipAudio(
    context,
    signal,
    ["/audio/grab.wav", "/audio/land.wav"],
    1,
  );
  return {
    load: clips.load,
    stop: clips.stop,
    grab() {
      clips.stop();
      clips.play(0);
    },
    land() {
      clips.stop();
      clips.play(1);
    },
  };
}

export function createObjectPressAudio(
  context: AudioContext,
  signal: AbortSignal,
) {
  const clip = createClipAudio(context, signal, ["/audio/press.wav"], 0.8);
  return {
    load: clip.load,
    stop: clip.stop,
    play() {
      clip.stop();
      clip.play();
    },
  };
}

export function createShelfTransitionAudio(
  context: AudioContext,
  signal: AbortSignal,
) {
  const clip = createClipAudio(context, signal, ["/audio/woosh.wav"], 0.7);
  return {
    load: clip.load,
    stop: clip.stop,
    play() {
      clip.stop();
      clip.play();
    },
  };
}

export function createTypingAudio(context: AudioContext, signal: AbortSignal) {
  return createClipAudio(context, signal, ["/audio/type-click.wav"], 0.45);
}

function createMotionAudio(
  context: AudioContext,
  signal: AbortSignal,
  url: string,
) {
  const clip = createClipAudio(context, signal, [url], 0.7);
  let playing = false;
  const stop = () => {
    clip.stop();
    playing = false;
  };
  return {
    load: clip.load,
    stop,
    setPlaying(wanted: boolean) {
      if (!wanted) {
        if (playing) stop();
        return;
      }
      if (!playing) playing = clip.play(0, true);
    },
  };
}

export function createDeskAudio(context: AudioContext, signal: AbortSignal) {
  return createMotionAudio(context, signal, "/audio/desk.wav");
}

export function createChairSlideAudio(
  context: AudioContext,
  signal: AbortSignal,
) {
  return createMotionAudio(context, signal, "/audio/chair-slide.wav");
}

/** Run both unlock calls synchronously inside the tap, before any fetch/await. */
export async function resumeOfficeAudio(
  context: AudioContext,
  music: HTMLAudioElement,
  canPlay: () => boolean,
) {
  if (!canPlay() || context.state === "closed") return;
  const attempts: Promise<unknown>[] = [];
  if (context.state !== "running") attempts.push(context.resume());
  if (music.paused) attempts.push(music.play());
  // A rejected autoplay attempt must not change the user's sound preference.
  // Safari can require another real tap after returning from an interruption.
  await Promise.allSettled(attempts);
  if (!canPlay()) {
    music.pause();
    await context.suspend().catch(() => {});
  }
}

/** Unlock the Web Audio output while the user gesture is still active. */
export function primeOfficeAudio(context: AudioContext) {
  const silent = context.createBufferSource();
  silent.buffer = context.createBuffer(1, 1, context.sampleRate);
  silent.connect(context.destination);
  silent.onended = () => silent.disconnect();
  silent.start();
}

export function useOfficePlaybackSession(signal: AbortSignal) {
  const session = (navigator as Navigator & { audioSession?: { type: string } })
    .audioSession;
  if (!session) return;
  const previous = session.type;
  try {
    session.type = "playback";
  } catch {
    return;
  }
  signal.addEventListener(
    "abort",
    () => {
      if (session.type === "playback") session.type = previous;
    },
    { once: true },
  );
}
