/** Browser ROS 2 JSON protocol adapter. Requires independent rosbridge_server, no direct hardware control. */
export class RosBridgeClient{
 constructor(url='ws://localhost:9090'){this.url=url;this.ws=null;this.status='disconnected';this.messages=[];this.onStatus=()=>{};}
 connect(){if(!/^wss?:\/\//.test(this.url))throw Error('ROS WebSocket URL 格式无效');this.ws=new WebSocket(this.url);this.status='connecting';this.onStatus(this.status);
 this.ws.onopen=()=>{this.status='connected';this.onStatus(this.status)};
 this.ws.onclose=()=>{this.status='disconnected';this.onStatus(this.status)};
 this.ws.onerror=()=>{this.status='error';this.onStatus(this.status)};
 this.ws.onmessage=e=>{try{this.messages.push(JSON.parse(e.data));if(this.messages.length>50)this.messages.shift()}catch{}};
 }
 send(o){if(this.status!=='connected')throw Error('rosbridge 未连接');this.ws.send(JSON.stringify(o));}
 advertise(topic,type){this.send({op:'advertise',topic,type});}
 publish(topic,msg){this.send({op:'publish',topic,msg});}
 subscribe(topic,type){this.send({op:'subscribe',topic,type});}
 publishPose(x,z,yaw){this.publish('/agribot/sim_pose',{header:{frame_id:'map'},pose:{position:{x:z,y:-x,z:0},orientation:{x:0,y:0,z:Math.sin(-yaw/2),w:Math.cos(-yaw/2)}}});}
 sendArmTrajectory(points,jointNames=['joint_base','joint_shoulder','joint_elbow']){
 this.publish('/agribot/joint_trajectory',{joint_names:jointNames,points:points.map(p=>({positions:p.q,time_from_start:{sec:Math.floor(p.t),nanosec:Math.round((p.t%1)*1e9)}}))});
 }
 disconnect(){this.ws?.close();this.ws=null;this.status='disconnected';this.onStatus(this.status);}
}
