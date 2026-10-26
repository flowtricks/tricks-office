import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { loadTestModel, loadTestChair } from './load-test-model.mjs';
import { createCharacterAnimator, createWalkCycle, WALK_SPEED, WALK_CYCLE_DISTANCE } from '../src/scripts/character-animation.ts';
import { createOfficeSeating } from '../src/scripts/office-seating.ts';
import { Group, Vector2, Raycaster } from 'three';

const file = process.argv[2] || 'public/models/reference-character.glb';
const model = await loadTestModel(file);
let surface;
model.scene.traverse(node => { if (node.isSkinnedMesh && node.name === 'CharacterSurface') surface = node; });
assert(surface, 'Expected a skinned character');
const animator = createCharacterAnimator(model.scene, 43);
const geometry = surface.geometry;
const positions = geometry.getAttribute('position');
const joints = geometry.getAttribute('skinIndex');
const weights = geometry.getAttribute('skinWeight');
const rigid = new Map();
let shoes = 0, fingers = 0, shirt = 0;
for (let i = 0; i < positions.count; i++) {
  const y = positions.getY(i), x = positions.getX(i);
  const shoe = y < .36;
  const finger = y > .85 && y < 1.15 && (Math.abs(x) > .43 || (x > .38 && positions.getZ(i) > .05));
  const torso = y > 1.28 && y < 2.16 && Math.abs(x) < (y < 1.55 ? .38 : .43);
  if (!shoe && !finger && !torso) continue;
  const joint = surface.skeleton.bones[joints.getX(i)].name;
  assert.equal(weights.getX(i), 1, `${shoe ? 'Shoe' : torso ? 'Shirt' : 'Finger'} vertex ${i} must have a single rigid influence`);
  assert(torso ? joint === 'Body' : joint.endsWith(shoe ? 'Foot' : 'Hand'), `Vertex ${i} incorrectly attached to ${joint}`);
  rigid.set(i, joint);
  if (shoe) shoes++; else if (torso) shirt++; else fingers++;
}
assert(shoes > 2000 && fingers > 500, 'Expected both complete shoes and hands');
assert(shirt > 800, 'Expected the shirt torso and hem');
const edges = [];
const index = geometry.index;
for (let i = 0; i < index.count; i += 3) {
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const u = index.getX(i + a), v = index.getX(i + b);
    if (!rigid.has(u) || !rigid.has(v)) continue;
    assert.equal(rigid.get(u), rigid.get(v), `Connected rigid vertices ${u} and ${v} assigned to different limbs`);
    const rest = new Vector3().fromBufferAttribute(positions, u).distanceTo(new Vector3().fromBufferAttribute(positions, v));
    edges.push([u, v, rest]);
  }
}
const a = new Vector3(), b = new Vector3();
let maximumStretch = 0;
for (let frame = 0; frame < 32; frame++) {
  animator.update({ time: frame / 8, phase: frame / 32 * Math.PI * 2, stride: 1 });
  model.scene.updateMatrixWorld(true);
  surface.skeleton.update();
  for (const [u, v, rest] of edges) {
    surface.getVertexPosition(u, a); surface.getVertexPosition(v, b);
    maximumStretch = Math.max(maximumStretch, Math.abs(a.distanceTo(b) - rest));
  }
}
assert(maximumStretch < .00001, `Rigid parts stretched by ${maximumStretch}`);
console.log(`PASS: ${shoes} shoe vertices, ${fingers} finger/palm vertices, ${shirt} shirt vertices, ${edges.length} edges across 32 walking poses. Maximum edge-length change: ${maximumStretch.toExponential(2)}.`);

