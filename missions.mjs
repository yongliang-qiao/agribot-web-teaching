/** Four distinct, deterministic teaching experiments for AgriBot.
 * Each mission has its own starting state, simulation stop criteria, metrics and rubric.
 * Reference geometry is used for grading only; the navigation steering path is supplied by core.rowMotion's camera-derived vision error.
 */
import {ROWS,SPACE,HALF,LENGTH,WHEELBASE,clamp,laneX,initState,rowMotion,randSeed} from './core.mjs';

export const MISSIONS={
 nav:{key:'nav',label:'实验1 · 作物行视觉闭环导航',scope:'第3条作物通道，14 m；只评价视觉导航，不喷施、不掉头。',procedure:'记录默认参数；重置并调节 Kp、预瞄距离；比较 RMSE、最大偏差、有效视觉帧比例。',finish:'机器人到达目标行末端即停止。',rubricDesc:'完成20、横向RMSE 35、最大偏差20、有效视觉帧比例25。'},
 turn:{key:'turn',label:'实验2 · 四轮转向地头掉头',scope:'从第一条通道末端前2 m开始，完成一次连续180° U形转弯，再行驶2 m。',procedure:'改变转弯半径（与行距2.1 m比较）和速度；观察转弯终点横向偏差、转角、路径长度和位移连续性。',finish:'完成1次掉头，并驶入下一作物通道2 m后停止。',rubricDesc:'完成25、转弯次数15、终点对行误差25、半径路径一致性20、位移连续性15。'},
 vision:{key:'vision',label:'实验3 · 杂草检测与精准喷施',scope:'第3条通道单行作业；逐个评价玉米/杂草候选目标，输出TP、FP、FN、Precision、Recall、F1以及喷施命中和作物风险。',procedure:'在教学标签模式下调节检测阈值及喷施半径；重置重跑，比较检出率与误喷。ONNX模式必须上传真实模型，未加载不得评分。',finish:'驶完一条通道并评估该通道全部经过的候选对象。',rubricDesc:'完成20、检测F1 30、杂草命中率30、作物保护20。教学标签分数不代表AI mAP。'},
 integrated:{key:'integrated',label:'实验4 · 五行自主作业综合考核',scope:'5条通道、4次连续掉头、视觉导航、杂草检测与精准喷施；统一采集轨迹、识别、作业与成绩。',procedure:'先用相同种子运行基准组并保存，再仅改变一项参数重跑；比较导航误差、作业覆盖、检测F1、命中率、风险、总分。',finish:'5行全部完成并完成4次掉头。',rubricDesc:'完成20、导航RMSE 20、掉头15、检测F1 20、命中15、作物保护10。'}
};
export function createMission(field,mode,seed){if(!MISSIONS[mode])throw Error('未知实验 '+mode);let s=initState(field,seed);s.mode=mode;s.metrics={tp:0,fp:0,fn:0,tn:0,observedWeeds:0,observedCrops:0,cropSprayed:0,sprayEvents:0,expectedWeeds:0,expectedCrops:0,seenIds:[],maxStep:0,turnExitError:null,turnArcError:null,turnExitHeadingError:null,stage:'准备'};s.initPose={x:s.x,z:s.z,theta:s.theta};
 if(mode==='nav'||mode==='vision'){s.lane=2;s.x=laneX(2)+.12;s.z=-HALF;s.theta=0;}
 if(mode==='turn'){s.lane=0;s.x=laneX(0);s.z=HALF-2;s.theta=0;}
 s.initPose={x:s.x,z:s.z,theta:s.theta};const active=mode==='integrated'?[0,1,2,3,4]:mode==='turn'?[]:mode==='nav'?[]:[2];s.metrics.expectedWeeds=field.weeds.filter(o=>active.includes(o.row)).length;s.metrics.expectedCrops=field.crops.filter(o=>active.includes(o.row)).length;return s;}
