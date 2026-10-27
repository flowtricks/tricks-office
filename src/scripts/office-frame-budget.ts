/** Keep ProMotion devices at a steady 60 fps instead of doing twice the work. */
export function createOfficeFrameBudget(mobile: boolean) {
  let lastRender = -Infinity;
  let lastShadow = -Infinity;
  let elapsed = 0;
  let samples = 0;
  let stable = 0;
  let scale = 1;
  return {
    get resolutionScale() {
      return scale;
    },
    renderDue(now: number) {
      if (mobile && now - lastRender < 1000 / 60 - 1) return false;
      lastRender = now;
      return true;
    },
    shadowsDue(now: number) {
      // Reuse the existing soft shadows between updates; animation/input stays 60 Hz.
      if (mobile && now - lastShadow < 1000 / 30 - 2) return false;
      lastShadow = now;
      return true;
    },
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