for (const name of ['LeftEye', 'RightEye']) {
  const eye = model.scene.getObjectByName(name);
  assert(eye?.isSkinnedMesh && eye !== surface, `${name} must be a separate original surface`);
  assert(eye.geometry.index.count > 30);
  assert.deepEqual(eye.geometry.getAttribute('position').array, positions.array);
  assert.deepEqual(eye.geometry.getAttribute('uv').array, geometry.getAttribute('uv').array);
}
const feet = ['Left', 'Right'].map(side => ({
  side,
  vertices: [...rigid.keys()].filter(i => rigid.get(i) === side + 'Foot'),
  anchor: undefined,
  peakLift: 0,
}));
let worstFloorError = 0, worstSlide = 0, walkLift = 0, kneeBend = 0, footYawError = 0;
const stepHeights = [];
for (let frame = 0; frame < 360; frame++) {
  const time = 5 + frame / 120;
  const phase = frame / 120 * WALK_SPEED * Math.PI * 2 / WALK_CYCLE_DISTANCE;
  model.scene.position.z = frame / 120 * WALK_SPEED;
  animator.update({ time, phase, stride: 1 });
  model.scene.updateMatrixWorld(true); surface.skeleton.update();
  for (const [index, foot] of feet.entries()) {
    kneeBend = Math.max(kneeBend, 2 * Math.acos(Math.min(1, Math.abs(model.scene.getObjectByName(foot.side + 'Shin').quaternion.w))));
    const cycle = (phase / (Math.PI * 2) + index * .5) % 1;
    let lowest = Infinity;
    for (const vertex of foot.vertices) {
      surface.getVertexPosition(vertex, a); lowest = Math.min(lowest, a.y);
    }
    assert(lowest > -.001, `${foot.side} shoe intersects the floor`);
    walkLift = Math.max(walkLift, lowest);
    if (frame < 120) continue;
    if (cycle < .5) {
      if (foot.peakLift > 0) stepHeights.push(foot.peakLift);
      foot.peakLift = 0;
      worstFloorError = Math.max(worstFloorError, Math.abs(lowest));
      const footprint = foot.vertices.map(vertex => {
        surface.getVertexPosition(vertex, a);
        return [a.x, a.z];
      });
      const center = footprint.reduce(([x, z], p) => [x + p[0] / footprint.length, z + p[1] / footprint.length], [0, 0]);
      let xx = 0, zz = 0, xz = 0;
      for (const [x, z] of footprint) {
        xx += (x - center[0]) ** 2;
        zz += (z - center[1]) ** 2;
        xz += (x - center[0]) * (z - center[1]);
      }
      footYawError = Math.max(footYawError, Math.abs(.5 * Math.atan2(2 * xz, zz - xx)));
      const ankle = model.scene.getObjectByName(foot.side + 'Foot').getWorldPosition(a);
      foot.anchor ??= ankle.clone();
      worstSlide = Math.max(worstSlide, ankle.distanceTo(foot.anchor));
    } else {
      foot.peakLift = Math.max(foot.peakLift, lowest);
      foot.anchor = undefined;
    }
  }
}
assert(footYawError < .025, `Planted shoes must point forward, got ${footYawError} radians`);
assert(kneeBend < 1.05, `Walk should keep knee bend restrained, got ${kneeBend} radians`);
assert(walkLift > .08, `Walking should visibly clear the ground, got ${walkLift}`);
assert(worstFloorError < .001, `Planted foot floats by ${worstFloorError}`);
assert(worstSlide < .02, `Planted foot slides by ${worstSlide}`);
assert(Math.max(...stepHeights) - Math.min(...stepHeights) > .005, "Successive steps should vary in height");
let closed = 0, open = 0, headMovement = 0;
const idleShoulders = [];
for (let frame = 0; frame < 900; frame++) {
  animator.update({ time: 9 + frame / 60, phase: 0, stride: 0 });
  const closure = model.scene.getObjectByName('LeftEye').userData.blink.value;
  if (frame > 60) idleShoulders.push(model.scene.getObjectByName('LeftArm').quaternion.x);
  if (closure > .99) closed++;
  if (closure === 0) open++;
  const head = model.scene.getObjectByName('Head');
  headMovement = Math.max(headMovement, 2 * Math.acos(Math.min(1, Math.abs(head.quaternion.w))));
}
assert(Math.max(...idleShoulders) - Math.min(...idleShoulders) > .005, 'Idle shoulders should vary between poses');
assert(closed > 0 && open > 750, 'Expected brief, occasional blinks');
assert(headMovement > .08 && headMovement < .25, 'Expected small occasional head turns');
console.log(`PASS: original eyes separated; spontaneous blinking and head glances; planted foot error ${worstFloorError.toExponential(2)}, slide ${worstSlide.toFixed(4)}.`);

