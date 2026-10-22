import {ROWS,SPACE,LENGTH,HALF,laneX,clamp,wrap,makeField,initState,estimateRows,rowMotion,recordVisual,teachingDemoSpray,estimateScore,boundingBoxesFromYolo,randSeed} from './core.mjs';
import {installVegetation,buildRover3D} from './scene_realism.mjs';
import {MISSIONS,createMission,advanceMission,demoDetectAndSpray,evaluateMission,progress,counts} from './missions.mjs';
const $=id=>document.getElementById(id);const fmt=(v,n=2)=>Number(v).toFixed(n);
const cameraCanvas=$('camera'),cameraCtx=cameraCanvas.getContext('2d',{willReadFrequently:true}),vCanvas=$('vision'),vctx=vCanvas.getContext('2d'),plot=$('chart'),pctx=plot.getContext('2d');
const settings=()=>({speed:+$('speed').value,gain:+$('gain').value,look:+$('look').value,conf:+$('conf').value,spray:+$('spray').value,turnRadius:+$('turnRadius').value});
const settingNames=['speed','gain','look','conf','spray','turnRadius'];
let field=makeField(),s=createMission(field,'nav',20261022),records=[],history=[],playing=false,three=null,scene,viewCamera,onboardCamera,renderer,renderTarget,robot,worldCanvas,backend='fallback',plantMeshes=[],weedMeshes=[],marks=[],wheelMeshes=[],nozzleMeshes=[],modelSession=null,modelReady=false,inferenceBusy=false,savedCurrent=false,aiBoxes=[],inferenceCount=0;
let last=performance.now(),simCarry=0,steps=0,lastCameraStep=-100,previousTestStatus='';
function info(msg){s.logs.unshift(`${fmt(s.time,1)}s · ${msg}`);s.logs=s.logs.slice(0,80);$('events').textContent=s.logs.join('\n');}
function lesson(){return $('lesson').value;}
function setTask(){const t=MISSIONS[lesson()];$('task').innerHTML=`<b>${t.label}</b><div><b>任务：</b>${t.scope}</div><div><b>操作：</b>${t.procedure}</div><div><b>完成判据：</b>${t.finish}</div><div><b>评分：</b>${t.rubricDesc}</div>`;$('turnRadius').disabled=!['turn','integrated'].includes(lesson());$('spray').disabled=!['vision','integrated'].includes(lesson());$('conf').disabled=!['vision','integrated'].includes(lesson());$('detector').disabled=!['vision','integrated'].includes(lesson());}
function updateValues(){for(const id of settingNames)$(id+'V').textContent=fmt(+$(id).value,id==='conf'?2:1);}
// Render fallback intentionally does not pretend to be Three.js; useful for offline teaching and browser testing.
function fallbackWorld(){const c=document.createElement('canvas');worldCanvas=c;c.width=1200;c.height=680;c.style.width='100%';c.style.height='100%';$('world').prepend(c);backend='fallback';$('cameraLabel').textContent='车载合成相机（浏览器离线模式）';$('sceneStats').textContent='离线模式：未加载 3D 几何模型';}
function drawWorldFallback(){if(!worldCanvas)return;const ctx=worldCanvas.getContext('2d'),w=worldCanvas.width,h=worldCanvas.height;ctx.fillStyle='#735a42';ctx.fillRect(0,0,w,h);const X=x=>w/2+x*68,Z=z=>h/2-z*40;
 for(let r=0;r<ROWS;r++){ctx.fillStyle='#59432f';ctx.fillRect(X(laneX(r))-(.8*68),0,1.6*68,h);}
 for(const p of field.crops){const x=X(p.x),z=Z(p.z);ctx.strokeStyle='#2d6b2d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,z+7);ctx.lineTo(x,z-8);ctx.stroke();for(let l=0;l<5;l++){const a=l*2.399+p.seed*5;ctx.fillStyle=['#498f31','#6ba643','#82b944'][l%3];ctx.beginPath();ctx.ellipse(x+Math.cos(a)*8,z+Math.sin(a)*8,11,3,a,0,Math.PI*2);ctx.fill();}}
 for(const p of field.weeds){const x=X(p.x),z=Z(p.z);for(let a=0;a<(p.kind==='foxtail'?11:7);a++){const ang=2*Math.PI*a/(p.kind==='foxtail'?11:7);ctx.fillStyle=p.hit?'#b7aa60':(p.kind==='foxtail'?'#a9c74a':'#6d9e3c');ctx.beginPath();ctx.ellipse(x+Math.cos(ang)*5,z+Math.sin(ang)*5,p.kind==='foxtail'?9:6,p.kind==='foxtail'?1.5:3,ang,0,Math.PI*2);ctx.fill();}}
 for(const [x,z,r] of marks){ctx.strokeStyle='#edcf62';ctx.beginPath();ctx.ellipse(X(x),Z(z),r*68,r*40,0,0,Math.PI*2);ctx.stroke();}
 if(history.length>2){ctx.strokeStyle='#e8c778';ctx.lineWidth=3;ctx.beginPath();history.forEach((v,i)=>i?ctx.lineTo(X(v.x),Z(v.z)):ctx.moveTo(X(v.x),Z(v.z)));ctx.stroke();}
 ctx.save();ctx.translate(X(s.x),Z(s.z));ctx.rotate(s.theta);ctx.fillStyle='#273b30';ctx.fillRect(-19,-28,38,56);ctx.fillStyle='#deaa43';ctx.fillRect(-15,-25,30,45);ctx.fillStyle='#478d83';ctx.fillRect(-11,-24,22,13);ctx.fillStyle='#1c2423';for(const x of [-23,16])for(const y of [-21,10])ctx.fillRect(x,y,7,13);ctx.restore();}
function syntheticCamera(){const ctx=cameraCtx,W=cameraCanvas.width,H=cameraCanvas.height;ctx.fillStyle='#a0c6d5';ctx.fillRect(0,0,W,110);ctx.fillStyle='#75563f';ctx.fillRect(0,110,W,H-110);
 // Images are rasterized through the same geometric projection expected by the visual controller.
 function projected(wx,wz){const dx=wx-s.x,dz=wz-s.z,forward=dx*Math.sin(s.theta)+dz*Math.cos(s.theta),right=dx*Math.cos(s.theta)-dz*Math.sin(s.theta);if(forward<.2||forward>8)return null;return {x:W/2-right*95/(.5+forward*.28),y:H*1.03-35*forward/(1+forward*.11),scale:1/(.4+forward*.2)};}
 const objects=[...field.crops.map(p=>({...p,type:0})),...field.weeds.map(p=>({...p,type:1}))].map(p=>({...p,xy:projected(p.x,p.z)})).filter(p=>p.xy).sort((a,b)=>a.xy.scale-b.xy.scale);
 for(const p of objects){const {x,y,scale}=p.xy;if(x<-50||x>W+50)continue;const h=p.type?13*scale:65*scale;if(p.type){for(let k=0;k<7;k++){const angle=k*2*Math.PI/7;ctx.fillStyle=p.hit?'#9b984d':'#80a43f';ctx.beginPath();ctx.ellipse(x+Math.cos(angle)*7*scale,y+Math.sin(angle)*4*scale,12*scale,3*scale,angle,0,Math.PI*2);ctx.fill();}}
 else{ctx.strokeStyle='#416c32';ctx.lineWidth=Math.max(1,3*scale);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-h);ctx.stroke();for(let k=0;k<7;k++){const side=k%2?-1:1,leafY=y-h*(.2+k*.1),sx=side*23*scale;ctx.fillStyle=k%2?'#7eb648':'#478f37';ctx.beginPath();ctx.ellipse(x+sx/2,leafY,Math.abs(sx/1.4),5*scale,side*.35,0,Math.PI*2);ctx.fill();}}}
 ctx.fillStyle='rgba(10,30,20,.7)';ctx.fillRect(0,0,W,20);ctx.fillStyle='#fff';ctx.font='12px monospace';ctx.fillText('SYNTHETIC CAMERA / offline fallback, NOT Three.js frame',8,14);
}
// These function names remain separated so browser integration tests can inspect the actual steps.
function analyzeCamera(){const pixels=cameraCtx.getImageData(0,0,cameraCanvas.width,cameraCanvas.height);const vision=estimateRows(pixels.data,cameraCanvas.width,cameraCanvas.height);recordVisual(s,vision);
 const W=vCanvas.width,H=vCanvas.height;vctx.fillStyle='#142222';vctx.fillRect(0,0,W,H);const out=vctx.createImageData(W,H);const src=pixels.data;
 for(let y=0;y<H;y+=2){for(let x=0;x<W;x+=2){const i=(y*W+x)*4,g=src[i+1],r=src[i],b=src[i+2],veg=2*g-r-b>23&&g>48&&g>r*1.15&&g>b*1.05;for(let yy=y;yy<Math.min(y+2,H);yy++)for(let xx=x;xx<Math.min(x+2,W);xx++){const j=(yy*W+xx)*4;out.data[j]=veg?45:18;out.data[j+1]=veg?223:27;out.data[j+2]=veg?107:31;out.data[j+3]=255;}}}
 vctx.putImageData(out,0,0);vctx.lineWidth=2;vctx.strokeStyle='#f1c86b';vctx.beginPath();vctx.moveTo(W/2,0);vctx.lineTo(W/2,H);vctx.stroke();
 if(vision.ok){vctx.strokeStyle='#69bfff';for(const x of [vision.left,vision.right]){vctx.beginPath();vctx.moveTo(x,H*.39);vctx.lineTo(x,H*.88);vctx.stroke();}vctx.strokeStyle='#ef5d84';vctx.beginPath();vctx.moveTo(vision.center,H*.39);vctx.lineTo(vision.center,H*.88);vctx.stroke();}
 vctx.fillStyle='white';vctx.font='12px monospace';vctx.fillText(`ExG pixels ${vision.greenCount} | corridor ${vision.ok?'valid':'LOST'} | e=${fmt(vision.opticalErr)}`,8,18);
 overlayOnnx();return vision;}
