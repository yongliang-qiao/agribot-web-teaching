import {obstaclesForSeed,planAStar,purePursuit,advancePowertrain,evaluateSafety,armInverse,interpolateJoints,armForward,SpraySystem,taskPriority,retryTask} from './advanced_sim.mjs';
import {captureRGBD,drawDepth,drawCloud,pixelToWorld,cloudToPLY} from './rgbd.mjs';
import {RosBridgeClient} from './ros_bridge.mjs';
const $=id=>document.getElementById(id);
const f=(x,n=2)=>Number(x).toFixed(n);

/** UI additions and advanced scenarios are opt-in to protect v4 four-experiment comparability. */
export function createAdvancedUI({state,field,settings,lesson,render,showSpray,notify,download,result,camera,vision}){
 let obstacles=[],plan=null,lastLane=-1,plantMeshes=[],pathMesh=null,arm=null,armPose=[0,0,0],armTarget=null,armTrajectory=[],latestArmPlan=[],armStart=0,gripClosed=false;
 let dynamic={speed:0,steering:0,slip:0,wheelTravel:0},safetyEvents=[],spray=new SpraySystem(),replay=[],playback=null,recordEvery=0,depthFrame=null;
 let ros=null,lastMode=false,worldCamera=null,graphics=null,simScene=null,vehicle=null,T=null;
 let obstacleCount=0,controllerTask={type:'safety',priority:100,created:0,status:'idle',attempts:0};
 let sprayVfx=[],sprayCones=[],robotRadius=.25,processedSprays=0,retries=[],retried=0;
 const active=()=>!!$('advancedMode').checked;
 function status(text){$('advancedStatus').textContent=text;}
 function updateDisplay(){const ss=spray.summary(),a=active()?`障碍物 ${obstacles.length} · A* ${plan?.ok?'成功':plan?'失败':'待规划'} · 当前速度 ${f(dynamic.travelSpeed||0)}m/s · 估算滑移 ${f(dynamic.slip*100,1)}%`: '高级动力学未开启';status(a+` · 喷施 ${ss.sprayCount} 次 · 药液剩余 ${f(ss.remainingL,3)}L · 碰撞拦停 ${safetyEvents.length} 次`);}
 function rebuildObstacles(){const s=state();obstacles=obstaclesForSeed(s.fieldSeed,0);lastLane=-1;plan=null;controllerTask={type:'safety',priority:100,created:s.time,status:'idle',attempts:0};
  if(T&&simScene)drawObstacles();updateDisplay();}
 function drawObstacles(){for(const m of plantMeshes){simScene.remove(m);m.geometry?.dispose();m.material?.dispose()}plantMeshes=[];
   if(!active()||!T||!simScene)return;
   for(const o of obstacles){const mesh=new T.Mesh(o.kind==='crate'?new T.BoxGeometry(o.r*2,o.h,o.r*2):new T.DodecahedronGeometry(o.r,1),new T.MeshStandardMaterial({color:o.kind==='crate'?0xb78a43:0x7a7770,roughness:.88}));mesh.position.set(o.x,o.h/2,o.z);mesh.name='Obstacle '+o.id;simScene.add(mesh);plantMeshes.push(mesh);}
 }
 function drawPlan(){if(!T||!simScene)return;if(pathMesh){simScene.remove(pathMesh);pathMesh.geometry?.dispose();pathMesh.material?.dispose();pathMesh=null;}
  if(!active()||!plan?.ok||plan.path.length<2)return;
  const pts=plan.path.map(p=>new T.Vector3(p.x,.19,p.z));pathMesh=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:0x48e8ff}));simScene.add(pathMesh);
 }
 function planCurrentLane(){if(!active())return null;const s=state(),lane=s.lane;const row=lane===undefined?0:lane;
   const targetX=(row-2)*2.1,targetZ=row%2===0?6.85:-6.85;
   const near=obstacles.filter(o=>Math.abs(o.x-targetX)<1.0);
   plan=planAStar({x:s.x,z:s.z},{x:targetX,z:targetZ},near,{xmin:targetX-.56,xmax:targetX+.56,zmin:-7.3,zmax:7.3,res:.09,robotRadius});
   lastLane=row;drawPlan();notify('A* '+(plan.ok?`已生成安全路径，${plan.path.length} 个关键点，扩展 ${plan.visited} 个栅格`:'失败：'+plan.reason));updateDisplay();return plan;
 }
 function before(dt){if(!active())return {};
  const s=state();dynamic.steering=s.steering||0;advancePowertrain(dynamic,settings().speed,dt);
  if(s.phase!=='row')return {actualSpeed:dynamic.travelSpeed};
  if(!plan||lastLane!==s.lane)planCurrentLane();
  if(!plan?.ok){s.abortReason='路径规划失败，安全停车：'+(plan?.reason||'未知原因');return {actualSpeed:0};}
  const near=plan.path.find(p=>Math.hypot(p.x-s.x,p.z-s.z)>1.65)||plan.path[plan.path.length-1];
  const guidance=purePursuit({x:s.x,z:s.z},s.theta,[near],{lookahead:1.65,maxSteer:.49});
  // Optical error remains in the steering loop; planning provides additional obstacle-aware guidance.
  const urgent=obstacles.some(o=>Math.abs(o.x-s.x)<1.1&&Math.abs(o.z-s.z)<3.2);
  return {actualSpeed:dynamic.travelSpeed,plannerSteering:guidance.steering,plannerWeight:urgent?.98:.45};
 }
 function queueSpray(e){if(!active())return false;
  const s=state();spray.request({x:e.x,z:e.z,weedId:e.weedId},s.time,field().crops);return true;
 }
 function after(dt,prev){if(!active())return;
  const s=state(),check=evaluateSafety(prev,{x:s.x,z:s.z},obstacles,{robotRadius});
  if(!check.ok){s.x=prev.x;s.z=prev.z;s.theta=prev.theta;s.abortReason='安全约束触发：'+check.reason;safetyEvents.push({...check,t:s.time,x:s.x,z:s.z});notify(s.abortReason)}
  spray.step(s.time,dt,{x:s.x,z:s.z},field().crops);
  // Bounded retry policy: only for a temporarily out-of-reach target, never override crop-safety blocks.
  for(const h of spray.history.slice(processedSprays))if(!h.fired&&!h.cropProtected&&h.target?.weedId!==undefined){
    const task=retryTask({target:h.target,attempts:(h.attempts||0),nextAt:s.time},{maxRetries:2});
    if(task.status==='retry'){task.nextAt=s.time+Math.pow(2,task.attempts)*.30;retries.push(task);retried++;notify('喷施未命中位置，加入有界重试队列（不放宽作物保护）');}
  }
  processedSprays=spray.history.length;
  for(const task of retries){if(task.status!=='retry'||task.nextAt>s.time)continue;task.status='resubmitted';
    if(Math.hypot(s.x-task.target.x,s.z-task.target.z)<1.3){const e=spray.request(task.target,s.time,field().crops);e.attempts=task.attempts;}
    else if(task.attempts<2){task.status='retry';task.attempts++;task.nextAt=s.time+.4;}
  }
  retries=retries.filter(t=>t.status==='retry');
  
  if(spray.active.length){for(const pt of spray.active){showSpray(pt.x,pt.z);const w=field().weeds.find(x=>x.id===pt.weedId);if(w&&!w.hit){w.hit=true;s.hit++;}}
   sprayVfx=spray.active.map(x=>({...x,until:s.time+.24}));}
  if(s.lane!==lastLane&&s.phase==='row')planCurrentLane();
  if(armTrajectory.length&&s.time>=armStart){const t=s.time-armStart;let p=armTrajectory[armTrajectory.length-1];for(const q of armTrajectory){if(q.t>=t){p=q;break}}armPose=p.q;
   if(t>=armTrajectory[armTrajectory.length-1].t)armTrajectory=[];arm?.move(armPose,gripClosed);}
  if(s.time-recordEvery>.24){recordEvery=s.time;replay.push({t:+s.time.toFixed(3),x:s.x,z:s.z,theta:s.theta,lane:s.lane,phase:s.phase,steer:s.steering,speed:dynamic.travelSpeed,slip:dynamic.slip,arm:[...armPose],liquid:spray.liquidL,hits:s.hit});if(replay.length>12000)replay.shift();$('replaySlider').max=Math.max(1,replay.length-1);}
  if((s.time*4|0)%8===0)updateDisplay();
 }
 function replayTick(){if(playback===null||!replay.length)return;
  const idx=Math.min(replay.length-1,playback++),p=replay[idx],s=state();s.x=p.x;s.z=p.z;s.theta=p.theta;s.steering=p.steer;s.distance=p.t*(p.speed||.5);armPose=p.arm;
  if(arm)arm.move(armPose,gripClosed);$('replaySlider').value=idx;
  if(idx>=replay.length-1){playback=null;status('轨迹回放已完成，点“重置”恢复初始实验。')}
 }
 function reset(){dynamic={speed:0,steering:0,slip:0,wheelTravel:0,travelSpeed:0};spray=new SpraySystem({delay:+$('sprayDelay').value,radius:settings().spray});processedSprays=0;retries=[];retried=0;
 replay=[];playback=null;recordEvery=0;armPose=[0,0,0];armTrajectory=[];safetyEvents=[];depthFrame=null;
 if($('replaySlider'))$('replaySlider').value='0';rebuildObstacles();if(arm)arm.move(armPose,gripClosed);}
 function drawFallback(ctx,X,Z){if(!active())return;
 for(const o of obstacles){ctx.beginPath();ctx.arc(X(o.x),Z(o.z),(o.r+robotRadius)*54,0,Math.PI*2);ctx.fillStyle='rgba(255,78,54,.40)';ctx.fill();ctx.strokeStyle='#ffca4a';ctx.stroke();}
 if(plan?.ok){ctx.beginPath();plan.path.forEach((p,i)=>i?ctx.lineTo(X(p.x),Z(p.z)):ctx.moveTo(X(p.x),Z(p.z)));ctx.strokeStyle='#5dd4ff';ctx.lineWidth=3;ctx.stroke();}}
 function setup3D(g){({three:T,scene:simScene,onboardCamera:worldCamera,renderer:graphics,robot:vehicle}=g);drawObstacles();if(vehicle){arm=null;sprayCones=[];
    const material=new T.MeshBasicMaterial({color:0x8dddf8,transparent:true,opacity:.27,depthWrite:false});
    for(const x of [-1.09,-.82,.82,1.09]){const c=new T.Mesh(new T.ConeGeometry(.16,.42,14,1,true),material);c.position.set(x,.38,.83);c.rotation.z=Math.PI;c.visible=false;vehicle.add(c);sprayCones.push(c);}
   }drawPlan();}
 function draw(){if(active()&&T&&simScene&&vehicle){for(const c of sprayCones)c.visible=sprayVfx.some(x=>x.until>state().time); }
  if(playback!==null)replayTick();}
 function doDepth(){if(!T||!graphics||!simScene||!worldCamera){status('RGB-D不可用：请先在支持 WebGL 与 Three.js 的浏览器中加载三维农田。');return;}
  try{depthFrame=captureRGBD(T,simScene,worldCamera,graphics);if(!depthFrame.valid||!depthFrame.count)throw Error('当前深度帧全部无有效点');
   drawDepth($('depthMap'),depthFrame);drawCloud($('pointCloud'),depthFrame);status(`RGB-D 深度数据已读取：${depthFrame.width}×${depthFrame.height}，点云 ${depthFrame.count} 点；距离 ${f(depthFrame.minDepth)}–${f(depthFrame.maxDepth)}m（虚拟深度，不是实体传感器）`);}
  catch(e){status('WebGL 深度读回失败：'+e.message);notify('深度失败 '+e.message)}
 }
 function saveJSON(){const obj={schema:'edu.jlu.agribot.v5/result',version:'5.0',result:result(),advanced:summary(),events:state().logs,trail:replay};download(JSON.stringify(obj,null,2),'AgriBot_v5_report_'+state().fieldSeed+'.json','application/json');}
 function saveImage(){const a=camera(),b=vision(),out=document.createElement('canvas');out.width=960;out.height=560;const ctx=out.getContext('2d');ctx.fillStyle='#101d21';ctx.fillRect(0,0,960,560);ctx.drawImage(a,0,0,480,250);ctx.drawImage(b,480,0,480,250);
  ctx.fillStyle='#e5f7ee';ctx.font='18px sans-serif';ctx.fillText('AgriBot v5 · 虚拟相机 RGB（左） + 分割或 ONNX 框（右）',16,290);ctx.font='15px monospace';ctx.fillText('lesson='+lesson()+' seed='+state().fieldSeed+' t='+f(state().time,2)+'s',16,322);ctx.fillText('WebGL='+Boolean(T)+' · demo predictions are NOT trained AI',16,350);
  out.toBlob(blob=>{if(blob){const u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download='AgriBot_v5_annotated.png';link.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}},'image/png');}
 function summary(){return {advancedEnabled:active(),physics:'deterministic traction-limited kinematic approximation, NOT rigid-body contact',obstacles:obstacles.map(x=>({...x})),planner:plan?{ok:plan.ok,visited:plan.visited,pathPoints:plan.path.length,reason:plan.reason||null}:null,safetyEvents,steeringAngle:state().steering,wheelSlipEstimated:dynamic.slip,actualSpeed:dynamic.travelSpeed,priorityQueue:taskPriority([{type:'safety',priority:100,created:0},{type:'visual_navigation',priority:80,created:0},{type:'spraying',priority:50,created:0}]).map(x=>x.type),sprayRetries:retried,arm:{joints:armPose,tool:armForward(armPose),gripperClosed:gripClosed},spray:spray.summary(),pointCloud:depthFrame?{width:depthFrame.width,height:depthFrame.height,points:depthFrame.count,minDepth:depthFrame.minDepth,maxDepth:depthFrame.maxDepth}:null,rosbridge:ros?.status||'disconnected',trajectoryFrames:replay.length};}
 async function submitClass(){const r=result(),code=$('classCode').value.trim();if(!r.completed||r.score===null){$('submitState').textContent='仅允许提交已完成且有效评分的实验';return;}
  try{const resp=await fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class_code:code,record:r})});const body=await resp.json();if(!resp.ok)throw Error(body.error);$('submitState').textContent='提交成功：本地教师服务器已收到成绩';}
  catch(e){$('submitState').textContent='提交失败：'+e.message+'；静态 GitHub Pages 没有教学数据库。'}
 }
 function initControls(){
  $('advancedMode').onchange=()=>{reset();status(active()?'高级仿真已启用。可添加障碍物并规划路径。':'已恢复 v4 四实验原有动力学和评分。')};
  $('plan').onclick=()=>{if(!active())$('advancedMode').checked=true;rebuildObstacles();planCurrentLane();};
  $('depthCapture').onclick=doDepth;
  $('sprayDelay').oninput=()=>{$('delayValue').textContent=f(+$('sprayDelay').value);spray.delay=+$('sprayDelay').value};
  $('armPlan').onclick=()=>{const q=armInverse({x:+$('armX').value,y:+$('armY').value,z:+$('armZ').value});if(!q.ok){$('armStatus').textContent='IK失败：'+q.reason;return;}
   armTrajectory=interpolateJoints(armPose,q.q,{duration:2,dt:.05});latestArmPlan=armTrajectory.map(p=>({...p,q:[...p.q]}));armStart=state().time;
   // When paused, execute a visible pose directly so the learner can still inspect joint constraints.
   armTarget=q.q;$('armStatus').textContent='IK成功，规划 '+armTrajectory.length+' 点；三关节 '+q.q.map(v=>f(v,3)).join(', ')+' rad；仿真运行时按轨迹执行';
   if(!active()){armPose=[...q.q];arm?.move(armPose,gripClosed);render();}
  };
  $('grip').onclick=()=>{gripClosed=!gripClosed;arm?.move(armPose,gripClosed);$('armStatus').textContent='夹爪 '+(gripClosed?'闭合':'打开')+'（视觉动画，未模拟真实抓握力）'};
  $('replayPlay').onclick=()=>{if(!replay.length){status('先完成或运行一次实验，才有轨迹可以回放');return;}playback=0;status('轨迹回放中；停止回放后请重置继续实验')};
  $('replayPause').onclick=()=>{playback=null;status('回放已停止')};
  $('replaySlider').oninput=()=>{playback=+$('replaySlider').value;replayTick();playback=null};
  $('exportJSON').onclick=saveJSON;$('exportImage').onclick=saveImage;
  $('exportReplay').onclick=()=>download(JSON.stringify({schema:'edu.jlu.agribot.v5/replay',seed:state().fieldSeed,mission:lesson(),frames:replay},null,2),'AgriBot_v5_replay.json','application/json');
  $('rosConnect').onclick=()=>{if(ros?.status==='connected'){ros.disconnect();$('rosState').textContent='已断开 rosbridge';return;}
   ros=new RosBridgeClient($('rosURL').value.trim());ros.onStatus=msg=>{ $('rosState').textContent='ROS 2 bridge: '+msg+(msg==='connected'?'（仅发布仿真话题；非硬件执行）':'');if(msg==='connected'){try{ros.advertise('/agribot/sim_pose','geometry_msgs/msg/PoseStamped');ros.advertise('/agribot/joint_trajectory','trajectory_msgs/msg/JointTrajectory')}catch(e){notify(e.message)}}};
   try{ros.connect()}catch(e){$('rosState').textContent='ROS连接失败：'+e.message};};
  $('rosTrajectory').onclick=()=>{try{if(!ros||ros.status!=='connected')throw Error('请先连接 rosbridge');if(!latestArmPlan.length)throw Error('请先规划机械臂轨迹');ros.sendArmTrajectory(latestArmPlan);$('rosState').textContent='已发布教学机械臂三关节轨迹（未绑定真实关节或硬件驱动）';}catch(e){$('rosState').textContent=e.message}};
  $('exportCloud').onclick=()=>{if(!depthFrame||!T||!worldCamera){status('请先采集有效RGB-D深度图');return;}download(cloudToPLY(depthFrame,worldCamera,T),'AgriBot_v5_pointcloud.ply','application/octet-stream');};
  $('depthMap').onclick=e=>{if(!depthFrame||!T||!worldCamera)return;const rect=e.currentTarget.getBoundingClientRect(),x=Math.floor((e.clientX-rect.left)/rect.width*depthFrame.width),y=Math.floor((e.clientY-rect.top)/rect.height*depthFrame.height);
   const pt=pixelToWorld(depthFrame,x,y,worldCamera,T);$('depthPoint').textContent=pt?`像素(${x},${y}) → 世界坐标 x=${f(pt.x,3)}, y=${f(pt.y,3)}, z=${f(pt.z,3)} m`:'该像素没有有效深度';};
  $('rosPublish').onclick=()=>{try{if(!ros||ros.status!=='connected')throw Error('请先连接 rosbridge');const s=state();ros.publishPose(s.x,s.z,s.theta);$('rosState').textContent='仿真位姿已发布到 /agribot/sim_pose（ROS 2）';}catch(e){$('rosState').textContent=e.message}};
  $('submitClass').onclick=submitClass;
  updateDisplay();
 }
 return {initControls,active,before,after,queueSpray,setup3D,draw,drawFallback,reset,summary,replayTick};
}
