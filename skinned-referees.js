import * as THREE from "https://esm.sh/three@0.180.0";
import { FBXLoader } from "https://esm.sh/three@0.180.0/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkinnedObject } from "https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js";
import { mergeVertices } from "https://esm.sh/three@0.180.0/examples/jsm/utils/BufferGeometryUtils.js";

const canvas = document.querySelector("#skinned-referees");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// Three.js expects field of view in degrees; the rink renderer uses radians.
const camera = new THREE.PerspectiveCamera(56.25, 1, 0.1, 140);
const clock = new THREE.Clock();
scene.add(new THREE.HemisphereLight(0xeaffff, 0x263945, 2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(-4, 8, 6);
scene.add(keyLight);

const refs = [];
const playerRefs = new Map();
let template = null;
let clip = null;
let loaded = false;
let playerTemplate = null;
let playerClip = null;
let playerMaterials = [];
let playersLoaded = false;
const refereeHeight = 1.6;
const playerHeight = 1.72;
const playerModelYawOffset = -Math.PI / 2;
const animationFadeSpeed = 12;

const shadowCanvas = document.createElement("canvas");
shadowCanvas.width = 64;
shadowCanvas.height = 64;
const shadowContext = shadowCanvas.getContext("2d");
const shadowGradient = shadowContext.createRadialGradient(32, 32, 3, 32, 32, 32);
shadowGradient.addColorStop(0, "rgba(0, 0, 0, 0.24)");
shadowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
shadowContext.fillStyle = shadowGradient;
shadowContext.fillRect(0, 0, 64, 64);
const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture,
  transparent: true,
  depthWrite: false,
});
const shadowGeometry = new THREE.PlaneGeometry(1, 1);

const refereeTexture = new THREE.TextureLoader().load("assets/referee-model/texture_diffuse.png");
refereeTexture.colorSpace = THREE.SRGBColorSpace;
refereeTexture.flipY = true;

new FBXLoader().load(
  "assets/referee-model/Patinage.fbx",
  (object) => {
    object.scale.setScalar(0.01);
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) {
      console.error("Le fichier Patinage.fbx ne contient pas de modèle visible.");
      return;
    }
    const normalizedScale = refereeHeight / size.y;
    object.scale.multiplyScalar(normalizedScale);
    object.updateMatrixWorld(true);

    const normalizedBox = new THREE.Box3().setFromObject(object);
    object.position.x -= (normalizedBox.min.x + normalizedBox.max.x) * 0.5;
    object.position.z -= (normalizedBox.min.z + normalizedBox.max.z) * 0.5;
    object.position.y -= normalizedBox.min.y;
    object.updateMatrixWorld(true);

    object.traverse((child) => {
      if (!child.isMesh) return;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      child.material = new THREE.MeshStandardMaterial({
        map: refereeTexture,
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide,
      });
    });

    template = new THREE.Group();
    template.add(object);
    clip = object.animations.find((item) => item.duration > 0)?.clone() || null;
    if (clip) {
      const rootTracks = new Set([
        "mixamorigHips.position",
        "SmartRigArmature.position",
        "SmartRigArmature.scale",
      ]);
      clip.tracks = clip.tracks.filter((track) => !rootTracks.has(track.name));
    }
    loaded = true;
    window.skinnedReferees.ready = true;
  },
  undefined,
  (error) => console.error("Impossible de charger l'animation FBX :", error),
);

function makeBlueDiffuseTexture(texture) {
  const image = texture.image;
  const blueCanvas = document.createElement("canvas");
  blueCanvas.width = image.width;
  blueCanvas.height = image.height;
  const context = blueCanvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, blueCanvas.width, blueCanvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const red = pixels.data[i];
    const green = pixels.data[i + 1];
    const blue = pixels.data[i + 2];
    if (red > 65 && red > green * 1.6 && red > blue * 1.5 && green < 100) {
      pixels.data[i] = Math.round(red * 0.16);
      pixels.data[i + 1] = Math.min(255, Math.round(green * 0.7 + 28));
      pixels.data[i + 2] = Math.min(255, Math.round(red * 0.95));
    }
  }
  context.putImageData(pixels, 0, 0);
  const blueTexture = new THREE.CanvasTexture(blueCanvas);
  blueTexture.colorSpace = THREE.SRGBColorSpace;
  blueTexture.flipY = true;
  return blueTexture;
}

