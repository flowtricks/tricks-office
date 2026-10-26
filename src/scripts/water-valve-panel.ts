import * as T from "three";

export function roundedPanelPath(
  width: number,
  height: number,
  radius: number,
) {
  const path = new T.Shape();
  const x = -width / 2,
    y = -height / 2;
  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
  return path;
}

export function createWaterValvePanel(wallColor: T.Color) {
  const panel = new T.Group();
  panel.name = "Recessed water shutoff access panel";
  const paint = new T.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.85,
    metalness: 0.05,
  });
  const inside = new T.MeshStandardMaterial({
    color: "#232a26",
    roughness: 0.85,
  });
  const pipePaint = new T.MeshStandardMaterial({
    color: "#363b3b",
    roughness: 0.43,
    metalness: 0.55,
  });
  const noise = new Uint8Array(64 * 64 * 4);
  let seed = 47;
  for (let i = 0; i < noise.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = 95 + (seed % 130);
    noise.set([value, value, value, 255], i);
  }
  const texture = new T.DataTexture(noise, 64, 64);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.needsUpdate = true;
  pipePaint.bumpMap = texture;
  pipePaint.bumpScale = 0.0014;
  paint.bumpMap = texture;
  paint.bumpScale = 0.0005;
  function part(
    geometry: T.BufferGeometry,
    material: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    panel.add(mesh);
    return mesh;
  }
  // One continuous thin flange, with the cavity genuinely behind the wall face.
  const frame = roundedPanelPath(0.86, 0.76, 0.035);
  frame.holes.push(
    new T.Path(roundedPanelPath(0.64, 0.54, 0.035).getPoints(12).reverse()),
  );
  part(
    new T.ExtrudeGeometry(frame, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.004,
      bevelThickness: 0.003,
      curveSegments: 12,
    }),
    paint,
    0,
    0,
    0.003,
  );
  const reveal = roundedPanelPath(0.66, 0.56, 0.035);
  reveal.holes.push(
    new T.Path(roundedPanelPath(0.64, 0.54, 0.035).getPoints(12).reverse()),
  );
  part(
    new T.ExtrudeGeometry(reveal, {
      depth: 0.27,
      bevelEnabled: false,
      curveSegments: 12,
    }),
    inside,
    0,
    0,
    -0.27,
  );
  part(
    new T.ShapeGeometry(roundedPanelPath(0.66, 0.56, 0.035)),
    inside,
    0,
    0,
    -0.275,
  );
  function pipe(
    radius: number,
    height: number,
    y: number,
    material = pipePaint,
  ) {
    return part(
      new T.CylinderGeometry(radius, radius, height, 32),
      material,
      -0.035,
      y,
      -0.13,
    );
  }
  pipe(0.043, 0.59, 0);
  pipe(0.061, 0.105, 0.205);
  pipe(0.054, 0.17, 0.07);
  pipe(0.063, 0.075, -0.055);
  for (const y of [0.148, -0.013]) pipe(0.056, 0.008, y, inside);
  const pivot = part(
    new T.CylinderGeometry(0.031, 0.031, 0.073, 24),
    pipePaint,
    -0.008,
    0.075,
    -0.067,
  );
  pivot.rotation.x = Math.PI / 2;
  const handle = new T.Shape();
  handle.moveTo(-0.025, 0.098);
  handle.quadraticCurveTo(0.005, 0.126, 0.028, 0.094);
  handle.lineTo(0.034, 0.054);
  handle.lineTo(0.096, -0.014);
  handle.quadraticCurveTo(0.117, -0.033, 0.118, -0.067);
  handle.lineTo(0.128, -0.225);
  handle.quadraticCurveTo(0.103, -0.257, 0.082, -0.227);
  handle.lineTo(0.074, -0.075);
  handle.quadraticCurveTo(0.073, -0.05, 0.053, -0.034);
  handle.lineTo(-0.023, 0.044);
  handle.closePath();
  part(
    new T.ExtrudeGeometry(handle, {
      depth: 0.015,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.003,
      bevelSegments: 3,
      curveSegments: 10,
    }),
    pipePaint,
    0,
    0,
    -0.042,
  );
  const bolt = part(
    new T.CylinderGeometry(0.021, 0.021, 0.012, 6),
    pipePaint,
    0,
    0.078,
    -0.019,
  );
  bolt.rotation.x = Math.PI / 2;
  return panel;
}
