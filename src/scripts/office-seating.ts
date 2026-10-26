import * as T from "three";

export type ChairPose = {
  sit: number;
  lean: number;
  seatHeight: number;
  footForward: number;
  footLift: number;
};

type Frame = {
  position: T.Vector3;
  yaw: number;
  pull: number;
  sit: number;
  lean: number;
};
type Beat = Frame & {
  name: string;
  duration: number;
  walking?: boolean;
  path?: T.CubicBezierCurve3;
};

export function clearsOfficeChair(chair: T.Object3D, x: number, z: number) {
  const dx = x - chair.position.x,
    dz = z - chair.position.z;
  const cos = Math.cos(chair.rotation.y),
    sin = Math.sin(chair.rotation.y);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const nearestX = T.MathUtils.clamp(localX, -0.71, 0.71);
  const nearestZ = T.MathUtils.clamp(localZ, -0.61, 0.52);
  return Math.hypot(localX - nearestX, localZ - nearestZ) >= 0.65;
}

export function createOfficeSeating(
  character: T.Object3D,
  chair: T.Object3D,
  seatHeight: number,
  deskPosition: T.Vector3,
  walkable: (x: number, z: number) => boolean,
) {
  const home = chair.position.clone();
  const homeRotation = chair.quaternion.clone();
  const forward = new T.Vector3(0, 0, 1).applyQuaternion(homeRotation);
  const sideways = new T.Vector3(1, 0, 0).applyQuaternion(homeRotation);
  const facing = chair.rotation.y;
  const retreat = 0.64;
  const tucked = 0.12;
  const seatForward = 0.18;
  chair.position.addScaledVector(forward, -retreat);
  const entry = character.position.clone();
  let mode: "free" | "entering" | "seated" | "leaving" = "free";
  let beats: Beat[] = [];
  let elapsed = 0;
  let exitRequested = false;
  let inputCooldown = 0;
  let inputWasActive = false;
  let armed = true;
  let side = -1;
  const state: Frame = {
    position: character.position.clone(),
    yaw: character.rotation.y,
    pull: retreat,
    sit: 0,
    lean: 0,
  };
  let start = { ...state, position: state.position.clone() };
  const pose: ChairPose = {
    sit: 0,
    lean: 0,
    seatHeight,
    footForward: 0.43,
    footLift: 0,
  };
  const fromDesk = new T.Vector3();
  const lastPosition = new T.Vector3();
  const point = (x: number, z: number, pull = retreat) =>
    home
      .clone()
      .addScaledVector(sideways, x)
      .addScaledVector(forward, z - pull);
  const angleTo = (from: T.Vector3, to: T.Vector3) =>
    Math.atan2(to.x - from.x, to.z - from.z);
  const turn = (from: number, to: number, t: number) =>
    from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
  function queue(items: Beat[]) {
    beats = items;
    elapsed = 0;
    start = { ...state, position: state.position.clone() };
  }
  function beat(
    name: string,
    duration: number,
    position: T.Vector3,
    values: Partial<Omit<Beat, "name" | "duration" | "position">> = {},
  ): Beat {
    return {
      name,
      duration,
      position,
      yaw: facing,
      pull: retreat,
      sit: 0,
      lean: 0,

      ...values,
    };
  }
  function begin() {
    mode = "entering";
    entry.copy(character.position);
    state.position.copy(character.position);
    state.yaw = character.rotation.y;
    side = character.position.clone().sub(home).dot(sideways) > 0 ? 1 : -1;
    const seated = point(0, seatForward);
    queue([
      beat("sit", 0.95, seated, {
        sit: 1,
        lean: 0.12,
        walking: true,
        path: new T.CubicBezierCurve3(
          entry.clone(),
          point(side * 0.9, 1.17),
          point(0, 1.12),
          seated,
        ),
      }),
      beat("scoot", 0.65, point(0, seatForward, tucked), {
        pull: tucked,
        sit: 1,
        lean: 0.01,
      }),
    ]);
  }
  function leave() {
    mode = "leaving";
    exitRequested = false;
    const front = point(0, 1.12);
    queue([
      beat("push-back", 0.65, point(0, seatForward), { sit: 1, lean: 0.12 }),
      beat("stand", 0.5, front, { lean: 0.04 }),
      beat("walk-away", 0.65, entry.clone(), {
        yaw: angleTo(front, entry),
        walking: true,
        path: new T.CubicBezierCurve3(
          front,
          point(side * 0.6, 1.17),
          point(side * 0.9, 1.17),
          entry.clone(),
        ),
      }),
    ]);
  }
  return {
    get active() {
      return mode !== "free" || inputCooldown > 0;
    },
    get stage() {
      return beats[0]?.name ?? mode;
    },
    requestExit() {
      if (mode === "seated" && inputCooldown === 0) exitRequested = true;
    },
    update(dt: number, input: T.Vector2, enabled: boolean) {
      inputCooldown = Math.max(0, inputCooldown - dt);
      const inputActive = input.lengthSq() > 0.01;
      fromDesk.copy(character.position).sub(deskPosition);
      const frontDistance = -fromDesk.dot(forward);
      const nearDesk =
        frontDistance > 0.7 &&
        frontDistance < 1.65 &&
        Math.abs(fromDesk.dot(sideways)) < 1.55;
      if (!armed && (!inputActive || !nearDesk)) armed = true;
      if (
        mode === "free" &&
        inputCooldown === 0 &&
        enabled &&
        armed &&
        inputActive &&
        nearDesk &&
        input.x * forward.x + input.y * forward.z > 0.15 &&
        walkable(character.position.x, character.position.z)
      )
        begin();
      if (mode === "seated" && inputCooldown === 0 && inputActive && !inputWasActive) exitRequested = true;
      inputWasActive = inputActive;
      if (mode === "seated" && exitRequested) leave();
      const active = mode !== "free" || inputCooldown > 0;
      lastPosition.copy(character.position);
      let walking = false;
      if (beats.length) {
        let remaining = dt;
        while (beats.length && remaining > 0) {
          const target = beats[0];
          const step = Math.min(remaining, target.duration - elapsed);
          elapsed += step;
          remaining -= step;
          const t = T.MathUtils.smootherstep(elapsed / target.duration, 0, 1);
          if (target.path) target.path.getPoint(t, state.position);
          else state.position.lerpVectors(start.position, target.position, t);
          state.yaw = turn(start.yaw, target.yaw, t);
          for (const key of ["pull", "sit", "lean"] as const)
            state[key] = T.MathUtils.lerp(start[key], target[key], t);
          pose.footForward = 0.43;
          pose.footLift = 0;
          if (target.name === "sit")
            state.sit = T.MathUtils.smootherstep(t, 0.5, 1);
          if (target.name === "scoot") {
            const u = elapsed / target.duration;
            const travel = start.pull - target.pull;
            const stroke = travel / 5;
            let distance = 0;
            if (u < 0.1) {
              const plant = u / 0.1;
              pose.footForward = T.MathUtils.lerp(
                0.43,
                0.51,
                T.MathUtils.smootherstep(plant, 0, 1),
              );
              pose.footLift = 0.045 * Math.sin(Math.PI * plant) ** 2;
            } else if (u < 0.26) {
              const push = (u - 0.1) / 0.16;
              distance = stroke * push ** 2;
              pose.footForward = 0.51 - distance;
            } else {
              const coast = Math.min(1, (u - 0.26) / 0.64);
              distance = stroke + (travel - stroke) * (2 * coast - coast ** 2);
              pose.footForward = T.MathUtils.lerp(
                0.51 - stroke,
                0.43,
                T.MathUtils.smootherstep(coast, 0, 1),
              );
              pose.footLift = 0.07 * Math.sin(Math.PI * coast);
            }
            state.pull = start.pull - distance;
            state.position.copy(point(0, seatForward, state.pull));
            state.lean = 0.06 * Math.sin(Math.PI * Math.min(1, u / 0.9));
          }
          if (target.name === "push-back") {
            const u = elapsed / target.duration;
            const travel = target.pull - start.pull;
            const stroke = Math.min(0.13, travel * 0.35);
            let distance = 0;
            if (u < 0.16) {
              const plant = u / 0.16;
              pose.footForward = T.MathUtils.lerp(
                0.43,
                0.40,
                T.MathUtils.smootherstep(plant, 0, 1),
              );
              pose.footLift = 0.045 * Math.sin(Math.PI * plant) ** 2;
            } else if (u < 0.36) {
              const push = (u - 0.16) / 0.2;
              distance = stroke * push ** 2;
              // One planted push; the feet stay fixed as the chair rolls back.
              pose.footForward = 0.40 + distance;
            } else {
              const coast = Math.min(1, (u - 0.36) / 0.56);
              const recover = Math.min(1, (u - 0.36) / 0.64);
              distance = stroke + (travel - stroke) * (2 * coast - coast ** 2);
              pose.footForward = T.MathUtils.lerp(
                0.40 + stroke,
                0.43,
                T.MathUtils.smootherstep(recover, 0, 1),
              );
              pose.footLift = 0.07 * Math.sin(Math.PI * recover);
            }
            state.pull = start.pull + distance;
            state.position.copy(point(0, seatForward, state.pull));
            state.lean = 0.06 * Math.sin(Math.PI * Math.min(1, u / 0.92));
          }
          walking ||= !!target.walking && state.sit < 0.1;
          if (elapsed >= target.duration - 1e-8) {
            beats.shift();
            elapsed = 0;
            start = { ...state, position: state.position.clone() };
          }
        }
        if (!beats.length) {
          inputCooldown = 1;
          exitRequested = false;
          if (mode === "entering") mode = "seated";
          else {
            mode = "free";
            armed = false;
          }
        }
      }
      if (active) {
        character.position.copy(state.position);
        character.rotation.y = state.yaw;
        chair.position.copy(home).addScaledVector(forward, -state.pull);
        chair.updateMatrixWorld(true);
      }
      pose.sit = state.sit;
      pose.lean = state.lean;
      return {
        active,
        walking,
        distance: walking ? lastPosition.distanceTo(character.position) : 0,
        pose: mode !== "free" ? pose : undefined,
      };
    },
  };
}
