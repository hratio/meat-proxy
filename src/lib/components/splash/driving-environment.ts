import { BoxGeometry, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, Object3D, SRGBColorSpace, Vector3, type ShaderMaterial, type Texture } from 'three';
import type { LandscapeConfig } from './landscape-config';
import { bankStreetDistance, bankStreetSpacing, nearBankCoast, nearBankHeight, routeCenter, routeLayout, routeDistrictCenter, routePoint, bridgeGrade, garageSchedule, type RoutePoint } from './driving-route';
import { createShoreProfile } from './shoreline-math';
import { seededRandom } from './landscape-math';

type Surface=(color?:Color,map?:Texture|null,road?:boolean,portrait?:boolean,emission?:number)=>ShaderMaterial;
/** Procedural civil set: continuous deck, graded approaches, piers and roadside furniture. */
export function createDrivingEnvironment(surface:Surface) {
  const group=new Group(),road=new Group(),bank=new Group(),reflection=new Group();group.name='River district';road.name='Road and bridge';bank.name='Near riverbank';reflection.name='Road and bridge reflections';group.add(bank,road,reflection);
  const asphalt=surface(new Color('#303738'),null,true),concrete=surface(new Color('#777f7c')),
    metal=surface(new Color('#526064')),earth=surface(new Color('#394744')),paint=surface(new Color('#b8b9a6')),
    lamp=surface(new Color('#e0cf9d'),null,false,false,1.9),rubber=surface(new Color('#161d20')),
    paving=surface(new Color('#424c4c'));
  const boxShape=new BoxGeometry(),geometries:BufferGeometry[]=[],meshes:InstancedMesh[]=[],lamps:Vector3[]=[];
  const batches=new Map<ShaderMaterial,Matrix4[]>(),transform=new Object3D();
  let key='';
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(512,256):Object.assign(document.createElement('canvas'),{width:512,height:256});
  const context=canvas.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
  context.fillStyle='#17272c';context.fillRect(0,0,512,256);context.strokeStyle='#a7b7ad';context.lineWidth=5;context.strokeRect(12,12,488,232);
  context.fillStyle='#d1d4bb';context.font='bold 42px sans-serif';context.fillText('CENTRAL',36,76);context.fillText('DISTRICT',36,131);context.font='30px sans-serif';context.fillText('NORTH QUAY   ↗',36,209);
  const signTexture=new CanvasTexture(canvas);signTexture.colorSpace=SRGBColorSpace;
  const signMaterial=surface(new Color('white'),signTexture,false,false,.035);
  function box(material:ShaderMaterial,position:[number,number,number],size:[number,number,number],heading=0,pitch=0){
    transform.position.fromArray(position);transform.scale.fromArray(size);transform.rotation.set(0,heading,pitch,'YXZ');transform.updateMatrix();
    let batch=batches.get(material);if(!batch){batch=[];batches.set(material,batch);}batch.push(transform.matrix.clone());
  }
  function relative(material:ShaderMaterial,p:RoutePoint,local:[number,number,number],size:[number,number,number]){box(material,routePoint(local,p),size,p.heading,p.pitch);}
  function ribbon(name:string,points:{point:RoutePoint;distance:number}[],width:number,thickness:number,material:ShaderMaterial,offset=0,drop=0){
    const positions:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let i=0;i<points.length;i++){
      const {point:p,distance}=points[i];
      for(const [side,dy] of [[-1,0],[1,0],[-1,-thickness],[1,-thickness]]){
        positions.push(...routePoint([0,dy+drop,offset+side*width/2],p));uv.push(distance,side*width/2);
      }
      if(i){const a=(i-1)*4,b=i*4;indices.push(a,a+1,b+1,a,b+1,b,a+2,b+2,b+3,a+2,b+3,a+3,a,b,b+2,a,b+2,a+2,a+1,a+3,b+3,a+1,b+3,b+1);}
    }
    const shape=new BufferGeometry();shape.setAttribute('position',new Float32BufferAttribute(positions,3));shape.setAttribute('uv',new Float32BufferAttribute(uv,2));shape.setIndex(indices);shape.computeVertexNormals();geometries.push(shape);
    const mesh=new Mesh(shape,material);mesh.name=name;road.add(mesh);return mesh;
  }
  function streetLamp(p:RoutePoint,side:number,width:number){
    // Street masts remain vertical even where the deck is graded.
    p={...p,pitch:0};
    const edge=side*(width/2+.6);
    relative(concrete,p,[0,.13,edge],[.46,.26,.46]);relative(metal,{...p,pitch:0},[0,3.7,edge],[.16,7.4,.16]);
    relative(metal,p,[0,7.35,edge-side*.8],[.13,.13,1.65]);relative(metal,p,[0,7.25,edge-side*1.6],[.52,.15,.9]);
    relative(lamp,p,[0,7.16,edge-side*1.6],[.42,.045,.7]);lamps.push(new Vector3(...routePoint([0,7.05,edge-side*1.6],p)));
  }
  function clear(){reflection.traverse(item=>{if(item instanceof InstancedMesh)item.dispose();});reflection.clear();for(const shape of geometries)shape.dispose();geometries.length=0;for(const mesh of meshes)mesh.dispose();meshes.length=0;road.clear();bank.clear();batches.clear();lamps.length=0;}
  function build(world:LandscapeConfig){
    clear();const s=world.sequence,layout=routeLayout(world),{dir,junction,radius,roadZ,base,span}=layout;
    const garageStart=s.garage.enabled?garageSchedule(world).distance:Infinity;
    const inGarage=(distance:number)=>distance>=garageStart-2&&distance<=garageStart+s.garage.depth+2;
    const junctionX=layout.start+dir*junction,width=s.roadWidth,half=width/2;
    const center=routeDistrictCenter(world);
    const straight=(x:number):RoutePoint=>{const g=bridgeGrade((x-layout.start)*dir,world);return{x,y:g.y,z:roadZ,heading:0,pitch:Math.atan(g.slope*dir)};};
    const main=Array.from({length:801},(_,i)=>({point:straight(center-4000+i*10),distance:center-4000+i*10}));
    ribbon('Coastal road pavement',main,width,.35,asphalt);
    const streets=Array.from({length:21},(_,i)=>center+(i-10)*bankStreetSpacing);
    for(const side of [-1,1]){
      ribbon('Road sidewalk',main,s.shoulder,.22,concrete,side*(half+s.shoulder/2),.1);
      // Leave the water-side barrier open at the bridge junction.
      let spans=s.bridge&&side===-1?[[center-4000,Math.min(junctionX,junctionX+dir*radius)-12],[Math.max(junctionX,junctionX+dir*radius)+12,center+4000]]:[[center-4000,center+4000]];
      if(s.bank&&side===1){
        const cuts=[center-4000,...streets.flatMap(x=>[x-5,x+5]),center+4000];
        spans=Array.from({length:cuts.length/2},(_,i)=>cuts.slice(i*2,i*2+2));
      }
      for(const [from,to] of spans){
        const steps=Math.max(1,Math.ceil((to-from)/10));
        const points=Array.from({length:steps+1},(_,i)=>{const x=from+(to-from)*i/steps;return{point:straight(x),distance:x};});
        ribbon('Road guardrail',points,.12,.19,metal,side*(half+s.shoulder-.1),.72);
      }
    }
    for(let x=center-1800,i=0;x<=center+1800;x+=6,i++){
      for(const side of [-1,1]){
        if(s.bridge&&side===-1&&x>Math.min(junctionX,junctionX+dir*radius)-12&&x<Math.max(junctionX,junctionX+dir*radius)+12)continue;
        if(s.bank&&side===1&&bankStreetDistance(x,world)<5)continue;
        box(metal,[x,straight(x).y+.38,roadZ+side*(half+s.shoulder-.1)],[.09,.75,.09]);
        if(i%3===0)box(paint,[x,straight(x).y+.76,roadZ+side*(half+s.shoulder-.16)],[.09,.13,.03]);
      }
    }
    for(let x=center-1600;x<=center+1600;x+=s.lampSpacing)streetLamp(straight(x),1,width+s.shoulder);
    if(s.bank){
      const positions:number[]=[],uv:number[]=[],indices:number[]=[],depths=[-15,-5,0,5,15,35,80,160,350,700,1800,6000];
      for(let i=0;i<=360;i++){
        const x=center-3600+i*20,coast=nearBankCoast(x,world);
        for(const d of depths){positions.push(x,nearBankHeight(x,coast+d,world),coast+d);uv.push(x,coast+d);}
        if(i<360)for(let j=0;j<depths.length-1;j++){const a=i*depths.length+j,b=a+depths.length;indices.push(a,b+1,b,a,a+1,b+1);}
      }
      const shape=new BufferGeometry();shape.setAttribute('position',new Float32BufferAttribute(positions,3));shape.setAttribute('uv',new Float32BufferAttribute(uv,2));shape.setIndex(indices);shape.computeVertexNormals();geometries.push(shape);const land=new Mesh(shape,earth);land.name='Populated near bank';bank.add(land);
      // A working frontage: paved service courts and cross streets share the
      // building generator's street grid, with joints, drains and low kerbs.
      const paved:number[]=[],pavedUv:number[]=[],pavedIndices:number[]=[];
      function patch(x0:number,x1:number,z0:number,z1:number){
        const start=paved.length/3;
        for(const [x,z] of [[x0,z0],[x0,z1],[x1,z1],[x1,z0]]){paved.push(x,nearBankHeight(x,z,world)+.04,z);pavedUv.push(x,z);}
        pavedIndices.push(start,start+1,start+2,start,start+2,start+3);
      }
      const front=roadZ+half+s.shoulder+.1,back=roadZ+39;
      for(let x=center-1600;x<center+1600;x+=20){
        patch(x,x+20,front,back);
        if(bankStreetDistance(x,world)>12){
          const y=nearBankHeight(x,back,world);
          box(concrete,[x+9.7,y+.12,back],[19.4,.24,.34]);
          box(rubber,[x+5,nearBankHeight(x+5,front+1,world)+.055,front+1],[1.1,.03,.35]);
          for(let j=0;j<5;j++)box(metal,[x+4.6+j*.2,nearBankHeight(x+5,front+1,world)+.074,front+1],[.04,.025,.33]);
        }
      }
      for(const x of streets){
        for(let z=front;z<roadZ+240;z+=20)patch(x-4,x+4,z,z+20);
        const entry=straight(x);box(paint,[x,base+.045,front+1.2],[5.6,.035,.22]);
        for(const side of [-1,1])box(metal,[x+side*5,base+.45,front+3],[.16,.9,.16]);
        for(const side of [-1,1]){
          const px=x+side*14,pz=roadZ+26,py=nearBankHeight(px,pz,world);
          box(paint,[px,py+.065,pz],[.11,.025,5]);
          box(paint,[px+side*2.5,py+.065,pz],[5,.025,.11]);
        }
        streetLamp({...entry,z:back-3,y:nearBankHeight(x,back-3,world)},1,10);
      }
      const pavingShape=new BufferGeometry();pavingShape.setAttribute('position',new Float32BufferAttribute(paved,3));pavingShape.setAttribute('uv',new Float32BufferAttribute(pavedUv,2));pavingShape.setIndex(pavedIndices);pavingShape.computeVertexNormals();geometries.push(pavingShape);
      const apron=new Mesh(pavingShape,paving);apron.name='Service courts and access streets';bank.add(apron);
      for(let x=center-1500;x<=center+1500;x+=20){const z=nearBankCoast(x,world);box(concrete,[x,base-.9,z+1],[20,1.8,2]);}
      const random=seededRandom(world.seed^0x35bb);
      for(let i=0;i<70;i++){
        const x=center-1100+random()*2200,z=roadZ+half+s.shoulder+4+random()*7;
        box(concrete,[x,base+.25,z],[1.1,.5,.85]);box(metal,[x,base+.72,z],[.8,.9,.65]);
        if(i%3===0){box(metal,[x+1.8,base+.8,z],[.15,1.6,.15]);box(paint,[x+1.8,base+1.2,z],[.18,.15,.18]);}
      }
    }
    if(s.bridge){
      const deckWidth=width+s.shoulder*2;
      const bridge=Array.from({length:Math.ceil(span/3)+1},(_,i)=>{const d=junction+3+i/Math.ceil(span/3)*(span-3);return{point:routeCenter(d,world),distance:d};});
      ribbon('Bridge roadway',bridge,deckWidth,.32,asphalt,0,.018);
      ribbon('Continuous box girder',bridge,deckWidth+.3,1.65,concrete,0,-.32);
      for(const side of [-1,1]){
        const raised=bridge.filter(p=>p.distance>junction+28&&p.distance<garageStart-1);
        ribbon('Highway barrier base',raised,.58,.35,concrete,side*(deckWidth/2-.12),.33);
        ribbon('Highway barrier upper',raised,.25,.55,concrete,side*(deckWidth/2-.12),.88);
        ribbon('Barrier steel cap',raised,.28,.05,metal,side*(deckWidth/2-.12),.93);
        ribbon('Girder edge beam',bridge,.24,1.25,concrete,side*(deckWidth/2+.1),-.3);
      }
      const profile=createShoreProfile(world.seed,world.docks);
      for(let d=32;d<span&&junction+d<garageStart-1;d+=12){const p=routeCenter(junction+d,world);for(const side of [-1,1])relative(paint,p,[0,.75,side*(deckWidth/2-.28)],[.15,.09,.035]);}
      for(let d=34,i=0;d<span;d+=s.lampSpacing,i++)if(!inGarage(junction+d))streetLamp(routeCenter(junction+d,world),i%2?-1:1,deckWidth+.7);
      for(let d=48;d<span-50;d+=42){
        const p=routeCenter(junction+d,world);
        if(p.z>=nearBankCoast(p.x,world)-2||p.z<=profile.coast(p.x)+4)continue;
        const bottom=world.water.waterLevel-6,height=p.y-1.35-bottom;
        for(const side of [-1,1]){const at=routePoint([0,0,side*deckWidth*.27],{...p,pitch:0});box(concrete,[at[0],bottom+height/2,at[2]],[1.4,height,1.8],p.heading);}
        box(concrete,[p.x,p.y-1.75,p.z],[2.8,.7,deckWidth+.2],p.heading);
        box(rubber,[p.x,world.water.waterLevel+.3,p.z],[3.2,.7,3.5],p.heading);
      }
      for(let d=40;d<span;d+=42){const p=routeCenter(junction+d,world);relative(rubber,p,[0,.03,0],[.065,.025,width]);}
      // Continue onto a reserved city street, following the land rather than
      // leaving the car on a floating bridge-height plane beyond the landing.
      const street=Array.from({length:301},(_,i)=>{const d=junction+span+i*4;return{point:routeCenter(d,world),distance:d};});
      ribbon('City approach street',street,width,.3,asphalt,0,.018);
      for(const side of [-1,1]){
        ribbon('City approach sidewalk',street,s.shoulder,.24,concrete,side*(half+s.shoulder/2),.13);
        for(let d=12;d<1200;d+=s.lampSpacing*2)if(!inGarage(junction+span+d))streetLamp(routeCenter(junction+span+d,world),side,width+s.shoulder);
      }
      for(let d=0;d<1200;d+=10){
        const p=routeCenter(junction+span+d,world);
        relative(paint,p,[0,.04,0],[4,.02,.1]);
        for(const side of [-1,1])relative(rubber,p,[0,.025,side*(half-.25)],[.65,.035,.28]);
      }
      // Low splitter island and chevrons keep the branch legible from the car.
      const island=straight(junctionX+dir*42);relative(concrete,island,[0,.15,-half-1],[10,.3,1.1]);
      for(const dx of [-3,0,3])relative(paint,island,[dx,.35,-half-1],[.35,.18,.9]);
      const sign=straight(junctionX-dir*22);relative(metal,sign,[0,2.5,half+s.shoulder+1],[.16,5,.16]);
      const plaque=new Mesh(new BoxGeometry(.05,1.25,2.5),[metal,signMaterial,metal,metal,metal,metal]);geometries.push(plaque.geometry);
      plaque.position.fromArray(routePoint([0,4.3,half+s.shoulder+1],sign));plaque.rotation.y=dir>0?0:Math.PI;plaque.name='Bridge direction sign';road.add(plaque);
    }
    for(const [material,matrices] of batches){const mesh=new InstancedMesh(boxShape,material,matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();mesh.name='Instanced road furniture';road.add(mesh);meshes.push(mesh);}
    const mirrored=road.clone(true);mirrored.visible=true;reflection.add(mirrored);reflection.scale.y=-1;
  }
  return {group,lamps,
    configure(world:LandscapeConfig){group.visible=world.sequence.enabled;road.visible=world.sequence.road;bank.visible=world.sequence.bank;
      const s=world.sequence,next=JSON.stringify([s.enabled,s.bank,s.bridge,s.junctionAtMs,s.durationMs,s.travelMode,s.startX,s.speedKph,s.continueDriving,s.turnRadius,s.bridgeRise,s.bridgeApproach,s.roadWidth,s.shoulder,s.lampSpacing,s.garage.enabled,s.garage.enabled?garageSchedule(world).distance:0,s.garage.depth,world.camera,world.speed,world.water.waterLevel,world.seed,world.docks]);
      const rebuilt=s.enabled&&key!==next;
      if(rebuilt){key=next;build(world);}lamp.uniforms.emission.value=1.9*s.roadLights;lamp.uniforms.baseColor.value.set(s.roadLightColor);
      reflection.visible=s.road&&world.water.reflectionEnabled&&world.water.reflectionDetail==='full';reflection.position.y=world.water.waterLevel*2;
      return rebuilt;
    },
    update(travel:number){group.position.x=-travel;},
    dispose(){clear();boxShape.dispose();signTexture.dispose();group.clear();}
  };
}
