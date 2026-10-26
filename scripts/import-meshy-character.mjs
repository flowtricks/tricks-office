import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-meshy-character.mjs character.meshy');
let bytes = fs.readFileSync(source);
if (bytes.subarray(0, 8).toString() === 'MESHY.AI') {
  if (bytes.readUInt16LE(8) !== 1 || bytes.length < 8240) throw new Error('Unsupported Meshy container');
  const counter = Buffer.alloc(16);
  bytes.copy(counter, 0, 10, 22);
  counter.writeUInt32BE(2, 12);
  const decoder = crypto.createDecipheriv('aes-256-ctr', Buffer.from('JSON{"accessors":[{"bufferView":'), counter);
  bytes = Buffer.concat([decoder.update(bytes.subarray(32, 8224)), decoder.final(), bytes.subarray(8240)]);
}
if (bytes.subarray(0, 4).toString() !== 'glTF' || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-character-'));
try {
  fs.writeFileSync(path.join(temp, 'source.glb'), bytes);
  execFileSync('npx', ['--yes', '@gltf-transform/cli@4.5.1', 'copy', path.join(temp, 'source.glb'), path.join(temp, 'decoded.glb')], { stdio: 'inherit' });
  bytes = fs.readFileSync(path.join(temp, 'decoded.glb'));
  const jsonSize = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize));
  const binOffset = 20 + jsonSize + 8;
  const binary = bytes.subarray(binOffset, binOffset + gltf.buffers[0].byteLength);
  if (!gltf.images?.length || !gltf.materials?.some(m => m.pbrMetallicRoughness?.baseColorTexture)) throw new Error('Model has no color texture');
  if (gltf.images.some(image => image.bufferView === undefined)) throw new Error('Textures must be embedded');
  if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1) throw new Error('Expected one character surface');
  fs.writeFileSync(path.join(root, 'scripts/assets/character-textured-source.glb'), bytes);
  fs.writeFileSync(path.join(path.dirname(source), 'character-textured.glb'), bytes);

  const primitive = gltf.meshes[0].primitives[0];
  const meshNode = gltf.nodes.find(n => n.mesh === 0);
  const original = gltf.accessors[primitive.attributes.POSITION];
  const originalView = gltf.bufferViews[original.bufferView];
  if (original.componentType !== 5123 || original.normalized || meshNode.rotation || meshNode.matrix) throw new Error('Unexpected source position encoding');
  const positions = new Float32Array(original.count * 3);
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < original.count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      const offset = (originalView.byteOffset || 0) + (original.byteOffset || 0) + i * (originalView.byteStride || 6) + axis * 2;
      const value = binary.readUInt16LE(offset) * meshNode.scale[axis] + meshNode.translation[axis];
      positions[i * 3 + axis] = value;
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
    }
  }
  const scale = 3.3 / (maximum[1] - minimum[1]);
  const centerX = (minimum[0] + maximum[0]) / 2;
  for (let i = 0; i < original.count; i++) {
    positions[i * 3] = (positions[i * 3] - centerX) * scale;
    positions[i * 3 + 1] = (positions[i * 3 + 1] - minimum[1]) * scale;
    positions[i * 3 + 2] *= scale;
  }

  const indexAccessor = gltf.accessors[primitive.indices];
  const indexView = gltf.bufferViews[indexAccessor.bufferView];
  const indexSize = indexAccessor.componentType === 5125 ? 4 : 2;
  const indices = Array.from({ length: indexAccessor.count }, (_, i) =>
    binary[indexSize === 4 ? 'readUInt32LE' : 'readUInt16LE']((indexView.byteOffset || 0) + (indexAccessor.byteOffset || 0) + i * indexSize));
  function lowerParts(cutoff) {
    const parents = Array.from({ length: original.count }, (_, i) => i);
    const find = i => parents[i] === i ? i : (parents[i] = find(parents[i]));
    const join = (a, b) => {
      if (positions[a * 3 + 1] < cutoff && positions[b * 3 + 1] < cutoff) parents[find(a)] = find(b);
    };
    const welded = new Map();
    for (let i = 0; i < original.count; i++) {
      const key = Array.from(positions.subarray(i * 3, i * 3 + 3), v => Math.round(v * 100000)).join(',');
      if (welded.has(key)) join(i, welded.get(key));
      else welded.set(key, i);
    }
    for (let i = 0; i < indices.length; i += 3) {
      join(indices[i], indices[i + 1]); join(indices[i + 1], indices[i + 2]); join(indices[i], indices[i + 2]);
    }
    const parts = new Map();
    for (let i = 0; i < original.count; i++) {
      if (positions[i * 3 + 1] >= cutoff) continue;
      const id = find(i);
      if (!parts.has(id)) parts.set(id, []);
      parts.get(id).push(i);
    }
    return [...parts.values()].map(vertices => ({
      vertices,
      low: Math.min(...vertices.map(i => positions[i * 3 + 1])),
      side: vertices.reduce((sum, i) => sum + positions[i * 3], 0) < 0 ? 'Left' : 'Right',
    }));
  }
  const shoeSide = new Map(), lowerArmSide = new Map(), lowerLegSide = new Map();
  for (const part of lowerParts(.36)) {
    for (const i of part.vertices) shoeSide.set(i, part.side);
  }
  for (const part of lowerParts(1.55).filter(part => part.low > .8)) {
    for (const i of part.vertices) lowerArmSide.set(i, part.side);
  }
  for (const part of lowerParts(1.1).filter(part => part.low < .05)) {
    for (const i of part.vertices) lowerLegSide.set(i, part.side);
  }

  const bones = [{ name: 'Body', at: [0, 1.30, -.10] }, { name: 'Head', at: [0, 2.21, -.10], parent: 'Body' }];
  for (const [sign, side] of [[-1, 'Left'], [1, 'Right']]) {
    bones.push(
      { name: side + 'Arm', at: [sign * .41, 2.08, -.10], parent: 'Body' },
      { name: side + 'Forearm', at: [sign * .55, 1.55, -.06], parent: side + 'Arm' },
      { name: side + 'Hand', at: [sign * .55, 1.04, .015], parent: side + 'Forearm' },
      { name: side + 'Leg', at: [sign * .205, 1.28, -.12], parent: 'Body' },
      { name: side + 'Shin', at: [sign * .205, .78, -.12], parent: side + 'Leg' },
      { name: side + 'Foot', at: [sign * .205, .28, -.12], parent: side + 'Shin' },
    );
  }
  const boneIndex = name => bones.findIndex(b => b.name === name);
  const nodes = [{ name: 'OfficeCharacter', children: [1, 2] }, { name: 'CharacterSurface', mesh: 0, skin: 0 }];
  const inverseBinds = new Float32Array(bones.length * 16);
  for (const [index, bone] of bones.entries()) {
    const parent = bone.parent ? bones[boneIndex(bone.parent)].at : [0, 0, 0];
    const children = bones.flatMap((child, i) => child.parent === bone.name ? [i + 2] : []);
    nodes.push({ name: bone.name, translation: bone.at.map((v, axis) => v - parent[axis]), ...(children.length ? { children } : {}) });
    const matrix = inverseBinds.subarray(index * 16, index * 16 + 16);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
    matrix[12] = -bone.at[0]; matrix[13] = -bone.at[1]; matrix[14] = -bone.at[2];
  }
  const joints = new Uint16Array(original.count * 4);
  const weights = new Float32Array(original.count * 4);
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < original.count; i++) {
    const x = positions[i * 3], z = positions[i * 3 + 1], y = -positions[i * 3 + 2];
    const ax = Math.abs(x), side = lowerArmSide.get(i) || lowerLegSide.get(i) || (x < 0 ? 'Left' : 'Right'), values = {};
    let head = ax < .28 || y < -.1 || z > 2.35 ? smooth(2.18, 2.39, z) : smooth(2.32, 2.42, z);
    let arm = smooth(.37, .49, ax) * (1 - smooth(2.08, 2.28, z)) * smooth(.85, 1.12, z);
    let leg = 1 - smooth(1.10, 1.24, z);
    if (z < .7) leg = 1;
    if (z < 1.36 && ax > .46) leg = 0;
    if (lowerLegSide.has(i)) { leg = 1; arm = 0; }
    if (lowerArmSide.has(i)) {
      arm += (1 - arm) * (1 - smooth(1.32, 1.5, z));
      leg = 0;
    }
    if (z >= 1.24 && z <= 2.18 && !lowerArmSide.has(i)) {
      arm *= smooth(.45, .58, ax);
      if (ax <= .45) { head = 0; arm = 0; leg = 0; }
    }
    if (z > 2.39) { head = 1; arm = 0; leg = 0; }
    values.Head = head;
    if (arm > .001 && head < .99) {
      arm *= 1 - head;
      const fore = 1 - smooth(1.43, 1.68, z), hand = 1 - smooth(1.15, 1.30, z);
      values[side + 'Arm'] = arm * (1 - fore);
      values[side + 'Forearm'] = arm * fore * (1 - hand);
      values[side + 'Hand'] = arm * fore * hand;
    }
    if (leg > .001 && arm < .5) {
      leg *= 1 - head;
      const shin = 1 - smooth(.67, .89, z), foot = 1 - smooth(.36, .44, z);
      values[side + 'Leg'] = leg * (1 - shin);
      values[side + 'Shin'] = leg * shin * (1 - foot);
      values[side + 'Foot'] = leg * shin * foot;
    }
    values.Body = Math.max(0, 1 - Object.values(values).reduce((a, b) => a + b, 0));
    if (shoeSide.has(i)) {
      for (const name of Object.keys(values)) delete values[name];
      values[shoeSide.get(i) + 'Foot'] = 1;
    }
    const strongest = Object.entries(values).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = strongest.reduce((total, [, v]) => total + v, 0);
    for (const [slot, [name, value]] of strongest.entries()) {
      joints[i * 4 + slot] = boneIndex(name);
      weights[i * 4 + slot] = value / sum;
    }
  }
  const chunks = [binary];
  let length = binary.length;
  function accessor(array, type, componentType, count, bounds = {}) {
    const padding = (4 - length % 4) % 4;
    chunks.push(Buffer.alloc(padding)); length += padding;
    const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const bufferView = gltf.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, ...(type !== 'MAT4' ? { target: type === 'SCALAR' ? 34963 : 34962 } : {}) }) - 1;
    chunks.push(data); length += data.length;
    return gltf.accessors.push({ bufferView, type, componentType, count, ...bounds }) - 1;
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  positions.forEach((v, i) => { min[i % 3] = Math.min(min[i % 3], v); max[i % 3] = Math.max(max[i % 3], v); });
  accessor(positions, 'VEC3', 5126, original.count, { min, max });
  gltf.accessors[primitive.attributes.POSITION] = gltf.accessors.pop();
  primitive.attributes.JOINTS_0 = accessor(joints, 'VEC4', 5123, original.count);
  primitive.attributes.WEIGHTS_0 = accessor(weights, 'VEC4', 5126, original.count);
  const inverseBindMatrices = accessor(inverseBinds, 'MAT4', 5126, bones.length);
  const eyes = [
    { name: 'LeftEye', center: [-.163, 2.748], radius: [.044, .056], triangles: [] },
    { name: 'RightEye', center: [.139, 2.747], radius: [.043, .056], triangles: [] },
  ];
  const bodyTriangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);
    const center = [0, 1, 2].map(axis => triangle.reduce((sum, vertex) => sum + positions[vertex * 3 + axis], 0) / 3);
    const eye = eyes.find(eye => center[2] > .18 && center[2] < .29
      && Math.abs(center[0] - eye.center[0]) < eye.radius[0] * 1.6
      && Math.abs(center[1] - eye.center[1]) < eye.radius[1] * 1.45);
    (eye ? eye.triangles : bodyTriangles).push(...triangle);
  }
  primitive.indices = accessor(new Uint16Array(bodyTriangles), 'SCALAR', 5123, bodyTriangles.length);
  gltf.meshes[0].name = 'CharacterSurface';
  for (const eye of eyes) {
    if (eye.triangles.length < 30) throw new Error(`Missing original surface for ${eye.name}`);
    const eyeIndices = accessor(new Uint16Array(eye.triangles), 'SCALAR', 5123, eye.triangles.length);
    const mesh = gltf.meshes.push({ name: eye.name, primitives: [{ ...primitive, indices: eyeIndices }] }) - 1;
    nodes[0].children.push(nodes.length);
    nodes.push({ name: eye.name, mesh, skin: 0, extras: { eyeCenter: eye.center, eyeRadius: eye.radius } });
  }
  gltf.skins = [{ name: 'CharacterSkeleton', skeleton: 2, joints: bones.map((_, i) => i + 2), inverseBindMatrices }];
  gltf.nodes = nodes; gltf.scenes = [{ nodes: [0] }]; gltf.scene = 0;
  gltf.buffers = [{ byteLength: length }];
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const bin = Buffer.concat([...chunks, Buffer.alloc((4 - length % 4) % 4)]);
  const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonPadded.length + bin.length, 8);
  header.writeUInt32LE(jsonPadded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length); binHeader.writeUInt32LE(0x004e4942, 4);
  const output = path.join(root, 'public/models/reference-character.glb');
  fs.writeFileSync(output, Buffer.concat([header, jsonPadded, binHeader, bin]));
  console.log(`Imported ${original.count} vertices, ${gltf.images.length} original texture images, and ${bones.length} bones into ${output}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