export function progress(s){if(s.completed)return 1;let laneFrac=clamp((s.lane%2===0?s.z+HALF:HALF-s.z)/LENGTH,0,1);switch(s.mode){case'nav':case'vision':return laneFrac;case'turn':return s.turns>0?.7+clamp((HALF-s.z)/2,0,1)*.3:s.phase==='turn'?.25+clamp(s.turnAngle/Math.PI,0,1)*.45:clamp((s.z-(HALF-2))/2,0,1)*.25;default:return clamp((s.lane+(s.phase==='turn'?.5:laneFrac))/ROWS,0,1);}}
export function advanceMission(s,field,dt,params){if(s.completed||s.abortReason)return;const x=s.x,z=s.z,turns=s.turns,oldPhase=s.phase;
 rowMotion(s,dt,params);s.metrics.maxStep=Math.max(s.metrics.maxStep,Math.hypot(s.x-x,s.z-z));
 if(oldPhase==='turn'&&s.phase==='row'&&s.turns>turns){s.metrics.turnExitError=Math.abs(s.x-laneX(s.lane));s.metrics.turnExitHeadingError=Math.abs(Math.atan2(Math.sin(s.theta-((s.lane%2)*Math.PI)),Math.cos(s.theta-((s.lane%2)*Math.PI))));s.metrics.turnArcError=Math.abs(s.turnPath-Math.PI*(params.turnRadius||SPACE/2));}
 switch(s.mode){
 case 'nav':case 'vision':if(s.phase==='turn'||s.completed){s.completed=true;s.phase='done';}break;
 case 'turn':if(s.turns===1 && s.phase==='row' && s.z<=HALF-2){s.completed=true;s.phase='done';}if(s.turns>1){s.abortReason='实验2只允许执行一次掉头';}break;
 default:break;
 }
 s.metrics.stage=s.completed?'完成':s.phase==='turn'?'地头转向':s.mode==='vision'?'检测和喷施':s.mode==='nav'?'视觉导航':s.mode==='turn'?'对行驶入':'全田自主作业';
}
// Bounded deterministic pseudo-detector for TEACHING LABEL MODE, not an AI network.
// Classification of ground-truth-labeled virtual objects happens independently of any actual ONNX model.
function objectScore(obj,seed){const rand=randSeed((seed^Math.imul((obj.id??0)+7919,2654435761)^Math.imul((obj.idx??0)+31,2246822519))>>>0);return obj.isWeed?.34+.63*rand():.06+.37*rand();}
export function demoDetectAndSpray(s,field,params){if(s.phase!=='row'||(s.mode!=='vision'&&s.mode!=='integrated'))return [];
 const m=s.metrics,events=[];const objects=[...field.weeds.filter(o=>o.row===s.lane).map(o=>({o,isWeed:true,id:'w'+o.id})),...field.crops.filter(o=>o.row===s.lane).map((o,i)=>({o,isWeed:false,id:'c'+o.row+':'+i,idx:o.row*100+i}))];
 for(const {o,isWeed,id,idx} of objects){if(m.seenIds.includes(id))continue;const dz=(s.lane%2===0?o.z-s.z:s.z-o.z);if(dz<-.12||dz>.18)continue; // passed through the virtual sensor gate
  m.seenIds.push(id);const p=objectScore({id:isWeed?o.id:idx,idx,isWeed},s.fieldSeed),predicted=p>=params.conf;
  if(isWeed){m.observedWeeds++;if(predicted){m.tp++;s.seen++;o.seen=true;}else m.fn++;}
  else{m.observedCrops++;if(predicted)m.fp++;else m.tn++;}
  if(predicted){let inReach=Math.abs(o.x-s.x)<1.1, nearCrop=field.crops.some(c=>Math.hypot(c.x-o.x,c.z-o.z)<params.spray+.03);
   if(inReach){m.sprayEvents++;if(!isWeed){m.cropSprayed++;s.falseSpray++;events.push({type:'crop',x:o.x,z:o.z});}
    else if(nearCrop){m.cropSprayed++;s.falseSpray++;events.push({type:'risk',x:o.x,z:o.z});}
    else{if(!params.deferSpray){o.hit=true;s.hit++;}events.push({type:'hit',x:o.x,z:o.z,weedId:o.id});}
   }
  }
 }
 return events;
}
export function counts(s){const m=s.metrics;return{rmse:s.sampleN?Math.sqrt(s.sqErr/s.sampleN):0,maxError:s.maxErr,visionPct:s.visionSamples?100*s.visionValid/s.visionSamples:0,precision:m.tp+m.fp?m.tp/(m.tp+m.fp):0,recall:m.tp+m.fn?m.tp/(m.tp+m.fn):0,f1:2*m.tp+m.fp+m.fn?2*m.tp/(2*m.tp+m.fp+m.fn):0,hitRate:m.expectedWeeds?s.hit/m.expectedWeeds:0,turns:s.turns,turnExitError:m.turnExitError??0,turnArcError:m.turnArcError??0,maxStep:m.maxStep,sprayEvents:m.sprayEvents,cropSprayed:m.cropSprayed,observedWeeds:m.observedWeeds,observedCrops:m.observedCrops,expectedWeeds:m.expectedWeeds,expectedCrops:m.expectedCrops,tp:m.tp,fp:m.fp,fn:m.fn,tn:m.tn,turnPath:s.turnPath,elapsed:s.time,completed:s.completed,aborted:!!s.abortReason};}
export function evaluateMission(s,source='demo',validOnnx=false){const m=counts(s);const sat=(x,target)=>clamp(x/target,0,1);const better=(x,bad)=>clamp(1-x/bad,0,1);
 const rows=[];function add(label,max,ratio,note){rows.push({label,max,earned:Math.round(max*clamp(ratio,0,1)*100)/100,note});}
 switch(s.mode){
 case 'nav': add('终点完成',20,+m.completed,'单条作物通道');add('横向 RMSE',35,better(m.rmse,.30),`${m.rmse.toFixed(3)} m，越小越好`);add('最大横向偏差',20,better(m.maxError,.65),`${m.maxError.toFixed(3)} m`);add('有效视觉帧',25,m.visionPct/100,`${m.visionPct.toFixed(1)}%`);break;
 case 'turn':add('任务完成',25,+m.completed,'一次转向并回到通道');add('规定转弯次数',15,+(m.turns===1),'1次');add('出弯对行误差',25,better(m.turnExitError,.55),`${m.turnExitError.toFixed(3)} m`);add('路径长度一致性',20,better(m.turnArcError,.30),`${m.turnArcError.toFixed(3)} m`);add('位置连续性',15,better(Math.max(0,m.maxStep-.09),.30),`最大单步${m.maxStep.toFixed(3)} m`);break;
 case 'vision':add('任务完成',20,+m.completed,'一行');add('分类F1',30,m.f1,`P=${m.precision.toFixed(2)} R=${m.recall.toFixed(2)}`);add('杂草命中率',30,m.hitRate,`${s.hit}/${m.expectedWeeds}`);add('作物保护',20,better(m.cropSprayed,Math.max(1,m.expectedCrops*.2)),`风险${m.cropSprayed}`);break;
 default:add('任务完成',20,+m.completed,'5行4次转弯');add('视觉导航误差',20,better(m.rmse,.3),`${m.rmse.toFixed(3)} m`);add('连续掉头',15,s.turns/4,`${s.turns}/4`);add('分类F1',20,m.f1,`${m.f1.toFixed(2)}`);add('杂草命中率',15,m.hitRate,`${s.hit}/${m.expectedWeeds}`);add('作物保护',10,better(m.cropSprayed,Math.max(1,m.expectedCrops*.2)),`风险${m.cropSprayed}`);}
 const onnxRequired=(s.mode==='vision'||s.mode==='integrated')&&source==='onnx'&&!validOnnx;
 const score=s.completed&&!onnxRequired&&!s.abortReason?Math.round(rows.reduce((sum,x)=>sum+x.earned,0)):null;
 return {score,rows,metrics:m,gradeType:source==='onnx'?'ONNX推理展示（尚未建立可靠的逐目标TP/FP/FN评估，禁止给出AI实验成绩）':'教学标签模式（非AI识别精度）',isGradeValid:!onnxRequired&&s.completed&&!s.abortReason};
}
