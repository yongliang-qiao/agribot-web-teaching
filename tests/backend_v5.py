import os,sys,subprocess,tempfile,time,urllib.request,json,socket
from pathlib import Path
R=Path(__file__).resolve().parent.parent
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
with tempfile.TemporaryDirectory() as d:
 env={**os.environ,'PORT':str(port),'AGRIBOT_ADMIN_TOKEN':'temporary-test-token','AGRIBOT_DB':str(Path(d)/'db.sqlite')}
 proc=subprocess.Popen([sys.executable,str(R/'server/server.py')],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 def req(endpoint,body=None,admin=False):
  headers={'Content-Type':'application/json'}
  if admin:headers['Authorization']='Bearer temporary-test-token'
  request=urllib.request.Request(f'http://127.0.0.1:{port}/api/{endpoint}',data=json.dumps(body).encode() if body is not None else None,headers=headers)
  with urllib.request.urlopen(request,timeout=4) as r:return json.load(r)
 try:
  for _ in range(30):
   try:assert req('health')['ok'];break
   except (OSError,ConnectionError):time.sleep(.1)
  else:raise RuntimeError('backend did not start')
  new=req('classes',{'name':'农业机器人实验 2026'},True);assert len(new['code'])==8
  cls=req('classes',admin=True)['classes'][0];assert cls['name']=='农业机器人实验 2026'
  req('students',{'class_id':cls['id'],'student_id':'2026001','name':'测试学生'},True)
  record={'student':'2026001','mission':'nav','score':85,'seed':101,'completed':True}
  req('submit',{'class_code':new['code'],'record':record})
  req('submit',{'class_code':new['code'],'record':{'student':'2026001','mission':'harvest','score':92,'seed':102,'completed':True}})
  summary=req('stats',admin=True)['stats'][0];assert summary['students']==1 and summary['submissions']==2 and summary['avg_score']==88.5
  subs=req('submissions?class_id='+str(cls['id']),admin=True)['submissions'];assert len(subs)==2
  print('Backend PASS: auth, class creation, roster, student submission and class aggregation')
 finally:
  proc.terminate();proc.communicate(timeout=3)