function overlayOnnx(){if(!$('detector')||$('detector').value!=='onnx')return;vctx.font='11px monospace';for(const b of aiBoxes){vctx.lineWidth=2;vctx.strokeStyle=b.cls===1?'#fbd054':'#72cbfb';vctx.strokeRect(b.x,b.y,b.w,b.h);vctx.fillStyle=vctx.strokeStyle;vctx.fillText(`${b.cls?'weed':'crop'} ${fmt(b.conf)}`,b.x,Math.max(16,b.y-3));}}
function addLeafGeometry(points,colors,origin,height,azimuth,len,width,shade,seed){const n=6;const centers=[];for(let i=0;i<=n;i++){let t=i/n;let radius=len*t;centers.push([origin[0]+Math.cos(azimuth)*radius,origin[1]+height+len*(.26*t-.55*t*t),origin[2]+Math.sin(azimuth)*radius]);}
 const perp=[-Math.sin(azimuth),0,Math.cos(azimuth)];for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n;const half=t=>width*Math.sin(Math.PI*t)**.72*(.75+.25*Math.cos(t*2*Math.PI+seed));
  const quad=[[centers[i],-half(t0)],[centers[i],half(t0)],[centers[i+1],-half(t1)],[centers[i+1],half(t1)]];
  const vect=j=>[quad[j][0][0]+perp[0]*quad[j][1],quad[j][0][1]+Math.abs(quad[j][1])*.05,quad[j][0][2]+perp[2]*quad[j][1]];
  for(const ii of [0,2,1,1,2,3]){points.push(...vect(ii));colors.push(shade[0]*(.9+t0*.1),shade[1]*(.85+t0*.15),shade[2]*(.9+t0*.1));}
 }}
