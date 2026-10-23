#!/usr/bin/env python3
"""Download AgML maize_weed_detection and convert actual HF annotations to YOLO.

Source: https://huggingface.co/datasets/Project-AgML/maize_weed_detection
License on dataset card: CC BY 4.0. No data are bundled with this code.

Bboxes are documented by AgML as unnormalized [xmin, ymin, width, height].
Category identities are read from ClassLabel; ambiguous category IDs are NEVER guessed.
"""
import argparse
import json
import math
import random
from collections import Counter
from pathlib import Path

REPO = 'Project-AgML/maize_weed_detection'


def infer_mapping(features, crop_id=None, weed_id=None):
    """Return {source_id: target_id} using verified metadata or explicit user IDs."""
    if crop_id is not None or weed_id is not None:
        if crop_id is None or weed_id is None or crop_id == weed_id:
            raise ValueError('Provide TWO distinct --crop-id and --weed-id values.')
        return {int(crop_id): 0, int(weed_id): 1}, 'explicit user mapping'
    try:
        obj = features['objects']
        cls_feature = obj['category']
        if not getattr(cls_feature,'names',None) and hasattr(cls_feature,'feature'):
            cls_feature=cls_feature.feature
        names=cls_feature.names
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError('Cannot infer class ID. Inspect Dataset.features and pass --crop-id and --weed-id.') from exc
    crop_names={'maize','corn','zea mays','crop','maize plant'}
    weed_names={'weed','weeds','weed plant'}
    crop_ids=[i for i,n in enumerate(names) if str(n).lower().strip() in crop_names]
    weed_ids=[i for i,n in enumerate(names) if str(n).lower().strip() in weed_names]
    if len(crop_ids)!=1 or len(weed_ids)!=1 or crop_ids[0]==weed_ids[0]:
        raise ValueError(f'Ambiguous {names=}. Pass --crop-id X --weed-id Y after verifying actual IDs.')
    return {crop_ids[0]:0,weed_ids[0]:1},'metadata: '+repr(names)


def record_to_yolo(record, mapping):
    """(PIL Image, YOLO lines, dropped) from a single AgML HF row."""
    im=record['image'].convert('RGB')
    width,height=im.size
    obs=record['objects']
    if not isinstance(obs,dict) or 'bbox' not in obs:
        raise ValueError('Expected objects.bbox dictionary, received '+str(type(obs)))
    cats=obs.get('category',obs.get('category_id'))
    if cats is None or len(cats)!=len(obs['bbox']):
        raise ValueError('category and bbox annotation array lengths mismatch')
    lines=[]; dropped=0
    for box,cat in zip(obs['bbox'],cats):
        if int(cat) not in mapping:
            raise ValueError(f'Unexpected class={cat}; mapping={mapping}')
        if len(box)!=4 or any(not math.isfinite(float(x)) for x in box):
            dropped+=1;continue
        x,y,w,h=map(float,box)
        if w<=0 or h<=0:
            dropped+=1;continue
        # Clamp source xywh to image bounds, including edge-touching boxes.
        x0=min(float(width),max(0,x)); y0=min(float(height),max(0,y))
        x1=min(float(width),max(0,x+w)); y1=min(float(height),max(0,y+h))
        if x1-x0 < 1 or y1-y0 < 1:
            dropped+=1;continue
        xc=(x0+x1)/(2*width); yc=(y0+y1)/(2*height)
        wn=(x1-x0)/width; hn=(y1-y0)/height
        lines.append(f'{mapping[int(cat)]} {xc:.7f} {yc:.7f} {wn:.7f} {hn:.7f}')
    return im,lines,dropped


def split_indices(n,seed):
    ids=list(range(n));random.Random(seed).shuffle(ids)
    a=int(n*.7);b=int(n*.85)
    return {idx:('train' if j<a else 'val' if j<b else 'test') for j,idx in enumerate(ids)}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--crop-id',type=int,help='Required only if metadata is ambiguous')
    p.add_argument('--weed-id',type=int,help='Required only if metadata is ambiguous')
    p.add_argument('--seed',type=int,default=42)
    args=p.parse_args()
    try:
        from datasets import load_dataset
        import yaml
    except ImportError as exc:
        raise SystemExit('Install `pip install datasets Pillow PyYAML` to download/convert the dataset') from exc
    ds=load_dataset(REPO,split='train')
    mapping,metadata=infer_mapping(ds.features,args.crop_id,args.weed_id)
    if len(ds)<30:raise SystemExit('Too few images for reliable three-way split')
    root=args.output.expanduser().resolve();root.mkdir(parents=True,exist_ok=True)
    indices=split_indices(len(ds),args.seed)
    counts=Counter();classes=Counter();dropped=0
    for i,row in enumerate(ds):
        sp=indices[i]
        idir=root/'images'/sp;ldir=root/'labels'/sp
        idir.mkdir(parents=True,exist_ok=True);ldir.mkdir(parents=True,exist_ok=True)
        img,lines,n_dropped=record_to_yolo(row,mapping)
        name=f'agml_{i:05d}'
        img.save(idir/(name+'.jpg'),quality=92)
        (ldir/(name+'.txt')).write_text('\n'.join(lines)+('\n' if lines else ''),encoding='utf-8')
        counts[sp]+=1;dropped+=n_dropped
        classes.update(int(line.split(' ',1)[0]) for line in lines)
    cfg={'path':str(root),'train':'images/train','val':'images/val','test':'images/test','names':{0:'crop',1:'weed'}}
    (root/'data.yaml').write_text(yaml.safe_dump(cfg,sort_keys=False,allow_unicode=True),encoding='utf-8')
    manifest={'source':REPO,'sourceURL':'https://huggingface.co/datasets/'+REPO,'license':'CC BY 4.0 according to dataset card',
      'sampleCount':len(ds),'mapping':mapping,'mappingEvidence':metadata,'splits':dict(counts),'boxesByConvertedClass':dict(classes),
      'boxesDroppedOutsideImage':dropped,'splitSeed':args.seed,
      'limitation':'Random IMAGE split; similar images from a field or sequence may leak between splits. Use independent field/time split for publication-grade generalization claims.'}
    (root/'dataset_manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(manifest,indent=2,ensure_ascii=False))
    print('Created',root/'data.yaml')

if __name__=='__main__':main()
