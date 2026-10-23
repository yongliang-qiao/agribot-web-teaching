"""Offline Chromium acceptance. Tests functional 2D fallback because external Three.js CDN is unavailable here.
Run python tests/browser_acceptance.py; 3D WebGL and real ONNX with supplied weights require separately testing on target Mac.
"""
import re
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
core=(ROOT/'core.mjs').read_text().replace('export const ','const ').replace('export function ','function ')
app=(ROOT/'app.mjs').read_text()
app=re.sub(r'^import .*?;\n','',app,count=2,flags=re.M)
app=app.replace('async function loadThreeModule(){',"async function loadThreeModule(){throw Error('Offline browser test');")
html=(ROOT/'index.html').read_text().replace('<script type="module" src="./app.mjs"></script>',f'<script type="module">\n{core}\n{app}\n</script>')
(ROOT/'tests'/'offline_browser_fixture.html').write_text(html,encoding='utf-8')
results={}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1380,'height':900},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded');page.wait_for_function('!!window.__agriTest',timeout=13000)
 assert page.evaluate('window.__agriTest.backend()')=='fallback'
 page.fill('#student','教学验收-测试学生')
 for task in ['nav','turn','vision','integrated']:
  page.select_option('#lesson',task)
  record=page.evaluate('window.__agriTest.stepN(3400)')
  assert record['completed'],f'{task} did not finish'
  assert record['turns']==4,f'{task} did not turn four times'
  assert record['visionValidPct']>40,f'{task} no pixel vision feedback'
  assert record['elapsed']>80,f'{task} run ended unexpectedly'
  assert 0<=record['score']<=100
  results[task]={'completed':record['completed'],'turns':record['turns'],'rmse':record['rmse'],'visionValidPct':record['visionValidPct'],'hit':record['weedHit'],'score':record['score']}
  page.click('#save')
 assert page.locator('#records tr').count()==4
 with page.expect_download() as dl:page.click('#csv')
 download=dl.value
 assert download.suggested_filename.endswith('.csv')
 csvpath=ROOT/'tests'/'acceptance_record.csv';download.save_as(csvpath)
 text=csvpath.read_text(encoding='utf-8-sig');assert '教学验收-测试学生' in text and 'visionValidPct' in text
 with page.expect_download() as dl:page.click('#report')
 report=dl.value;assert report.suggested_filename.endswith('.md')
 report.save_as(ROOT/'tests'/'acceptance_report.md')
 assert '教学原型' in (ROOT/'tests'/'acceptance_report.md').read_text(encoding='utf-8') or '相机' in (ROOT/'tests'/'acceptance_report.md').read_text(encoding='utf-8')
 page.select_option('#detector','onnx')
 no_model=page.evaluate('window.__agriTest.stepN(3400)')
 assert no_model['weedHit']==0,'ONNX mode must not use hidden ground-truth demo spray'
 assert no_model['score'] is None,'Without ONNX weights experiment 3 must remain ungraded'
 results['onnx_without_model']={'weedHit':no_model['weedHit'],'detector':no_model['detector'],'onnxLoaded':no_model['onnxModelLoaded'],'score':no_model['score']}
 # Verify navigation parameter change affects measured error, not a decorative slider.
 comparison=[]
 for gain in ['0.3','3.0']:
  page.select_option('#lesson','nav');page.locator('#gain').evaluate("(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}",gain)
  result=page.evaluate('window.__agriTest.stepN(3400)')
  comparison.append((float(gain),result['rmse']))
 assert abs(comparison[0][1]-comparison[1][1])>.006,'Kp had no measurable effect'
 results['gain_comparison']=comparison
 assert not errors,errors
 page.screenshot(path=str(ROOT/'tests'/'browser_fallback_proof.png'),full_page=False)
 browser.close()
results['browser_errors']=errors
(ROOT/'tests'/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
