// AgriBot Teaching Lab: deterministic educational kinematics and pixel vision.
export const ROWS=5, SPACE=2.1, LENGTH=14, HALF=LENGTH/2, WHEELBASE=1.08, MAX_STEER=0.85;
export const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const laneX=i=>(i-(ROWS-1)/2)*SPACE;
export function randSeed(seed){let v=seed>>>0;return()=>((v=(1664525*v+1013904223)>>>0)/4294967296)}
export function makeField(seed=20261022){const rand=randSeed(seed);const weeds=[];const crops=[];
 for(let i=0;i<ROWS;i++){for(const side of [-1,1])for(let j=0;j<22;j++){const z=-HALF+.16+j*(LENGTH-.32)/21;
 crops.push({x:laneX(i)+side*.68+(rand()-.5)*.08,z:z+(rand()-.5)*.15,h:.85+rand()*.38,seed:rand(),row:i});}
 for(let j=0;j<11;j++){weeds.push({id:weeds.length,row:i,x:laneX(i)+(rand()-.5)*1.25,z:-HALF+.48+j*(LENGTH-.96)/10+(rand()-.5)*.18,r:.10+rand()*.1,seed:rand(),kind:(['pigweed','foxtail','lambsquarters'][Math.floor(rand()*3)]),hit:false,seen:false,checked:false});}}
 return {weeds,crops};}
export function initState(field,seed=20261022){return {x:laneX(0)+.12,z:-HALF,theta:0,lane:0,phase:'row',turnAngle:0,turns:0,turnPath:0,time:0,distance:0,completed:false,abortReason:'',sampleN:0,sqErr:0,maxErr:0,visionSamples:0,visionValid:0,visionErr:0,visionYaw:0,visionFound:false,visionPeaks:null,seen:0,hit:0,falseSpray:0,outside:0,pending:[],logs:[],lastInference:0,fieldSeed:seed,visionFrames:0,lostSeq:0,steering:0};}
// Input is a camera render/simulated camera pixel buffer, not a ground-truth lane offset.
export function estimateRows(rgba,w,h){const scores=new Float64Array(w);let greenCount=0;
 const y0=Math.floor(h*.39),y1=Math.floor(h*.88);
 for(let y=y0;y<y1;y+=2){for(let x=0;x<w;x+=2){const p=(y*w+x)*4,r=rgba[p],g=rgba[p+1],b=rgba[p+2];
 const exg=2*g-r-b,green=exg>23&&g>48&&g>r*1.15&&g>b*1.05;
 if(green){scores[x]+=1+(.35*(y-y0)/(y1-y0));greenCount++;}}}
 const smooth=new Float64Array(w);for(let x=10;x<w-10;x++){let sum=0;for(let k=-12;k<=12;k++)sum+=scores[x+k];smooth[x]=sum;}
 const peaks=[];const margin=Math.round(w*.045);
 for(const [from,to] of [[margin,Math.floor(w*.48)],[Math.floor(w*.52),w-margin]]){let max=0,where=-1;
 for(let x=from;x<to;x++){if(smooth[x]>max){max=smooth[x];where=x;}}
 if(max>8){let weighted=0,total=0;for(let xi=Math.max(from,where-18);xi<=Math.min(to-1,where+18);xi++){weighted+=xi*scores[xi];total+=scores[xi];}peaks.push({x:total>0?weighted/total:where,power:max});}else peaks.push(null);}
 // A crop-row corridor exists only when TWO crop boundaries are seen.
 const ok=!!(peaks[0]&&peaks[1]&&peaks[1].x-peaks[0].x>w*.14);
 const center=ok?(peaks[0].x+peaks[1].x)/2:null;
 // camera faces +robot Z; screen-left means desired positive yaw (right turn in world x-z map).
 const opticalErr=ok?clamp((w/2-center)/(w*.24),-1.8,1.8):0;
 return {ok,left:peaks[0]?.x??null,right:peaks[1]?.x??null,center,opticalErr,greenCount,confidence:ok?clamp(Math.min(peaks[0].power,peaks[1].power)/90,0,1):0};}
