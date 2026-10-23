# AgML 玉米与杂草检测模型

数据源：`Project-AgML/maize_weed_detection`，Hugging Face 数据集卡显示 CC BY 4.0。

运行 `training/prepare_agml_maize_weed.py`、`training/audit_yolo_dataset.py`、`training/train_real_onnx.py` 和 `training/check_onnx.py` 后，生成 `agml_maize_weed_yolov8n.onnx` 和 `agml_maize_weed_evaluation.json`。

**当前发行 ZIP 不含真实图像或训练模型，不能宣称已训练。** 将 ONNX 模型手工加载到网页，网页仅对原始 YOLOv8 两类输出进行推理。ONNX 自动喷施/评分仍需专门验收。