function geometryFromLeaves(points,colors){const G=new three.BufferGeometry();G.setAttribute('position',new three.Float32BufferAttribute(points,3));G.setAttribute('color',new three.Float32BufferAttribute(colors,3));G.computeVertexNormals();return new three.Mesh(G,new three.MeshStandardMaterial({vertexColors:true,side:three.DoubleSide,roughness:.92}));}
function build3D(){const T=three;scene=new T.Scene();scene.background=new T.Color(0x9cc3cd);scene.fog=new T.FogExp2(0x9cc3cd,.023);
 viewCamera=new T.PerspectiveCamera(49,1,.1,180);onboardCamera=new T.PerspectiveCamera(73,480/250,.08,30);
 renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));renderer.outputColorSpace=T.SRGBColorSpace;$('world').prepend(renderer.domElement);renderer.domElement.style.width='100%';renderer.domElement.style.height='100%';
 const hemi=new T.HemisphereLight(0xedfcff,0x5b482d,2.3);scene.add(hemi);const sun=new T.DirectionalLight(0xffe5ae,2.5);sun.position.set(-6,17,12);scene.add(sun);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ct=canvas.getContext('2d');ct.fillStyle='#755438';ct.fillRect(0,0,512,512);const rr=randSeed(4411);for(let k=0;k<18000;k++){const v=rr()*75;ct.fillStyle=`rgba(${70+v},${52+v*.6},${36+v*.36},${.16+rr()*.24})`;ct.fillRect(rr()*512,rr()*512,1+rr()*4,1+rr()*3)}for(let y=0;y<512;y+=24){ct.fillStyle='rgba(37,25,15,.17)';ct.fillRect(0,y,512,3)}let tex=new T.CanvasTexture(canvas);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(5,6);tex.colorSpace=T.SRGBColorSpace;
 const dirt=new T.Mesh(new T.PlaneGeometry(27,30),new T.MeshStandardMaterial({map:tex,roughness:1}));dirt.rotation.x=-Math.PI/2;dirt.position.y=-.03;scene.add(dirt);
 // Procedural furrows, small clods. No third-party 3D assets involved.
 const soilM=new T.MeshStandardMaterial({color:0x64482e,roughness:1});const ridgeG=new T.BoxGeometry(1.42,.11,LENGTH+.9);
 for(let row=0;row<ROWS;row++){const ridge=new T.Mesh(ridgeG,soilM);ridge.position.set(laneX(row),-.04,0);scene.add(ridge);}
 const dirtG=new T.IcosahedronGeometry(.07,0),clods=new T.InstancedMesh(dirtG,new T.MeshStandardMaterial({color:0x977251,roughness:1}),560),dummy=new T.Object3D();for(let i=0;i<560;i++){dummy.position.set((rr()-.5)*23,.015+rr()*.02,(rr()-.5)*23);const k=.45+rr()*2;dummy.scale.set(k,k*.45,k*.8);dummy.rotation.set(rr(),rr(),rr());dummy.updateMatrix();clods.setMatrixAt(i,dummy.matrix)}clods.instanceMatrix.needsUpdate=true;scene.add(clods);
 // High fidelity botanically staged crop and weed meshes, kept separate from ground truth.
 const botanicalStats=installVegetation(T,scene,field);
 const vehicle=buildRover3D(T,scene);robot=vehicle.rover;wheelMeshes=vehicle.wheels;nozzleMeshes=vehicle.nozzles;
 robot.userData.cameraHeight=vehicle.cameraHeight;robot.userData.cameraForward=vehicle.cameraForward;
 $('sceneStats').textContent=`V3–V5 玉米 ${botanicalStats.plantCount} 株 · 苋类/藜类/狗尾草类形态杂草 ${botanicalStats.weedCount} 株 · 植被三角面约 ${botanicalStats.triangles.toLocaleString()}`;
 renderTarget=new T.WebGLRenderTarget(480,250,{depthBuffer:true});
 resize();window.addEventListener('resize',resize);backend='three';$('cameraLabel').textContent='真实 Three.js 场景渲染的车载相机（虚拟传感器）';}
