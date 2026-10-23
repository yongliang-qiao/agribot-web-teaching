/** Deterministic, browser-only EDUCATIONAL mechanics. No rigid-body physics engine or validated agronomic spray model. */
export const sat=(v,a,b)=>Math.min(b,Math.max(a,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function obstaclesForSeed(seed=20261022,lanex=0){
  const offset=(((seed*1664525+1013904223)>>>0)/4294967296-.5)*.12;
  return [{id:'rock-1',kind:'rock',x:lanex+.24+offset,z:1.8,r:.10,h:.25}];
}
export function circleCollision(p,obstacles,robotRadius=.26){
  return obstacles.find(o=>distance(p,o)<o.r+robotRadius)??null;
}
export function segmentCollision(a,b,obstacles,robotRadius=.26){
  const vx=b.x-a.x,vz=b.z-a.z,L=vx*vx+vz*vz;
  return obstacles.find(o=>{const t=L?sat(((o.x-a.x)*vx+(o.z-a.z)*vz)/L,0,1):0;return Math.hypot(o.x-a.x-vx*t,o.z-a.z-vz*t)<o.r+robotRadius;})??null;
}
/** A* grid planner with crop corridor and inflated robot footprint. Sources: planned map of obstacles, not camera detection. */
export function planAStar(start,goal,obstacles,{xmin=-.55,xmax=.55,zmin=-7.2,zmax=7.2,res=.10,robotRadius=.25,cropMargin=.04}={}){
 const nx=Math.floor((xmax-xmin)/res)+1,nz=Math.floor((zmax-zmin)/res)+1;
 if(nx*nz>100000)throw Error('A* grid too large');
 const ix=x=>sat(Math.round((x-xmin)/res),0,nx-1),iz=z=>sat(Math.round((z-zmin)/res),0,nz-1);
 const decode=k=>({i:k%nx,j:Math.floor(k/nx)}),key=(i,j)=>j*nx+i;
 const source=key(ix(start.x),iz(start.z)),target=key(ix(goal.x),iz(goal.z));
 const blocked=(i,j)=>{const x=xmin+i*res,z=zmin+j*res;if(x<xmin+cropMargin||x>xmax-cropMargin)return true;return obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+robotRadius)};
 if(blocked(ix(start.x),iz(start.z)))return {ok:false,reason:'起点与障碍物或保护区冲突',path:[],visited:0};
 if(blocked(ix(goal.x),iz(goal.z)))return {ok:false,reason:'终点与障碍物或保护区冲突',path:[],visited:0};
 const g=new Float64Array(nx*nz).fill(Infinity),parent=new Int32Array(nx*nz).fill(-1),seen=new Uint8Array(nx*nz),open=[source];g[source]=0;
 const h=(i,j)=>Math.hypot(i-ix(goal.x),j-iz(goal.z));let expanded=0;
 while(open.length&&expanded<100000){open.sort((a,b)=>{const A=decode(a),B=decode(b);return (g[a]+h(A.i,A.j))-(g[b]+h(B.i,B.j))});const k=open.shift();if(seen[k])continue;seen[k]=1;expanded++;
  if(k===target){const path=[];let p=k;while(p>=0){const v=decode(p);path.push({x:xmin+v.i*res,z:zmin+v.j*res});p=parent[p]}path.reverse();const simplified=[path[0]];for(let t=1;t<path.length-1;t++){let a=path[t-1],b=path[t],c=path[t+1];if(Math.sign(b.x-a.x)!==Math.sign(c.x-b.x)||Math.sign(b.z-a.z)!==Math.sign(c.z-b.z))simplified.push(b);}simplified.push(path[path.length-1]);return {ok:true,path:simplified,visited:expanded,cost:g[k]};}
  const {i,j}=decode(k);for(const [di,dj] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const ni=i+di,nj=j+dj;if(ni<0||ni>=nx||nj<0||nj>=nz||blocked(ni,nj)||seen[key(ni,nj)])continue;
   if(di&&dj&&(blocked(i+di,j)||blocked(i,j+dj)))continue;
   const q=key(ni,nj),next=g[k]+Math.hypot(di,dj);if(next<g[q]){g[q]=next;parent[q]=k;open.push(q)}
  }
 }
 return {ok:false,reason:'无可通行的安全路线',path:[],visited:expanded};
}
export function purePursuit(position,heading,path,{lookahead=.65,wheelbase=1.08,maxSteer=.54}={}){
 if(!path.length)return {steering:0,target:position};
 const look=path.find(p=>distance(p,position)>lookahead)||path[path.length-1];
 const dx=look.x-position.x,dz=look.z-position.z;
 const xLocal=dx*Math.cos(heading)-dz*Math.sin(heading),forward=dx*Math.sin(heading)+dz*Math.cos(heading);
 const k=2*xLocal/Math.max(.04,xLocal*xLocal+forward*forward);
 return {steering:sat(Math.atan(wheelbase*k),-maxSteer,maxSteer),target:look};
}
/** First-order speed actuation and a simple traction-limited slip factor, not measured soil mechanics. */
export function advancePowertrain(p,desired,dt,{accel=.55,brake=1.8,soilGrip=.82,rollResistance=.02}={}){
 const diff=desired-p.speed;const lim=(diff>=0?accel:brake)*dt;
 p.speed=sat(p.speed+sat(diff,-lim,lim),0,2);p.slip=sat((1-soilGrip)*Math.abs(p.steering||0)*.35+(1-soilGrip)*.025,0,.35);
 p.travelSpeed=Math.max(0,p.speed*(1-p.slip)-rollResistance*Math.min(p.speed,.5));
 p.wheelTravel=(p.wheelTravel||0)+p.speed*dt;
 return p;
}
export function evaluateSafety(current,next,obstacles,{robotRadius=.26,bounds={xmin:-5.7,xmax:5.7,zmin:-8.7,zmax:8.7}}={}){
 const hit=segmentCollision(current,next,obstacles,robotRadius);
 if(hit)return {ok:false,code:'COLLISION',reason:`与${hit.id}的安全距离不足`};
 if(next.x<bounds.xmin||next.x>bounds.xmax||next.z<bounds.zmin||next.z>bounds.zmax)return {ok:false,code:'OUT_OF_FIELD',reason:'车辆越出地块边界'};
 return {ok:true,code:'SAFE'};
}
/** Planar 3DOF arm mounted to rover: base-yaw, shoulder, elbow. Teaching kinematics, not real torque control. */
export function armForward(q,{l1=.55,l2=.48,baseHeight=1.14}={}){
 const [yaw,shoulder,elbow]=q;const reach=l1*Math.cos(shoulder)+l2*Math.cos(shoulder+elbow);
 return {x:Math.sin(yaw)*reach,y:baseHeight+l1*Math.sin(shoulder)+l2*Math.sin(shoulder+elbow),z:Math.cos(yaw)*reach};
}
export function armInverse(target,{l1=.55,l2=.48,baseHeight=1.14,limits=[[-Math.PI,Math.PI],[-1.35,1.2],[-2.4,2.4]]}={}){
 const x=target.x,z=target.z,y=target.y-baseHeight;const yaw=Math.atan2(x,z),r=Math.hypot(x,z);const c=(r*r+y*y-l1*l1-l2*l2)/(2*l1*l2);
 if(c>1||c< -1)return {ok:false,reason:'目标超出机械臂可达空间'};
 const e=-Math.acos(sat(c,-1,1)),shoulder=Math.atan2(y,r)-Math.atan2(l2*Math.sin(e),l1+l2*Math.cos(e));const q=[yaw,shoulder,e];
 if(q.some((v,i)=>v<limits[i][0]||v>limits[i][1]))return {ok:false,reason:'关节限位冲突',q};
 return {ok:true,q,achieved:armForward(q,{l1,l2,baseHeight})};
}
export function interpolateJoints(start,goal,{duration=2,dt=.05}={}){
 const n=Math.max(1,Math.ceil(duration/dt)),pts=[];
 for(let i=0;i<=n;i++){const t=i/n;const smooth=t*t*(3-2*t);pts.push({t:t*duration,q:start.map((a,j)=>a+(goal[j]-a)*smooth)})}return pts;
}
export class SpraySystem{
 constructor({delay=.35,flowLMin=.65,radius=.30,capacityL=12,seed=42}={}){Object.assign(this,{delay,flowLMin,radius,capacityL,liquidL:capacityL,seed,queue:[],history:[],active:[],miss:0,risk:0,appliedL:0});}
 request(target,t,plants=[]){const nearCrop=plants.some(p=>Math.hypot(p.x-target.x,p.z-target.z)<this.radius+.10);const task={id:`spray-${this.history.length+this.queue.length+1}`,target,requestTime:t,fireAt:t+this.delay,nearCrop,done:false};this.queue.push(task);return task;}
 step(t,dt,robot,plants=[]){this.active=[];for(const e of this.queue){if(e.done||t<e.fireAt)continue;e.done=true;const dist=Math.hypot(e.target.x-robot.x,e.target.z-robot.z),radius=this.radius;const protectedCrop=e.nearCrop||plants.some(p=>Math.hypot(p.x-e.target.x,p.z-e.target.z)<radius+.10);const reachable=dist<1.30;const duration=.12;const liquid=Math.min(this.liquidL,this.flowLMin*duration/60);const fired=reachable&&!protectedCrop&&liquid>0;
  if(fired){this.liquidL-=liquid;this.appliedL+=liquid;this.active.push({x:e.target.x,z:e.target.z,radius,weedId:e.target.weedId});}else{this.miss++;if(protectedCrop)this.risk++;}
  this.history.push({...e,actualAt:t,reachable,cropProtected:protectedCrop,fired,volumeL:liquid*fired,coverageRadius:radius});}
 this.queue=this.queue.filter(e=>!e.done);return this.active;
 }
 summary(){return {sprayCount:this.history.filter(h=>h.fired).length,failed:this.miss,cropSafetyBlocks:this.risk,appliedL:this.appliedL,remainingL:this.liquidL,pending:this.queue.length,delayS:this.delay,radiusM:this.radius};}
}
export function taskPriority(tasks){return [...tasks].sort((a,b)=>b.priority-a.priority||a.created-b.created);}
export function retryTask(task,{maxRetries=2}={}){const attempts=(task.attempts||0)+1;return {...task,attempts,status:attempts>maxRetries?'failed':'retry',nextAt:(task.nextAt||0)+Math.min(8,Math.pow(2,attempts))};}
