from pathlib import Path
root=Path('/mnt/data/agribot_web_lab_v5')
p=root/'core.mjs';t=p.read_text();t=t.replace('const v=params.speed; s.time+=dt;','const v=params.actualSpeed??params.speed; s.time+=dt;')
t=t.replace('const steering=clamp(params.gain*optical*.24/Math.max(.6,params.look)+.9*yawErr,-.49,.49);s.steering=steering;', 'const visualSteering=params.gain*optical*.24/Math.max(.6,params.look)+.9*yawErr;\n  const steering=clamp(params.plannerSteering===undefined?visualSteering:visualSteering*.55+params.plannerSteering*.45,-.49,.49);s.steering=steering;')
p.write_text(t)
p=root/'missions.mjs';t=p.read_text();t=t.replace('else{o.hit=true;s.hit++;events.push({type:\'hit\',x:o.x,z:o.z});}',"else{if(!params.deferSpray){o.hit=true;s.hit++;}events.push({type:'hit',x:o.x,z:o.z,weedId:o.id});}")
p.write_text(t)
p=root/'index.html';t=p.read_text();t=t.replace('AgriBot v4.0','AgriBot v5.0').replace('AgriBot 田间视觉导航与精准作业虚拟仿真实验','AgriBot 3D · 智能农机与作业机器人综合教学平台')
newpanel='''<div id="advancedPanel" style="display:grid;gap:8px"><h2>v5 · 高级三维仿真与任务</h2>
<label><input id="advancedMode" type="checkbox"> 启用障碍物 / A* / 动力学近似 / 安全停车（原四实验可保持兼容）</label>
<div class="row"><button id="plan">A* 安全路径规划</button><button id="depthCapture">采集 RGB-D + 点云</button></div>
<div class="row"><button id="replayPlay">▶ 回放</button><button id="replayPause">Ⅱ 停止回放</button></div><input type="range" id="replaySlider" min="0" max="100" value="0" style="width:100%"><small id="advancedStatus">未启用高级动力学；尚未采集深度</small>
<div class="views"><div class="view"><h3>WebGL 深度图 / m</h3><canvas id="depthMap" width="160" height="90"></canvas></div><div class="view"><h3>点云俯视投影（传感器坐标）</h3><canvas id="pointCloud" width="320" height="180"></canvas></div></div>
<h2>机械臂与夹爪 · 3DOF 教学模型</h2><div class="control"><label>机械臂目标 x / m</label><input id="armX" type="number" min="-1" max="1" step="0.05" value="0.25"><label>目标高度 y / m</label><input id="armY" type="number" min="0.2" max="2" step="0.05" value="1.45"><label>目标 z / m</label><input id="armZ" type="number" min="0.05" max="1" step="0.05" value="0.55"></div>
<div class="row"><button id="armPlan">IK + 轨迹规划</button><button id="grip">夹爪 开/合</button></div><small id="armStatus">待规划 · 三关节演示非实际六轴机械臂</small>
<h2>模拟喷施与结果</h2><label>执行延迟 / s <span id="delayValue">0.35</span></label><input id="sprayDelay" type="range" min="0" max="1.2" step="0.05" value="0.35">
<div class="row"><button id="exportJSON">实验 JSON</button><button id="exportImage">带标记图像 PNG</button><button id="exportReplay">轨迹回放 JSON</button></div>
<h2>ROS 2 桥接（可选）</h2><input id="rosURL" type="text" value="ws://localhost:9090" aria-label="ROS bridge URL"><div class="row"><button id="rosConnect">连接 rosbridge</button><button id="rosPublish">发布仿真位姿</button></div><small id="rosState">ROS 2 未连接；没有真实硬件控制功能。</small>
<h2>教师后台 / 学生成绩提交</h2><a href="./teacher.html" target="_blank" rel="noopener">打开教师后台（需要本地 Python 服务器）</a><input id="classCode" placeholder="教师发放的班级加入码"><button id="submitClass">向教师后台提交已完成实验</button><small id="submitState">GitHub Pages 没有数据库，需单独部署后端。</small>
</div>
'''
t=t.replace('<details><summary>教学原型',newpanel+'<details><summary>教学原型')
t=t.replace('四套独立教学实验 · 确定性场景种子 · 可量化评分 · 真实相机像素视觉反馈 · 三维仿真','四项独立实验 · A* 避障 / 深度点云 / IK机械臂 / 教师后台（部分高级功能需要 WebGL 与服务端）')
# Add extra CSS
css='''#advancedPanel{border:1px solid #477769;border-radius:8px;padding:11px;background:#102d2a}#advancedPanel input[type=checkbox]{accent-color:#9fe7b9}#advancedPanel .views{grid-template-columns:1fr}#advancedPanel .view canvas{height:104px;object-fit:contain;background:#071717}#advancedPanel button{font-size:12px}#advancedPanel h2{margin:8px 0 1px;font-size:14px}#advancedPanel small{display:block}'''
t=t.replace('</style></head>',css+'</style></head>')
p.write_text(t)
