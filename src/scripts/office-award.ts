import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** The 2022 Webflow educator award, modeled from the shelf reference. */
export function createWebflowAward() {
  const award = new T.Group();
  award.name = "2022 Webflow Community Educator of the Year award";
  const dark = new T.MeshStandardMaterial({
    color: "#303943",
    roughness: 0.67,
    metalness: 0.22,
  });
  const base = new T.Mesh(
    new RoundedBoxGeometry(0.43, 0.46, 0.28, 2, 0.004),
    dark,
  );
  base.position.y = 0.23;
  base.castShadow = base.receiveShadow = true;
  award.add(base);

  // Curved, tapered strokes of the original sculpted Webflow W.
  const w = new T.Shape();
  w.moveTo(-0.18, 0.265);
  w.bezierCurveTo(-0.1, 0.25, -0.095, 0.205, -0.093, 0.145);
  w.lineTo(-0.087, 0.035);
  w.lineTo(-0.018, 0.192);
  w.bezierCurveTo(0.002, 0.238, 0.031, 0.253, 0.068, 0.25);
  w.lineTo(0.096, 0.035);
  w.lineTo(0.139, 0.177);
  w.bezierCurveTo(0.156, 0.224, 0.185, 0.238, 0.218, 0.237);
  w.lineTo(0.135, 0);
  w.lineTo(0.043, 0);
  w.lineTo(0.018, 0.133);
  w.lineTo(-0.043, 0);
  w.lineTo(-0.145, 0);
  w.closePath();
  const emblem = new T.Mesh(
    new T.ExtrudeGeometry(w, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.001,
      bevelSize: 0.001,
      bevelSegments: 2,
      curveSegments: 24,
    }),
    dark,
  );
  emblem.position.set(-0.018, 0.455, 0.04);
  emblem.castShadow = emblem.receiveShadow = true;
  award.add(emblem);

  const plaqueCanvas = document.createElement("canvas");
  plaqueCanvas.width = 1024;
  plaqueCanvas.height = 320;
  const ctx = plaqueCanvas.getContext("2d")!;
  ctx.fillStyle = "#454e57";
  ctx.fillRect(0, 0, 1024, 320);
  ctx.strokeStyle = "#c9d0d0";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, 988, 284);
  ctx.beginPath();
  ctx.moveTo(18, 246);
  ctx.lineTo(1006, 246);
  ctx.stroke();
  ctx.fillStyle = "#e0e5e4";
  ctx.textAlign = "center";
  ctx.font = "600 24px sans-serif";
  ctx.fillText("WEBFLOW AWARDS", 512, 66);
  ctx.font = "600 42px sans-serif";
  ctx.fillText("Community Educator of the Year", 512, 143);
  ctx.font = "32px sans-serif";
  ctx.fillText("Timothy Ricks", 512, 193);
  ctx.textAlign = "left";
  ctx.font = "italic 600 26px sans-serif";
  ctx.fillText("webflow conf", 42, 282);
  ctx.textAlign = "right";
  ctx.font = "600 25px sans-serif";
  ctx.fillText("2022", 980, 282);
  const label = new T.CanvasTexture(plaqueCanvas);
  label.colorSpace = T.SRGBColorSpace;
  label.anisotropy = 4;
  const rim = new T.Mesh(
    new RoundedBoxGeometry(0.376, 0.124, 0.008, 2, 0.002),
    new T.MeshStandardMaterial({
      color: "#a6adac",
      metalness: 0.7,
      roughness: 0.4,
    }),
  );
  rim.position.set(0, 0.085, 0.144);
  award.add(rim);
  const plaque = new T.Mesh(
    new T.PlaneGeometry(0.368, 0.115),
    new T.MeshStandardMaterial({
      map: label,
      roughness: 0.55,
      metalness: 0.25,
    }),
  );
  plaque.position.set(0, 0.085, 0.1485);
  award.add(plaque);
  return award;
}

export async function createModernWebflowAwards() {
  const loader = new T.TextureLoader();
  return Promise.all(
    [2025, 2026].map(async (year) => {
      const [frontLabel, sideLabel] = await Promise.all([
        loader.loadAsync(`/textures/awards/award-${year}-front.svg`),
        loader.loadAsync(`/textures/awards/award-${year}-side.svg`),
      ]);
      for (const label of [frontLabel, sideLabel]) {
        label.colorSpace = T.SRGBColorSpace;
        label.anisotropy = 8;
      }
      const award = new T.Group();
      award.name = `${year} Webflow ${year === 2025 ? "Community " : ""}Educator of the Year award`;
      const acrylic = new T.MeshPhysicalMaterial({
        color: "#0b1c23",
        roughness: 0.13,
        metalness: 0.48,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.1,
      });
      const body = new T.Mesh(
        new RoundedBoxGeometry(0.2, 0.78, 0.2, 2, 0.0015),
        acrylic,
      );
      body.position.y = 0.39;
      body.castShadow = body.receiveShadow = true;
      award.add(body);
      const edge = new T.Mesh(
        new RoundedBoxGeometry(0.207, 0.785, 0.207, 2, 0.001),
        new T.MeshPhysicalMaterial({
          color: "#a8cbd0",
          transparent: true,
          opacity: 0.1,
          roughness: 0.08,
          metalness: 0.6,
          depthWrite: false,
          clearcoat: 1,
        }),
      );
      edge.position.y = 0.3925;
      award.add(edge);
      const metal = new T.MeshStandardMaterial({
        color: "#8d9ca4",
        metalness: 0.78,
        roughness: 0.34,
      });
      const plate = (points: number[][], side = false) => {
        const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
        const mesh = new T.Mesh(
          new T.ExtrudeGeometry(shape, {
            depth: 0.003,
            bevelEnabled: true,
            bevelSize: 0.0006,
            bevelThickness: 0.0006,
            bevelSegments: 2,
          }),
          metal,
        );
        if (side) {
          mesh.rotation.y = -Math.PI / 2;
          mesh.position.x = -0.105;
        } else mesh.position.z = 0.105;
        mesh.castShadow = mesh.receiveShadow = true;
        award.add(mesh);
      };
      plate([
        [-0.097, 0.772],
        [0.097, 0.772],
        [0.097, 0.28],
        [-0.075, 0.28],
        [0.045, 0.48],
        [-0.097, 0.36],
      ]);
      plate(
        [
          [-0.097, 0.772],
          [-0.025, 0.772],
          [-0.025, 0.52],
          [0.065, 0.772],
          [0.097, 0.772],
          [0.097, 0.37],
          [-0.097, 0.31],
          [-0.06, 0.51],
          [-0.097, 0.51],
        ],
        true,
      );
      for (const [i, map] of [frontLabel, sideLabel].entries()) {
        const label = new T.Mesh(
          new T.PlaneGeometry(0.2, 0.78),
          new T.MeshStandardMaterial({
            map,
            alphaTest: 0.4,
            roughness: 0.55,
            metalness: 0.05,
          }),
        );
        label.position.y = 0.39;
        if (i === 0) label.position.z = 0.109;
        else {
          label.position.x = -0.109;
          label.rotation.y = -Math.PI / 2;
        }
        award.add(label);
      }
      return award;
    }),
  );
}
