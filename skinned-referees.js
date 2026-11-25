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
let playerMaterials = [];
let playersLoaded = false;
const refereeHeight = 1.6;
const playerHeight = 1.72;
const playerModelYawOffset = 0;
const animationFadeSpeed = 12;
const playerBoneNames = {
  hips: "mixamorigHips",
  spine: "mixamorigSpine",
  chest: "mixamorigSpine2",
  leftThigh: "mixamorigLeftUpLeg",
  leftShin: "mixamorigLeftLeg",
  leftFoot: "mixamorigLeftFoot",
  rightThigh: "mixamorigRightUpLeg",
  rightShin: "mixamorigRightLeg",
  rightFoot: "mixamorigRightFoot",
  leftArm: "mixamorigLeftArm",
  leftForearm: "mixamorigLeftForeArm",
  rightArm: "mixamorigRightArm",
  rightForearm: "mixamorigRightForeArm",
};
const poseEuler = new THREE.Euler();
const poseQuaternion = new THREE.Quaternion();

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
    const positionAlpha = 1 - Math.exp(-26 * delta);
    object.position.x += (targetX - object.position.x) * positionAlpha;
    object.position.z += (targetZ - object.position.z) * positionAlpha;
    const yawDelta = Math.atan2(
      Math.sin(targetYaw - object.rotation.y),
      Math.cos(targetYaw - object.rotation.y),
    );
    object.rotation.y += yawDelta * (1 - Math.exp(-26 * delta));
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
  const playerIndex = (entity.team || 0) * 6 + (entity.number || 1) - 1;
  object.traverse((child) => {
    if (child.isMesh) child.material = playerMaterials[entity.team === 0 ? 0 : 1];
  });
  object.userData.playerBones = Object.fromEntries(
    Object.entries(playerBoneNames)
      .map(([key, name]) => [key, object.getObjectByName(name)])
      .filter(([, bone]) => bone)
      .map(([key, bone]) => [key, { bone, restQuaternion: bone.quaternion.clone() }]),
  );
  object.userData.animationWeight = 0;
  object.userData.animationPhase = ((playerIndex % 12) / 12) * Math.PI * 2;
  object.userData.animationSpeedFactor = 0.93 + (playerIndex % 5) * 0.035;
  object.userData.lastMovementYaw = null;
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.014;
  shadow.scale.set(0.82, 0.5, 1);
  scene.add(shadow);
  object.userData.shadow = shadow;
  scene.add(object);
  playerRefs.set(entity, object);
  return object;
}

function setPlayerBoneRotation(object, key, x, y, z) {
  const poseBone = object.userData.playerBones[key];
  if (!poseBone) return;
  poseEuler.set(x, y, z);
  poseQuaternion.setFromEuler(poseEuler);
  poseBone.bone.quaternion.copy(poseBone.restQuaternion).multiply(poseQuaternion);
}

