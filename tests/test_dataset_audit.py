from pathlib import Path
import tempfile
from audit_yolo_dataset import audit_dataset


def run():
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp)
        (root/'data.yaml').write_text('path: .\ntrain: images/train\nval: images/val\ntest: images/test\nnames: [crop, weed]\n',encoding='utf-8')
        for k, split in enumerate(['train','val','test']):
            (root/'images'/split).mkdir(parents=True)
            (root/'labels'/split).mkdir(parents=True)
            (root/'images'/split/f'{split}.jpg').write_bytes(('valid-'+split).encode())
            (root/'labels'/split/f'{split}.txt').write_text('0 0.5 0.5 0.2 0.3\n1 0.3 0.4 0.1 0.2\n')
        result=audit_dataset(root/'data.yaml')
        assert result['passed'], result
        # Inverse-label / malformed bounds caught.
        (root/'labels'/'test'/'test.txt').write_text('1 1.4 0.3 0.2 0.3\n')
        invalid=audit_dataset(root/'data.yaml')
        assert not invalid['passed'] and invalid['errorCount']>0
        (root/'labels'/'test'/'test.txt').write_text('0 0.5 0.5 0.2 0.3\n1 0.3 0.4 0.1 0.2\n')
        (root/'images'/'test'/'test.jpg').write_bytes((root/'images'/'train'/'train.jpg').read_bytes())
        leak=audit_dataset(root/'data.yaml')
        assert not leak['passed'] and any('leakage' in e for e in leak['errors'])
        print('PASS dataset audit: correct classes, normalized bounding boxes, duplicate image leakage')

if __name__=='__main__':run()
