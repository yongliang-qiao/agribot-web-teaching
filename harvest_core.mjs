/** Independent fruit-harvesting educational mission. Pure deterministic simulator.
 * 3DOF position IK and pick/place state machine. No fruit detector, torque controller, or validated grasp physics.
 */
import {armForward,armInverse,interpolateJoints} from './advanced_sim.mjs';
export const HARVEST_SCHEMA='edu.jlu.agribot.harvest.v1';
export const HOME=[0,.15,-.35];
export const BASKET={x:-.42,y:1.04,z:.52};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const round=(x,n=4)=>+x.toFixed(n);
export function makeStrawberries(seed=20261023){
 let x=seed>>>0;const rnd=()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296};
 const layout=[[-.30,.94,.57],[-.20,1.00,.67],[.06,1.06,.55],[.20,.96,.64],[.32,1.06,.55],[.14,1.01,.72],[-.05,1.03,.48],[.27,.96,.47],[-.27,.99,.68],[.32,1.01,.68],[-.09,.99,.72],[.06,.93,.66]];
 return layout.map(([fx,fy,fz],i)=>({id:`F${String(i+1).padStart(2,'0')}`,x:round(fx+(rnd()-.5)*.022),y:round(fy+(rnd()-.5)*.018),z:round(fz+(rnd()-.5)*.022),ripe:i<8,status:'on_plant',attempts:0}));
}
export const STAGES={approach:'接近',grasp:'接近果柄',close:'夹取',lift:'抬升',carry:'运送果筐',release:'放入果筐',return:'复位'};
const edgeWaypoints=(fruit,offset=0)=>({x:fruit.x+offset,y:fruit.y,z:fruit.z});
function centerDist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
export function pickPlan(fruit,{gripWidth=.045,offset=.0,motionScale=1}={}){
 if(!fruit)return {ok:false,reason:'没有选中果实'};
 if(!fruit.ripe)return {ok:false,reason:'作物保护：禁止采摘未成熟果实'};
 if(fruit.status!=='on_plant')return {ok:false,reason:'该果实已处理'};
 if(!(gripWidth>=.025&&gripWidth<=.09))return {ok:false,reason:'夹爪开度不在允许范围内'};
 const contact=edgeWaypoints(fruit,offset),approach={...contact,y:fruit.y+.085},lift={...contact,y:fruit.y+.12};
 // Closable envelope roughly around the demonstration fruit; not a validated force/contact model.
 const contactError=Math.abs(offset);if(contactError>.055)return {ok:false,reason:'末端位置偏差过大，夹爪无法覆盖果柄',code:'MISS'};
 if(gripWidth<.034)return {ok:false,reason:'夹爪开度过窄，可能提前挤压果实',code:'GRIP'};
 if(gripWidth>.078)return {ok:false,reason:'夹爪开度过大，无法稳定抓取果柄',code:'GRIP'};
 const pts=[{stage:'approach',point:approach},{stage:'grasp',point:contact},{stage:'lift',point:lift},{stage:'carry',point:{...BASKET,y:1.12}},{stage:'release',point:BASKET}];
 let previous=HOME;const segments=[];for(const item of pts){const ik=armInverse(item.point);if(!ik.ok)return {ok:false,reason:`${STAGES[item.stage]}失败：${ik.reason}`,code:'IK'};
  const frame=interpolateJoints(previous,ik.q,{duration:Math.max(.25,.8/motionScale),dt:.04});segments.push({...item,q:ik.q,frames:frame});previous=ik.q;
 }
 // Verify final pose of every waypoint against analytic forward kinematics.
 for(const seg of segments)if(centerDist(armForward(seg.q),seg.point)>.0001)return {ok:false,reason:'正逆运动学复算失败',code:'IK'};
 segments.push({stage:'return',point:armForward(HOME),q:HOME,frames:interpolateJoints(previous,HOME,{duration:.8/motionScale,dt:.04})});
 return {ok:true,fruitId:fruit.id,segments,contactError:round(contactError),jointWaypoints:segments.map(s=>({stage:s.stage,q:s.q}))};
}
export function harvestScore(s){
 const ripe=s.fruits.filter(f=>f.ripe),picked=ripe.filter(f=>f.status==='picked');
 const ratio=picked.length/Math.max(1,ripe.length);
 const fruitScore=Math.round(65*ratio),cropScore=s.unripeDamaged?0:15;
 const errorScore=Math.round(10*clamp(1-s.maxPoseError/.055,0,1));
 const completionScore=s.finished?10:0;
 return {score:clamp(fruitScore+cropScore+errorScore+completionScore,0,100),picked:picked.length,ripe:ripe.length,unripe:s.fruits.filter(f=>!f.ripe).length,unripeDamaged:s.unripeDamaged,failed:s.failed,elapsed:round(s.time,2),meanPoseError:round(s.poseErrCount?s.poseErrSum/s.poseErrCount:0,4),maxPoseError:round(s.maxPoseError,4),completed:s.finished,components:[{name:'成熟果实采摘',points:fruitScore,max:65},{name:'未成熟果实保护',points:cropScore,max:15},{name:'末端定位精度',points:errorScore,max:10},{name:'任务完成',points:completionScore,max:10}]};
}
export class HarvestMission{
 constructor(seed=20261023,params={}){this.seed=seed>>>0;this.params={gripWidth:.045,offset:0,motionScale:1,...params};this.fruits=makeStrawberries(this.seed);this.time=0;this.q=[...HOME];this.gripperClosed=false;this.carried=null;this.stage='ready';this.busy=false;this.finished=false;this.failed=0;this.unripeDamaged=0;this.poseErrSum=0;this.poseErrCount=0;this.maxPoseError=0;this.logs=[];this.active=null;this.frameIndex=0;this.segmentIndex=0;this.frames=[];this.trail=[];this.history=[];}
 log(text){this.logs.push({t:round(this.time,2),message:text});if(this.logs.length>1000)this.logs.shift()}
 start(fruitId){if(this.busy)return {ok:false,reason:'机械臂正在执行'};if(this.finished)return {ok:false,reason:'实验已完成，请重置'};
  const fruit=this.fruits.find(f=>f.id===fruitId);const p=pickPlan(fruit,this.params);
  if(!p.ok){this.failed++;if(fruit)fruit.attempts++;this.log(`拒绝 ${fruitId||'无目标'}：${p.reason}`);return p;}
  this.active={fruitId,plan:p};this.segmentIndex=0;this.frameIndex=0;this.busy=true;this.stage='approach';this.log(`开始采摘 ${fruitId}：IK已计算 ${p.segments.length} 段轨迹`);return p;
 }
 autoNext(){const next=this.fruits.find(f=>f.ripe&&f.status==='on_plant');return next?this.start(next.id):{ok:false,reason:'成熟果实已全部处理'};}
 tick(dt=.04){if(!Number.isFinite(dt)||dt<=0)return;if(!this.busy){this.time+=dt;return;}
  const cur=this.active.plan.segments[this.segmentIndex];const frames=cur.frames;
  let f=frames[this.frameIndex];this.q=[...f.q];this.stage=cur.stage;
  const eff=armForward(this.q);this.trail.push({...eff,t:round(this.time,3),stage:this.stage});if(this.trail.length>1000)this.trail.shift();
  if(this.frameIndex<frames.length-1){this.frameIndex++}else{
    const fruit=this.fruits.find(x=>x.id===this.active.fruitId);
    if(cur.stage==='grasp'){this.gripperClosed=true;this.carried=fruit.id;fruit.status='held';this.poseErrSum+=this.active.plan.contactError;this.poseErrCount++;this.maxPoseError=Math.max(this.maxPoseError,this.active.plan.contactError);this.log(`已夹取 ${fruit.id}`)}
    if(cur.stage==='release'){this.gripperClosed=false;fruit.status='picked';this.carried=null;this.log(`已放入果筐 ${fruit.id}`)}
    this.segmentIndex++;this.frameIndex=0;
    if(this.segmentIndex>=this.active.plan.segments.length){this.busy=false;this.stage='ready';this.log('机械臂已回到准备位');this.active=null;
     this.finished=this.fruits.every(x=>!x.ripe||x.status==='picked');if(this.finished){this.stage='done';this.log('全部成熟果实采摘完成');}}
  }
  this.time+=dt;this.history.push({t:round(this.time,3),q:this.q.map(v=>round(v)),stage:this.stage,carried:this.carried,fruitId:this.active?.fruitId??null});if(this.history.length>12000)this.history.shift();
 }
 runToEnd(limit=50000){let n=0;while(n++<limit&&!this.finished){if(!this.busy){const p=this.autoNext();if(!p.ok)break;}this.tick(.04)}return {steps:n,finished:this.finished,result:harvestScore(this)}}
 result(student='匿名'){return {schema:HARVEST_SCHEMA,mission:'harvest',lesson:'实验5 · 果实智能采摘与机械臂逆运动学',student,seed:this.seed,params:this.params,grade:harvestScore(this),completed:this.finished,fruits:this.fruits.map(f=>({...f})),events:this.logs,trajectoryFrames:this.history.length};}
}
