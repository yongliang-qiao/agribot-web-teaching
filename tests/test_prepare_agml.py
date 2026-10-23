from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'))
from prepare_agml_maize_weed import infer_mapping, record_to_yolo, split_indices
from PIL import Image

class ClassLabel:
    names=['weed','maize']

class Foo:
    def __getitem__(self,k):
        if k=='objects':return {'category':ClassLabel()}
        raise KeyError(k)

def test_all():
    mapping,proof=infer_mapping(Foo());assert mapping=={1:0,0:1} and 'metadata' in proof
    img,lines,drop=record_to_yolo({'image':Image.new('RGB',(100,100)),'objects':{'bbox':[[0,0,30,40],[40,40,30,30],[95,95,20,20]],'category':[1,0,0]}},mapping)
    assert len(lines)==3 and drop==0,lines
    assert lines[0].split()[0]=='0' and lines[1].split()[0]=='1'
    assert lines[0].split()[1:] == ['0.1500000','0.2000000','0.3000000','0.4000000']
    assert lines[2].split()[-2:]==['0.0500000','0.0500000']
    assert split_indices(100,42)==split_indices(100,42)
    assert sum(x=='train' for x in split_indices(100,42).values())==70
    assert sum(x=='val' for x in split_indices(100,42).values())==15
    assert sum(x=='test' for x in split_indices(100,42).values())==15
    try:infer_mapping({'objects':{'category':'bad'}})
    except ValueError:pass
    else:raise AssertionError('missing class info should fail')
    print('PASS AgML conversion mapping, bbox, clamping and deterministic split')

if __name__=='__main__':test_all()
