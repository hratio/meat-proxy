import { BoxGeometry, CanvasTexture, Color, Group, InstancedMesh, Mesh, Object3D, SRGBColorSpace, type ShaderMaterial, type Texture } from 'three';
import type { LandscapeConfig } from './landscape-config';
import { garagePlacement, garageSchedule } from './driving-route';

type Surface=(color?:Color,map?:Texture|null,road?:boolean,portrait?:boolean,emission?:number)=>ShaderMaterial;

/** Roller centre on a vertical track, quarter-circle bend and overhead return. */
export function sectionalDoorPose(distance:number,height:number,radius=.65) {
  if(distance<=height)return {x:0,y:distance,angle:0};
  const angle=Math.min(Math.PI/2,(distance-height)/radius);
  return {x:radius*(1-Math.cos(angle))+Math.max(0,distance-height-radius*Math.PI/2),
    y:height+radius*Math.sin(angle),angle};
}

/** World-anchored service bay; shutters sample absolute time for reverse seeking. */
export function createDrivingGarage(surface:Surface) {
  const group=new Group();group.name='Corporate garage';
  const box=new BoxGeometry(),transform=new Object3D(),meshes:InstancedMesh[]=[],batches=new Map<ShaderMaterial,number[][]>();
  const shell=surface(new Color('#343d3d')),frame=surface(new Color('#697474')),rubber=surface(new Color('#161c1c'));
  const shutter=surface(new Color('#657170')),lamp=surface(new Color('#ced8c9'),null,false,false,.65);
  let panels:InstancedMesh|undefined,key='',settings:LandscapeConfig,panelHeight=0,doorHeight=0;
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(512,96):Object.assign(document.createElement('canvas'),{width:512,height:96});
  const ctx=canvas.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
  ctx.fillStyle='#192425';ctx.fillRect(0,0,512,96);ctx.fillStyle='#bac6bd';ctx.font='bold 31px sans-serif';ctx.fillText('SLOP CORP  /  SERVICE 07',20,57);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  const label=surface(new Color('#b7c2b7'),texture,false,false,.06);
  function add(material:ShaderMaterial,x:number,y:number,z:number,sx:number,sy:number,sz:number,angle=0){
    let list=batches.get(material);if(!list){list=[];batches.set(material,list);}list.push([x,y,z,sx,sy,sz,angle]);
  }
  function clear(){for(const mesh of meshes)mesh.dispose();meshes.length=0;batches.clear();group.clear();panels=undefined;}
  function build(world:LandscapeConfig){
    clear();const g=world.sequence.garage,w=g.width,h=g.height,d=g.depth;
    doorHeight=h-.8;
    // A hollow room: two side walls, ceiling and back wall. The route is its floor.
    for(const side of [-1,1]){
      add(shell,d/2,h/2-2,side*(w/2+.3),d,h+4,.6);
      add(frame,0,h/2,side*(w/2-.22),1.2,h,.44);
      add(rubber,d/2,.7,side*(w/2-.08),d,.22,.14);
      for(let x=4;x<d;x+=8)add(frame,x,h/2,side*(w/2-.08),.15,h,.12);
      add(frame,0,-1.8,side*(w/2+.15),1.8,3.6,1.1);
      // Steel channels guide every panel around the bend and into the ceiling.
      for(let s=.2;s<doorHeight*2+1;s+=.28){const p=sectionalDoorPose(s,doorHeight);add(frame,p.x+.12,p.y,side*(w/2-.3),.075,.31,.075,-p.angle);}
      add(lamp,-.64,doorHeight*.5,side*(w/2-.35),.04,.5,.05);
    }
    add(shell,d/2,h+.35,0,d,.55,w+1.2);add(shell,d,h/2-1,0,.6,h+2,w+1.2);
    add(frame,0,doorHeight+.45,0,1.2,.9,w+.3);
    add(rubber,0,.035,0,.3,.05,w-.8);
    add(lamp,-.63,doorHeight+.14,0,.04,.065,w-1.1);
    for(let x=6;x<d;x+=14)add(lamp,x,h-.035,0,.13,.04,w*.65);
    const count=Math.ceil(doorHeight/.34);panelHeight=doorHeight/count;
    panels=new InstancedMesh(box,shutter,count);panels.name='Sectional overhead door';panels.frustumCulled=false;group.add(panels);meshes.push(panels);
    for(const [material,items] of batches){
      const mesh=new InstancedMesh(box,material,items.length);
      items.forEach(([x,y,z,sx,sy,sz,angle],i)=>{transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(0,0,angle);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});
      mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);
    }
    const sign=new Mesh(box,label);sign.name='Garage entrance sign';sign.position.set(-.62,h-.38,0);sign.scale.set(.035,.38,3.4);group.add(sign);
  }
  return {group,
    configure(world:LandscapeConfig){
      settings=world;const s=world.sequence,g=s.garage;group.visible=s.enabled&&g.enabled;
      const next=JSON.stringify([g.width,g.height,g.depth]);
      if(group.visible&&next!==key){key=next;build(world);}
    },
    update(seconds:number,travel:number){
      if(!group.visible||!panels)return;
      const g=settings.sequence.garage,schedule=garageSchedule(settings),p=garagePlacement(settings);
      group.position.set(p.x-travel,p.y,p.z);group.rotation.y=p.heading;
      const time=Number.isFinite(seconds)?seconds*1000:settings.sequence.durationMs;
      const t=Math.max(0,Math.min(1,(time-schedule.openAtMs)/g.openDurationMs));
      const lift=t*t*(3-2*t)*(doorHeight+1.2);
      for(let i=0;i<panels.count;i++){
        const pose=sectionalDoorPose((i+.5)*panelHeight+lift,doorHeight);
        transform.position.set(pose.x,pose.y,0);transform.rotation.set(0,0,-pose.angle);transform.scale.set(.12,panelHeight-.018,g.width-.7);transform.updateMatrix();panels.setMatrixAt(i,transform.matrix);
      }
      panels.instanceMatrix.needsUpdate=true;
    },
    dispose(){clear();box.dispose();texture.dispose();}
  };
}