function resize(){if(renderer&&viewCamera){const e=$('world');renderer.setSize(e.clientWidth,e.clientHeight,false);viewCamera.aspect=e.clientWidth/e.clientHeight;viewCamera.updateProjectionMatrix();}}
function syncRobot(){if(backend!=='three'||!robot)return;robot.position.set(s.x,0,s.z);robot.rotation.y=s.theta;
 for(const w of wheelMeshes){w.spin.rotation.x=s.distance/w.radius;
  const steer=s.steering||0;
  w.pivot.rotation.y=w.front?steer:-steer;
 }}
function captureCamera(){if(backend!=='three'){syntheticCamera();return;}try{syncRobot();const F=new three.Vector3(Math.sin(s.theta),0,Math.cos(s.theta));const pos=new three.Vector3(s.x,robot.userData.cameraHeight||1.69,s.z).addScaledVector(F,robot.userData.cameraForward||.72);onboardCamera.position.copy(pos);onboardCamera.lookAt(pos.x+F.x*5,.45,pos.z+F.z*5);onboardCamera.updateMatrixWorld(true);
 renderer.setRenderTarget(renderTarget);renderer.render(scene,onboardCamera);const w=480,h=250,pixels=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(renderTarget,0,0,w,h,pixels);renderer.setRenderTarget(null);
 const image=cameraCtx.createImageData(w,h);for(let y=0;y<h;y++){image.data.set(pixels.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);}cameraCtx.putImageData(image,0,0);}catch(e){syntheticCamera();if(!$('cameraLabel').textContent.includes('降级')){$('cameraLabel').textContent='车载合成相机降级（WebGL 像素读取失败）';$('errors').textContent='3D 显示可用，但车载相机帧读取失败，视觉闭环使用合成像素。错误：'+e.message;}}}
function drawMain(){if(backend==='fallback'){drawWorldFallback();return;}syncRobot();const p=robot.position;const target=new three.Vector3(p.x+10,12.5,p.z+12.5);viewCamera.position.lerp(target,.07);viewCamera.lookAt(p.x,.25,p.z);renderer.setRenderTarget(null);renderer.render(scene,viewCamera);}
// This is used to map an actual ONNX weed detection to a 3D soil coordinate. If it misses the soil, no spray is queued.
function onnxDetectionToGround(box){if(backend!=='three'||!onboardCamera)return null;const px=box.x+box.w/2,py=box.y+box.h*.88;const raycaster=new three.Raycaster();raycaster.setFromCamera(new three.Vector2(px/240-1,1-py/125),onboardCamera);
 const origin=raycaster.ray.origin,dir=raycaster.ray.direction;if(dir.y>=-.015)return null;const t=(.05-origin.y)/dir.y;if(t<.1||t>7)return null;return {x:origin.x+t*dir.x,z:origin.z+t*dir.z,confidence:box.conf};}