for (const fps of [30, 60, 120]) {
  const gait = createWalkCycle();
  const dt = 1 / fps;
  let speed = 0, peakLift = 0, pose;
  const startTime = 30 + fps;
  animator.update({ time: startTime, phase: 0, stride: 0 });
  for (let frame = 0; frame < fps * 2; frame++) {
    speed += ((frame === 0 ? WALK_SPEED : 0) - speed) * (1 - Math.exp(-dt * 12));
    pose = gait.update(speed * dt, dt, frame === 0);
    animator.update({ time: startTime + (frame + 1) * dt, ...pose });
    model.scene.updateMatrixWorld(true); surface.skeleton.update();
    for (const foot of feet) {
      let lowest = Infinity;
      for (const vertex of foot.vertices) {
        surface.getVertexPosition(vertex, a);
        lowest = Math.min(lowest, a.y);
      }
      peakLift = Math.max(peakLift, lowest);
      assert(lowest > -.003, `Tap at ${fps} fps pushes the shoe through the floor: ${lowest}`);
    }
  }
  assert(peakLift > .025, `A one-frame tap at ${fps} fps should visibly lift a foot, got ${peakLift}`);
  assert.equal(pose.stride, 0, 'Tap must finish and return to idle');
  assert(Math.abs(pose.phase - Math.PI * 2) < .00001, 'Quick tap must complete exactly two steps');
  gait.reset();
  assert.deepEqual(gait.update(0, dt), { phase: 0, stride: 0 }, 'No movement must stay idle');
  for (let frame = 0; frame < fps; frame++) pose = gait.update(WALK_SPEED * dt, dt);
  assert(Math.abs(pose.phase - WALK_SPEED * Math.PI * 2 / WALK_CYCLE_DISTANCE) < .00001, 'Full-speed steps must stay synchronized to distance');
}
console.log('PASS: single-frame taps lift and land the feet at 30/60/120 fps; continuous walking stays synchronized.');

const shoeDirections = feet.map(foot => {
  const points = foot.vertices.map(i => [positions.getX(i), positions.getZ(i)]);
  const center = points.reduce(([x, z], p) => [x + p[0] / points.length, z + p[1] / points.length], [0, 0]);
  let xx = 0, zz = 0, xz = 0;
  for (const [x, z] of points) {
    xx += (x - center[0]) ** 2;
    zz += (z - center[1]) ** 2;
    xz += (x - center[0]) * (z - center[1]);
  }
  const yaw = .5 * Math.atan2(2 * xz, zz - xx);
  return new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
});
const relaxedFeet = new Set();
let motionTime = 220, maximumIdleTurn = 0;
for (let stop = 0; stop < 8; stop++) {
  for (let frame = 0; frame < 60; frame++) {
    animator.update({ time: motionTime += 1 / 60, phase: frame / 60 * Math.PI * 2, stride: 1 });
  }
  let previousAngles;
  for (let frame = 0; frame < 240; frame++) {
    animator.update({ time: motionTime += 1 / 60, phase: Math.PI * 2, stride: 0 });
    model.scene.updateMatrixWorld(true);
    const angles = feet.map((foot, i) => {
      const bone = model.scene.getObjectByName(foot.side + 'Foot');
      const direction = shoeDirections[i].clone().transformDirection(bone.matrixWorld);
      return Math.atan2(direction.x, direction.z);
    });
    if (previousAngles) for (let i = 0; i < 2; i++) maximumIdleTurn = Math.max(maximumIdleTurn, Math.abs(angles[i] - previousAngles[i]));
    previousAngles = angles;
  }
  relaxedFeet.add(Math.abs(previousAngles[0]) > Math.abs(previousAngles[1]) ? 'Left' : 'Right');
}
assert(maximumIdleTurn < .025, `Idle feet should ease outward without snapping, got ${maximumIdleTurn} radians/frame`);
assert.equal(relaxedFeet.size, 2, 'Idle stance should use both feet across repeated stops');
console.log('PASS: idle foot turns ease smoothly and vary between left and right.');

