import * as THREE from "https://esm.sh/three@0.180.0";
import { FBXLoader } from "https://esm.sh/three@0.180.0/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkinnedObject } from "https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js";

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
let template = null;
let clip = null;
let loaded = false;

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
    const normalizedScale = 1.2 / size.y;
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

function makeRef(index) {
  if (!template) return null;
  const object = cloneSkinnedObject(template);
  const mixer = clip ? new THREE.AnimationMixer(object) : null;
  const action = mixer ? mixer.clipAction(clip) : null;
  if (action) {
    action.reset();
    action.setEffectiveTimeScale(1);
    action.play();
  }
  object.userData.mixer = mixer;
  object.userData.action = action;
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
    if (moving) {
      action.paused = false;
      action.setEffectiveTimeScale(0.55 + Math.min(1, speed / 142) * 0.35);
    } else if (!action.paused) {
      action.paused = true;
    }
  }
  return true;
}

window.skinnedReferees = {
  ready: false,
  sync(cameraState, entities) {
    if (!loaded) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    camera.position.set(...cameraState.eye);
    camera.up.set(...cameraState.up);
    camera.lookAt(new THREE.Vector3(...cameraState.target));
    camera.updateProjectionMatrix();
    syncRef(0, entities.userRef, delta);
    syncRef(1, entities.assistantRef, delta);
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
