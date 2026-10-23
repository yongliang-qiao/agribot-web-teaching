from playwright.sync_api import sync_playwright
from pathlib import Path
import re,json
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'harvest.html').read_text()
parts=[]
for fname in ['advanced_sim.mjs','harvest_core.mjs','harvest_scene.mjs','harvest_app.mjs']:
 code=(ROOT/fname).read_text()
 code=re.sub(r'(?m)^import .*?;\n','',code)
 code=re.sub(r'(?m)^export (?=(?:const|class|function|async))','',code)
 parts.append(code)
storage_stub='''<script>const __storage=Object.create(null);Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__storage[k]??null,setItem:(k,v)=>{__storage[k]=String(v)}}});</script>'''
html=html.replace('<script type="module" src="./harvest_app.mjs"></script>',storage_stub+'<script>\n'+'\n'.join(parts)+'\n</script>')
errors=[];results={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    cx=b.new_context(viewport={'width':1650,'height':1050},accept_downloads=True)
    page=cx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',lambda route:route.abort())
    page.set_content(html,wait_until='domcontentloaded')
    page.wait_for_function('!!window.__harvestTest',timeout=30000)
    results['initial']=page.evaluate('window.__harvestTest.state()')
    assert len(results['initial']['fruits'])==12
    assert page.locator('#fruit option').count()==12
    page.select_option('#fruit','F09')
    page.click('#ik')
    results['unripe_message']=page.locator('#runStatus').inner_text()
    assert '禁止采摘' in results['unripe_message']
    page.select_option('#fruit','F01');page.click('#ik')
    assert 'IK成功' in page.locator('#runStatus').inner_text()
    page.click('#pick')
    result=page.evaluate('window.__harvestTest.stepN(160)')
    assert result['grade']['picked']>=1,result
    page.click('#reset')
    result=page.evaluate('window.__harvestTest.runAll()')
    assert result['finished'] and result['result']['picked']==8,result
    results['result']=result['result']
    # Browser report / CSV / JSON downloads.
    for button,filename in [('report','harvest_report.md'),('exportJSON','harvest_record.json'),('exportCSV','harvest_grades.csv')]:
        with page.expect_download() as d:page.click('#'+button)
        d.value.save_as(ROOT/'tests'/filename)
        assert (ROOT/'tests'/filename).stat().st_size>100
    obj=json.loads((ROOT/'tests'/'harvest_record.json').read_text())
    assert obj['schema']=='edu.jlu.agribot.harvest.v1' and obj['completed']
    assert len(obj['history'])>500
    page.click('#save')
    assert page.evaluate('localStorage.getItem("agribot_harvest_results_v1")')
    # Deterministic repeat with same seed.
    page.click('#reset');same=page.evaluate('window.__harvestTest.runAll()')['result']
    assert same==results['result']
    page.screenshot(path=str(ROOT/'tests'/'harvest_browser_2d.png'),full_page=True)
    results['render_mode']=page.evaluate('window.__harvestTest.mode()')
    # Ensure cross-link and separate field study remain.
    assert 'href="./harvest.html"' in (ROOT/'index.html').read_text()
    results['main_has_fruit_link']=True
    assert not errors,errors
    b.close()
results['page_errors']=errors
(ROOT/'tests'/'harvest_v5_1_browser_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in results.items() if k!='initial'},ensure_ascii=False,indent=2))