function animatePlayer(object, delta, speed, topSpeed, turnRate) {
  const moving = speed > 3;
  const turnIntensity = Math.min(1, Math.max(0, (Math.abs(turnRate) - 0.35) / 1.8));
  const sprintIntensity = Math.min(1, Math.max(0, (speed / topSpeed - 0.72) / 0.28));
  const targetWeight = moving
    ? Math.min(1, 0.62 + turnIntensity * 0.2 + sprintIntensity * 0.18)
    : 0;
  const blend = 1 - Math.exp(-animationFadeSpeed * delta);
  const weight = object.userData.animationWeight
    + (targetWeight - object.userData.animationWeight) * blend;
  object.userData.animationWeight = weight;

  if (!moving && weight < 0.01) {
    object.userData.animationWeight = 0;
    object.userData.shadow.position.y = -0.014;
    object.position.y = 0;
    for (const { bone, restQuaternion } of Object.values(object.userData.playerBones)) {
      bone.quaternion.copy(restQuaternion);
    }
    return;
  }

  const speedRatio = Math.min(1, speed / topSpeed);
  const phase = object.userData.animationPhase;
  const leftStride = Math.sin(phase);
  const rightStride = Math.sin(phase + Math.PI);
  const leftPush = Math.max(0, Math.cos(phase));
  const rightPush = Math.max(0, Math.cos(phase + Math.PI));
  const leftRecovery = Math.max(0, -leftStride);
  const rightRecovery = Math.max(0, -rightStride);
  const stride = weight * (0.9 + sprintIntensity * 0.25);
  const turnLean = Math.max(-1, Math.min(1, turnRate * 0.16)) * weight;
  const crouch = (0.09 + sprintIntensity * 0.13) * weight;

  setPlayerBoneRotation(object, "hips", turnLean * 0.42, Math.sin(phase) * 0.035 * stride, -crouch);
  setPlayerBoneRotation(object, "spine", -turnLean * 0.2, -Math.sin(phase) * 0.025 * stride, crouch * 0.38);
  setPlayerBoneRotation(object, "chest", -turnLean * 0.3, Math.sin(phase) * 0.04 * stride, crouch * 0.2);
  setPlayerBoneRotation(
    object, "leftThigh",
    leftPush * 0.24 * stride,
    0,
    -leftStride * 0.34 * stride,
  );
  setPlayerBoneRotation(
    object, "leftShin",
    0,
    0,
    leftRecovery * 0.62 * stride,
  );
  setPlayerBoneRotation(
    object, "leftFoot",
    -leftRecovery * 0.1 * stride,
    0,
    leftStride * 0.2 * stride - leftRecovery * 0.16 * stride,
  );
  setPlayerBoneRotation(
    object, "rightThigh",
    -rightPush * 0.24 * stride,
    0,
    -rightStride * 0.34 * stride,
  );
  setPlayerBoneRotation(
    object, "rightShin",
    0,
    0,
    rightRecovery * 0.62 * stride,
  );
  setPlayerBoneRotation(
    object, "rightFoot",
    rightRecovery * 0.1 * stride,
    0,
    rightStride * 0.2 * stride - rightRecovery * 0.16 * stride,
  );
  setPlayerBoneRotation(object, "leftArm", -rightStride * 0.15 * stride, 0, rightStride * 0.16 * stride);
  setPlayerBoneRotation(object, "leftForearm", 0, 0, 0.1 * stride + leftPush * 0.09 * stride);
  setPlayerBoneRotation(object, "rightArm", -leftStride * 0.15 * stride, 0, leftStride * 0.16 * stride);
  setPlayerBoneRotation(object, "rightForearm", 0, 0, 0.1 * stride + rightPush * 0.09 * stride);

  object.position.y = Math.abs(Math.sin(phase * 2)) * 0.018 * weight;
  object.userData.shadow.position.y = -0.014;
  object.userData.animationPhase = (
    phase + delta * (2.2 + speedRatio * 3.2) * object.userData.animationSpeedFactor
  ) % (Math.PI * 2);
}

function syncPlayer(entity, delta) {
  let object = playerRefs.get(entity);
  if (!object) object = makePlayer(entity);

  const targetX = (entity.x - 700) * 0.05;
  const targetZ = (entity.y - 360) * 0.05;
  const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
  const movementYaw = speed > 3 ? Math.atan2(entity.vx, entity.vy) : entity.yaw ?? 0;
  const targetYaw = movementYaw + playerModelYawOffset;
  const previousMovementYaw = object.userData.lastMovementYaw;
  const turnRate = speed > 3 && previousMovementYaw !== null && delta > 0
    ? Math.atan2(
      Math.sin(movementYaw - previousMovementYaw),
      Math.cos(movementYaw - previousMovementYaw),
    ) / delta
    : 0;
  object.userData.lastMovementYaw = speed > 3 ? movementYaw : null;
  if (!object.userData.hasSynced) {
    object.position.set(targetX, object.position.y, targetZ);
    object.rotation.y = targetYaw;
    object.userData.hasSynced = true;
  } else {
    const positionAlpha = 1 - Math.exp(-30 * delta);
    object.position.x += (targetX - object.position.x) * positionAlpha;
    object.position.z += (targetZ - object.position.z) * positionAlpha;
    const yawDelta = Math.atan2(
      Math.sin(targetYaw - object.rotation.y),
      Math.cos(targetYaw - object.rotation.y),
    );
    object.rotation.y += yawDelta * (1 - Math.exp(-30 * delta));
  }
  object.visible = true;

  object.userData.shadow.position.set(object.position.x, -0.014, object.position.z);
  animatePlayer(object, delta, speed, entity.speed || 120, turnRate);
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
        scene.remove(object);
        scene.remove(object.userData.shadow);
        playerRefs.delete(entity);
      }
      entities.players.forEach((entity) => syncPlayer(entity, delta));
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
