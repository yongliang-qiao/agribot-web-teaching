# AgriBot Web Teaching Lab v5.0 — advanced teaching preview

An independently implemented browser-based agricultural robotics teaching simulator. This is **not a port of any third-party ROS/Gazebo project** and is not a validated rigid-body, wheel–soil, RGB-D sensor, crop-perception or pesticide-flow digital twin. Based on v4.1 with the existing four independent lessons preserved.

## Quick start (MacBook M5 / Windows / Linux)

```bash
cd agribot_web_lab_v5
bash scripts/vendor_browser_libs.sh    # download Three.js and onnxruntime-web while online
python3 -m http.server 8080
# open http://localhost:8080
```

Without the Three.js bundle or available CDN, the app runs a clearly labelled 2D fallback, **without depth acquisition or 3D model animation**. The original four experiments remain accessible.

## What's new

- A* grid planning within crop-row clearance, bounded curvature guidance, obstacle collision guard and emergency stop. Safety mode is opt-in and may report no safe path rather than crossing protected crop regions.
- A first-order drive response and empirically **unvalidated** tyre slip/traction approximation. Not a vehicle dynamics or wheel-soil physics engine.
- Optional simulated RGB-D depth pass using `MeshDepthMaterial` and `readRenderTargetPixels` from the Three.js renderer, depth visualization, metric depth conversion, camera point cloud, clickable 3D location, PLY export. Browser/WebGL end-to-end is **not yet acceptance tested**.
- Three-axis articulated teaching arm, analytic inverse kinematics, joint limits, cubic-smooth interpolated joint trajectory, gripper animation. Not a full six-axis robotic manipulator, planning-scene collision checking, MoveIt or ros2_control hardware system.
- Delayed spray trigger, flow volume accounting, virtual crop-protection interlock, bounded retry policy and nozzle animation. No droplet CFD, wind drift, actual deposition or calibrated actuators.
- Export structured JSON, a paired RGB/annotation PNG and time-sampled replay JSON. Replay is a pose-history visualization, not deterministic resimulation of full contacts.
- WebSocket rosbridge client for publishing **simulation-only** PoseStamped and JointTrajectory messages. Requires an external ROS 2 bridge. No actual drivers, motor control, emergency safety PLC or robot hardware access.
- Local-only teacher dashboard (`teacher.html`) and Python+SQLite backend with class creation, enrolment, student results, score aggregation and CSV export.
- Crop and weed geometry from independent V3-V5 maize and three weed shape generators, textured soil, with a cropped mature-maize reference photo supplied by the user. **No photogrammetry/scanned GLB models or licensed photorealistic foliage textures included.**

## Four independent teaching missions

1. Pixel-vision row following (single lane). 2. Continuous 4WS U-turn. 3. Detection + protected spray. 4. Five-row mission, four turns. Default (advanced mode off) preserves the same seed-based rubric as v4.1, producing independently graded experiments. Advanced mode changes dynamics and results and should be assessed separately.

## Local teacher backend (not for direct exposure on the public internet)

```bash
export AGRIBOT_ADMIN_TOKEN='CHOOSE_YOUR_OWN_LONG_RANDOM_SECRET'
python3 server/server.py
# open http://127.0.0.1:8080/teacher.html
# student lab http://127.0.0.1:8080/index.html
```

Use the teacher token to create a class, register each student's ID, distribute the class join code, then students submit completed results from the lab. The HTTP server listens on `127.0.0.1` only, without institutional SSO or TLS. **Do not deploy it to a public server as-is**; university production use requires TLS, identity federation, roles, privacy policy, security audit, backups and managed storage. GitHub Pages can host the static simulation **but not** this backend.

## External ROS 2 connection (optional)

```bash
# In your separate Ubuntu 24.04/ROS 2 Jazzy environment:
sudo apt install ros-jazzy-rosbridge-suite
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
```

On the browser page, enter `ws://localhost:9090` and explicitly click Connect. When the ROS host is elsewhere, set an appropriate authorized `wss://` endpoint. For the web's coordinates, the adapter publishes ROS `x = web z`, ROS `y = -web x`, ROS `z = 0` and yaw `-web yaw` for the PoseStamped visualization. Joint names `joint_base`, `joint_shoulder`, `joint_elbow` **must be mapped to your own robot** before any use; current code is not a driver.

## AgML maize/weed object detection

