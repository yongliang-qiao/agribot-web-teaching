# 实验4 · 五行自主作业综合考核

学生：四实验浏览器验收 | 统一随机种子：20261023 | 状态：完成

任务：5条通道、4次连续掉头、视觉导航、杂草检测与精准喷施；统一采集轨迹、识别、作业与成绩。
操作：先用相同种子运行基准组并保存，再仅改变一项参数重跑；比较导航误差、作业覆盖、检测F1、命中率、风险、总分。
完成判据：5行全部完成并完成4次掉头。

## 参数及运行结果

|指标|数值|
|---|---|
|student|四实验浏览器验收|
|mission|integrated|
|lesson|实验4 · 五行自主作业综合考核|
|seed|20261023|
|datetime|2026-10-22T13:25:47.241Z|
|speed|0.75|
|Kp|1.3|
|lookahead|1.1|
|turnRadius|1.05|
|confidence|0.35|
|sprayRadius|0.35|
|backend|fallback|
|detector|demo|
|modelLoaded|false|
|modelInferenceFrames|0|
|independentModelValidation|false|
|gradeType|教学标签模式（非AI识别精度）|
|completed|true|
|aborted|false|
|elapsed|111.1|
|rmse|0.1213|
|maxError|0.2537|
|visionValidPct|88.5|
|turns|4|
|turnExitError|0.0798|
|turnArcError|9.896|
|maxStep|0.0375|
|weedDetected|55|
|weedHit|38|
|totalWeeds|55|
|cropSprayRisk|60|
|TP|55|
|FP|43|
|FN|0|
|TN|177|
|precision|0.5612|
|recall|1|
|F1|0.719|
|score|72|

## 量化评分依据

|评分项目|实测/判据|得分|
|---|---|---|
|任务完成|5行4次转弯|20/20|
|视觉导航误差|0.121 m|11.92/20|
|连续掉头|4/4|15/15|
|分类F1|0.72|14.38/20|
|杂草命中率|38/55|10.36/15|
|作物保护|风险60|0/10|

## 相同任务+种子的既有记录比较

## 学术诚信及技术边界
教学标签模式（非AI识别精度）
教学标签检测使用已知虚拟对象与可复现的模拟置信度，不能报告为模型检测mAP；真实ONNX模型需单独提供权重、独立标注验证及WebGL联调。Three.js仅渲染，不是Gazebo动力学。