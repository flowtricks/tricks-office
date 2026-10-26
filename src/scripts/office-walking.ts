import * as T from "three";

/** Critically damped controls: continuous acceleration without a floaty stop. */
export function createOfficeWalking() {
  const velocity = new T.Vector2();
  const acceleration = new T.Vector2();
  let turnVelocity = 0;
  return {
    velocity,
    reset() {
      velocity.set(0, 0);
      acceleration.set(0, 0);
      turnVelocity = 0;
    },
    update(input: T.Vector2, speed: number, dt: number) {
      const rate = input.lengthSq() > 0.0001 ? 24 : 32;
      const decay = Math.exp(-rate * dt);
      for (const axis of ["x", "y"] as const) {
        const target = input[axis] * speed;
        const error = velocity[axis] - target;
        const step = (acceleration[axis] + rate * error) * dt;
        velocity[axis] = target + (error + step) * decay;
        acceleration[axis] = (acceleration[axis] - rate * step) * decay;
      }
      if (input.lengthSq() < 0.0001 && velocity.lengthSq() < 0.000001) {
        velocity.set(0, 0);
        acceleration.set(0, 0);
      }
    },
    face(yaw: number, dx: number, dz: number, dt: number) {
      if (Math.hypot(dx, dz) < 0.00001) {
        turnVelocity = 0;
        return yaw;
      }
      const angle = Math.atan2(dx, dz);
      const error = Math.atan2(Math.sin(yaw - angle), Math.cos(yaw - angle));
      const rate = 24;
      const step = (turnVelocity + rate * error) * dt;
      const decay = Math.exp(-rate * dt);
      turnVelocity = (turnVelocity - rate * step) * decay;
      return yaw - error + (error + step) * decay;
    },
  };
}