async function loadPlayerModel() {
  try {
    const textureLoader = new THREE.TextureLoader();
    const [object, diffuse, normal, roughness] = await Promise.all([
      new FBXLoader().loadAsync("assets/player-model/player-animation.fbx"),
      textureLoader.loadAsync("assets/player-model/player-diffuse.png"),
      textureLoader.loadAsync("assets/player-model/player-normal.png"),
      textureLoader.loadAsync("assets/player-model/player-metallic-roughness.png"),
    ]);

    diffuse.colorSpace = THREE.SRGBColorSpace;
    diffuse.flipY = true;
    diffuse.needsUpdate = true;
    for (const texture of [normal, roughness]) {
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = true;
      texture.needsUpdate = true;
    }

    const blueDiffuse = makeBlueDiffuseTexture(diffuse);
    playerMaterials = [
      new THREE.MeshStandardMaterial({
        map: blueDiffuse,
        normalMap: normal,
        roughnessMap: roughness,
        metalnessMap: roughness,
        roughness: 0.82,
        metalness: 0,
      }),
      new THREE.MeshStandardMaterial({
        map: diffuse,
        normalMap: normal,
        roughnessMap: roughness,
        metalnessMap: roughness,
        roughness: 0.82,
        metalness: 0,
      }),
    ];

    object.scale.setScalar(0.01);
    object.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) {
      throw new Error("Le fichier d'animation des joueurs ne contient pas de modèle visible.");
    }
    object.scale.multiplyScalar(playerHeight / size.y);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    object.position.x -= (box.min.x + box.max.x) * 0.5;
    object.position.z -= (box.min.z + box.max.z) * 0.5;
    object.position.y -= box.min.y;
    object.updateMatrixWorld(true);

    object.traverse((child) => {
      if (!child.isMesh) return;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      child.geometry = mergeVertices(child.geometry, 1e-4);
      child.material = playerMaterials[1];
    });

    playerTemplate = object;
    playerClip = object.animations.find((item) => item.duration > 0)?.clone() || null;
    if (playerClip) {
      const rootTracks = new Set([
        "mixamorigHips.position",
        "SmartRigArmature.position",
        "SmartRigArmature.scale",
      ]);
      playerClip.tracks = playerClip.tracks.filter((track) => !rootTracks.has(track.name));
    }
    playersLoaded = true;
    window.skinnedReferees.playersReady = true;
  } catch (error) {
    console.error("Impossible de charger le modèle animé des joueurs :", error);
  }
}

loadPlayerModel();

function makeRef(index) {
  if (!template) return null;
  const object = cloneSkinnedObject(template);
  const mixer = clip ? new THREE.AnimationMixer(object) : null;
  const action = mixer ? mixer.clipAction(clip) : null;
  if (action) {
    action.reset();
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(0);
    action.play();
    action.paused = true;
  }
  object.userData.mixer = mixer;
  object.userData.action = action;
  object.userData.animationWeight = 0;
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.014;
  shadow.scale.set(0.82, 0.5, 1);
  object.add(shadow);
  scene.add(object);
  refs[index] = object;
  return object;
}

function syncRef(index, entity, delta) {
  if (!loaded) return false;
  let object = refs[index];
  if (!object) object = makeRef(index);
  if (!object) return false;

  const targetX = (entity.x - 700) * 0.05;
  const targetZ = (entity.y - 360) * 0.05;
  const targetYaw = entity.yaw ?? 0;
  if (!object.userData.hasSynced) {
    object.position.set(targetX, object.position.y, targetZ);
    object.rotation.y = targetYaw;
    object.userData.hasSynced = true;
  } else {
    const positionAlpha = 1 - Math.exp(-18 * delta);
    object.position.x += (targetX - object.position.x) * positionAlpha;
    object.position.z += (targetZ - object.position.z) * positionAlpha;
    const yawDelta = Math.atan2(
      Math.sin(targetYaw - object.rotation.y),
      Math.cos(targetYaw - object.rotation.y),
    );
    object.rotation.y += yawDelta * (1 - Math.exp(-20 * delta));
  }
  object.visible = true;

  const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
  const action = object.userData.action;
  if (action) {
    const moving = speed > 3;
    const targetWeight = moving ? 1 : 0;
    const blend = 1 - Math.exp(-animationFadeSpeed * delta);
    const weight = object.userData.animationWeight
      + (targetWeight - object.userData.animationWeight) * blend;
    object.userData.animationWeight = weight;
    action.setEffectiveWeight(weight);
    action.setEffectiveTimeScale(0.55 + Math.min(1, speed / 142) * 0.35);
    action.paused = !moving && weight < 0.01;
  }
  return true;
}

