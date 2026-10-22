/* Original geometry: seedling maize V3–V5, pigweed, lambsquarters, foxtail
 * and a four-wheel autonomous agricultural rover. No stock 3D assets needed.
 * Realistic geometry does not constitute photogrammetry or photographed plants.
 */
export function installVegetation(T, scene, field) {
  const greenMat = new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.84,metalness:0});
  const veinMat = new T.LineBasicMaterial({color:0xa3cc61,transparent:true,opacity:.38});
  const vertices=[], colors=[], veins=[];
  const rand=v=>{let x=Math.sin(v*723.71+17.19)*43758.5453;return x-Math.floor(x)};
  const addTriangle=(a,b,c,col)=>{vertices.push(...a,...b,...c);for(let k=0;k<3;k++)colors.push(...col)};
  function leaf({x,y,z,az,len,width,rise=0.26,droop=0.30,twist=0.20,tint=[.22,.53,.14],serrated=0,seed=0}){
    const n=12;
    function point(t,side){
      const phi=az+twist*t*t, u=len*t, taper=Math.pow(Math.sin(Math.PI*t),.75);
      const wav=1+serrated*.12*Math.sin(35*t+seed*11);
      const w=side*width*taper*wav;
      return [x+Math.cos(phi)*u-Math.sin(phi)*w,
        y+len*(rise*t-droop*t*t)+Math.abs(w)*.08,
        z+Math.sin(phi)*u+Math.cos(phi)*w];
    }
    for(let j=0;j<n;j++){
      const a=j/n,b=(j+1)/n;
      const al=point(a,-1),ar=point(a,1),bl=point(b,-1),br=point(b,1);
      const hue=.86+rand(seed*20+j*2)*.19;
      const color=[tint[0]*hue,tint[1]*hue,tint[2]*hue];
      addTriangle(al,bl,ar,color);addTriangle(ar,bl,br,color);
      const m0=point(a,0),m1=point(b,0);veins.push(...m0,...m1);
    }
  }
  const stems=new T.InstancedMesh(new T.CylinderGeometry(.007,.021,1,7),new T.MeshStandardMaterial({color:0x44762e,roughness:.92}),field.crops.length);
  const place=new T.Object3D();
  field.crops.forEach((p,i)=>{
    const H=p.h;
    place.position.set(p.x,H*.5,p.z);place.scale.set(.9,H*.96,.9);place.rotation.set(0,0,0);place.updateMatrix();stems.setMatrixAt(i,place.matrix);
    const count=5+Math.floor(p.seed*3);
    for(let k=0;k<count;k++){
      const fraction=(k+1)/(count+1),a=k*2.40+p.seed*6.283,variation=.85+.3*rand(i*7+k),L=(.36+.32*fraction)*variation;
      leaf({x:p.x,y:H*(.14+.52*fraction),z:p.z,az:a,len:L,width:.035+.023*fraction,
       rise:.4,droop:.43,twist:(rand(i*17+k)-.5)*.4,seed:p.seed+k,
       tint:[[.19,.40,.09],[.21,.49,.13],[.25,.56,.15],[.30,.59,.18]][k%4]});
    }
    // New growth at the whorl; deliberately no ear or tassel at V3–V5.
    leaf({x:p.x,y:H*.69,z:p.z,az:p.seed*5,len:.26,width:.035,rise:.72,droop:.10,seed:p.seed,tint:[.38,.64,.20]});
  });stems.instanceMatrix.needsUpdate=true;scene.add(stems);
  const descriptions={pigweed:0,foxtail:0,lambsquarters:0};
  field.weeds.forEach((p,i)=>{
    const kind=p.kind==='grass'?'foxtail':p.kind==='broadleaf'?'pigweed':p.kind;
    descriptions[kind]=(descriptions[kind]||0)+1;
    let n=kind==='foxtail'?11:kind==='pigweed'?8:7;
    for(let k=0;k<n;k++){
      const a=2*Math.PI*k/n +p.seed*6.283,ratio=.75+.4*rand(i*3+k),h=kind==='foxtail'?.035:.02+.09*k/n;
      leaf({x:p.x,y:h,z:p.z,az:a,len:p.r*(kind==='foxtail'?1.9:1.2)*ratio,
        width:p.r*(kind==='foxtail'?.05:kind==='pigweed'?.24:.30),
        rise:kind==='foxtail'?.7:.25,droop:kind==='foxtail'?.45:.32,
        twist:kind==='foxtail'?.15:.30,serrated:kind==='lambsquarters'?1:0,seed:p.seed+k,
        tint:kind==='foxtail'?[.30,.48,.10]:kind==='pigweed'?[.20,.40,.09]:[.31,.48,.21]});
    }
  });
  const G=new T.BufferGeometry();G.setAttribute('position',new T.Float32BufferAttribute(vertices,3));G.setAttribute('color',new T.Float32BufferAttribute(colors,3));G.computeVertexNormals();
  const foliage=new T.Mesh(G,greenMat);foliage.name='Botanical meshes / maize V3-V5, pigweed, foxtail, lambsquarters';scene.add(foliage);
  const veing=new T.BufferGeometry();veing.setAttribute('position',new T.Float32BufferAttribute(veins,3));scene.add(new T.LineSegments(veing,veinMat));
  // Small dried residues: subtle field detail while keeping rendering cheap.
  const trashGeometry=new T.ConeGeometry(.012,.19,3), trash=new T.InstancedMesh(trashGeometry,new T.MeshStandardMaterial({color:0xb3a16d,roughness:1}),160);
  for(let i=0;i<160;i++){
    place.position.set((rand(i+39)-.5)*21,.015,(rand(i+113)-.5)*20);place.scale.set(1,1,1);place.rotation.set(0,rand(i+7)*6.28,Math.PI/2);place.updateMatrix();trash.setMatrixAt(i,place.matrix);
  }trash.instanceMatrix.needsUpdate=true;scene.add(trash);
  return {plantCount:field.crops.length,weedCount:field.weeds.length,species:descriptions,triangles:vertices.length/9};
}

