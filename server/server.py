#!/usr/bin/env python3
"""Teaching-scale local HTTP backend for student results and teacher class statistics.
Not hardened or intended as a public multi-tenant university identity system.
"""
import json, os, sqlite3, csv, io, secrets, pathlib, sys
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
ROOT = pathlib.Path(__file__).resolve().parent.parent
DB = pathlib.Path(os.environ.get('AGRIBOT_DB', str(ROOT / 'server' / 'agribot.sqlite')))
ADMIN_TOKEN = os.environ.get('AGRIBOT_ADMIN_TOKEN', '')

def dbconnect():
 DB.parent.mkdir(exist_ok=True,parents=True)
 conn=sqlite3.connect(DB,timeout=10);conn.row_factory=sqlite3.Row
 conn.execute('PRAGMA journal_mode=WAL')
 conn.executescript('''CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL, student_id TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(class_id,student_id));
 CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY,class_id INTEGER NOT NULL,student_id TEXT NOT NULL,mission TEXT NOT NULL,score REAL,seed INTEGER,record TEXT NOT NULL,submitted TEXT NOT NULL);''')
 return conn
class Handler(SimpleHTTPRequestHandler):
 # Serve only explicitly public web assets. Never expose database, model training,
 # Python source, internal test fixtures, or hidden dotfiles over HTTP.
 PUBLIC_EXTENSIONS={'.html','.mjs','.js','.css','.png','.jpg','.jpeg','.svg','.wasm','.ico','.webp','.json'}
 BLOCKED_DIRS={'server','training','tests','scripts','models','__pycache__','.git'}
 def _public_path(self):
  from urllib.parse import unquote
  raw=unquote(urlparse(self.path).path)
  rel=pathlib.PurePosixPath(raw.lstrip('/'))
  parts=rel.parts
  if raw=='/':return '/index.html'
  if any(x in self.BLOCKED_DIRS or x.startswith('.') for x in parts):return None
  if '..' in parts:return None
  if rel.suffix.lower() not in self.PUBLIC_EXTENSIONS:return None
  return raw
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff')
  self.send_header('Referrer-Policy','no-referrer')
  self.send_header('X-Frame-Options','DENY')
  super().end_headers()
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def send_json(self,status,obj):
  b=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def body(self):
  if int(self.headers.get('Content-Length','0'))>250_000:raise ValueError('单次成绩最大250KB')
  raw=self.rfile.read(int(self.headers.get('Content-Length','0')));return json.loads(raw or '{}')
 def teacher(self):
  if not ADMIN_TOKEN or self.headers.get('Authorization','')!='Bearer '+ADMIN_TOKEN:
   self.send_json(403,{'error':'教师令牌错误，或服务器未配置 AGRIBOT_ADMIN_TOKEN'});return False
  return True
 def do_GET(self):
  p=urlparse(self.path);q=parse_qs(p.query)
  if not p.path.startswith('/api/'):
   safe=self._public_path()
   if safe is None:return self.send_error(403,'Static path not published')
   self.path=safe
   return super().do_GET()
  if p.path=='/api/health':return self.send_json(200,{'ok':True,'mode':'local teaching backend'})
  if not self.teacher():return
  with dbconnect() as conn:
   if p.path=='/api/classes':return self.send_json(200,{'classes':[dict(x) for x in conn.execute('SELECT * FROM classes ORDER BY id DESC')]})
   if p.path=='/api/stats':
    rows=conn.execute('''SELECT c.id,c.name,c.code,COUNT(DISTINCT s.id) students, COUNT(DISTINCT r.id) submissions,ROUND(AVG(r.score),2) avg_score
     FROM classes c LEFT JOIN students s ON c.id=s.class_id LEFT JOIN submissions r ON c.id=r.class_id GROUP BY c.id ORDER BY c.id DESC''').fetchall()
    return self.send_json(200,{'stats':[dict(x) for x in rows]})
   if p.path=='/api/submissions':
    cid=q.get('class_id',[''])[0];sql='SELECT * FROM submissions';args=[]
    if cid.isdigit():sql+=' WHERE class_id=?';args=[int(cid)]
    sql+=' ORDER BY id DESC LIMIT 5000';return self.send_json(200,{'submissions':[dict(x) for x in conn.execute(sql,args)]})
   if p.path=='/api/students':
    cid=q.get('class_id',[''])[0];rows=conn.execute('SELECT * FROM students WHERE class_id=? ORDER BY student_id',(int(cid) if cid.isdigit() else -1,)).fetchall()
    return self.send_json(200,{'students':[dict(x) for x in rows]})
  return self.send_json(404,{'error':'unknown endpoint'})
 def do_POST(self):
  try:data=self.body()
  except (ValueError,json.JSONDecodeError) as e:return self.send_json(400,{'error':str(e)})
  p=urlparse(self.path).path
  if p=='/api/classes':
   if not self.teacher():return
   name=str(data.get('name','')).strip()[:100]
   if not name:return self.send_json(400,{'error':'请填写班级名称'})
   code=secrets.token_urlsafe(6)[:8]
   with dbconnect() as conn:conn.execute('INSERT INTO classes(name,code,created) VALUES(?,?,?)',(name,code,datetime.now(timezone.utc).isoformat()))
   return self.send_json(201,{'name':name,'code':code})
  if p=='/api/students':
   if not self.teacher():return
   try:cid=int(data['class_id']);student_id=str(data['student_id'])[:64].strip();name=str(data['name'])[:100].strip()
   except (KeyError,TypeError,ValueError):return self.send_json(400,{'error':'字段缺失'})
   if not student_id or not name:return self.send_json(400,{'error':'学号和姓名必填'})
   try:
    with dbconnect() as conn:conn.execute('INSERT INTO students(class_id,student_id,name) VALUES(?,?,?)',(cid,student_id,name))
   except sqlite3.IntegrityError:return self.send_json(409,{'error':'已存在该学生'})
   return self.send_json(201,{'ok':True})
  if p=='/api/submit':
   code=str(data.get('class_code',''))[:16];r=data.get('record',{});
   if not isinstance(r,dict):return self.send_json(400,{'error':'成绩格式错误'})
   student_id=str(r.get('student','')).strip()[:64];mission=str(r.get('mission',''))[:32]
   try:score=r.get('score');score=float(score) if score is not None else None
   except (ValueError,TypeError):return self.send_json(400,{'error':'成绩数字格式错误'})
   if score is not None and not(0<=score<=100):return self.send_json(400,{'error':'成绩范围错误'})
   if not student_id or mission not in ('nav','turn','vision','integrated','harvest') or not r.get('completed'):
    return self.send_json(400,{'error':'必须填写学号并完成指定实验'})
   with dbconnect() as conn:
    cl=conn.execute('SELECT id FROM classes WHERE code=?',(code,)).fetchone()
    if not cl:return self.send_json(403,{'error':'班级加入码无效'})
    student=conn.execute('SELECT id FROM students WHERE class_id=? AND student_id=?',(cl['id'],student_id)).fetchone()
    if not student:return self.send_json(403,{'error':'当前学号不在教师登记的班级名单中'})
    conn.execute('INSERT INTO submissions(class_id,student_id,mission,score,seed,record,submitted) VALUES(?,?,?,?,?,?,?)',(
     cl['id'],student_id,mission,score,int(r.get('seed',0)),json.dumps(r,ensure_ascii=False),datetime.now(timezone.utc).isoformat()))
   return self.send_json(201,{'ok':True,'message':'已提交本地教学服务器'})
  return self.send_json(404,{'error':'unknown endpoint'})

def main():
 if not ADMIN_TOKEN:print('Warning: AGRIBOT_ADMIN_TOKEN unset; teacher endpoints disabled.',file=sys.stderr)
 dbconnect().close();port=int(os.environ.get('PORT','8080'))
 srv=ThreadingHTTPServer(('127.0.0.1',port),Handler)
 print(f'AgriBot local teaching server: http://127.0.0.1:{port}');srv.serve_forever()
if __name__=='__main__':main()
