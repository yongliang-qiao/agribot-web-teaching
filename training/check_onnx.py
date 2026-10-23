#!/usr/bin/env python3
"""Smoke-test a trained YOLOv8 ONNX two-class crop/weed model on CPU.
Only tests I/O contract and numerically finite forward inference; DOES NOT establish mAP.
"""
import argparse
import json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('model',type=Path)
    ap.add_argument('--out',type=Path)
    args=ap.parse_args()
    try:
        import numpy as np
        import onnxruntime as ort
    except ImportError as e:
        raise SystemExit('Install numpy onnxruntime before checking') from e
    session=ort.InferenceSession(str(args.model),providers=['CPUExecutionProvider'])
    inp=session.get_inputs()[0];shape=inp.shape
    if len(shape)!=4 or shape[0]!=1 or shape[1]!=3 or not all(isinstance(v,int) and v>=64 for v in shape[2:]):
        raise SystemExit(f'Expected fixed RGB NCHW [1,3,H,W], actual {shape}')
    x=np.zeros(shape,dtype='float32')
    ys=session.run(None,{inp.name:x})
    y=ys[0]
    if y.ndim!=3 or y.shape[0]!=1 or (y.shape[1]!=6 and y.shape[2]!=6):
        raise SystemExit(f'Expected YOLOv8 raw 2-class output [1,6,N]/[1,N,6], actual {y.shape}')
    if not np.isfinite(y).all():raise SystemExit('NaN/Inf in model output')
    result={'model':str(args.model),'passed':True,'input':shape,'output':list(y.shape),'runtime':ort.__version__,'note':'Zero-input smoke test, NOT accuracy or field evaluation.'}
    if args.out:args.out.write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
