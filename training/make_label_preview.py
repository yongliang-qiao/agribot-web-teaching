#!/usr/bin/env python3
"""Manual label audit collage: green=crop, red=weed. Run before training!"""
import argparse,random
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--dataset',type=Path,required=True);p.add_argument('--output',type=Path,default=Path('labels_preview.jpg'));p.add_argument('--count',type=int,default=12);a=p.parse_args()
imgs=list((a.dataset/'images'/'train').glob('*'));random.Random(42).shuffle(imgs);imgs=imgs[:a.count]
canvas=Image.new('RGB',(1200,((len(imgs)+3)//4)*265),'#f4f4f4');D=ImageDraw.Draw(canvas)
for i,f in enumerate(imgs):
 try:
  im=Image.open(f).convert('RGB');W,H=im.size;im.thumbnail((288,227));ox=(i%4)*300;oy=(i//4)*265;canvas.paste(im,(ox,oy));
  lab=a.dataset/'labels'/'train'/(f.stem+'.txt')
  for line in lab.read_text().splitlines():
   cls,cx,cy,bw,bh=map(float,line.split());xc=cx*im.width;yc=cy*im.height;w=bw*im.width;h=bh*im.height
   D.rectangle((ox+xc-w/2,oy+yc-h/2,ox+xc+w/2,oy+yc+h/2),outline='#06f700' if cls==0 else '#ff3344',width=2)
  D.text((ox,oy+230),f.stem[:36],fill='#111')
 except Exception as e:D.text(((i%4)*300,(i//4)*265+230),str(e)[:30],fill='red')
a.output.parent.mkdir(parents=True,exist_ok=True);canvas.save(a.output,quality=88);print(a.output)
