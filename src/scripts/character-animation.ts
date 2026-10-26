import { footProfileHull } from "./character-foot-profile.ts";
import * as T from "three";
import type { ChairPose } from "./office-seating";

export const WALK_SPEED = 2.3;
export const WALK_CYCLE_DISTANCE = .98;

export function createWalkCycle() {
  const rate = WALK_SPEED * Math.PI * 2 / WALK_CYCLE_DISTANCE;
  let phase = 0, stride = 0, burstStart = 0, inputTime = 0;
  let settling: { start: number; end: number; stride: number } | undefined;
  return {
    stop() {
      // Keep the current foot pose while blending to idle at an obstacle.
      stride = 0;
      settling = undefined;
      inputTime = 0;
    },
    reset() {
      phase = 0;
      stride = 0;
      settling = undefined;
      burstStart = 0;
      inputTime = 0;
    },
    update(distance: number, dt: number, inputActive = distance > .0005) {
      if (dt <= 0) return { phase, stride };
      if (inputActive && distance > .0005) {
        if (stride === 0) { burstStart = phase; inputTime = 0; }
        if (settling) inputTime = .26;
        inputTime += dt;
        settling = undefined;
        stride = Math.max(.45, Math.min(1, distance / dt / WALK_SPEED));
        phase += Math.max(distance * Math.PI * 2 / WALK_CYCLE_DISTANCE, rate * .65 * dt);
      } else if (stride > 0) {
        settling ??= {
          start: phase,
          // A short press completes one left/right pair. Residual root velocity
          // must not restart the cycle or sneak in a third step after release.
          end: inputTime <= .25
            ? burstStart + Math.PI * 2
            : Math.ceil((phase + .00001) / Math.PI) * Math.PI,
          stride,
        };
        phase = Math.min(settling.end, phase + rate * dt);
        const progress = (phase - settling.start) / (settling.end - settling.start);
        stride = settling.stride * (1 - T.MathUtils.smoothstep(progress, .55, 1));
        if (phase === settling.end) settling = undefined;
      }
      return { phase, stride };
    },
  };
}

type Pose = {
  time: number;
  phase: number;
  stride: number;
  wave?: boolean;
  suspended?: number;
  hangPitch?: number;
  hangRoll?: number;
  landingCompression?: number;
  reduced?: boolean;
  chairPose?: ChairPose;
};