async function loadOrt(){if(window.ort)return window.ort;return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src='./vendor/ort.min.js';el.onload=()=>{window.ort.__source='local';resolve(window.ort)};el.onerror=()=>{el.remove();const cdn=document.createElement('script');cdn.src='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';cdn.onload=()=>{window.ort.__source='cdn';resolve(window.ort)};cdn.onerror=()=>reject(Error('ONNX Runtime Web 本地与 CDN 均无法加载'));document.head.append(cdn);};document.head.append(el);});}
function readModelInput(){const meta=modelSession.inputMetadata[modelSession.inputNames[0]],dim=meta?.dimensions??meta?.shape??[];const w=Number(dim[3]),h=Number(dim[2]);if(!Number.isInteger(w)||!Number.isInteger(h)||w<64||h<64||dim[1]!==3)throw Error('模型须为静态 NCHW [1,3,H,W] RGB');return {w,h};}
async function inferOnnx(single=false){if(!modelReady||!modelSession){$('aiState').textContent='未加载有效的两类别 YOLOv8 ONNX 模型';return null;}if(inferenceBusy)return null;inferenceBusy=true;
 try{const ort=window.ort,{w,h}=readModelInput();const temp=document.createElement('canvas');temp.width=w;temp.height=h;const ctx=temp.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#727272';ctx.fillRect(0,0,w,h);
 // Letterbox, preserving the camera aspect ratio. YOLOv8 exported with [1,6,N] features.
 const scale=Math.min(w/480,h/250),cw=480*scale,ch=250*scale,padX=(w-cw)/2,padY=(h-ch)/2;ctx.drawImage(cameraCanvas,padX,padY,cw,ch);
 const rgba=ctx.getImageData(0,0,w,h).data,arr=new Float32Array(w*h*3);for(let i=0;i<w*h;i++){arr[i]=rgba[i*4]/255;arr[i+w*h]=rgba[i*4+1]/255;arr[i+2*w*h]=rgba[i*4+2]/255;}
 const input=modelSession.inputNames[0],res=await modelSession.run({[input]:new ort.Tensor('float32',arr,[1,3,h,w])});const y=res[modelSession.outputNames[0]];
 const det=boundingBoxesFromYolo(y.data,y.dims,settings().conf).map(d=>({...d,x:(d.x-padX)/scale,y:(d.y-padY)/scale,w:d.w/scale,h:d.h/scale})).filter(d=>d.x+d.w>0&&d.x<480&&d.y+d.h>0&&d.y<250);
 aiBoxes=det;inferenceCount++;$('aiState').textContent=`真实 ONNX 推理已完成 ${inferenceCount} 帧（crop ${det.filter(d=>!d.cls).length} / weed ${det.filter(d=>d.cls).length}）；当前不生成AI考核成绩`;
 if(!single){for(const d of det.filter(d=>d.cls===1)){const point=onnxDetectionToGround(d);if(point&&!s.pending.some(p=>Math.hypot(p.x-point.x,p.z-point.z)<.22)){s.pending.push({...point,created:s.time});s.seen++;}}}
 analyzeCamera();return det;
 }catch(e){$('aiState').textContent='推理错误：'+e.message;info('ONNX推理失败：'+e.message);return null;}finally{inferenceBusy=false;}}
function onnxSpray(){if(!modelReady||s.phase!=='row')return;for(const p of s.pending){if(p.done||s.time-p.created>8){p.done=true;continue;}if(Math.abs(s.z-p.z)<.2&&Math.abs(s.x-p.x)<settings().spray+.85){p.done=true;let closest=null,dist=1e9;for(const w of field.weeds){const d=Math.hypot(w.x-p.x,w.z-p.z);if(d<dist){dist=d;closest=w;}}
 if(closest&&dist<.22&&!closest.hit){closest.hit=true;closest._marked=true;s.hit++;if(field.crops.some(c=>Math.hypot(c.x-closest.x,c.z-closest.z)<settings().spray+.04))s.falseSpray++;showSpray(closest.x,closest.z);}
 else {s.falseSpray++;showSpray(p.x,p.z);}
 }}s.pending=s.pending.filter(p=>!p.done);}
function showSpray(x,z){marks.push([x,z,settings().spray]);if(backend!=='three')return;const o=new three.Mesh(new three.RingGeometry(.045,settings().spray,26),new three.MeshBasicMaterial({color:0xf2ce4d,side:three.DoubleSide,transparent:true,opacity:.65}));o.rotation.x=-Math.PI/2;o.position.set(x,.06,z);scene.add(o);}
// Real ONNX detections currently lack a fully evaluated per-object confusion matrix and an independent labelled holdout.
// Do NOT turn valid inference calls into an AI experiment grade.
function validOnnx(){return false;} // must only change after labelled ground-truth association and browser acceptance
function grade(){return evaluateMission(s,$('detector').value,validOnnx());}
function lockParameters(locked){for(const id of ['lesson','seed','speed','gain','look','conf','spray','turnRadius','detector','model']) $(id).disabled=locked; if(!locked)setTask();}
function advance(dt){if(s.completed||s.abortReason)return;const prevPhase=s.phase,prevTurns=s.turns;
 advanceMission(s,field,dt,settings());
 if(s.phase==='row'&&['vision','integrated'].includes(lesson())){
  if($('detector').value==='demo'){
   for(const evt of demoDetectAndSpray(s,field,settings())){showSpray(evt.x,evt.z);if(evt.type==='crop')info('教学检测误报：对作物触发喷施');}
  }else onnxSpray();
 }
 if(s.turns>prevTurns)info(`本实验完成第 ${s.turns} 次连续掉头；末端横向误差 ${fmt(s.metrics.turnExitError??0,3)} m`);
 if(s.phase!==prevPhase&&s.phase==='turn')info(`进入地头，规划半径 ${fmt(settings().turnRadius)} m，前后轮反相转向`);
 if(++steps-lastCameraStep>=8){lastCameraStep=steps;captureCamera();analyzeCamera();
  if(s.lostSeq>=22&&s.phase==='row'){playing=false;s.abortReason='连续22帧丢失作物行，安全停车';info('安全停止：'+s.abortReason);$('status').textContent='● 安全停止';}
  if($('detector').value==='onnx'&&modelReady&&s.phase==='row'&&['vision','integrated'].includes(lesson())&&s.time-s.lastInference>=.75){s.lastInference=s.time;inferOnnx(false);}
 }
 if(steps%14===0){history.push({x:s.x,z:s.z,t:s.time,err:s.x-laneX(s.lane)});if(history.length>900)history.shift();}
 if(s.completed){playing=false;const g=grade();info(`${MISSIONS[lesson()].label} 已完成；得分 ${g.score===null?'未评定':g.score}`);$('status').textContent='● 已完成';}
 if(s.abortReason){playing=false;$('status').textContent='● 已安全停止';}
 syncDashboard();}
