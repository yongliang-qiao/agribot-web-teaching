# AgriBot Web Teaching Lab

独立实现的浏览器端农业机器人虚拟仿真教学原型，借鉴 Autonomous Spot-and-Treat AgriBot 的*功能思路*，不是该 GitHub 项目的代码移植。

## 直接运行

双击 `index.html` 即可，无需安装、无需联网。支持 macOS、Windows、Linux 的现代浏览器。

若需要在线网址，将 `index.html` 上传到 GitHub Pages、学校静态网站、Cloudflare Pages 或 Netlify 即可。此交付物本身不包含公共托管网址。

## 实验

1. 作物行路径跟踪：改变速度及 P 控制增益。
2. 杂草感知：设置模拟识别准确率，观察漏检。
3. 精准喷施：改变喷施半径，观察命中率。
4. 综合实验：完成五条作业通道，导出 CSV 评价记录。

## 模型局限

此版本是 Canvas 2D 教学模型。没有运行 ROS 2、Gazebo、YOLOv8 或真实物理引擎；视觉识别使用概率抽样代替深度学习推理，路径控制也作了教学化简。不得把其实验数据作为真实农机性能测试结果。

## 版权说明

网页原型为独立编写。参考来源：https://github.com/Sreelm10sj/ros2-autonomous-agribot 。未复制源仓库代码、权重、三维模型。若今后集成原仓库资源，应先核实许可或取得作者授权。