function makePlayer(entity) {
  const object = cloneSkinnedObject(playerTemplate);
  const mixer = playerClip ? new THREE.AnimationMixer(object) : null;
  const action = mixer ? mixer.clipAction(playerClip) : null;
  if (action) {
    action.reset();
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(0);
    action.play();
    action.paused = true;
  }
  object.traverse((child) => {
    if (child.isMesh) child.material = playerMaterials[entity.team === 0 ? 0 : 1];
  });
  object.userData.mixer = mixer;
  object.userData.action = action;
  object.userData.animationWeight = 0;
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.014;
  shadow.scale.set(0.82, 0.5, 1);
  object.add(shadow);
  scene.add(object);
  playerRefs.set(entity, object);
  return object;
}

function syncPlayer(entity, delta) {
  let object = playerRefs.get(entity);
  if (!object) object = makePlayer(entity);

  const targetX = (entity.x - 700) * 0.05;
  const targetZ = (entity.y - 360) * 0.05;
  const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
  const movementYaw = speed > 3 ? Math.atan2(entity.vx, entity.vy) : entity.yaw ?? 0;
  const targetYaw = movementYaw + playerModelYawOffset;
  if (!object.userData.hasSynced) {
    object.position.set(targetX, object.position.y, targetZ);
    object.rotation.y = targetYaw;
    object.userData.hasSynced = true;
  } else {
    const positionAlpha = 1 - Math.exp(-24 * delta);
    object.position.x += (targetX - object.position.x) * positionAlpha;
    object.position.z += (targetZ - object.position.z) * positionAlpha;
    const yawDelta = Math.atan2(
      Math.sin(targetYaw - object.rotation.y),
      Math.cos(targetYaw - object.rotation.y),
    );
    object.rotation.y += yawDelta * (1 - Math.exp(-24 * delta));
  }
  object.visible = true;

  const action = object.userData.action;
  if (action) {
    const moving = speed > 3;
    const targetWeight = moving ? 1 : 0;
    const blend = 1 - Math.exp(-animationFadeSpeed * delta);
    const weight = object.userData.animationWeight
      + (targetWeight - object.userData.animationWeight) * blend;
    object.userData.animationWeight = weight;
    action.setEffectiveWeight(weight);
    action.setEffectiveTimeScale(0.65 + Math.min(1, speed / 120) * 0.35);
    action.paused = !moving && weight < 0.01;
  }
}

window.skinnedReferees = {
  ready: false,
  playersReady: false,
  sync(cameraState, entities) {
    if (!loaded && !playersLoaded) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    camera.position.set(...cameraState.eye);
    camera.up.set(...cameraState.up);
    camera.lookAt(new THREE.Vector3(...cameraState.target));
    camera.updateProjectionMatrix();
    syncRef(0, entities.userRef, delta);
    syncRef(1, entities.assistantRef, delta);
    if (playersLoaded) {
      const activePlayers = new Set(entities.players);
      for (const [entity, object] of playerRefs) {
        if (activePlayers.has(entity)) continue;
        object.userData.mixer?.stopAllAction();
        scene.remove(object);
        playerRefs.delete(entity);
      }
      entities.players.forEach((entity) => syncPlayer(entity, delta));
      playerRefs.forEach((object) => object.userData.mixer?.update(delta));
    }
    refs.forEach((object) => object?.userData.mixer?.update(delta));
    renderer.render(scene, camera);
  },
};

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();
