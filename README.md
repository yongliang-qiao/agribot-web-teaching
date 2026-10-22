# AgriBot Web Teaching Lab v4.1 — GitHub Pages 发布版

这是用于静态网页托管的精简包，来源为 v4.1 AgML 版工程。仅包含在线演示运行所需的网页和 JavaScript 模块，不包含训练代码、真实 ONNX 模型或数据集。

## 如何发布

1. 解压 ZIP，将其中 `index.html`、`app.mjs`、`core.mjs`、`missions.mjs`、`scene_realism.mjs` 及 `.nojekyll` 上传到 GitHub 仓库的 **根目录**；不要上传 ZIP 文件本身。
2. 仓库 `Settings → Pages → Deploy from a branch → main → /(root) → Save`。
3. 网页地址通常为 `https://<用户名>.github.io/<仓库名>/`，发布后使用强制刷新避免旧缓存。

## 运行机制与限制

- 页面优先从 `./vendor/three.module.js` 加载 Three.js，文件不存在时从 jsDelivr CDN 加载；因此默认需要互联网访问 jsDelivr，或自行补齐 `vendor/`。
- 网页有四项独立教学任务与固定种子模拟评分；无法载入 Three.js 时切换二维降级演示。
- 在线版本没有训练好的 AgML 玉米/杂草 ONNX 权重；需要另外训练后通过页面上传。真实 ONNX 检测尚未通过完整独立测试，也不能宣称模型 AI 评分已验证。
- 学生记录仅保存在当前浏览器 localStorage，不会自动上传服务器，也不能实现教师统一管理。
- GitHub Pages 为静态托管，不能在站点服务器上运行 YOLO 模型训练。

## 完整开发版

完整源码、训练脚本、测试程序、AgML 数据集说明另在 `AgriBot_v4_1_AgML_MaizeWeed_Dataset.zip`。
