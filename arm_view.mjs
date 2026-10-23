/** A visible, articulated 3DOF teaching arm; not a physical torque-controlled manipulator. */
export function createArm(T,rover){
 const steel=new T.MeshStandardMaterial({color:0x4f6574,metalness:.6,roughness:.34}),orange=new T.MeshStandardMaterial({color:0xe0b04d,metalness:.3,roughness:.37}),dark=new T.MeshStandardMaterial({color:0x27363b,roughness:.7});
 const obj=(g,mat,parent,pos)=>{const m=new T.Mesh(g,mat);m.position.set(...pos);parent.add(m);return m};
 const base=new T.Group();base.position.set(0,1.14,-.1);rover.add(base);
 obj(new T.CylinderGeometry(.16,.17,.14,16),steel,base,[0,.06,0]);
 const shoulder=new T.Group();shoulder.position.set(0,.13,0);base.add(shoulder);
 obj(new T.BoxGeometry(.09,.09,.55),orange,shoulder,[0,0,.275]);
 const elbow=new T.Group();elbow.position.set(0,0,.55);shoulder.add(elbow);
 obj(new T.SphereGeometry(.085,12,8),steel,elbow,[0,0,0]);
 obj(new T.BoxGeometry(.075,.075,.48),steel,elbow,[0,0,.24]);
 const gripper=new T.Group();gripper.position.set(0,0,.48);elbow.add(gripper);
 obj(new T.BoxGeometry(.11,.08,.11),dark,gripper,[0,0,0]);
 const fingers=[];for(const x of [-.068,.068])fingers.push(obj(new T.BoxGeometry(.027,.08,.17),steel,gripper,[x,0,.12]));
 const move=(q,closed=false)=>{base.rotation.y=q[0];shoulder.rotation.x=-q[1];elbow.rotation.x=-q[2];fingers[0].position.x=closed?-.026:-.07;fingers[1].position.x=closed?.026:.07;};
 move([0,0,0]);return {base,shoulder,elbow,gripper,move};
}
