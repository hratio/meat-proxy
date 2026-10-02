/** Browser-only asset capture stage; imported by tooling/weapons/capture-previews.mjs. */
import * as THREE from 'three';
import { createModelLoader } from '../../src/lib/models/loader';
import { defaults } from '../../src/lib/config';
import { weaponProfile } from '../../src/lib/weapons/profiles';
import { frameWeapon, lightWeaponScene, createWeaponMotion, disposeWeapon } from '../../src/lib/weapons/runtime';
const canvas=document.createElement('canvas'); document.body.append(canvas);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setSize(1200,800); renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.1;
const scene=new THREE.Scene(); lightWeaponScene(renderer,scene);
const camera=new THREE.PerspectiveCamera(35,1.5,.01,50);
for(const [color,intensity,x,y,z] of [[0xfff2e8,3.1,-2,4,-2],[0xc7d9ff,2.4,2,2,2],[0xffffff,1.2,0,1,3]]) {
 const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
}
scene.add(new THREE.HemisphereLight(0xc3cad8,0x16131a,.9));
const loader=createModelLoader();
let object: THREE.Group | undefined, motion: ReturnType<typeof createWeaponMotion> | undefined;
let root: THREE.Object3D = new THREE.Group();
async function show(id: string,view: 'hero' | 'reverse' | 'side' | 'top' | 'front'='hero') {
 if(object){scene.remove(object);disposeWeapon(object);}
 const gltf=await loader.loadAsync('/models/weapons/'+id+'.glb');root=gltf.scene;
 object=frameWeapon(root); scene.add(object);motion=createWeaponMotion(root, -1, () => weaponProfile('/models/weapons/'+id+'.glb', defaults.weapons.profiles));
 const s=root.getObjectByName('Weapon')?.userData.primaryHand==='right'?-1:1;
 const positions: Record<string, [number, number, number]>={hero:[s*2,1.25,-2.2],reverse:[-s*2,.65,1.5],side:[s*3.25,.08,0],top:[.01,3.4,.05],front:[.03,.03,-3.4]};
 camera.position.fromArray(positions[view]);camera.lookAt(0,0,0);
 await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
 return {meshes:renderer.info.render.calls,triangles:renderer.info.render.triangles};
}
function shot(charge=0) {motion?.update(1020,16,1000,true,.5,false,charge); renderer.render(scene,camera);}
import { loadGloves,fitGlove } from '../../src/lib/gloves/runtime';
import { gloveSchema } from '../../src/lib/gloves/config';
let gloveLibrary: Awaited<ReturnType<typeof loadGloves>> | undefined, fittedHand: THREE.Object3D | undefined;
async function gloves() {
 if(!gloveLibrary){gloveLibrary=await loadGloves();gloveLibrary.configure(gloveSchema.parse({}));}
 return gloveLibrary;
}
async function showGlove(view: 'back' | 'palm' | 'side'='back') {
 const library=await gloves();
 if(fittedHand){library.release(fittedHand);fittedHand=undefined;}
 if(object){scene.remove(object);disposeWeapon(object);object=undefined;}
 const hand=library.create();fittedHand=hand;root=hand;
 object=frameWeapon(hand);scene.add(object);
 const positions: Record<string, [number, number, number]>={back:[1.6,1.25,2.4],palm:[-1.7,.3,-2.4],side:[2.7,.2,-.4]};
 camera.position.fromArray(positions[view]).multiplyScalar(1.35);camera.lookAt(0,0,0);
 await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
}
async function withGlove(id: string,slot=0){
 const library=await gloves();
 if(fittedHand){library.release(fittedHand);fittedHand=undefined;}
 await show(id);
 const hand=library.create();fittedHand=hand;
 fitGlove(hand,root,object!,'/models/weapons/'+id+'.glb',slot);library.setHand(hand);
 await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
}
const review={show,shot,renderer,scene,camera,showGlove,withGlove,get root(){return root},get motion(){return motion}};
declare global { interface Window { arsenal: typeof review; } }
window.arsenal=review;
