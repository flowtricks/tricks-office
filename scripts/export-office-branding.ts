import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareCharacter } from "../src/scripts/character-materials";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

export function addBrandingExports(
  scene: T.Scene,
  camera: T.PerspectiveCamera,
  renderer: T.WebGLRenderer,
  composer: EffectComposer,
) {
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;gap:12px;color:black";
  document.body.append(panel);
  const download = (
    canvas: HTMLCanvasElement,
    name: string,
    type = "image/png",
  ) => {
    const link = document.createElement("a");
    link.download = name;
    link.href = canvas.toDataURL(type, 0.95);
    link.textContent = name;
    link.id = name.split(".")[0];
    panel.append(link);
  };
  const addButton = (label: string, action: () => void) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.cssText = "background:white;padding:12px;border-radius:12px";
    button.onclick = action;
    panel.append(button);
  };
  addButton("Export social image", () => {
    const size = renderer.getSize(new T.Vector2());
    const ratio = renderer.getPixelRatio();
    const position = camera.position.clone(),
      quaternion = camera.quaternion.clone(),
      aspect = camera.aspect;
    renderer.setPixelRatio(1);
    composer.setPixelRatio(1);
    renderer.setSize(2400, 1260, false);
    composer.setSize(2400, 1260);
    camera.aspect = 2400 / 1260;
    camera.position.set(6.2, 4.7, 10);
    camera.lookAt(-0.15, 1.85, -0.9);
    camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    composer.render();
    download(renderer.domElement, "office-social.jpg", "image/jpeg");
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    renderer.setSize(size.x, size.y, false);
    composer.setSize(size.x, size.y);
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  });
  addButton("Export face icon", async () => {
    const portrait = new T.Scene();
    portrait.environment = scene.environment;
    portrait.environmentIntensity = 0.25;
    const model = (
      await new GLTFLoader().loadAsync("/models/reference-character.glb")
    ).scene;
    prepareCharacter(model);
    model.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      const original = object.geometry;
      const geometry = original.clone();
      const positions = geometry.getAttribute("position");
      const index = geometry.getIndex()!;
      const selected: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2);
        if (
          Math.min(positions.getY(a), positions.getY(b), positions.getY(c)) >
          2.17
        )
          selected.push(a, b, c);
      }
      geometry.setIndex(selected);
      object.geometry = geometry;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        material.clippingPlanes = [
          new T.Plane(
            new T.Vector3(0, 1, 0.8).normalize(),
            -2.4 / Math.hypot(1, 0.8),
          ),
        ];
      }
    });
    portrait.add(model);
    portrait.add(new T.HemisphereLight("#fff1df", "#596378", 2));
    const key = new T.DirectionalLight("#fff0dc", 3.2);
    key.position.set(-3, 5, 5);
    portrait.add(key);
    const fill = new T.DirectionalLight("#c9ddff", 1.4);
    fill.position.set(4, 3, 3);
    portrait.add(fill);
    const rim = new T.DirectionalLight("#ffe3bf", 2);
    rim.position.set(-1, 4, -3);
    portrait.add(rim);
    const lens = new T.OrthographicCamera(-0.65, 0.65, 0.65, -0.65, 0.1, 20);
    lens.position.set(0.18, 3.3, 6);
    lens.lookAt(0, 2.79, 0);
    const output = new T.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    output.localClippingEnabled = true;
    output.setSize(1024, 1024);
    output.setClearColor(0, 0);
    output.toneMapping = T.ACESFilmicToneMapping;
    output.toneMappingExposure = 1;
    await output.compileAsync(portrait, lens);
    output.render(portrait, lens);
    download(output.domElement, "character-face.png");
    output.dispose();
  });
}