// The collar stays pinned while the suspended body swings below it.
const collar = new Vector3(0, .88, -.04);
const expectedCollar = new Vector3(0, 2.18, -.14);
for (let frame = 0; frame < 120; frame++) {
  animator.update({ time: motionTime += 1 / 60, phase: 0, stride: 0,
    suspended: 1, hangPitch: .15 * Math.sin(frame / 15), hangRoll: .2 * Math.cos(frame / 17) });
  model.scene.updateMatrixWorld(true);
  surface.skeleton.update();
  const grip = model.scene.getObjectByName('Body').localToWorld(collar.clone());
  assert(grip.distanceTo(model.scene.localToWorld(expectedCollar.clone())) < .00001, 'Swing must stay anchored to the back of the collar');
  for (const [u, v, rest] of edges) {
    surface.getVertexPosition(u, a); surface.getVertexPosition(v, b);
    assert(Math.abs(a.distanceTo(b) - rest) < .00001, 'Hanging must preserve rigid shoes, hands, and shirt');
  }
}
for (const [i, foot] of feet.entries()) {
  const bone = model.scene.getObjectByName(foot.side + 'Foot');
  assert(shoeDirections[i].clone().transformDirection(bone.matrixWorld).y < -.25, 'Suspended toes should point down');
}
assert(new Vector3(0, 0, 1).transformDirection(model.scene.getObjectByName('Head').matrixWorld).y < -.15,
  'Suspended head should bow slightly');
animator.update({ time: motionTime += 1 / 60, phase: 0, stride: 0, suspended: 0 });
model.scene.updateMatrixWorld(true);
surface.skeleton.update();
for (const foot of feet) for (const vertex of foot.vertices) {
  surface.getVertexPosition(vertex, a);
  assert(a.y > -.003, 'Landing must restore flat feet above the floor');
}
console.log('PASS: collar stays pinned through hanging sway; toes and head hang down; rigid parts remain intact and feet reset for landing.');

for (const compression of [0.025, 0.05, 0.075, 0.1, 0.05, 0]) {
  animator.update({ time: motionTime += 1 / 60, phase: 0, stride: 0, landingCompression: compression });
  model.scene.updateMatrixWorld(true);
  surface.skeleton.update();
  for (const foot of feet) {
    let lowest = Infinity;
    for (const vertex of foot.vertices) {
      surface.getVertexPosition(vertex, a);
      lowest = Math.min(lowest, a.y);
    }
    assert(Math.abs(lowest) < .003, `Landing knees must absorb impact without pushing feet through the floor: ${lowest}`);
  }
}
console.log('PASS: landing compression keeps both soles planted as the knees bend and recover.');

for (const side of ['Left', 'Right']) {
  const ankle = model.scene.getObjectByName(side + 'Foot');
  const footIndex = surface.skeleton.bones.indexOf(ankle);
  assert(Math.abs(surface.skeleton.boneInverses[footIndex].elements[13] + .28) < .001, 'Ankle pivot must sit at the shoe collar');
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) < .44) continue;
    for (let slot = 0; slot < 4; slot++) {
      assert(joints.array[i * 4 + slot] !== footIndex || weights.array[i * 4 + slot] === 0,
        'Rotating a foot must not rotate the calf above the ankle');
    }
  }
}
console.log('PASS: ankle pivots are lowered and foot weights no longer extend into the calves.');

