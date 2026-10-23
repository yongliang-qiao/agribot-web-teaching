import {HarvestMission,pickPlan,harvestScore,STAGES,HARVEST_SCHEMA} from './harvest_core.mjs';
import {makeHarvestFallback,makeHarvestRenderer} from './harvest_scene.mjs';
const $=id=>document.getElementById(id),fix=(n,d=3)=>Number(n).toFixed(d);
let m=new HarvestMission(),view=null,mode='2D',running=false,auto=false,saved=false,records=[],carry=0,last=performance.now(),logCount=0;
try{records=JSON.parse(localStorage.getItem('agribot_harvest_results_v1')||'[]');if(!Array.isArray(records))records=[]}catch{records=[]}
function settings(){return {gripWidth:+$('gripWidth').value,offset:+$('offset').value,motionScale:+$('motionScale').value}}
function info(txt){$('runStatus').textContent=txt}
function applySettings(){Object.assign(m.params,settings());$('gripValue').textContent=fix(m.params.gripWidth)+' m';$('offsetValue').textContent=fix(m.params.offset)+' m';$('motionValue').textContent=fix(m.params.motionScale,1)+' ×'}
function renderFruitChoices(){const chosen=$('fruit').value;$('fruit').textContent='';for(const f of m.fruits){const o=document.createElement('option');o.value=f.id;o.textContent=`${f.id} · ${f.ripe?'成熟':'未成熟'} · ${f.status==='picked'?'已入筐':f.status==='held'?'夹取中':'植株上'}`;if(f.status==='picked'||f.status==='held')o.disabled=true;$('fruit').append(o)}if(m.fruits.some(f=>f.id===chosen&&f.status==='on_plant'))$('fruit').value=chosen;}
function update(){const g=harvestScore(m);$('picked').textContent=`${g.picked} / ${g.ripe}`;$('elapsed').textContent=fix(g.elapsed,1)+' s';$('poseError').textContent=fix(g.meanPoseError)+' m';$('grade').textContent=m.finished?String(g.score):`${g.score}（进行中）`;
 $('telemetry').textContent=`当前阶段：${STAGES[m.stage]||m.stage} ｜ 基座偏航 ${fix(m.q[0])} rad；肩关节 ${fix(m.q[1])} rad；肘关节 ${fix(m.q[2])} rad ｜ 夹爪：${m.gripperClosed?'闭合':'张开'}`;
 const lines=g.components.map(x=>`<tr><td>${x.name}</td><td>满分 ${x.max}</td><td>${x.points}</td></tr>`);$('rubric').innerHTML=lines.join('');$('evaluation').textContent=`已采摘 ${g.picked}/${g.ripe}；未成熟果实保护 ${g.unripeDamaged?'失败':'通过'}；失败/拒绝操作 ${m.failed} 次；${g.completed?'实验完成，可保存成绩':'尚未完成，不可提交正式成绩'}`;
 $('fruitTable').textContent='';for(const f of m.fruits){const tr=document.createElement('tr');for(const v of [f.id,f.ripe?'成熟':'未成熟',f.status==='picked'?'入筐完成':f.status==='held'?'正在夹取':'待处理']){const td=document.createElement('td');td.textContent=v;tr.append(td)}$('fruitTable').append(tr)}
 $('log').textContent=m.logs.slice(-18).map(v=>`[${fix(v.t,1)} s] ${v.message}`).join('\n')||'等待实验';$('log').scrollTop=$('log').scrollHeight;
 if(!m.busy&&m.finished){running=false;auto=false;info('实验完成 · 8颗成熟果实采摘结束')}
 else if(running)info(`执行中 · ${STAGES[m.stage]||m.stage}`);
 view?.draw();}