export function rowMotion(s,dt,params){if(s.completed||s.abortReason)return;const v=params.actualSpeed??params.speed; s.time+=dt;
 if(s.phase==='row'){
  // Controller ONLY sees the latest pixel-derived optical error (no true lane x in steering command).
  const desiredBase=(s.lane%2)*Math.PI;
  const yawErr=wrap(desiredBase-s.theta);
  const optical=s.visionFound?s.visionErr:0;
  const visualSteering=params.gain*optical*.24/Math.max(.6,params.look)+.9*yawErr;
  const steering=clamp(params.plannerSteering===undefined?visualSteering:visualSteering*(1-(params.plannerWeight??.45))+params.plannerSteering*(params.plannerWeight??.45),-.49,.49);s.steering=steering;
  s.theta+=v*Math.tan(steering)*dt/WHEELBASE;
  s.x+=v*Math.sin(s.theta)*dt;s.z+=v*Math.cos(s.theta)*dt;
  let error=s.x-laneX(s.lane);s.sqErr+=error*error;s.sampleN++;s.maxErr=Math.max(s.maxErr,Math.abs(error));
  if(Math.abs(error)>SPACE*.55)s.outside++;
  const end=s.lane%2===0?HALF:-HALF;
  if((s.lane%2===0&&s.z>=end)||(s.lane%2===1&&s.z<=end)){
    if(s.lane===ROWS-1){s.completed=true;s.phase='done';return}
    s.phase='turn';s.turnAngle=0;s.turnStartHeading=s.theta;
  }
 }else if(s.phase==='turn'){
  // Continuous symmetric four-wheel-steering (4WS) arc: front and rear steer in opposite directions.
  // Apply arc integration. The yaw rate is v/R for a symmetric four-wheel-steering path.
  // Integrate from mid-heading, no instant translation or teleport.
  const dir=s.lane%2===0?1:-1;
  const R=params.turnRadius||SPACE/2;
  // Symmetric 4WS: front/rear opposite steering; tan(delta)=WHEELBASE/(2R).
  // 2.1 m row spacing => R=1.05 m, delta about 27.2 degrees.
  s.steering=dir*Math.atan(WHEELBASE/(2*R));
  if(Math.abs(s.steering)>MAX_STEER+1e-8){s.abortReason='掉头曲率超出车辆转向极限';return;}
  const da=Math.min(Math.PI-s.turnAngle,v*dt/R);
  const middle=s.theta+dir*da/2;
  const ds=R*da;
  s.x+=Math.sin(middle)*ds;s.z+=Math.cos(middle)*ds;
  s.theta=wrap(s.theta+dir*da);s.turnAngle+=da;s.turnPath+=ds;
  if(s.turnAngle>=Math.PI-1e-9){s.lane++;s.turns++;s.phase='row';s.turnAngle=0;}
 }
 s.distance+=v*dt;
}
export function recordVisual(s,vision){s.visionSamples++;s.visionFound=vision.ok;s.visionErr=vision.opticalErr;s.visionPeaks=vision;
 if(vision.ok){s.visionValid++;s.lostSeq=0;}else if(s.phase==='row')s.lostSeq++;s.visionFrames++;}
export function teachingDemoSpray(s,field,params){if(s.phase!=='row'||s.completed)return;for(const weed of field.weeds){if(weed.checked||weed.row!==s.lane)continue;
 const dz=weed.z-s.z,sideDist=Math.abs(weed.x-s.x);
 if(Math.abs(dz)<.15&&sideDist<1.2){weed.checked=true;
  if(sideDist<.9){weed.seen=true;s.seen++;
   // Purely ground-truth-based DEMO action. Never call this an AI prediction.
   if(sideDist<params.spray+.30){weed.hit=true;s.hit++;if(field.crops.some(c=>Math.hypot(c.x-weed.x,c.z-weed.z)<params.spray+.04))s.falseSpray++;}
  }
 }} }
export function estimateScore(s,mode,field){const rmse=s.sampleN?Math.sqrt(s.sqErr/s.sampleN):0;const nav=clamp(1-rmse/.48,0,1);const coverage=clamp((s.lane+(s.phase==='turn'?.5:0))/ROWS,0,1);
 const validity=s.visionSamples?s.visionValid/s.visionSamples:0;const hit=field.weeds.length?s.hit/field.weeds.length:0;
 let score;
 switch(mode){case 'nav':score=100*(nav*.70+validity*.30);break;
 case 'turn':score=100*(.6*s.turns/(ROWS-1)+.25*(s.outside===0?1:0)+.15*coverage);break;
 case 'vision':score=100*(.55*hit+.3*(1-s.falseSpray/Math.max(1,s.hit))+.15*validity);break;
 default:score=100*(.35*nav+.2*(s.turns/(ROWS-1))+.25*hit+.1*validity+.1*(s.outside===0?1:0));}
 return {score:Math.round(clamp(score,0,100)),rmse,coverage,validity,hitRate:hit};}
export function boundingBoxesFromYolo(raw,dims,threshold=0.35,canvasW=480,canvasH=250){
 if(dims.length!==3||dims[0]!==1)throw new Error('需要输出形状 [1,6,N] 或 [1,N,6]');
 const channelMajor=dims[1]===6,other=dims[2]===6;
 if(!channelMajor&&!other)throw new Error('需要2类YOLOv8原始输出 (6个特征)');
 const n=channelMajor?dims[2]:dims[1];const get=(i,k)=>channelMajor?raw[k*n+i]:raw[i*6+k];const candidates=[];
 for(let i=0;i<n;i++){const crop=get(i,4),weed=get(i,5),cls=weed>crop?1:0,conf=Math.max(crop,weed);if(conf<threshold)continue;
 const [cx,cy,w,h]=[get(i,0),get(i,1),get(i,2),get(i,3)];if(![cx,cy,w,h].every(Number.isFinite))continue;
 candidates.push({cls,conf,x:cx-w/2,y:cy-h/2,w,h});}
 candidates.sort((a,b)=>b.conf-a.conf);const ans=[];
 function iou(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),X=Math.min(a.x+a.w,b.x+b.w),Y=Math.min(a.y+a.h,b.y+b.h),inter=Math.max(0,X-x)*Math.max(0,Y-y)*1,uni=a.w*a.h+b.w*b.h-inter;return uni?inter/uni:0;}
 for(const d of candidates){if(ans.length>=90)break;if(!ans.some(a=>a.cls===d.cls&&iou(a,d)>.45))ans.push(d)}return ans;}
