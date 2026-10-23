# v4.1 数据集更换说明

本版以 **AgML Maize Weed Detection** 作为两类真实检测训练的**默认推荐数据源**，代替 CornWeed。

- 数据源：<https://huggingface.co/datasets/Project-AgML/maize_weed_detection>
- 500 张带框真实玉米田图像，5764 个标注框（依据公开数据卡）
- 许可：数据集卡标注 CC BY 4.0，使用时署名原作者、注明来源和更改
- 类别：来源 `maize`、`weed`，程序转换为网页要求的 `crop=0, weed=1`
- 原始边框：AgML HF 以绝对像素 `[xmin,ymin,width,height]` 表达

## MacBook M5 安装与训练

```bash
cd agribot_web_lab_v4_1_agml
python3 -m venv .venv
source .venv/bin/activate
pip install -r training/requirements-training.txt
python training/prepare_agml_maize_weed.py --output ~/datasets/agml_maize_weed
python training/audit_yolo_dataset.py --data ~/datasets/agml_maize_weed/data.yaml
python training/make_label_preview.py --dataset ~/datasets/agml_maize_weed --output ~/datasets/agml_preview.jpg
python training/train_real_onnx.py --data ~/datasets/agml_maize_weed/data.yaml --device mps --epochs 60 --batch 8
python training/check_onnx.py models/agml_maize_weed_yolov8n.onnx
python3 -m http.server 8080
```

打开 <http://localhost:8080>，实验3或4选择 `真实 YOLOv8 ONNX 推理` 并上传 `models/agml_maize_weed_yolov8n.onnx`。

**注意**：500 张图仅作教学训练基线。来源只有一个公开 train 分组；这里采用固定种子 70/15/15 图像级拆分，不保证不同地块或连续帧之间独立。实际训练必须有下载数据与计算环境；无法把转换脚本当作真实训练结果，也不能把网页内三维仿真图像上的表现当作数据集测试性能。

优先采集独立玉米田相机样本并评估域差异。