function syncDashboard(){const g=grade(),m=g.metrics;$('progress').textContent=fmt(progress(s)*100,0)+'%';$('rmse').textContent=fmt(m.rmse,3)+' m';$('hits').textContent=s.hit+'/'+m.expectedWeeds;$('score').textContent=g.score===null?(s.completed?'未评定':'—'):g.score+'分';
 $('missionStage').textContent=s.metrics.stage||'准备';$('missionStatus').textContent=s.completed?'已完成':s.abortReason?'中止：'+s.abortReason:s.phase==='turn'?'连续转向中':'执行中';
 $('hud').textContent=`${backend==='three'?'THREE.JS 3D':'2D 降级'} · ${MISSIONS[lesson()].label} · ${s.metrics.stage}\nt=${fmt(s.time,1)}s · 有效视觉=${fmt(m.visionPct,0)}% · 像素误差=${fmt(s.visionErr)}`;
 const body=$('rubric');body.textContent='';for(const e of g.rows){const tr=document.createElement('tr');for(const val of [e.label,e.note,e.earned+' / '+e.max]){const td=document.createElement('td');td.textContent=val;tr.appendChild(td);}body.append(tr);}
 $('experimentStats').textContent=['vision','integrated'].includes(lesson())?`TP ${m.tp} / FP ${m.fp} / FN ${m.fn} · Precision ${fmt(m.precision)} · Recall ${fmt(m.recall)} · F1 ${fmt(m.f1)} · 作物喷施风险 ${m.cropSprayed}`:lesson()==='turn'?`掉头 ${m.turns} 次 · 出弯横向误差 ${fmt(m.turnExitError,3)} m · 最大单步位移 ${fmt(m.maxStep,3)} m`:`视觉有效 ${fmt(m.visionPct)}% · 最大横向误差 ${fmt(m.maxError,3)} m`;
 drawChart();}
