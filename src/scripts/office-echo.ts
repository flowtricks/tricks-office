import * as T from "three";

export function createEchoDot() {
  const echo = new T.Group();
  echo.name = "Amazon Echo Dot";
  const fabricCanvas = document.createElement("canvas");
  fabricCanvas.width = fabricCanvas.height = 128;
  const ctx = fabricCanvas.getContext("2d")!;
  ctx.fillStyle = "#666666";
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = (x + y) % 8 ? "#444444" : "#999999";
    ctx.fillRect(x + (y % 8 ? 1 : 0), y, 2, 3);
  }
  const weave = new T.CanvasTexture(fabricCanvas);
  weave.wrapS = weave.wrapT = T.RepeatWrapping;
  weave.repeat.set(6, 1);
  const fabric = new T.MeshStandardMaterial({ color: "#343940", roughness: .95, bumpMap: weave, bumpScale: .003 });
  const plastic = new T.MeshStandardMaterial({ color: "#202329", roughness: .8 });
  const body = new T.Mesh(new T.LatheGeometry([
    new T.Vector2(0, .012), new T.Vector2(.19, .012), new T.Vector2(.222, .028),
    new T.Vector2(.235, .06), new T.Vector2(.235, .135), new T.Vector2(.222, .17),
    new T.Vector2(.19, .182), new T.Vector2(0, .182),
  ], 64), fabric);
  echo.add(body);
  const top = new T.Mesh(new T.CylinderGeometry(.205, .214, .018, 64), plastic);
  top.position.y = .179;
  echo.add(top);
  const ringMaterial = new T.MeshStandardMaterial({ color: "#008aff", emissive: "#008aff", emissiveIntensity: 3, roughness: .3 });
  const ring = new T.Mesh(new T.TorusGeometry(.215, .006, 10, 96), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .173;
  echo.add(ring);
  const cyan = new T.Mesh(new T.TorusGeometry(.215, .0065, 10, 32, Math.PI / 2), new T.MeshStandardMaterial({color: "#58edff", emissive: "#28cfff", emissiveIntensity: 3}));
  cyan.rotation.set(Math.PI / 2, 0, -.8);
  cyan.position.y = .173;
  echo.add(cyan);
  const icon = new T.MeshStandardMaterial({ color: "#8b929a", roughness: 1 });
  for (const [x, z, plus] of [[-.085, 0, true], [.085, 0, false]] as const) {
    const horizontal = new T.Mesh(new T.BoxGeometry(.038, .002, .006), icon);
    horizontal.position.set(x, .19, z);
    echo.add(horizontal);
    if (plus) { const vertical = horizontal.clone(); vertical.rotation.y = Math.PI / 2; echo.add(vertical); }
  }
  for (const z of [-.075, .075]) {
    const button = new T.Mesh(new T.CylinderGeometry(.014, .014, .003, 20), icon);
    button.position.set(0, .19, z);
    echo.add(button);
  }
  const blueLight = new T.PointLight("#168bff", .65, 1.25, 2);
  blueLight.position.y = .21;
  echo.add(blueLight);
  echo.traverse(object => { if (object instanceof T.Mesh) object.castShadow = object.receiveShadow = true; });
  return echo;
}

/** Capture only the existing room fixtures, before daylight and Echo are added. */
export function createRoomLightSwitch(scene: T.Scene, daylightMaterial: T.Material, characterFill: { value: number }) {
  const lights: Array<[T.Light, number]> = [];
  const materials = new Set<T.Material>();
  scene.traverse(object => {
    if (object instanceof T.Light) lights.push([object, object.intensity]);
    if (object instanceof T.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  const surfaces = [...materials].filter((material): material is T.MeshStandardMaterial => material instanceof T.MeshStandardMaterial)
    .map(material => ({material, emission: material.emissiveIntensity, environment: material.envMapIntensity}));
  const unlit = [...materials].filter((material): material is T.MeshBasicMaterial => material instanceof T.MeshBasicMaterial && material !== daylightMaterial)
    .map(material => ({material, color: material.color.clone()}));
  const environment = scene.environmentIntensity;
  let level = 1, target = 1;
  return {
    set(on: boolean) { target = on ? 1 : 0; },
    update(dt: number) {
      if (level === target) return;
      level = T.MathUtils.damp(level, target, 10, dt);
      if (Math.abs(level - target) < .001) level = target;
      for (const [light, intensity] of lights) light.intensity = intensity * level;
      for (const {material, emission, environment} of surfaces) {
        material.emissiveIntensity = emission * level;
        material.envMapIntensity = environment * level;
      }
      for (const {material, color} of unlit) material.color.copy(color).multiplyScalar(level);
      scene.environmentIntensity = environment * level;
      characterFill.value = level;
    },
  };
}

export function createEchoCommand() {
  let on = true, elapsed = 0, message = "", applied = false;
  return {
    get lightsOn() { return on; },
    get busy() { return message !== "" && !applied; },
    start() {
      if (message && !applied) return;
      elapsed = 0;
      applied = false;
      message = on ? "Alexa, lights off" : "Alexa, lights on";
      return message;
    },
    update(dt: number) {
      if (!message) return { text: "", visible: false, changed: false, on };
      elapsed += dt;
      const length = Math.min(message.length, Math.floor(elapsed / .055));
      let changed = false;
      if (!applied && elapsed >= message.length * .055 + .25) {
        on = !on;
        applied = changed = true;
      }
      const text = message.slice(0, length);
      if (elapsed > message.length * .055 + 3) message = "";
      return { text, visible: !!message, changed, on };
    },
  };
}
