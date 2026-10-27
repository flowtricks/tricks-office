import * as T from "three";

/** Keep the supplied model live so hover lifting and its light move together. */
export function createEchoDot(model: T.Group) {
  const echo = new T.Group();
  echo.name = "Amazon Echo Dot";
  model.name = "User-supplied Echo Dot";
  model.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    object.castShadow = object.receiveShadow = true;
  });
  echo.add(model);
  const blueLight = new T.PointLight("#168bff", .65, 1.25, 2);
  blueLight.position.y = .21;
  echo.add(blueLight);
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

/** A short, repeatable typing rhythm with punctuation pauses and eased word edges. */
export function echoTypingTimes(message: string) {
  let time = 0;
  const rhythm = [.014, .003, .021, .008, .001, .017, .005];
  return Array.from(message, (letter, index) => {
    let delay = .035 + rhythm[index % rhythm.length];
    if (index < 2) delay += .035 * (2 - index);
    if (index >= message.length - 2) delay += .025 * (index - message.length + 3);
    if (message[index - 1] === ",") delay += .22;
    else if (message[index - 1] === " ") delay += .065;
    if (letter === " ") delay *= .75;
    time += delay;
    return time;
  });
}

export function createEchoCommand() {
  let on = true, elapsed = 0, message = "", applied = false, acknowledged = false;
  let typedLength = 0;
  let typingTimes: number[] = [];
  return {
    get lightsOn() { return on; },
    get busy() { return message !== "" && !applied; },
    start() {
      if (message && !applied) return;
      elapsed = 0;
      typedLength = 0;
      applied = acknowledged = false;
      message = on ? "Alexa, lights off" : "Alexa, lights on";
      typingTimes = echoTypingTimes(message);
      return message;
    },
    update(dt: number) {
      if (!message) return { text: "", visible: false, changed: false, on, exit: "none", finishedTyping: false, typedLetters: 0 };
      elapsed += dt;
      let length = typedLength;
      while (length < typingTimes.length && elapsed >= typingTimes[length]) length++;
      const typingDuration = typingTimes[typingTimes.length - 1];
      const typedLetters = (message.slice(typedLength, length).match(/[a-z]/gi) ?? []).length;
      typedLength = length;
      const finishedTyping = !acknowledged && length === message.length;
      if (finishedTyping) acknowledged = true;
      let changed = false;
      if (!applied && elapsed >= typingDuration + .25) {
        on = !on;
        applied = changed = true;
      }
      const text = message.slice(0, length);
      // Let the completed line read briefly, then dismiss text, shape, and opacity in order.
      const exitTime = elapsed - (typingDuration + 1.0);
      const exit = exitTime < 0 ? "none" : exitTime < .18 ? "text" : exitTime < .40 ? "shrink" : "fade";
      if (exitTime >= .56) message = "";
      return { text, visible: !!message, changed, on, exit, finishedTyping, typedLetters };
    },
  };
}