model.scene.position.set(0, 0, 0);
const character = new Group();
character.add(model.scene);
character.scale.setScalar(.9);
const { chair, seatHeight, baseHeight } = await loadTestChair();
chair.rotation.y = Math.PI * 80 / 180;
chair.position.set(1.071, 0, -1.402);
const forward = new Vector3(0, 0, 1).applyQuaternion(chair.quaternion);
const desk = new Vector3(2.5, 0, -1.15);
const sideDirection = new Vector3(1, 0, 0).applyQuaternion(chair.quaternion);
character.position.copy(desk).addScaledVector(forward, -1.5).addScaledVector(sideDirection, -1.4);
const seating = createOfficeSeating(character, chair, seatHeight, desk, () => true);
const seatingGait = createWalkCycle();
let seatedFloor = Infinity, plantedError = 0, elbowWidth = 0, scootSlide = 0;
// Check the real caster geometry: tucked feet can sit between spokes.
const casterMeshes = [];
chair.traverse(mesh => { if (mesh.isMesh && /Etoile|Roulette/.test(mesh.name)) casterMeshes.push(mesh); });
const casterRay = new Raycaster();
let casterOverlap = 0;
let pushAnchor, previousChair = chair.position.clone();
for (let frame = 0; frame < 1200; frame++) {
  if (frame === 650) seating.requestExit();
  const motion = seating.update(1 / 60, frame < 60 ? new Vector2(forward.x, forward.z) : new Vector2(), true);
  const gait = seatingGait.update(motion.distance, 1 / 60, motion.walking);
  animator.update({ time: motionTime += 1 / 60, ...gait, chairPose: motion.pose && { ...motion.pose, seatHeight: motion.pose.seatHeight / .9, footForward: motion.pose.footForward / .9, footLift: motion.pose.footLift / .9 } });
  character.updateMatrixWorld(true); surface.skeleton.update();
  const pushing = motion.pose?.sit === 1 && motion.pose.footLift < .00001 &&
    chair.position.distanceTo(previousChair) > .00001;
  if (pushing) {
    const ankle = model.scene.getObjectByName('LeftFoot').getWorldPosition(a).clone();
    if (pushAnchor) scootSlide = Math.max(scootSlide, ankle.distanceTo(pushAnchor));
    pushAnchor = ankle;
  } else pushAnchor = undefined;
  previousChair.copy(chair.position);
  if (motion.pose) for (const foot of feet) {
    let floor = Infinity;
    for (const vertex of foot.vertices) {
      surface.getVertexPosition(vertex, a);
      floor = Math.min(floor, a.y);
      a.applyMatrix4(surface.matrixWorld);
      chair.worldToLocal(a);
      if (frame % 8 === 0 && a.y < .035) {
        const sole = a.clone();
        const origin = chair.localToWorld(new Vector3(a.x, baseHeight + .02, a.z));
        casterRay.set(origin, new Vector3(0, -1, 0));
        casterRay.far = baseHeight + .02;
        const hit = casterRay.intersectObjects(casterMeshes, false)[0];
        if (hit) casterOverlap = Math.max(casterOverlap, hit.point.y - sole.y);
      }
    }
    seatedFloor = Math.min(seatedFloor, floor);
    if (seating.stage === 'seated') plantedError = Math.max(plantedError, Math.abs(floor));
  }
  if (seating.stage === 'seated') for (const side of ['Left', 'Right']) {
    model.scene.getObjectByName(side + 'Forearm').getWorldPosition(a);
    model.scene.worldToLocal(a);
    elbowWidth = Math.max(elbowWidth, Math.abs(a.x));
  }
}
assert(scootSlide < .003, `Feet must stay planted while propelling the chair: ${scootSlide}`);
assert(seatedFloor > -.025, `Seating should not drive the shoes through the floor: ${seatedFloor}`);
assert(casterOverlap < .025, `Shoes must clear actual caster spokes: ${casterOverlap}`);
assert(plantedError < .003, `Seated feet must stay on the floor: ${plantedError}`);
assert(elbowWidth < .75, `Seated elbows must stay close to the torso: ${elbowWidth}`);
assert.equal(seating.active, false);
console.log(`PASS: sitting/standing rig, planted scoot slide ${scootSlide.toFixed(4)}, lowest shoe ${seatedFloor.toFixed(4)}.`);
