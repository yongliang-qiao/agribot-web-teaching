#!/usr/bin/env python3
"""Train on REAL annotated maize/weed images and export YOLOv8 ONNX.

The repository intentionally does not contain any weights or AgML images.
Requirements: pip install ultralytics onnx onnxruntime pyyaml
Usage: python train_real_onnx.py --data /path/to/data.yaml --device mps --epochs 60
The generated model is suitable for browser ONLY if classes are exactly crop=0, weed=1.
"""
import argparse
import json
import shutil
from pathlib import Path


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--data',type=Path,required=True,help='Data YAML with train/val/test directories and names: {0: crop, 1: weed}')
    ap.add_argument('--weights',default='yolov8n.pt',help='YOLOv8 base model checkpoint (local file or ultralytics name)')
    ap.add_argument('--device',default='mps',help='mps for Apple Silicon/macOS, cpu or CUDA 0')
    ap.add_argument('--epochs',type=int,default=60)
    ap.add_argument('--imgsz',type=int,default=640)
    ap.add_argument('--batch',type=int,default=8)
    ap.add_argument('--project',default='runs/agriculture')
    ap.add_argument('--deploy-dir',type=Path,default=Path(__file__).resolve().parents[1]/'models')
    args=ap.parse_args()
    if not args.data.is_file():ap.error(f'data YAML missing: {args.data}')
    try:
        from ultralytics import YOLO
        import yaml
    except ImportError as exc:
        raise SystemExit('Install: pip install ultralytics onnx onnxruntime pyyaml') from exc
    data=yaml.safe_load(args.data.read_text(encoding='utf-8'))
    names=data.get('names',{})
    labels=list(names.values()) if isinstance(names,dict) else names
    if labels!=['crop','weed']:
        raise SystemExit('Class order must be exactly crop=0 and weed=1; got '+str(labels))
    # Strict dataset audit BEFORE training prevents broken bboxes or exact image leakage.
    from audit_yolo_dataset import audit_dataset
    audit=audit_dataset(args.data.resolve())
    if not audit['passed']:
        raise SystemExit('Dataset audit failed; run python training/audit_yolo_dataset.py --data ... to inspect: '+str(audit['errors'][:6]))
    # Datasets without validation should not be used to claim unbiased metrics.
    for split in ['train','val','test']:
        if split not in data:raise SystemExit(f'Missing {split} split in data.yaml')
    model=YOLO(args.weights)
    model.train(data=str(args.data.resolve()),epochs=args.epochs,imgsz=args.imgsz,batch=args.batch,
                device=args.device,project=args.project,name='crop_weed_yolov8',exist_ok=False,seed=42,
                pretrained=True,patience=18,workers=2,plots=True)
    best=Path(model.trainer.best)
    trained=YOLO(str(best))
    metrics=trained.val(data=str(args.data.resolve()),split='test',imgsz=args.imgsz,device=args.device)
    onnx_path=trained.export(format='onnx',imgsz=args.imgsz,opset=12,simplify=False,dynamic=False,nms=False)
    info={'checkpoint':str(best),'onnx':str(onnx_path),'trainData':str(args.data.resolve()),
          'test_mAP50_95':float(metrics.box.map),'test_mAP50':float(metrics.box.map50),
          'note':'Evaluation on user supplied held-out real test images; DO NOT extrapolate to synthetic sim images or new fields.'}
    out=Path(onnx_path).with_suffix('.evaluation.json')
    out.write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
    args.deploy_dir.mkdir(parents=True,exist_ok=True)
    dest=args.deploy_dir/'agml_maize_weed_yolov8n.onnx'
    shutil.copy2(onnx_path,dest)
    shutil.copy2(out,args.deploy_dir/'agml_maize_weed_evaluation.json')
    info['browser_model_path']=str(dest)
    print(json.dumps(info,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