export function buildRover3D(T,scene){
 const rover=new T.Group();rover.name='Autonomous maize sprayer / four independently steered wheels';scene.add(rover);
 const paint=new T.MeshStandardMaterial({color:0xd9ad3b,metalness:.26,roughness:.48});
 const steel=new T.MeshStandardMaterial({color:0x47595e,metalness:.72,roughness:.37});
 const dark=new T.MeshStandardMaterial({color:0x202b2c,roughness:.86});
 const light=new T.MeshStandardMaterial({color:0xc7d9d2,metalness:.56,roughness:.33});
 const cyan=new T.MeshStandardMaterial({color:0x1c7d80,metalness:.4,roughness:.2});
 const rubber=new T.MeshStandardMaterial({color:0x1d2321,roughness:.99});
 const tankMat=new T.MeshStandardMaterial({color:0xede9d5,roughness:.42});
 const add=(g,m,pos,holder=rover)=>{const mesh=new T.Mesh(g,m);mesh.position.set(...pos);mesh.castShadow=false;holder.add(mesh);return mesh};
 // Ladder frame and raised central gantry for row clearance.
 add(new T.BoxGeometry(1.05,.12,1.62),steel,[0,.64,-.04]);
 for(const x of [-.48,.48]){
   add(new T.BoxGeometry(.075,.50,.075),steel,[x,.90,-.42]);
   add(new T.BoxGeometry(.075,.50,.075),steel,[x,.90,.48]);
 }
 add(new T.BoxGeometry(1.12,.08,1.18),paint,[0,1.14,.03]);
 add(new T.BoxGeometry(.84,.27,.65),tankMat,[0,.86,-.22]);
 add(new T.BoxGeometry(.53,.14,.35),paint,[0,1.27,.19]);
 add(new T.BoxGeometry(.43,.055,.32),cyan,[0,1.36,.20]);
 // Weatherproof compute module and rear warning lights.
 add(new T.BoxGeometry(.44,.20,.30),steel,[0,1.29,-.34]);
 for(const sx of [-.40,.40]) add(new T.BoxGeometry(.12,.08,.03),new T.MeshStandardMaterial({color:0xbe3f2c,emissive:0x431107}),[sx,.93,-.85]);
 const wheels=[];const rad=.28;
 for(const x of [-.68,.68]) for(const z of [-.53,.53]) {
   const swivel=new T.Group();swivel.position.set(x,rad,z);rover.add(swivel);
   const spin=new T.Group();swivel.add(spin);
   const tire=add(new T.CylinderGeometry(rad,rad,.205,24,1),rubber,[0,0,0],spin);tire.rotation.z=Math.PI/2;
   for(let k=0;k<12;k++){
     const th=2*Math.PI*k/12;
     const pad=add(new T.BoxGeometry(.213,.052,.073),dark,[0,rad*Math.cos(th),rad*Math.sin(th)],spin);
     pad.rotation.x=th;
   }
   const hub=add(new T.CylinderGeometry(.118,.118,.218,18),light,[0,0,0],spin);hub.rotation.z=Math.PI/2;
   const cap=add(new T.CylinderGeometry(.053,.053,.226,12),cyan,[0,0,0],spin);cap.rotation.z=Math.PI/2;
   wheels.push({pivot:swivel,spin,radius:rad,front:z>0});
 }
 // Independent left/right booms, twin nozzles and hoses.
 add(new T.BoxGeometry(2.45,.065,.10),light,[0,.85,.82]);
 const nozzles=[];
 for(const x of [-1.09,-.82,.82,1.09]){
   const n=add(new T.CylinderGeometry(.042,.022,.18,12),paint,[x,.70,.83]);nozzles.push(n);
   add(new T.ConeGeometry(.060,.10,12),cyan,[x,.59,.83]);
   const points=[new T.Vector3(x*.42,.98,.15),new T.Vector3(x*.8,.95,.58),new T.Vector3(x,.79,.79)];
   add(new T.TubeGeometry(new T.CatmullRomCurve3(points),20,.011,6,false),dark,[0,0,0]);
 }
 // Camera + LiDAR and GNSS antenna, real protruding 3D structures.
 add(new T.CylinderGeometry(.017,.017,.34,12),steel,[0,1.48,.55]);
 add(new T.BoxGeometry(.25,.15,.20),dark,[0,1.69,.59]);
 add(new T.CylinderGeometry(.074,.074,.07,22),cyan,[0,1.69,.72]).rotation.x=Math.PI/2;
 add(new T.CylinderGeometry(.10,.11,.08,20),steel,[0,1.46,-.30]);
 add(new T.CylinderGeometry(.008,.008,.36,8),light,[.32,1.51,-.30]);
 const shadow=new T.Mesh(new T.CircleGeometry(.94,36),new T.MeshBasicMaterial({color:0x202119,transparent:true,opacity:.24,depthWrite:false}));
 shadow.rotation.x=-Math.PI/2;shadow.position.y=.008;shadow.scale.set(1,1.4,1);rover.add(shadow);
 return {rover,wheels,nozzles,cameraHeight:1.69,cameraForward:.72};
}
