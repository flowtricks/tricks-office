/** Phase-locked deadlines avoid dropping a 144 Hz screen to 48 fps. */
function cadence(hz: number) {
  const interval = 1000 / hz;
  let next = -Infinity;
  return (now: number) => {
    if (now + 0.5 < next) return false;
    if (!Number.isFinite(next)) next = now + interval;
    else next += Math.max(1, Math.floor((now + 0.5 - next) / interval) + 1) * interval;
    return true;
  };
}

/** Bound rendering work on every display, including desktop ProMotion. */
export function createOfficeFrameBudget(mobile: boolean) {
  const renderDue = cadence(60);
  const shadowsDue = cadence(30);
  let elapsed = 0;
  let samples = 0;
  let stable = 0;
  let scale = 1;
  return {
    get resolutionScale() {
      return scale;
    },
    renderDue,
    // Retain full-resolution shadow maps, reusing them between 30 Hz updates.
    shadowsDue,
    sample(milliseconds: number) {
      if (!mobile || milliseconds <= 0 || milliseconds > 100) {
        elapsed = samples = stable = 0;
        return false;
      }
      elapsed += milliseconds;
      samples++;
      if (elapsed < 2000) return false;
      const average = elapsed / samples;
      const before = scale;
      if (average > 22) {
        scale = Math.max(0.8, Math.round((scale - 0.1) * 10) / 10);
        stable = 0;
      } else if (average < 17.5) {
        stable += elapsed;
        if (stable >= 10_000) {
          scale = Math.min(1, Math.round((scale + 0.1) * 10) / 10);
          stable = 0;
        }
      } else {
        stable = 0;
      }
      elapsed = samples = 0;
      return before !== scale;
    },
  };
}
