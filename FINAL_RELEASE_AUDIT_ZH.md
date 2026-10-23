# AgriBot Web Teaching Lab — Final Release Candidate 5.2

审查日期：2026-10-23。基于 v5.1，保留四项田间教学实验与独立草莓采摘实验。

## 本次修复
- 教师服务器静态文件访问使用公开资源允许清单，禁止通过 HTTP 访问 SQLite、服务器源代码、测试和训练文件。
- 设置 X-Content-Type-Options、Referrer-Policy、X-Frame-Options 等安全响应头。
- 果实采摘页面在重置时使尚未完成的 WebGL 异步加载结果失效，降低画布加载竞争风险。
- 补充服务器端不校验学生提交成绩的学术诚信提示。

## 测试（当前环境）
- Node.js：9项单元测试通过；全体 *.mjs 语法检查通过。
- Python：训练脚本、测试和教师服务器编译检查通过；教师 API 创建班级、登记学生、提交五类任务中的示例成绩、统计汇总通过。
- 安全：index.html / harvest.html / app.mjs HTTP 200；server/server.py、server/agribot.sqlite、tests/harvest_record.json、README.md HTTP 403。
- Chromium 2D 降级模式：四个独立大田实验及高级导航与喷施逻辑通过 (`tests/browser_v5.py`)；独立采摘任务、重复运行、JSON/CSV/Markdown 下载通过 (`tests/browser_harvest_v5_1.py`)。
- 旧测试 `tests/browser_missions_v4.py` 依赖 v4 模块拼接方式，在新版产生初始化超时；未作为最终验收依据。

## 未通过或未实施的验收
- WebGL + Three.js 在真实 MacBook M5 Safari/Chrome 的三维端到端图形验收。
- 真实 AgML 标注数据训练、ONNX 权重和浏览器真实推理的准确率测定。
- ROS 2 / rosbridge 实机控制、真实硬件驱动、力学级轮地接触/采摘力控制。
- 公网多用户后台安全与服务器端成绩复算；当前前端提交的 score/completed 可以人为修改，不具备防作弊认证。

## 部署
前端 GitHub Pages：发布根目录的 HTML/MJS/assets 文件；如需三维请加载合法 Three.js 依赖（见 scripts/vendor_browser_libs.sh）。
本地教师端：`export AGRIBOT_ADMIN_TOKEN="..." && python3 server/server.py`，再打开 `http://127.0.0.1:8080/teacher.html`。不应直接暴露该服务到公共互联网。
