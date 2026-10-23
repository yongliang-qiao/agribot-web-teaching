import {armForward} from './advanced_sim.mjs';
/** Self-contained strawberry harvesting scene. Uses only geometrically-defined illustrative plant models. */
export function makeHarvestRenderer(T,root,mission){
 const w=root.clientWidth||960,h=Math.max(350,root.clientHeight||510),world=new T.Scene();world.background=new T.Color(0xbad6d1);
 const gl=new T.WebGLRenderer({antialias:true});gl.setPixelRatio(Math.min(2,window.devicePixelRatio||1));gl.setSize(w,h);gl.outputColorSpace=T.SRGBColorSpace;gl.shadowMap.enabled=true;root.append(gl.domElement);
 const cam=new T.PerspectiveCamera(44,w/h,.08,30);let azimuth=-.82,alt=.34,dist=3.5;
 function updateCamera(){cam.position.set(Math.sin(azimuth)*dist,1.15+Math.sin(alt)*dist,1.2+Math.cos(azimuth)*dist);cam.lookAt(0,1.13,.24)}updateCamera();
 world.add(new T.HemisphereLight(0xffffff,0x687867,2));const sun=new T.DirectionalLight(0xffecd4,2);sun.position.set(-2,6,4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);world.add(sun);
 const mat=(c,roughness=.7)=>new T.MeshStandardMaterial({color:c,roughness,side:T.DoubleSide});const leaf=mat(0x37874a),leafAlt=mat(0x4ca454),vein=mat(0x8ec17b),soil=mat(0x765845),wood=mat(0xa97b51),steel=mat(0x617c8b,.34),orange=mat(0xe9b54b,.45),rubber=mat(0x252b2c),red=mat(0xc72f2a,.5),unripe=mat(0xc6df83),seedMat=mat(0xffd46b),berryStem=mat(0x3c7540);
 function box(p,w,h,d,x,y,z,m){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);p.add(o);return o}
 function ball(p,r,x,y,z,m){const o=new T.Mesh(new T.SphereGeometry(r,12,9),m);o.position.set(x,y,z);p.add(o);return o}
 function link(p,a,b,r,m){const A=new T.Vector3(...a),B=new T.Vector3(...b),delta=B.clone().sub(A);const obj=new T.Mesh(new T.CylinderGeometry(r,r,delta.length(),10),m);obj.position.copy(A).addScaledVector(delta,.5);obj.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());p.add(obj);return obj}
 // Soil, raised bed and safety lab objects.
 box(world,5,.12,4,0,-.08,.25,soil);box(world,1.55,.42,1.0,0,.69,.63,wood);box(world,1.45,.06,.93,0,.94,.63,soil);
 for(let i=-5;i<=5;i++)box(world,1.42,.022,.012,0,.96,.20+i*.085,mat(0x947348));
 const robot=new T.Group();world.add(robot);
 box(robot,.78,.19,1.02,0,.43,-.65,steel);box(robot,.60,.35,.5,0,.68,-.82,orange);box(robot,.40,.25,.35,0,.73,-.28,steel);
 for(const sx of [-.45,.45])for(const sz of [-1.00,-.31]){const tire=new T.Mesh(new T.CylinderGeometry(.22,.22,.14,24),rubber);tire.rotation.z=Math.PI/2;tire.position.set(sx,.29,sz);robot.add(tire);const hub=ball(robot,.07,sx,.29,sz,steel)}
 const cameraBody=box(robot,.18,.12,.12,0,1.58,-.22,rubber);link(robot,[0,1.35,-.22],[0,1.56,-.22],.022,steel);ball(robot,.042,0,1.58,-.15,mat(0x2c7ea9));
 // Visualization of strawberry crowns and three leaflets per petiole. Not scanned plants.
 for(let i=0;i<8;i++){const stemX=-.46+(i%4)*.3,stemZ=.31+Math.floor(i/4)*.42;
  for(let k=0;k<5;k++){const angle=k*2*Math.PI/5+i*.4,b=[stemX+.09*Math.cos(angle),1.0+(.07+.025*(k%2)),stemZ+.10*Math.sin(angle)];link(world,[stemX,.98,stemZ],b,.009,berryStem);
   const l=new T.Mesh(new T.SphereGeometry(.095,8,5),k%2?leaf:leafAlt);l.scale.set(1,.16,.53);l.rotation.y=angle;l.position.set(b[0],b[1],b[2]);world.add(l);
  }
 }
 const berries=new Map();const makeBerry=f=>{
  const group=new T.Group();group.position.set(f.x,f.y,f.z);world.add(group);
  const fruit=new T.Mesh(new T.SphereGeometry(.046,16,12),f.ripe?red:unripe);fruit.scale.set(1,.90,.82);group.add(fruit);
  for(let j=0;j<17;j++){const a=j*2.39996,y=.044*(j/17*1.72-.86),r=.046*Math.sqrt(Math.max(0,1-(y/.048)**2));const z=Math.sin(a)*r,x=Math.cos(a)*r;ball(group,.003,x,y,z,seedMat)}
  link(group,[0,.044,0],[0,.10,0],.005,berryStem);
  for(let j=0;j<5;j++){const a=j*2*Math.PI/5;const l=new T.Mesh(new T.ConeGeometry(.024,.09,3),leaf);l.rotation.x=Math.PI/2;l.rotation.z=a;l.position.set(.014*Math.sin(a),.052,.014*Math.cos(a));group.add(l)}
  berries.set(f.id,group);
 };mission.fruits.forEach(makeBerry);
 // Work tray and an open collection crate.
 box(world,.52,.10,.44,-.45,.67,.32,mat(0x6e8798));box(world,.5,.02,.05,-.45,.76,.09,steel);box(world,.5,.02,.05,-.45,.76,.55,steel);
 const armLinks=new T.Group();world.add(armLinks);const fingers=new T.Group();world.add(fingers);
 const linkGeom=new T.CylinderGeometry(1,1,1,12),jointGeom=new T.SphereGeometry(1,12,9);
 const upperArm=new T.Mesh(linkGeom,orange),foreArm=new T.Mesh(linkGeom,steel);armLinks.add(upperArm,foreArm);
 const joints=[new T.Mesh(jointGeom,steel),new T.Mesh(jointGeom,steel),new T.Mesh(jointGeom,rubber)];joints.forEach(j=>armLinks.add(j));
 const fingerObjs=[new T.Mesh(new T.BoxGeometry(.022,.085,.04),steel),new T.Mesh(new T.BoxGeometry(.022,.085,.04),steel)];fingerObjs.forEach(o=>fingers.add(o));
 const track=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xf4d55e}));world.add(track);
 const setLink=(mesh,a,b,r)=>{const A=new T.Vector3(...a),B=new T.Vector3(...b),delta=B.sub(A);mesh.position.copy(A).addScaledVector(delta,.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());mesh.scale.set(r,delta.length(),r)};
 function pose(q,grip){
   const [yaw,shoulder]=q,B=[0,1.14,0],reach=.55*Math.cos(shoulder),E=[Math.sin(yaw)*reach,1.14+.55*Math.sin(shoulder),Math.cos(yaw)*reach],P=armForward(q),tip=[P.x,P.y,P.z];
   setLink(upperArm,B,E,.065);setLink(foreArm,E,tip,.043);
   for(const [i,pos] of [B,E,tip].entries()){joints[i].position.set(...pos);joints[i].scale.setScalar([.10,.075,.065][i])}
   const gap=grip?.024:.066;fingerObjs.forEach((mesh,i)=>mesh.position.set(tip[0]+(i?gap:-gap),tip[1]-.018,tip[2]+.042));
   if(mission.carried){const g=berries.get(mission.carried);if(g){g.visible=true;g.position.set(P.x,P.y-.04,P.z+.04)}}
   for(const f of mission.fruits){const mesh=berries.get(f.id);if(!mesh)continue;
     if(f.status==='picked'){mesh.visible=true;mesh.position.set(-.52+(parseInt(f.id.slice(1),10)%4)*.045,.79,.24+(parseInt(f.id.slice(1),10)%2)*.08)}
     else if(f.status==='on_plant'){mesh.visible=true;mesh.position.set(f.x,f.y,f.z)}}
   const tr=mission.trail.filter((_,i)=>i%5===0).slice(-350);const pts=tr.map(p=>new T.Vector3(p.x,p.y,p.z));track.geometry.dispose();track.geometry=new T.BufferGeometry().setFromPoints(pts);
 }
 pose(mission.q,false);
 let drag=false,prev=null;gl.domElement.addEventListener('pointerdown',e=>{drag=true;prev={x:e.clientX,y:e.clientY};gl.domElement.setPointerCapture(e.pointerId)});gl.domElement.addEventListener('pointerup',()=>drag=false);gl.domElement.addEventListener('pointermove',e=>{if(!drag)return;azimuth+=(prev.x-e.clientX)*.007;alt=Math.max(-.1,Math.min(1.1,alt+(e.clientY-prev.y)*.004));prev={x:e.clientX,y:e.clientY};updateCamera()});gl.domElement.addEventListener('wheel',e=>{e.preventDefault();dist=Math.max(2.1,Math.min(6,dist+Math.sign(e.deltaY)*.2));updateCamera()},{passive:false});
 const resize=()=>{const ww=root.clientWidth,hh=root.clientHeight;if(ww&&hh){gl.setSize(ww,hh);cam.aspect=ww/hh;cam.updateProjectionMatrix()}};window.addEventListener('resize',resize);
 return {mode:'three',draw(){pose(mission.q,mission.gripperClosed);gl.render(world,cam)},dispose(){window.removeEventListener('resize',resize);gl.dispose()}};
}
export function makeHarvestFallback(canvas,mission){const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
 function render(){ctx.clearRect(0,0,W,H);ctx.fillStyle='#bdd8ca';ctx.fillRect(0,0,W,H);ctx.fillStyle='#725541';ctx.fillRect(0,H*.25,W,H*.66);ctx.fillStyle='#926d47';ctx.fillRect(80,90,W-160,H-145);
  const pt=v=>({x:W/2+v.x*510,y:H*.86-v.z*250-(v.y-1)*120});
  for(const f of mission.fruits){const p=pt(f);ctx.beginPath();ctx.arc(p.x,p.y,16,0,Math.PI*2);ctx.fillStyle=f.status==='picked'?'#d3ae77':f.ripe?'#e64d42':'#d9e7a3';ctx.fill();ctx.strokeStyle='#29472f';ctx.stroke();ctx.fillStyle='#20362e';ctx.font='13px monospace';ctx.fillText(f.id,p.x-12,p.y-20)}
  const b=pt({x:0,y:1.14,z:0}),tip=pt(armForward(mission.q));ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(tip.x,tip.y);ctx.lineWidth=10;ctx.strokeStyle='#e5b554';ctx.stroke();ctx.lineWidth=1;ctx.fillStyle='#1c3940';ctx.beginPath();ctx.arc(tip.x,tip.y,9,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#182c27';ctx.font='15px sans-serif';ctx.fillText('2D 离线演示 · IK + 状态机运算，非三维渲染',16,26);ctx.fillText('红色：成熟草莓   淡绿：未成熟   黄色：机械臂',16,H-24);
 }
 return {mode:'fallback',draw:render,dispose(){}};
}
