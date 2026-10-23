/** Real *simulated* RGB-D: WebGL depth buffer readback from the same 3D scene as the RGB camera. */
export function decodePackedDepth(r,g,b,a){
 const k=255/256;const v=(r/(256**3)+g/(256**2)+b/256+a)/255*k;
 return Math.max(0,Math.min(1,v));
}
export function metricDepth(d,near,far){return near*far/(far-d*(far-near));}
export function cloudFromDepth(depth,w,h,camera,{stride=3,maxDepth=18}={}){
 const cloud=[],fov=camera.fov*Math.PI/180,fy=h/(2*Math.tan(fov/2)),fx=fy;
 for(let y=0;y<h;y+=stride)for(let x=0;x<w;x+=stride){const z=depth[y*w+x];if(!Number.isFinite(z)||z<=.08||z>maxDepth)continue;
   const xx=(x+.5-w/2)*z/fx,yy=(h/2-y-.5)*z/fy;
   cloud.push({x:xx,y:yy,z,px:x,py:y});
 }
 return cloud;
}
export function captureRGBD(T,scene,camera,renderer,{width=160,height=90,maxDepth=18}={}){
 const target=new T.WebGLRenderTarget(width,height,{minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true});
 const old=scene.overrideMaterial,oldColor=renderer.getClearColor(new T.Color()).clone(),oldAlpha=renderer.getClearAlpha(),oldTarget=renderer.getRenderTarget();
 const depthMat=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});depthMat.blending=T.NoBlending;
 const rgba=new Uint8Array(width*height*4);
 try{
  scene.overrideMaterial=depthMat;renderer.setClearColor(0xffffff,1);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,width,height,rgba);
 }finally{scene.overrideMaterial=old;renderer.setClearColor(oldColor,oldAlpha);renderer.setRenderTarget(oldTarget);target.dispose();depthMat.dispose();}
 const depths=new Float32Array(width*height),minMax={min:Infinity,max:0};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const src=((height-y-1)*width+x)*4,d=decodePackedDepth(rgba[src],rgba[src+1],rgba[src+2],rgba[src+3]);
   const z=metricDepth(d,camera.near,camera.far);depths[y*width+x]=z<=maxDepth?z:NaN;
   if(z<=maxDepth){minMax.min=Math.min(minMax.min,z);minMax.max=Math.max(minMax.max,z);}
 }
 const cloud=cloudFromDepth(depths,width,height,camera,{stride:3,maxDepth});
 return {width,height,depth:depths,cloud,count:cloud.length,valid:minMax.min!==Infinity,minDepth:minMax.min,maxDepth:minMax.max};
}
export function drawDepth(canvas,frame){const ctx=canvas.getContext('2d');canvas.width=frame.width;canvas.height=frame.height;const img=ctx.createImageData(frame.width,frame.height);
 for(let i=0;i<frame.depth.length;i++){const z=frame.depth[i],v=Number.isFinite(z)?Math.max(0,1-z/18):0;img.data[i*4]=Math.floor(255*v);img.data[i*4+1]=Math.floor(180*v);img.data[i*4+2]=Math.floor(90+150*v);img.data[i*4+3]=255}ctx.putImageData(img,0,0);}
export function drawCloud(canvas,frame){const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;ctx.fillStyle='#0c1820';ctx.fillRect(0,0,w,h);ctx.fillStyle='#61dfb6';for(const p of frame.cloud){const x=w/2+p.x*18,y=h-p.z*15;if(x>=0&&x<w&&y>=0&&y<h){ctx.globalAlpha=Math.max(.25,1-p.z/18);ctx.fillRect(x,y,2,2);}}ctx.globalAlpha=1;}

/** Unproject pixel + true WebGL z-buffer distance into a 3D world coordinate. */
export function pixelToWorld(frame,x,y,camera,T){
 x=Math.floor(x);y=Math.floor(y);
 if(x<0||y<0||x>=frame.width||y>=frame.height)return null;
 const z=frame.depth[y*frame.width+x];if(!Number.isFinite(z)||z<=0)return null;
 const fy=frame.height/(2*Math.tan(camera.fov*Math.PI/360)),fx=fy;
 return new T.Vector3((x+.5-frame.width/2)*z/fx,(frame.height/2-y-.5)*z/fy,-z).applyMatrix4(camera.matrixWorld);
}
export function cloudToPLY(frame,camera,T){
 const vertices=frame.cloud.map(p=>new T.Vector3(p.x,p.y,-p.z).applyMatrix4(camera.matrixWorld));
 return 'ply\nformat ascii 1.0\nelement vertex '+vertices.length+'\nproperty float x\nproperty float y\nproperty float z\nend_header\n'+vertices.map(p=>[p.x,p.y,p.z].map(x=>x.toFixed(5)).join(' ')).join('\n')+'\n';
}
