import * as THREE from "https://esm.sh/three@0.180.0";
import { OBJLoader } from "https://esm.sh/three@0.180.0/examples/jsm/loaders/OBJLoader.js";

const canvas = document.querySelector("#skinned-referees");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(Math.PI / 3.2, 1, 0.1, 140);
const clock = new THREE.Clock();
scene.add(new THREE.HemisphereLight(0xdff8ff, 0x1d2a32, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(-4, 8, 6);
scene.add(keyLight);
const refs = [];
let baseTemplate = null;
let loaded = false;

function materialize() {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
  });
}

const textureLoader = new THREE.TextureLoader();
const refereeTexture = textureLoader.load("assets/referee-model/texture_diffuse.png");
refereeTexture.colorSpace = THREE.SRGBColorSpace;
refereeTexture.flipY = false;

new OBJLoader().load(
  "assets/referee-model/base.obj",
  (object) => {
    baseTemplate = object;
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial({
        map: refereeTexture,
        roughness: 0.82,
        metalness: 0,
        transparent: false,
        side: THREE.DoubleSide,
      });
      child.castShadow = false;
      child.receiveShadow = false;
    });
    materialize();
    loaded = true;
    window.skinnedReferees.ready = true;
  },
  undefined,
  (error) => console.error("Impossible de charger le modèle 3D de l'arbitre :", error),
);

function makeRef(index) {
  if (!baseTemplate) return null;
  const object = baseTemplate.clone(true);
  object.userData.refIndex = index;
  scene.add(object);
  refs[index] = object;
  return object;
}

function syncRef(index, entity, assistant = false) {
  if (!loaded) return false;
  let object = refs[index];
  if (!object) object = makeRef(index);
  if (!object) return false;

  object.position.set(
    (entity.x - 700) * 0.05,
    0,
    (entity.y - 360) * 0.05,
  );
  object.rotation.y = (entity.yaw || 0) - Math.PI / 2;

  const speed = Math.hypot(entity.vx || 0, entity.vy || 0);
  const skating = Math.min(1, speed / 90);
  const phase = performance.now() * 0.008 * (0.7 + skating) + object.userData.refIndex * Math.PI;
  object.position.y = skating > 0.05 ? Math.abs(Math.sin(phase * 2)) * 0.025 : 0;
  object.rotation.z = Math.sin(phase) * 0.025 * skating;
  object.visible = true;
  return true;
}

window.skinnedReferees = {
  ready: false,
  getState() {
    return {
      loaded,
      refs: refs.map((object) => object ? {
        position: object.position.toArray(),
        scale: object.scale.toArray(),
        rotation: object.rotation.toArray(),
        visible: object.visible,
        box: (() => {
          object.updateWorldMatrix(true, true);
          const box = new THREE.Box3().setFromObject(object);
          return { min: box.min.toArray(), max: box.max.toArray() };
        })(),
      } : null),
      sceneChildren: scene.children.length,
    };
  },
  sync(cameraState, entities) {
    if (!loaded) return;
    camera.position.set(...cameraState.eye);
    camera.lookAt(new THREE.Vector3(...cameraState.target));
    camera.up.set(...cameraState.up);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    syncRef(0, entities.userRef, false);
    syncRef(1, entities.assistantRef, true);
  },
};

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  canvas.width = width * renderer.getPixelRatio();
  canvas.height = height * renderer.getPixelRatio();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop(() => {
  if (!loaded) return;
  const delta = Math.min(clock.getDelta(), 0.05);
  void delta;
  renderer.render(scene, camera);
});