export function createCharacterAnimator(model: T.Object3D, seed = Math.random() * 1000) {
  model.updateMatrixWorld(true);
  const modelRotation = model.getWorldQuaternion(new T.Quaternion()).invert();
  const modelInverse = model.matrixWorld.clone().invert();
  const names = ["Body", "Head", ...["Left", "Right"].flatMap(side => ["Arm", "Forearm", "Hand", "Leg", "Shin", "Foot"].map(part => side + part))];
  const joints = new Map(names.map(name => {
    const bone = model.getObjectByName(name);
    if (!bone) throw new Error(`Character rig is missing ${name}`);
    const parentRotation = bone.parent!.getWorldQuaternion(new T.Quaternion()).premultiply(modelRotation).invert();
    return [name, {
      bone,
      rotation: bone.quaternion.clone(),
      position: bone.position.clone(),
      rest: bone.getWorldPosition(new T.Vector3()).applyMatrix4(modelInverse),
      x: new T.Vector3(1, 0, 0).applyQuaternion(parentRotation),
      y: new T.Vector3(0, 1, 0).applyQuaternion(parentRotation),
      z: new T.Vector3(0, 0, 1).applyQuaternion(parentRotation),
    }] as const;
  }));
  const eyeClosures = ["LeftEye", "RightEye"].flatMap(name => {
    const eye = model.getObjectByName(name);
    if (!eye) return [];
    eye.userData.blink ??= { value: 0 };
    return [eye.userData.blink as { value: number }];
  });
  const shoeProfiles = new Map<string, Array<[number, number]>>();
  const shoeYaw = new Map<string, number>();
  const surface = model.getObjectByName("CharacterSurface") as T.SkinnedMesh;
  for (const side of ["Left", "Right"]) {
    const profile: Array<[number, number]> = [];
    const footprint: Array<[number, number]> = [];
    const foot = joints.get(side + "Foot")!.rest;
    const positions = surface.geometry.getAttribute("position");
    const skinIndex = surface.geometry.getAttribute("skinIndex");
    const skinWeight = surface.geometry.getAttribute("skinWeight");
    for (let i = 0; i < positions.count; i++) {
      if (skinWeight.getX(i) > .999 && surface.skeleton.bones[skinIndex.getX(i)].name === side + "Foot") {
        profile.push([positions.getY(i) - foot.y, positions.getZ(i) - foot.z]);
        footprint.push([positions.getX(i), positions.getZ(i)]);
      }
    }
    shoeProfiles.set(side, footProfileHull(profile));
    const center = footprint.reduce(([x, z], point) => [x + point[0] / footprint.length, z + point[1] / footprint.length], [0, 0]);
    let xx = 0, zz = 0, xz = 0;
    for (const [x, z] of footprint) {
      xx += (x - center[0]) ** 2;
      zz += (z - center[1]) ** 2;
      xz += (x - center[0]) * (z - center[1]);
    }
    shoeYaw.set(side, -.5 * Math.atan2(2 * xz, zz - xx));
  }
  const delta = new T.Quaternion();
  const ease = (v: number) => T.MathUtils.smoothstep(v, 0, 1);
  const random = (n: number) => T.MathUtils.euclideanModulo(Math.sin(n * 127.1 + 31.7 + seed) * 43758.5453, 1);
  let lastTime: number | undefined;
  let amount = 0;
  let hanging = 0;
  const savedRotation = new T.Quaternion();
  const collarOffset = new T.Vector3(0, .88, -.04);
  const collarShift = new T.Vector3();
  let nextBlink = Infinity, blinkStart = -Infinity, blinkDuration = .28, blinkCount = 0;
  let nextGlance = Infinity, glanceStart = -Infinity, glanceCount = 0;
  let nextIdle = Infinity, idleCount = 0, breathPhase = 0, breathRate = 1.6;
  const idle = new T.Vector3(), idleTarget = new T.Vector3();
  let wasWalking = false, restCount = 0;
  let restingFoot = random(401) < .5 ? 0 : 1;
  let restingAngle = .38;
  const footTurns = [0, 0];
  const look = new T.Vector3(), lookTarget = new T.Vector3();
  const seatedHip = new T.Vector3();
  const seatedInverse = new T.Matrix4();
  const walkingHinge = new T.Vector3();
  function rotate(name: string, x = 0, y = 0, z = 0) {
    const joint = joints.get(name)!;
    joint.bone.quaternion.copy(joint.rotation);
    for (const [axis, angle] of [[joint.x, x], [joint.y, y], [joint.z, z]] as const) {
      if (angle) joint.bone.quaternion.premultiply(delta.setFromAxisAngle(axis, angle));
    }
  }
  return {
    blink(duration = .28) {
      blinkStart = lastTime ?? 0;
      blinkDuration = duration;
      nextBlink = blinkStart + duration + 3.0;
    },
    update({ time, phase, stride, wave = false, reduced = false, suspended = 0, hangPitch = 0, hangRoll = 0, landingCompression = 0, chairPose }: Pose) {
      if (lastTime === undefined) {
        nextBlink = time + 1.5 + random(1) * 2;
        nextGlance = time + 2.5 + random(2) * 3;
        nextIdle = time + 1 + random(3) * 2;
      }
      const dt = Math.min(.05, Math.max(0, time - (lastTime ?? time)));
      lastTime = time;
      hanging = Math.min(suspended, T.MathUtils.damp(hanging, suspended, 12, dt));
      amount = T.MathUtils.damp(amount, reduced ? 0 : T.MathUtils.clamp(stride, 0, 1), stride > amount ? 40 : 18, dt);
      const walking = stride > .02;
      if (wasWalking && !walking) {
        restingFoot = random(++restCount + 401) < .5 ? 0 : 1;
        restingAngle = .32 + random(restCount + 431) * .12;
      }
      wasWalking = walking;
      if (time >= nextIdle) {
        idleCount++;
        const relaxed = random(idleCount + 101) < .35;
        idleTarget.set(
          relaxed ? 0 : (random(idleCount + 113) - .5) * .09,
          relaxed ? 0 : (random(idleCount + 127) - .5) * .07,
          relaxed ? 0 : (random(idleCount + 139) - .5) * .035,
        );
        breathRate = 1.2 + random(idleCount + 151) * .6;
        nextIdle = time + 3.5 + random(idleCount + 163) * 5;
      }
      idle.lerp(idleTarget, 1 - Math.exp(-dt * 1.8));
      breathPhase += dt * breathRate;
      const idleWeight = reduced || wave ? 0 : (1 - amount) ** 2;
      if (time >= nextBlink) {
        blinkStart = time; blinkDuration = .26 + random(++blinkCount) * .04;
        nextBlink = time + 3.0 + random(blinkCount + 11) * 3.5;
      }
      const blinkPhase = (time - blinkStart) / blinkDuration;
      const closure = blinkPhase < 0 || blinkPhase >= 1 ? 0 : blinkPhase < .3 ? ease(blinkPhase / .3)
        : blinkPhase < .44 ? 1 : 1 - ease((blinkPhase - .44) / .56);
      for (const eye of eyeClosures) eye.value = closure;
      if (time >= nextGlance) {
        glanceStart = time;
        glanceCount++;
        lookTarget.set((random(glanceCount + 23) - .5) * .10, (glanceCount % 2 ? 1 : -1) * (.10 + random(glanceCount + 37) * .08), (random(glanceCount + 51) - .5) * .05);
        nextGlance = time + 5.0 + random(glanceCount + 73) * 3.0;
      }
      const glanceAge = time - glanceStart;
      const glanceWeight = reduced || glanceAge > 3.2 ? 0 : glanceAge < .8 ? ease(glanceAge / .8) : glanceAge < 1.8 ? 1 : 1 - ease((glanceAge - 1.8) / 1.4);
      look.copy(lookTarget).multiplyScalar(glanceWeight * (1 - amount * .65));
      const body = joints.get("Body")!;
      const compression = Math.max(0, landingCompression);
      const bob = -compression + amount * (-.002 - .034 * Math.cos(phase) ** 2) + Math.sin(breathPhase) * .002 * idleWeight;
      body.bone.position.copy(body.position).addScaledVector(body.y, bob);
      const step = phase / Math.PI;
      const stepIndex = Math.floor(step);
      const walkVariation = T.MathUtils.lerp(random(stepIndex + 201), random(stepIndex + 202), ease(step % 1));
      rotate("Body", 0, Math.sin(phase) * (.015 + walkVariation * .006) * amount + idle.z * idleWeight);
      for (const [index, side] of ["Left", "Right"].entries()) {
        const legCycle = phase / (Math.PI * 2) + index * .5;
        const cycle = T.MathUtils.euclideanModulo(legCycle, 1);
        const legVariation = random(Math.floor(legCycle) * 2 + index + 301);
        const stance = cycle < .5;
        const swingPhase = stance ? 0 : (cycle - .5) / .5;
        const halfStep = WALK_CYCLE_DISTANCE / 4;
        // Match the planted foot's velocity at toe-off and contact instead of
        // pausing at each end of the swing. The middle of the step moves freely.
        const swingTravel = -swingPhase + 6 * swingPhase ** 2 - 4 * swingPhase ** 3;
        const forward = (stance ? halfStep - 2 * halfStep * cycle / .5 : -halfStep + 2 * halfStep * swingTravel) * amount;
        const liftPhase = swingPhase + .1 * Math.sin(Math.PI * swingPhase);
        const lift = stance ? 0 : Math.sin(Math.PI * liftPhase) ** 2 * (.076 + legVariation * .017) * amount;
        const pitch = stance ? 0 : Math.sin(swingPhase * Math.PI * 2) * (.10 + legVariation * .03) * amount;
        const profile = shoeProfiles.get(side)!;
        let lowest = Infinity;
        const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
        for (const [y, z] of profile) lowest = Math.min(lowest, y * cosPitch - z * sinPitch);
        const footHeight = -lowest + lift;
        const hip = joints.get(side + "Leg")!.rest;
        const h = hip.y + bob - footHeight;
        const upper = joints.get(side + "Shin")!.rest.distanceTo(hip);
        const lower = joints.get(side + "Foot")!.rest.distanceTo(joints.get(side + "Shin")!.rest);
        const distance = Math.min(upper + lower - .000001, Math.hypot(h, forward));
        const bend = Math.acos(T.MathUtils.clamp((distance * distance - upper * upper - lower * lower) / (2 * upper * lower), -1, 1));
        const thigh = -Math.atan2(forward, h) - Math.acos(T.MathUtils.clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1));
        const active = amount > .001 || compression > .0001;
        const outward = !walking && index === restingFoot ? (index === 0 ? -1 : 1) * restingAngle : 0;
        footTurns[index] = T.MathUtils.damp(footTurns[index], shoeYaw.get(side)! + outward, walking ? 16 : 1.2, dt);
        const turn = footTurns[index];
        // Align the whole leg with its shoe, keeping the walking hinge in the
        // forward plane instead of twisting the skin at the ankle.
        const leg = joints.get(side + "Leg")!;
        rotate(side + "Leg", 0, turn);
        if (active) leg.bone.quaternion.premultiply(delta.setFromAxisAngle(leg.x, thigh));
        const shin = joints.get(side + "Shin")!;
        rotate(side + "Shin");
        if (active) {
          walkingHinge.copy(shin.x).applyAxisAngle(shin.y, -turn);
          shin.bone.quaternion.premultiply(delta.setFromAxisAngle(walkingHinge, bend));
        }
        rotate(side + "Foot", active ? pitch : 0);
        const foot = joints.get(side + "Foot")!;
        foot.bone.quaternion.premultiply(delta.setFromAxisAngle(foot.y, turn));
        if (active) {
          foot.bone.quaternion.premultiply(delta.setFromAxisAngle(foot.x, -thigh - bend));
        }
        foot.bone.quaternion.premultiply(delta.setFromAxisAngle(foot.y, -turn));
        const armPhase = cycle * Math.PI * 2 - .3;
        const armSwing = (Math.cos(armPhase) * (.27 + walkVariation * .045) + Math.sin(2 * armPhase) * .025) * amount;
        const shoulder = index === 0 ? idle.x : idle.y;
        rotate(side + "Arm", armSwing + shoulder * idleWeight - compression * .8, 0, (index === 0 ? -.025 : .025) * amount);
        rotate(side + "Forearm", -(.16 + .07 * (1 - Math.cos(armPhase - .35))) * amount - Math.max(0, -armSwing) * .35 - Math.abs(shoulder) * idleWeight);
        rotate(side + "Hand", Math.sin(armPhase - .55) * .055 * amount);
      }
      if (wave) {
        rotate("RightArm", -1.15, 0, -.45);
        rotate("RightForearm", -1.2);
        rotate("RightHand", 0, 0, Math.sin(time * 8) * .25);
      }
      rotate("Head", look.x + compression * .7 - Math.cos(2 * phase - .2) * .008 * amount, look.y - Math.sin(phase) * .012 * amount, look.z + (wave ? Math.sin(time * 3) * .015 : 0));
      if (hanging > .0001) {
        const blendJoint = (name: string, x = 0, y = 0, z = 0) => {
          const bone = joints.get(name)!.bone;
          savedRotation.copy(bone.quaternion);
          rotate(name, x, y, z);
          bone.quaternion.slerp(savedRotation, 1 - hanging);
        };
        // Pivot the whole body at the back of the collar, keeping the grip fixed.
        const lean = .12 + hangPitch;
        blendJoint("Body", lean, 0, hangRoll);
        collarShift.copy(collarOffset).applyQuaternion(body.bone.quaternion);
        body.bone.position.copy(body.position).add(collarOffset).sub(collarShift);
        blendJoint("Head", .18, 0, 0);
        for (const [index, side] of ["Left", "Right"].entries()) {
          blendJoint(side + "Leg", -.06, 0, index === 0 ? -.025 : .025);
          blendJoint(side + "Shin", .08);
          blendJoint(side + "Foot", .5, shoeYaw.get(side)!);
          blendJoint(side + "Arm", -lean * .7, 0, index === 0 ? -.025 : .025);
          blendJoint(side + "Forearm", -.04);
          blendJoint(side + "Hand", .06);
        }
      }
      if (chairPose) {
        const { sit, lean, seatHeight, footForward, footLift } = chairPose;
        const breath = reduced ? 0 : Math.sin(breathPhase) * .008 * sit;
        const bodyLean = lean + breath;
        const seatDrop = Math.max(0, body.rest.y - seatHeight - .14);
        body.bone.position.addScaledVector(body.y, -seatDrop * sit * sit);
        rotate("Body", bodyLean, 0, idle.z * (1 - sit) * .25);
        model.updateWorldMatrix(true, true);
        seatedInverse.copy(model.matrixWorld).invert();
        for (const side of ["Left", "Right"]) {
          const hip = joints.get(side + "Leg")!;
          if (sit <= 0.0001) {
            hip.bone.quaternion.premultiply(delta.setFromAxisAngle(hip.x, -bodyLean));
            continue;
          }
          hip.bone.getWorldPosition(seatedHip).applyMatrix4(seatedInverse);
          const upper = joints.get(side + "Shin")!.rest.distanceTo(hip.rest);
          const lower = joints.get(side + "Foot")!.rest.distanceTo(joints.get(side + "Shin")!.rest);
          const footHeight = -Math.min(...shoeProfiles.get(side)!.map(([y]) => y));
          const h = seatedHip.y - footHeight - footLift;
          const forward = hip.rest.z + footForward * sit - seatedHip.z;
          const distance = Math.min(upper + lower - .000001, Math.hypot(h, forward));
          const bend = Math.acos(T.MathUtils.clamp((distance * distance - upper * upper - lower * lower) / (2 * upper * lower), -1, 1));
          const thigh = -Math.atan2(forward, h) - Math.acos(T.MathUtils.clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1));
          rotate(side + "Leg", thigh - bodyLean);
          rotate(side + "Shin", bend);
          rotate(side + "Foot", 0, shoeYaw.get(side)!);
          const foot = joints.get(side + "Foot")!;
          foot.bone.quaternion.premultiply(delta.setFromAxisAngle(foot.x, -thigh - bend));
        }
        rotate("Head", -bodyLean * .45 + look.x * .4, look.y * .4, look.z * .3);
        for (const [index, side] of ["Left", "Right"].entries()) {
          for (const [part, x, z] of [["Arm", .12 - bodyLean, index === 0 ? -.2 : .2], ["Forearm", -1.65, 0], ["Hand", .02, 0]] as const) {
            const bone = joints.get(side + part)!.bone;
            savedRotation.copy(bone.quaternion);
            rotate(side + part, x, 0, z);
            bone.quaternion.slerp(savedRotation, 1 - sit);
          }
        }
      }
    },
  };
}