function drawChart(){const ctx=pctx,w=plot.width=plot.clientWidth*devicePixelRatio,h=plot.height=110*devicePixelRatio;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#2f594c';for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(0,h*i/4);ctx.lineTo(w,h*i/4);ctx.stroke();}if(history.length<2)return;ctx.strokeStyle='#9fe7b9';ctx.lineWidth=2*devicePixelRatio;ctx.beginPath();const pts=history.slice(-220);pts.forEach((v,i)=>{const xx=i/Math.max(1,pts.length-1)*w,yy=h/2-clamp(v.err,-.8,.8)/1.6*h;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});ctx.stroke();ctx.fillStyle='#e0f6e8';ctx.font=`${11*devicePixelRatio}px sans-serif`;ctx.fillText('横向偏差 e (m) · ±0.8m',8*devicePixelRatio,14*devicePixelRatio);}
function result(){const g=grade(),m=g.metrics,p=settings();return {student:$('student').value.trim()||'匿名',mission:s.mode,lesson:MISSIONS[s.mode].label,seed:s.fieldSeed,datetime:new Date().toISOString(),speed:p.speed,Kp:p.gain,lookahead:p.look,turnRadius:p.turnRadius,confidence:p.conf,sprayRadius:p.spray,backend,detector:$('detector').value,modelLoaded:modelReady,modelInferenceFrames:inferenceCount,independentModelValidation:false,gradeType:g.gradeType,completed:s.completed,aborted:!!s.abortReason,elapsed:+fmt(m.elapsed,2),rmse:+fmt(m.rmse,4),maxError:+fmt(m.maxError,4),visionValidPct:+fmt(m.visionPct,1),turns:m.turns,turnExitError:+fmt(m.turnExitError,4),turnArcError:+fmt(m.turnArcError,4),maxStep:+fmt(m.maxStep,4),weedDetected:s.seen,weedHit:s.hit,totalWeeds:m.expectedWeeds,cropSprayRisk:m.cropSprayed,TP:m.tp,FP:m.fp,FN:m.fn,TN:m.tn,precision:+fmt(m.precision,4),recall:+fmt(m.recall,4),F1:+fmt(m.f1,4),score:g.score,rubric:g.rows};}
function saveRecords(){try{localStorage.setItem('agribot_lab_v4_records',JSON.stringify(records));}catch(e){info('本地保存失败：'+e.message)}showRecords();}
function showRecords(){const tbody=$('records');tbody.textContent='';for(const row of records.slice(-18).reverse()){const tr=document.createElement('tr');for(const v of [row.student,MISSIONS[row.mission]?.label||row.lesson,row.seed,row.speed,row.rmse,row.score??'—']){const td=document.createElement('td');td.textContent=v;tr.append(td);}tbody.append(tr);}}
function download(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3500);}
function csvCell(s){return '"'+String(s??'').replaceAll('"','""')+'"';}
function exportCsv(){const all=[...records];if(s.completed&&grade().isGradeValid&&!savedCurrent)all.push(result());if(!all.length){info('没有有效已完成实验可导出');return;}const flat=all.map(({rubric,...r})=>r),cols=Object.keys(flat[0]);const text='\uFEFF'+[cols.map(csvCell).join(','),...flat.map(r=>cols.map(k=>csvCell(r[k])).join(','))].join('\r\n');download(text,'AgriBot_v4_四实验记录.csv','text/csv;charset=utf-8');info('CSV记录已生成');}
function exportReport(){const r=result(),t=MISSIONS[lesson()],g=grade(),comparison=records.filter(x=>x.mission===r.mission&&x.seed===r.seed).slice(-3);const lines=[`# ${t.label}`,'',`学生：${r.student} | 统一随机种子：${r.seed} | 状态：${r.completed?'完成':'未完成'}`,'',`任务：${t.scope}`,`操作：${t.procedure}`,`完成判据：${t.finish}`,'','## 参数及运行结果','','|指标|数值|','|---|---|',...Object.entries(r).filter(([k])=>k!=='rubric').map(([k,v])=>`|${k}|${String(v).replaceAll('|','/')}|`),'','## 量化评分依据','','|评分项目|实测/判据|得分|','|---|---|---|',...g.rows.map(x=>`|${x.label}|${x.note}|${x.earned}/${x.max}|`),'','## 相同任务+种子的既有记录比较',...comparison.map(x=>`- ${x.datetime} · Kp=${x.Kp} · RMSE=${x.rmse} · 总分=${x.score}`),'','## 学术诚信及技术边界',g.gradeType,'教学标签检测使用已知虚拟对象与可复现的模拟置信度，不能报告为模型检测mAP；真实ONNX模型需单独提供权重、独立标注验证及WebGL联调。Three.js仅渲染，不是Gazebo动力学。'];download(lines.join('\n'),'AgriBot_v4_'+lesson()+'_'+r.seed+'.md','text/markdown;charset=utf-8');info('本任务报告已生成');}
function reset(preserveStudent=true){playing=false;lockParameters(false);const oldSeed=s.fieldSeed;
 const newSeed=Math.floor(Number($('seed').value)||20261022)>>>0;$('seed').value=String(newSeed);
 if(backend==='three'){for(const obj of [...scene.children]){if(obj instanceof three.Mesh&&obj.geometry?.type==='RingGeometry')scene.remove(obj);}}
 field=makeField(newSeed);s=createMission(field,lesson(),newSeed);s.logs=[];history=[];marks=[];aiBoxes=[];steps=0;lastCameraStep=-100;simCarry=0;inferenceCount=0;savedCurrent=false;
 // A new seed must rebuild vegetation; reusing meshes would make 3D pixels disagree with ground truth.
 if(backend==='three'&&oldSeed!==newSeed){window.removeEventListener('resize',resize);renderTarget?.dispose();scene?.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)m.dispose?.();}});renderer?.dispose();renderer?.domElement?.remove();build3D();}
 setTask();captureCamera();analyzeCamera();syncDashboard();drawMain();$('play').textContent='▶ 开始';$('status').textContent='● 待启动';info(`任务重置：${MISSIONS[lesson()].label} · 种子 ${newSeed}；尚未开始评分`);}
