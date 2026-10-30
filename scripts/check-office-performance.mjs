import assert from 'node:assert/strict';
import * as T from 'three';
import { batchRigidMeshes, accelerateOfficePicking, retainCutawayLights } from '../src/scripts/office-render-optimization.ts';
import { createShelfFocusTargets } from '../src/scripts/office-shelf-focus.ts';
import { footProfileHull } from '../src/scripts/character-foot-profile.ts';
import { loadTestChair, loadTestModel } from './load-test-model.mjs';

const cutawayScene = new T.Scene();
const wall = new T.Group();
wall.position.set(-4, 0, -1.3);
wall.rotation.y = Math.PI / 2;
const shelf = new T.Group();
shelf.position.set(0, 2, .2);
const lamp = new T.PointLight('#ffac48', 1.8, .55);
shelf.add(lamp);
wall.add(shelf);
cutawayScene.add(wall);
const lampPosition = lamp.getWorldPosition(new T.Vector3());
retainCutawayLights(wall, cutawayScene);
for (const visible of [true, false, true, false]) {
  wall.visible = visible;
  const lights = [];
  cutawayScene.traverseVisible(object => { if (object.isLight) lights.push(object); });
  assert.deepEqual(lights, [lamp], 'Wall cutaways must not change shader light counts');
  assert.ok(lamp.getWorldPosition(new T.Vector3()).distanceTo(lampPosition) < 1e-10);
  assert.equal(lamp.intensity, 1.8);
}
console.log('PASS: wall cutaways retain lights and their world positions without shader variants.');

const root = new T.Group(); root.position.set(2, 1, -3); root.rotation.y = .6;
const material = new T.MeshStandardMaterial();
for(let i=0;i<8;i++) {
  const part = new T.Mesh(new T.BoxGeometry(.2,.4,.3),material);
  part.position.set(i*.3,Math.sin(i),i*.15);part.rotation.set(.1*i,.2*i,.3*i);
  part.castShadow=part.receiveShadow=true;root.add(part);
}
const control=new T.Group();control.add(new T.Mesh(new T.BoxGeometry(),material));root.add(control);
const glass=new T.Mesh(new T.SphereGeometry(.1),new T.MeshStandardMaterial({transparent:true,opacity:.4}));root.add(glass);
function vertices(group){group.updateMatrixWorld(true);const result=[];group.traverse(o=>{if(o.isMesh){const a=o.geometry.attributes.position;for(let i=0;i<(o.geometry.index?.count??a.count);i++){const v=new T.Vector3().fromBufferAttribute(a,o.geometry.index?o.geometry.index.getX(i):i).applyMatrix4(o.matrixWorld);result.push(v.toArray().map(x=>x.toFixed(4)).join(','));}}});return result.sort()}
const before=vertices(root);batchRigidMeshes(root,new Set([control]));assert.deepEqual(vertices(root),before,'Batching must preserve every transformed triangle');assert(control.parent===root);assert(glass.parent===root);assert.equal(root.children.length,3);
const {chair}=await loadTestChair();chair.updateMatrixWorld(true);
const ray=new T.Raycaster();ray.firstHitOnly=true;
const directions=Array.from({length:300},(_,i)=>{const angle=i*2.399963;const origin=new T.Vector3(Math.cos(angle)*2,.2+(i%20)/12,Math.sin(angle)*2);return{origin,direction:new T.Vector3(0,.8,0).sub(origin).normalize()}});
function run(){const start=performance.now();const hits=directions.map(({origin,direction})=>{ray.set(origin,direction);return ray.intersectObject(chair,true)[0]?.distance??null});return {hits,ms:performance.now()-start}}
run();const original=run();const cleanup=accelerateOfficePicking(chair);run();const indexed=run();
original.hits.forEach((distance,i)=>{if(distance===null)assert.equal(indexed.hits[i],null);else assert(Math.abs(distance-indexed.hits[i])<1e-8,'BVH must return identical hits')});cleanup();
const {scene}=await loadTestModel('public/models/reference-character.glb');const surface=scene.getObjectByName('CharacterSurface');const pos=surface.geometry.attributes.position, ids=surface.geometry.attributes.skinIndex,weights=surface.geometry.attributes.skinWeight;
for(const side of ['Left','Right']){const points=[];for(let i=0;i<pos.count;i++)if(weights.getX(i)>.999&&surface.skeleton.bones[ids.getX(i)].name===side+'Foot')points.push([pos.getY(i),pos.getZ(i)]);const hull=footProfileHull(points);for(let i=0;i<1000;i++){const angle=i*Math.PI*2/1000;const support=points=>Math.min(...points.map(([y,z])=>y*Math.cos(angle)-z*Math.sin(angle)));assert(Math.abs(support(points)-support(hull))<1e-10)}console.log(`PASS: ${side} sole support ${points.length} → ${hull.length} points, identical across 1,000 angles.`)}
console.log(`PASS: lossless rigid batching; controls/transparency retained; 300 exact chair raycasts ${original.ms.toFixed(1)} ms → ${indexed.ms.toFixed(1)} ms.`);

// Settled hover transforms must stop doing work while keeping picking aligned.
const hoverScene = new T.Scene();
const ornament = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial());
hoverScene.add(ornament);
const hoverAbort = new AbortController();
const hover = createShelfFocusTargets([ornament], hoverAbort.signal, hoverScene);
const raycaster = new T.Raycaster(new T.Vector3(0, 0, 3), new T.Vector3(0, 0, -1));
const target = hover.pick(raycaster, () => undefined);
assert.ok(target);
let transformUpdates = 0;
const updateMatrix = target.mesh.updateMatrixWorld.bind(target.mesh);
target.mesh.updateMatrixWorld = (...args) => { transformUpdates++; return updateMatrix(...args); };
hover.setHovered(target);
for (let frame = 0; frame < 120; frame++) hover.update(1 / 60, false, true);
assert.equal(target.glow.position.y, target.center.y + .035);
assert.equal(target.mesh.position.y, target.glow.position.y);
const settledUpdates = transformUpdates;
for (let frame = 0; frame < 120; frame++) hover.update(1 / 60, false, true);
assert.equal(transformUpdates, settledUpdates);
hover.update(1 / 60, true, true);
assert.equal(target.glow.position.y, target.center.y, 'Reduced motion resets the lift');
hover.setHovered(undefined);
for (let frame = 0; frame < 120; frame++) hover.update(1 / 60, false, true);
assert.equal(target.glow.position.y, target.center.y);
hover.update(1 / 60, false, false);
assert.equal(target.glow.visible, false);
hoverAbort.abort();
console.log('PASS: hover lifts and pick geometry stay aligned, settled transforms stop, reduced motion and wall cutaway retained.');