`training/` contains existing dataset preparation, annotation audit, YOLOv8 training and ONNX export scripts. No trained ONNX weights are included and no real-world inference accuracy is asserted. Complete dataset license review, independent validation, MPS training, browser post-processing tests and crop-protection test before making claims of real AI performance.

## Key files

- `index.html` browser UI; `app.mjs` base four missions; `missions.mjs` grading.
- `advanced_sim.mjs` planner, collision and simplified mechanics; `advanced_ui.mjs` integration.
- `rgbd.mjs` WebGL depth and point-cloud logic; `arm_view.mjs` articulated 3D arm; `ros_bridge.mjs` communication adapter.
- `teacher.html`, `server/server.py` local-only class/result management.
- `tests/browser_v5.py`, `tests/advanced_v5.test.mjs`, `tests/backend_v5.py` tests.

## Verification

```bash
node --test tests/core.test.mjs tests/advanced_v5.test.mjs
python3 tests/backend_v5.py
python3 tests/browser_v5.py
```

The Chromium regression test uses an **inline ES module-flattening test fixture** due to blocked browser navigation in the test container; its 2D fallback and UI logic results do not verify normal module delivery, 3D WebGL or actual hardware/ONNX operation. Check browser console + network modules on your MacBook or GitHub Pages deployment before release.

For a full university-grade digital twin, use ROS 2 Jazzy, Gazebo Harmonic, a validated soil/contact plugin, calibrated RGB-D and spray models, MoveIt 2, ros2_control drivers and secure learning-management services. This v5 is an extendable teaching prototype, not a substitute for these subsystems.

---

## v5.1: 实验5 · 果实智能采摘（独立实验）

**入口**：从 `index.html` 点击「🍓 进入实验5」，或直接访问 `harvest.html`。原有四个大田实验保持独立；机械臂不再挂载到大田喷施车辆上，也不再由玉米田页面控制。

实验5使用一个**独立草莓采摘台 + 停驻四轮机器人 + 三关节机械臂 + 简化夹爪 + 果筐**三维教学场景。固定种子产生8颗成熟、4颗未成熟果实。允许选择目标、检查正逆运动学、手动单目标采摘、连续自动采摘、暂停、单步、改变夹爪开度、末端抓取偏移及轨迹速度。执行顺序为接近→下降→闭合夹爪→抬升→移向果筐→释放→复位。

独立评分：成熟果实采摘率65分、未成熟果实保护15分、末端定位误差10分、任务完成10分；有确定性随机种子、独立 JSON / CSV / Markdown 实验报告和本地记录，教师后端 `/api/submit` 已增加 `harvest` 任务枚举。

**技术边界**：果实坐标与成熟度来自场景已知标签，并非真实相机/YOLO识别；教学夹持是阈值+状态机判定，未对果实变形、接触力、关节扭矩和机械臂自碰撞建模。3DOF IK 使用分析式位置逆解及关节插值；无 ROS2 实体关节命令。Three.js 失败时自动显示带状态的2D备用画面。不要把该示例称作完成了真实果实采摘视觉闭环或真实抓取动力学。

独立源文件：`harvest.html`, `harvest_app.mjs`, `harvest_core.mjs`, `harvest_scene.mjs`。测试：`node --test tests/harvest_v5_1.test.mjs`、`python tests/browser_harvest_v5_1.py`（离线浏览器测试）。已验证 2D 模式与 UI 工作流；由于当前环境无法获得 Three.js CDN，**真实 WebGL 三维动画仍需在联网浏览器中验收**。

## GitHub Pages 发布 v5.1

上传仓库根目录中的 `index.html`、`harvest.html`、所有 `.mjs` 模块以及 `assets/` 文件夹到同一个发布分支（不能只更新 `index.html`）。如网络允许执行 `bash scripts/vendor_browser_libs.sh` 将 Three.js 和 ONNX Runtime 文件固化到 `vendor/`，否则依赖 CDN。GitHub Pages 支持两个静态实验网页，但 **Python 教师后端需要独立运行，无法在 Pages 执行**。


## Release candidate security and scoring limitations
- The local Python teacher server now serves only a public allowlist of static frontend assets; database, tests, training scripts and hidden files are blocked. Bind address stays at 127.0.0.1. Use a reverse proxy with proper authentication, TLS and database isolation before any campus deployment.
- Browser-submitted grades and `completed` flags can be forged in developer tools. The backend does **not** independently replay experiments or validate score computations. Treat submitted results as formative practice until server-side verification is implemented.
- No real ONNX weights, external robot hardware acceptance or Mac M5 WebGL validation is included in this release.
