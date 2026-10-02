import * as THREE from 'three';
import { createModelLoader } from '../models/loader';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { disposeWeapon } from '../weapons/runtime';
import { paintLetters, type LetteringMap } from './lettering';
import type { GloveConfig } from './config';
import { paintCanvas } from '../render/surface';

export const gloveUrl = '/models/gloves/reviewer-glove.glb';

const canvas = paintCanvas;

/** One asset per view; handed lettering shares the fabric's PBR detail maps. */
export async function loadGloves() {
  const template = (await createModelLoader().loadAsync(gloveUrl)).scene;
  const root = template.getObjectByName('ReviewerGlove');
  const fabric = template.getObjectByName('GloveFabric') as THREE.SkinnedMesh;
  const material = fabric.material as THREE.MeshStandardMaterial;
  const original = material.map!;
  const mapping = JSON.parse(root!.userData.lettering) as LetteringMap;
  const size = 2048;
  const label = canvas(1024);
  label.element.height = 256;
  const appearances = [false, true].map(mirrored => {
    const color = canvas(size), emission = canvas(size);
    const colorMap = new THREE.CanvasTexture(color.element), emissionMap = new THREE.CanvasTexture(emission.element);
    for (const texture of [colorMap, emissionMap]) { texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }
    const inkMaterial = mirrored ? material.clone() : material;
    inkMaterial.map = colorMap; inkMaterial.emissiveMap = emissionMap; inkMaterial.needsUpdate = true;
    return { mirrored, color, emission, colorMap, emissionMap, material: inkMaterial };
  });
  let painted = '', config: GloveConfig;
  const glow = new THREE.Color(), pulse = new THREE.Color();
  const instances = new Map<THREE.Object3D, { material: THREE.MeshStandardMaterial; firing: boolean; glow: number }>();
  let lastTime: number | undefined;

  function drawLabel(text: string, ink: string, mirrored: boolean) {
    const ctx = label.context;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.font = '900 196px Arial, sans-serif';
    const fontSize = Math.min(196, 920 / Math.max(1, ctx.measureText(text).width) * 196);
    ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink;
    ctx.save();
    if (mirrored) { ctx.translate(1024, 0); ctx.scale(-1, 1); }
    ctx.fillText(text, 512, 140);
    ctx.restore();
  }

  function configure(next: GloveConfig) {
    config = { ...next }; glow.set(next.glowColor); pulse.set(next.pulseColor);
    const signature = JSON.stringify([next.mainText, next.altText, next.textColor]);
    if (signature === painted) return;
    painted = signature;
    for (const { mirrored, color, emission, colorMap, emissionMap } of appearances) {
      color.context.clearRect(0, 0, size, size);
      color.context.drawImage(original.image as CanvasImageSource, 0, 0, size, size);
      emission.context.fillStyle = '#000'; emission.context.fillRect(0, 0, size, size);
      for (const key of ['main', 'alt'] as const) {
        const text = next[key === 'main' ? 'mainText' : 'altText'];
        drawLabel(text, next.textColor, mirrored); paintLetters(color.context, label.element, mapping[key], size);
        drawLabel(text, '#fff', mirrored); paintLetters(emission.context, label.element, mapping[key], size);
      }
      colorMap.needsUpdate = true; emissionMap.needsUpdate = true;
    }
  }

  function release(object: THREE.Object3D) {
    object.removeFromParent(); instances.get(object)?.material.dispose(); instances.delete(object);
    const skeletons = new Set<THREE.Skeleton>();
    object.traverse(node => { if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton); });
    skeletons.forEach(skeleton => skeleton.dispose());
  }

  return {
    configure,
    create() {
      const object = clone(template); object.name = 'ReviewerHand';
      const ink = appearances[0].material.clone();
      (object.getObjectByName('GloveFabric') as THREE.SkinnedMesh).material = ink;
      instances.set(object, { material: ink, firing: false, glow: 0 });
      return object;
    },
    setHand(object: THREE.Object3D) {
      const mesh = object.getObjectByName('GloveFabric') as THREE.SkinnedMesh;
      // Correct the lettering for the final anatomical hand, including any
      // reflection inherited from the weapon's slot transform.
      (mesh.material as THREE.MeshStandardMaterial).copy(appearances[object.userData.hand === 'right' ? 1 : 0].material);
      (mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
    },
    setFiring(object: THREE.Object3D, firing: boolean) { const state = instances.get(object); if (state) state.firing = firing; },
    release,
    update(time: number, reducedMotion: boolean) {
      if (!config) return;
      const delta = lastTime === undefined ? 0 : Math.min(100, Math.max(0, time - lastTime)); lastTime = time;
      const amount = config.pulse && !reducedMotion ? .5 - .5 * Math.cos(time / (config.pulseSeconds * 1000) * Math.PI * 2) : 0;
      for (const state of instances.values()) {
        const { material } = state;
        const target = state.firing ? 1 : 0;
        state.glow = reducedMotion ? target : THREE.MathUtils.lerp(state.glow, target, 1 - Math.exp(-delta / (state.firing ? 65 : 180)));
        material.emissive.copy(glow).lerp(pulse, amount);
        material.emissiveIntensity = config.glowIntensity * (config.glow ? 1 : state.glow) * (config.pulse && !reducedMotion ? .55 + .45 * amount : 1);
      }
    },
    dispose() {
      for (const object of instances.keys()) release(object);
      release(template); disposeWeapon(template); original.dispose();
      appearances[1].colorMap.dispose(); appearances[1].emissionMap.dispose(); appearances[1].material.dispose();
      // Release the decoded GLB images, after every instance has gone away.
      for (const texture of new Set([original, material.normalMap, material.roughnessMap, material.metalnessMap, material.aoMap])) {
        if (typeof ImageBitmap !== 'undefined' && texture?.image instanceof ImageBitmap) texture.image.close();
      }
      for (const { color, emission } of appearances) color.element.width = emission.element.width = 1;
      label.element.width = 1;
    }
  };
}

export type GloveLibrary = Awaited<ReturnType<typeof loadGloves>>;

/** Use the asset's fitted socket, after framing. Global scaling affects the
 * complete assembly, with no separate glove scale or world-space offset. */
export function fitGlove(hand: THREE.Object3D, model: THREE.Object3D, normalized: THREE.Object3D, url: string, slot: number) {
  const id = url.split('/').pop()?.replace(/\.glb(?:[?#].*)?$/i, '') || '';
  const anchor = model.getObjectByName('HandAnchor') ?? model.getObjectByName('Grip');
  if (!anchor) return false;
  // The supplied source is a left glove. Account for the weapon's own mirrored
  // parent before selecting a right/left hand, including aircraft exceptions.
  const primaryRight = anchor.userData.hand !== 'left';
  const rightHand = slot === 0 ? primaryRight : !primaryRight;
  const needsMirror = rightHand !== (normalized.scale.x < 0);
  hand.scale.set(needsMirror ? -1 : 1, 1, 1);
  hand.userData.hand = rightHand ? 'right' : 'left';
  if (id === 'daz-ratatat' && slot === 1 && !anchor.userData.leftHandAdjusted) {
    // Reflect the whole fit along the A-L row. The second reflection cancels
    // the native hand reflection, keeping the palm down and the wrist outside
    // the keys. A half-turn alone would leave the opposite hand on its side.
    anchor.updateMatrix();
    const mirrored = new THREE.Matrix4().makeScale(1, 1, -1)
      .multiply(anchor.matrix).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    mirrored.decompose(anchor.position, anchor.quaternion, anchor.scale);
    anchor.userData.leftHandAdjusted = true;
  }
  anchor.add(hand);
  return true;
}