function tick(dt=.04){if(auto&&!m.busy&&!m.finished){const p=m.autoNext();if(!p.ok){running=false;auto=false;info(p.reason)}}if(m.busy)m.tick(dt);if(!m.busy&&m.finished){running=false;auto=false;} }
function reset(){rendererGeneration++;const seed=(Math.floor(+$('seed').value)||20261023)>>>0;running=false;auto=false;carry=0;m=new HarvestMission(seed,settings());saved=false;view?.dispose();view=null;const root=$('harvestStage');root.querySelectorAll('canvas').forEach(n=>n.remove());const c=document.createElement('canvas');c.width=1000;c.height=580;root.prepend(c);view=makeHarvestFallback(c,m);mode='2D';$('renderMode').textContent='2D 可运行备份 · 正在尝试 WebGL 三维';renderFruitChoices();update();enableThree();info('实验已重置');}
let rendererGeneration=0;
async function enableThree(){const generation=++rendererGeneration;try{
 let T;try{T=await import('./vendor/three.module.js')}catch{T=await Promise.race([import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Three.js 加载超时')),5500))])}
 if(generation!==rendererGeneration)return;
 const root=$('harvestStage');const old=view;const next=makeHarvestRenderer(T,root,m);if(generation!==rendererGeneration){next.dispose();return;}view=next;mode='WebGL';root.querySelectorAll('canvas').forEach(n=>{if(n!==root.lastElementChild&&n!==next.renderer?.domElement&&n!==root.querySelector('canvas:last-of-type')){} });
 // Remove fallback canvas; keep the new WebGL canvas.
 const list=Array.from(root.querySelectorAll('canvas'));for(const c of list.slice(0,-1))c.remove();old?.dispose();$('renderMode').textContent='Three.js 3D 草莓园与三关节机械臂';view.draw();
 }catch(e){if(generation!==rendererGeneration)return;$('renderMode').textContent='2D 备用视图（Three.js/WebGL不可用）：'+String(e?.message||e)}}
function result(){const rec=m.result($('student').value.trim()||'匿名');return {...rec,score:rec.grade.score,elapsed:rec.grade.elapsed,seed:m.seed,completed:m.finished,backend:mode,student:rec.student,params:settings(),datetime:new Date().toISOString()}}
function download(data,name,type){const blob=new Blob([data],{type}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),3000)}
function csvSafe(x){return '"'+String(x??'').replaceAll('"','""')+'"'}
function events(){
 for(const id of ['gripWidth','offset','motionScale'])$(id).oninput=()=>{if(m.busy)return;applySettings();update()};
 $('seed').onchange=reset;
 $('ik').onclick=()=>{applySettings();const f=m.fruits.find(x=>x.id===$('fruit').value),p=pickPlan(f,settings());info(p.ok?`IK成功 · ${f.id} · ${p.segments.length}段轨迹， ${p.segments.reduce((n,s)=>n+s.frames.length,0)} 帧`:'IK/采摘条件不满足：'+p.reason);};
 $('pick').onclick=()=>{if(m.busy){info('请先完成当前采摘');return;}applySettings();let p=m.start($('fruit').value);if(p.ok){running=true;auto=false;info('开始单目标采摘')}else info('无法执行：'+p.reason);update()};
 $('auto').onclick=()=>{if(m.finished){info('实验已经完成，请重置');return;}applySettings();auto=true;running=true;info('按成熟度自动执行采摘任务')};
 $('pause').onclick=()=>{running=false;auto=false;info('已暂停，可单步继续或重新执行自动采摘');};
 $('step').onclick=()=>{if(!m.busy){if(!auto){const p=m.start($('fruit').value);if(!p.ok){info(p.reason);update();return}}}running=false;auto=false;tick(.04);update()};
 $('reset').onclick=reset;
 $('exportJSON').onclick=()=>download(JSON.stringify({...result(),history:m.history,events:m.logs},null,2),`AgriBot_Harvest_${m.seed}.json`,'application/json');
 $('exportCSV').onclick=()=>{const list=[...records];if(m.finished&&!saved)list.push(result());if(!list.length){info('当前没有已完成实验记录');return;}const cols=['student','seed','score','elapsed','completed','backend','datetime'];download('\uFEFF'+[cols.join(','),...list.map(r=>cols.map(k=>csvSafe(r[k])).join(','))].join('\r\n'),'AgriBot_Harvest_Grades.csv','text/csv;charset=utf-8')};
 $('report').onclick=()=>{const r=result(),g=r.grade;const lines=[`# ${r.lesson}`,'',`学生：${r.student}  场景种子：${r.seed}`,'',`完成状态：${m.finished?'完成':'未完成'}  渲染模式：${mode}`,'',`夹爪开度：${fix(settings().gripWidth)} m  目标偏移：${fix(settings().offset)} m`,`轨迹速度倍率：${fix(settings().motionScale)}×`,'',`采摘：${g.picked}/${g.ripe} 成熟果实；保护未成熟：${g.unripeDamaged===0?'成功':'失败'}`,'',`用时：${g.elapsed} s；平均末端定位误差：${g.meanPoseError} m`,'',`教学成绩：${g.score}/100`,'',`|考核项目|得分|满分|`,'|---|---:|---:|',...g.components.map(x=>`|${x.name}|${x.points}|${x.max}|`),'','## 运行事件',...m.logs.map(e=>`- ${fix(e.t,1)} s：${e.message}`),'','**限制**：成熟度为仿真标签；夹持成功是教学近似，并非基于真实图像的 AI 识别或力控制。'];download(lines.join('\n'),`AgriBot_Harvest_Report_${m.seed}.md`,'text/markdown;charset=utf-8')};
 $('save').onclick=()=>{if(!m.finished){info('只有完成实验才能保存有效成绩');return;}if(saved){info('当前实验已保存');return;}records.push(result());saved=true;try{localStorage.setItem('agribot_harvest_results_v1',JSON.stringify(records.slice(-200)))}catch(e){info('成绩保存失败：'+e.message);return;}info('已保存本地实验成绩')};
 $('submit').onclick=async()=>{if(!m.finished){$('submitStatus').textContent='实验未完成，拒绝提交';return;}try{const res=await fetch('./api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class_code:$('classCode').value.trim(),record:result()})});const payload=await res.json();if(!res.ok)throw Error(payload.error||res.statusText);$('submitStatus').textContent='教师后台已接收采摘实验成绩';}catch(e){$('submitStatus').textContent='提交失败：'+e.message+'。GitHub Pages 不支持本地教师 API。'}};
}
function frame(now){const dt=Math.min(.1,(now-last)/1000);last=now;if(running){carry+=dt*6;let steps=0;while(carry>=.04&&steps++<30&&(auto||m.busy)&&!m.finished){tick(.04);carry-=.04;}if(!auto&&!m.busy)running=false;}if(m.busy||running)renderFruitChoices();update();requestAnimationFrame(frame)}
events();applySettings();reset();window.__harvestTest={state:()=>({time:m.time,stage:m.stage,busy:m.busy,finished:m.finished,fruits:m.fruits.map(f=>({...f})),result:result()}),stepN:(n=1)=>{running=false;for(let i=0;i<n;i++){if(!m.busy)break;tick(.04)}update();return result()},runAll:()=>{const x=m.runToEnd();update();return x},reset,mode:()=>mode};requestAnimationFrame(frame);