let ortLoading=false;
async function onFileModel(){const file=$('model').files?.[0];if(!file)return;modelReady=false;modelSession=null;$('aiState').textContent='正在解析 ONNX……';
 try{const ort=await loadOrt();ort.env.wasm.wasmPaths=ort.__source==='local'?location.origin+'/vendor/':'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';modelSession=await ort.InferenceSession.create(await file.arrayBuffer(),{executionProviders:['wasm']});readModelInput();const out=modelSession.outputMetadata?.[modelSession.outputNames[0]]?.dimensions??modelSession.outputMetadata?.[modelSession.outputNames[0]]?.shape??[];if(out.length!==3||(Number(out[1])!==6&&Number(out[2])!==6))throw Error('ONNX输出必须是2类YOLOv8原始张量 [1,6,N] 或 [1,N,6]（禁止导出nms=True）');modelReady=true;$('aiState').textContent='ONNX已加载：'+file.name+'；仅接受 crop=0, weed=1 的 YOLOv8 原始输出';info('ONNX权重已加载 '+file.name);}
 catch(e){$('aiState').textContent='模型不可用：'+e.message;info('加载模型错误 '+e.message);}
}
function applyMissionDefaults(){const modes={nav:{speed:.8,gain:1.3,look:1.1,conf:.35,spray:.35,turnRadius:1.05},turn:{speed:.65,gain:1.3,look:1.1,conf:.35,spray:.35,turnRadius:1.05},vision:{speed:.55,gain:1.3,look:1.1,conf:.35,spray:.35,turnRadius:1.05},integrated:{speed:.75,gain:1.3,look:1.1,conf:.35,spray:.35,turnRadius:1.05}};
 for(const [k,v] of Object.entries(modes[lesson()]))$(k).value=v;$('detector').value='demo';updateValues();}
function controls(){$('lesson').onchange=()=>{applyMissionDefaults();reset();};$('seed').onchange=()=>reset();$('detector').onchange=()=>{reset();$('modeInfo').textContent=$('detector').value==='onnx'?'ONNX可上传推理并显示检测框；尚未完成独立模型验证与逐目标对照，真实AI成绩将禁用。':'教学演示模式：由仿真标注生成固定置信度用于分类教学，非真实AI准确率。';};for(const id of settingNames)$(id).oninput=updateValues;
 $('play').onclick=()=>{if(s.completed||s.abortReason)reset();if(['vision','integrated'].includes(lesson())&&$('detector').value==='onnx'&&!modelReady){info('无法开始：ONNX任务需要先上传可用模型');$('status').textContent='● 缺少ONNX模型';return;}playing=true;lockParameters(true);$('status').textContent='● 正在运行';$('play').textContent='▶ 运行中';};
 $('pause').onclick=()=>{playing=false;$('status').textContent='● 已暂停';};$('reset').onclick=()=>reset();$('step').onclick=()=>{if(s.completed||s.abortReason)return;lockParameters(true);playing=false;for(let i=0;i<5&&!s.completed&&!s.abortReason;i++)advance(.04);drawMain();};
 $('infer').onclick=async()=>{captureCamera();analyzeCamera();await inferOnnx(true);};$('model').onchange=onFileModel;
 $('save').onclick=()=>{if(savedCurrent){info('当前运行成绩已经保存。需要新实验请重置。');return;}if(!s.completed||!grade().isGradeValid){info('拒绝保存成绩：任务未完成；ONNX模式尚无经验证的逐目标TP/FP/FN评分器');return;}records.push(result());savedCurrent=true;saveRecords();info('本次已完成实验成绩已保存');};
 $('csv').onclick=exportCsv;$('report').onclick=exportReport;$('taskButton').onclick=()=>alert([MISSIONS[lesson()].label,MISSIONS[lesson()].scope,MISSIONS[lesson()].procedure,MISSIONS[lesson()].finish,MISSIONS[lesson()].rubricDesc].join('\n\n'));}
async function loadThreeModule(){
 try{return await import('./vendor/three.module.js');}
 catch(localError){return await Promise.race([import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Three.js 无法加载：本地和 CDN 均不可用')),8000))]);}
}
async function start(){controls();updateValues();try{records=JSON.parse(localStorage.getItem('agribot_lab_v4_records')||'[]');if(!Array.isArray(records))records=[];}catch{records=[];}showRecords();let err=null;
 try{three=await loadThreeModule();build3D();}catch(e){err=e;fallbackWorld();}
 $('errors').textContent=backend==='three'?'Three.js 三维环境已启用。当前相机图像由 WebGL 三维农田渲染并实际进行像素处理。':'Three.js/WebGL 不可用，已切换到 2D 离线教学模式。原因：'+String(err?.message||'未知');
 reset(false);window.__agriTest={getState:()=>({...s}),result,reset,backend:()=>backend,grade,progress:()=>progress(s),
 stepN(n=1000){playing=false;lockParameters(true);for(let i=0;i<n&&!s.completed&&!s.abortReason;i++)advance(.05);drawMain();return result();},capture:()=>{captureCamera();return analyzeCamera();},records:()=>records.slice()};
 $('status').textContent='● 待启动';requestAnimationFrame(frame);}
function frame(now){const delta=Math.min((now-last)/1000,.11);last=now;if(playing){simCarry+=delta*5;let n=0;while(simCarry>=.05&&n++<25&&!s.completed){advance(.05);simCarry-=.05;}}drawMain();requestAnimationFrame(frame);}
start().catch(e=>{$('errors').textContent='初始化失败：'+e.stack;$('status').textContent='初始化失败';});
