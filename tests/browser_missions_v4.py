"""Real Chromium HTTP acceptance in genuine ES-module setup.
Validates four distinct mission paths in offline 2D fallback; WebGL and real ONNX require separate coverage.
"""
import contextlib, json, socketserver, threading, http.server, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def serve():
    handler=lambda *args,**kwargs:QuietHandler(*args,directory=str(ROOT),**kwargs)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server

def set_slider(page,id,value):
    page.locator('#'+id).evaluate('(el,value)=>{el.value=String(value);el.dispatchEvent(new Event("input",{bubbles:true}));}',value)

result={}
html=(ROOT/'index.html').read_text()
parts=[]
for name in ('core.mjs','missions.mjs','scene_realism.mjs','app.mjs'):
    code=(ROOT/name).read_text()
    code=re.sub(r'^import .*?;\n','',code,flags=re.M)
    code=re.sub(r'(?m)^export (?=(?:const|function))','',code)
    parts.append(code)
html=html.replace('<script type="module" src="./app.mjs"></script>', '<script type="module">\n'+'\n'.join(parts)+'\n</script>')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    ctx=browser.new_context(viewport={'width':1480,'height':900},accept_downloads=True)
    page=ctx.new_page();errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.route('https://**/*',lambda route:route.abort())
    page.set_content(html,wait_until='domcontentloaded')
    page.wait_for_function('!!window.__agriTest',timeout=12000)
    assert page.evaluate('window.__agriTest.backend()')=='fallback'
    page.fill('#student','四实验浏览器验收')
    for mission,expected_turn,expected_weeds in [('nav',0,0),('turn',1,0),('vision',0,11),('integrated',4,55)]:
        page.click('#reset');page.select_option('#lesson',mission)
        rec=page.evaluate('window.__agriTest.stepN(4000)')
        assert rec['mission']==mission,(mission,rec)
        assert rec['completed'] and not rec['aborted'],rec
        assert rec['turns']==expected_turn,(mission,rec['turns'])
        assert rec['totalWeeds']==expected_weeds
        assert rec['score'] is not None and 0<=rec['score']<=100
        if mission in ('nav','turn'):
            assert rec['weedHit']==0 and rec['TP']==0,'Navigation and turn experiments must not spray'
        if mission in ('vision','integrated'):
            assert rec['TP']+rec['FN']==expected_weeds
            assert 0<=rec['precision']<=1 and 0<=rec['F1']<=1
        assert page.locator('#rubric tr').count()>0
        assert float(rec['visionValidPct'])>0
        result[mission]={k:rec[k] for k in ['elapsed','rmse','turns','weedHit','TP','FP','FN','F1','cropSprayRisk','score','seed']}
        page.click('#save')
    assert page.locator('#records tr').count()==4
    # Identical seed + parameters should produce bit-for-bit numeric mission measurements.
    page.click('#reset');page.select_option('#lesson','vision')
    first=page.evaluate('window.__agriTest.stepN(4000)')
    page.click('#reset');page.select_option('#lesson','vision')
    second=page.evaluate('window.__agriTest.stepN(4000)')
    fields=['elapsed','rmse','TP','FP','FN','F1','cropSprayRisk','score']
    assert {k:first[k] for k in fields}=={k:second[k] for k in fields},(first,second)
    result['reproducibility']='identical metrics, seed, parameters, fixed step'
    # Threshold manipulation yields distinct, measurable classification results.
    conf=[]
    for threshold in [0.25,0.80]:
        page.click('#reset');page.select_option('#lesson','vision');set_slider(page,'conf',threshold)
        r=page.evaluate('window.__agriTest.stepN(4000)')
        conf.append({'threshold':threshold,'tp':r['TP'],'fp':r['FP'],'fn':r['FN'],'f1':r['F1']})
    assert conf[0]['tp']>conf[1]['tp'] and conf[0]['fp']>=conf[1]['fp'],conf
    result['confidence_sensitivity']=conf
    # Turn radius: correct match to 2.1m spacing vs wrong radius -> worse exit error.
    radius=[]
    for val in [1.05,1.35]:
        page.click('#reset');page.select_option('#lesson','turn');set_slider(page,'turnRadius',val)
        r=page.evaluate('window.__agriTest.stepN(2000)')
        radius.append({'radius':val,'exitError':r['turnExitError'],'score':r['score']})
    assert radius[0]['exitError']<radius[1]['exitError'],radius
    result['turn_sensitivity']=radius
    # Seed reproducibility against changed seed: geometry & labelled events are changed.
    seed=[]
    for val in [20261022,20261023]:
        page.click('#reset');page.select_option('#lesson','vision')
        page.fill('#seed',str(val));page.locator('#seed').dispatch_event('change')
        r=page.evaluate('window.__agriTest.stepN(4000)')
        seed.append({'seed':val,'tp':r['TP'],'fp':r['FP'],'score':r['score']})
    assert seed[0]!=seed[1],seed
    result['seed_sensitivity']=seed
    # No model: scores cannot be created and real model start button must block.
    page.click('#reset');page.select_option('#lesson','vision');page.select_option('#detector','onnx')
    page.click('#play'); assert '缺少ONNX模型' in page.locator('#status').inner_text()
    r=page.evaluate('window.__agriTest.stepN(4000)')
    assert r['score'] is None and r['weedHit']==0
    page.click('#save')
    assert page.locator('#records tr').count()==4
    result['missing_onnx_prevention']=True
    # Export all saved records (CSV / markdown), no current invalid ONNX record.
    with page.expect_download() as download_info:page.click('#csv')
    dl=download_info.value;dl.save_as(ROOT/'tests'/'four_missions_export.csv')
    csv=(ROOT/'tests'/'four_missions_export.csv').read_text(encoding='utf-8-sig')
    assert csv.count('四实验浏览器验收')==4 and 'turnExitError' in csv
    page.click('#reset');page.select_option('#lesson','integrated')
    r=page.evaluate('window.__agriTest.stepN(4000)')
    with page.expect_download() as download_info:page.click('#report')
    download_info.value.save_as(ROOT/'tests'/'mission_report.md')
    md=(ROOT/'tests'/'mission_report.md').read_text(encoding='utf-8')
    assert '量化评分依据' in md and '五行' in md and '教学标签模式' in md
    page.screenshot(path=str(ROOT/'tests'/'four_missions_browser.png'),full_page=True)
    assert not errors,errors
    result['saved_records']=4;result['csv_export']=True;result['markdown_export']=True;result['page_errors']=errors
    browser.close()

(ROOT/'tests'/'missions_v4_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
