from playwright.sync_api import sync_playwright
from pathlib import Path
import re
import threading,json,os
ROOT=Path(__file__).resolve().parent.parent
html=(ROOT/'index.html').read_text()
parts=[]
for fname in ['core.mjs','missions.mjs','scene_realism.mjs','advanced_sim.mjs','rgbd.mjs','ros_bridge.mjs','arm_view.mjs','advanced_ui.mjs','app.mjs']:
 code=(ROOT/fname).read_text()
 code=re.sub(r'^import .*?;\n','',code,flags=re.M)
 code=re.sub(r'(?m)^export (?=(?:const|class|function|async))','',code)
 if fname=='advanced_ui.mjs':
  code=code.replace('const $=','const $advanced=').replace('$(', '$advanced(')
 parts.append(code)
html=html.replace('<script type="module" src="./app.mjs"></script>','<script>\n'+'\n'.join(parts)+'\n</script>')
outputs={};errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 cx=b.new_context(viewport={'width':1650,'height':1050},accept_downloads=True)
 page=cx.new_page();page.on('pageerror',lambda err:errors.append(str(err)))
 page.route('https://**/*',lambda route:route.abort())
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function('!!window.__agriTest',timeout=16000)
 assert page.evaluate('window.__agriTest.backend()')=='fallback'
 for mode in ['nav','turn','vision','integrated']:
  page.click('#reset')
  page.select_option('#lesson',mode)
  r=page.evaluate('window.__agriTest.stepN(5000)')
  outputs[mode]={k:r[k] for k in ['completed','aborted','score','turns','weedHit','elapsed']}
  assert r['completed'] and not r['aborted'] and r['score'] is not None,(mode,r)
 assert outputs['nav']['turns']==0 and outputs['turn']['turns']==1 and outputs['integrated']['turns']==4
 # JSON and PNG exports must work, and report is structured.
 with page.expect_download() as d:page.click('#exportJSON')
 path=ROOT/'tests'/'v5_export.json';d.value.save_as(path);data=json.loads(path.read_text())
 assert data['schema']=='edu.jlu.agribot.v5/result' and 'advanced' in data
 with page.expect_download() as d:page.click('#exportImage')
 d.value.save_as(ROOT/'tests'/'v5_annotated.png')
 assert (ROOT/'tests'/'v5_annotated.png').stat().st_size>500
 # Advanced controls: plan, arm IK and RGBD fallback messaging.
 page.click('#reset');page.check('#advancedMode');page.click('#plan');
 advancedText=page.locator('#advancedStatus').inner_text()
 arm='已迁移至独立实验5';assert page.locator('a[href="./harvest.html"]').count()>=1
 page.click('#depthCapture');depth=page.locator('#advancedStatus').inner_text()
 assert 'RGB-D不可用' in depth
 adv=page.evaluate('window.__agriTest.advanced()');assert adv['advancedEnabled']
 # Explicit obstacle behavior: either safe completion or traceable obstacle stop; no crash.
 page.select_option('#lesson','nav');page.click('#reset');page.click('#plan')
 ar=page.evaluate('window.__agriTest.stepN(5000)')
 outputs['advancedNav']={'completed':ar['completed'],'aborted':ar['aborted'],'abortReason':page.evaluate('window.__agriTest.getState().abortReason'),'planner':page.evaluate('window.__agriTest.advanced().planner')}
 assert ar['completed'] or ar['aborted']
 page.click('#reset');page.select_option('#lesson','vision');page.click('#reset')
 vr=page.evaluate('window.__agriTest.stepN(5000)')
 sp=page.evaluate('window.__agriTest.advanced().spray')
 outputs['advancedSpray']={'completed':vr['completed'],'aborted':vr['aborted'],'spray':sp,'weedHit':vr['weedHit']}
 assert sp['appliedL']>=0 and sp['delayS']==.35
 page.screenshot(path=str(ROOT/'tests'/'v5_browser.png'),full_page=True)
 assert not errors,errors
 b.close()
outputs['page_errors']=errors;outputs['fallback_depth_message']=depth;outputs['arm_ik']=arm
(ROOT/'tests'/'browser_v5_result.json').write_text(json.dumps(outputs,ensure_ascii=False,indent=2))
print(json.dumps(outputs,ensure_ascii=False,indent=2))

