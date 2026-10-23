# 实验4：全流程虚拟仿真实验

**学生：** 教学验收-测试学生
**完成状态：** 完成
**仿真环境：** 2D 浏览器降级

通过视觉导航、五行自主运动、四次地头掉头和杂草喷施完成一轮实验；保存参数、比较成绩、导出报告。

①填写学号；②保存默认参数的完整实验；③改变速度/增益再运行；④对比两组 RMSE、有效视觉帧比例及总分。

| 指标 | 数值 |
|---|---|
| student | 教学验收-测试学生 |
| lesson | 实验4：全流程虚拟仿真实验 |
| datetime | 2026-10-22T12:50:37.407Z |
| speed | 0.8 |
| Kp | 1.3 |
| lookahead | 1.1 |
| confidence | 0.35 |
| sprayRadius | 0.35 |
| backend | fallback |
| detector | demo |
| onnxModelLoaded | false |
| visionControlSource | camera_pixel_ExG |
| aiValidation | simulation_truth_demo |
| completed | true |
| elapsed | 104.45 |
| rmse | 0.1474 |
| maxError | 0.2799 |
| visionValidPct | 88.2 |
| turns | 4 |
| turnPath | 13.195 |
| requiredTurnSteerDeg | 27.2 |
| outside | 0 |
| weedDetected | 55 |
| weedHit | 50 |
| totalWeeds | 55 |
| falseSpray | 7 |
| score | 86 |
| fieldSeed | 20261022 |

**技术边界：**相机来自 Three.js 虚拟传感器或离线降级的合成像素，导航反馈使用相机像素识别的横向误差，任务参考航向来自规划。喷施 demo 依赖仿真真值，不代表实际 AI 性能。ONNX 需已训练模型且要独立验证真实数据集 mAP。