#!/usr/bin/env python3
"""Check a REAL crop/weed YOLO object-detection dataset before training.

Reads data.yaml (requires PyYAML); validates class order, matching image/label
stems, finite normalized xywh bounds and duplicate image bytes between splits.
Does NOT create fake training examples or transform dataset licenses.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

EXTS={'.jpg','.jpeg','.png','.bmp','.webp'}


def audit_dataset(yaml_file: Path):
    import yaml
    info=yaml.safe_load(yaml_file.read_text(encoding='utf-8'))
    root=Path(info.get('path') or yaml_file.parent)
    if not root.is_absolute():root=(yaml_file.parent/root).resolve()
    names=info.get('names')
    classes=[names[i] if i in names else names[str(i)] for i in range(len(names))] if isinstance(names,dict) else names
    errors=[];warnings=[];stats={}
    if classes!=['crop','weed']:
        errors.append(f'Class order must be crop=0, weed=1 (actual: {classes})')
    hash_to_split={}
    for split in ('train','val','test'):
        entry=info.get(split)
        if not isinstance(entry,str):errors.append(f'Missing {split} image directory in YAML');continue
        image_dir=root/entry if not Path(entry).is_absolute() else Path(entry)
        if not image_dir.is_dir():errors.append(f'Missing folder: {image_dir}');continue
        images=sorted(f for f in image_dir.rglob('*') if f.suffix.lower() in EXTS)
        if not images:errors.append(f'No images found in {split}: {image_dir}')
        count={0:0,1:0}; unlabeled=0
        for image in images:
            # Standard YOLO layout is images/SPLIT/xx.jpg -> labels/SPLIT/xx.txt.
            label_path=Path(*('labels' if component=='images' else component for component in image.relative_to(root).parts)).with_suffix('.txt') if image.is_relative_to(root) else None
            label=root/label_path if label_path else image.parent.parent.parent/'labels'/image.parent.name/(image.stem+'.txt')
            if not label.exists():
                errors.append(f'Missing label file: {label}')
                continue
            if not label.read_text().strip():unlabeled+=1
            for line_n,line in enumerate(label.read_text().splitlines(),1):
                if not line.strip():continue
                parts=line.strip().split()
                if len(parts)!=5:errors.append(f'{label}:{line_n} expected five YOLO columns');continue
                try:
                    cls=int(parts[0]); x,y,w,h=[float(t) for t in parts[1:]]
                    if cls not in (0,1):raise ValueError('unexpected class index')
                    if not all(math.isfinite(v) for v in (x,y,w,h)):raise ValueError('NaN or infinity')
                    if w<=0 or h<=0 or x<0 or x>1 or y<0 or y>1 or x-w/2<-.001 or x+w/2>1.001 or y-h/2<-.001 or y+h/2>1.001:
                        raise ValueError('invalid normalized bbox')
                    count[cls]+=1
                except ValueError as exc:errors.append(f'{label}:{line_n} {exc}')
            digest=hashlib.sha256(image.read_bytes()).hexdigest()
            if digest in hash_to_split and hash_to_split[digest]!=split:
                errors.append(f'EXACT image leakage: {image} duplicated in {hash_to_split[digest]}')
            hash_to_split[digest]=split
        stats[split]={'images':len(images),'cropBoxes':count[0],'weedBoxes':count[1],'emptyLabelImages':unlabeled}
        if not count[0] or not count[1]:warnings.append(f'{split} has only one class; inspect source and stratification')
    warnings.append('Exact duplicate detection cannot detect adjacent frames from same field. Split by field/date/video before training.')
    return {'passed':not errors,'datasetRoot':str(root),'stats':stats,'errors':errors[:200],'errorCount':len(errors),'warnings':warnings}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--data',type=Path,required=True)
    ap.add_argument('--output',type=Path,help='Save JSON audit report')
    args=ap.parse_args()
    result=audit_dataset(args.data.resolve())
    output=json.dumps(result,ensure_ascii=False,indent=2)
    if args.output:args.output.write_text(output,encoding='utf-8')
    print(output)
    if not result['passed']:raise SystemExit(2)


if __name__=='__main__':main()
