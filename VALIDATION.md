# AgriBot v5.0 — engineering validation ledger

Date: 2026-10-23. Tested inside the available isolated container; MacBook M5 hardware and genuine 3D WebGL/CDN could not be accessed here.

| Module | Test performed | Result |
|---|---|---|
| `core.mjs` | Legacy camera feedback, YOLO format, turn and motion unit test | PASS |
| A* / obstacle | Safe segment path, impossible route detection, collision/crop corridor constraints | PASS unit test |
| Advanced navigation | Browser synthetic-camera obstacle course at fixed seed | PASS; completes without collision in 2D fallback |
| Speed response/slip | Numeric bounded dynamics | PASS unit test; physical calibration NOT performed |
| Arm inverse kinematics | Reachable target, limit error, forward/backward position, trajectory | PASS unit test; 3D model animation NOT checked |
| Delayed spray | Time delay, count, litre volume and crop interlock | PASS unit test and advanced single-lane browser test |
| RGB-D depth | Depth-space algebra and point reconstruction | PASS unit test; GPU depth readback NOT checked |
| Five-row missions | Four independent tasks + deterministic rubric (advanced off) | PASS Chromium inline-bundle 2D fallback |
| Reports | JSON and PNG download (CSV/MD inherited from v4.1) | PASS browser fallback |
| Teacher backend | Admin token, class creation, student register/submit and aggregate | PASS Python local HTTP integration |
| ROS2 | JSON WebSocket protocol adapter syntax and topic wiring | STATIC ONLY; ROS server/hardware NOT available |
| Three.js | Existing procedural vegetation and rover; added IK arm and spray animation | STATIC ONLY; real Three.js/WebGL rendering NOT tested |
| ONNX | Existing loader and script | NOT trained or evaluated; no verified trained model |
| Realistic GLB plants / rigid-body dynamics | Not included | NOT IMPLEMENTED |

## Browser regression outputs

- Lesson 1: 88/100, one lane, 0 turns.
- Lesson 2: 99/100, one continuous turn.
- Lesson 3: 69/100, teaching labels, not real AI.
- Lesson 4: 73/100, five lanes and four turns.
- Advanced single-lane navigation: completed without collision in 2D fallback, A* route with 8 key points at chosen fixed seed.
- Advanced spray scenario: 8 virtual spray hits, 0.0104 L delivered, 15 crop-protection/failed attempts recorded. These values depend on illustrative flow/radius parameters; **not agronomic truth**.
- All browser JavaScript errors collected: none in test fixture.
- Screenshot: `tests/v5_browser.png`; machine-readable log: `tests/browser_v5_result.json`.

## Mandatory tests before claiming production readiness

1. Download/pin bundled Three.js + ONNX Runtime and verify real WebGL rendering in macOS Chrome and Safari.
2. Validate WebGL depth near/far packing and world-space point cloud against known-distance meshes.
3. Verify ONNX exported class mapping and independent held-out maize/weed dataset labels, mAP, latency and false crop-spray cases.
4. Validate slip/turning limits, obstacle map creation from actual perception rather than simulator truth, collision envelopes, terrain and wheel/soil contacts.
5. Replace teaching arm with calibrated manipulator URDF, self-collision constraints and real `ros2_control` joint names; no hardware actuation until separately reviewed.
6. Integrate institutional accounts, HTTPS, access controls and server database governance before students submit identifying information over a network.

---

## v5.1: Separate harvesting lesson verification (2026-10-23)

- Added independent `harvest.html` page and 3D strawberry teaching scene; removed visible arm controls and arm geometry from original maize spraying page.
- `node --test tests/harvest_v5_1.test.mjs`: 6/6 passed (deterministic fruit data, unripe protection, IK/FK pose check, 8 ripe fruit task, invalid gripper/offset handling, repeated runs).
- `python tests/browser_harvest_v5_1.py`: Chromium 2D fallback UI workflow passed (select target, IK, manual pick, automatic harvest 8/8, report/JSON/CSV download, local storage stub, same seed rerun, main-page link). **Browser fixture uses flattened inline modules because local HTTP localhost navigation is blocked in the test environment.** Not equivalent to testing deployed ES module paths.
- `python tests/browser_v5.py`: four original field lessons still passed: nav 88, turn 99, vision 69, integrated 73 (2D fallback with existing educational rubric); advanced planner and spray checks passed.
- `python tests/backend_v5.py`: class/student and teacher records, now including new `harvest` mission, passed.
- REAL Three.js/WebGL hardware-accelerated scene: **NOT run / not validated in this container**. Requires normal online MacBook Chrome/Safari test.
- NOT included: trained fruit maturity ONNX detector, calibrated RGB-D hand-eye transform, force control, fruit contact physics, collision-tested MoveIt 2 arm, physical ros2_control actuation.
