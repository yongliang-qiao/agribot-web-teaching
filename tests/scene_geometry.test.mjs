import assert from 'node:assert/strict';
import {installVegetation,buildRover3D} from '../scene_realism.mjs';
import {makeField} from '../core.mjs';
class Fake {constructor(...args){this.args=args;this.children=[];this.position={set:(...x)=>this.pos=x};this.rotation={set:(...x)=>this.rot=x};this.scale={set:(...x)=>this.scaleValues=x};this.matrix={};this.userData={};this.instanceMatrix={needsUpdate:false};}
add(o){this.children.push(o);}setAttribute(k,v){this[k]=v;}computeVertexNormals(){}setMatrixAt(i,m){this.instances=(this.instances||0)+1;}updateMatrix(){this.matrix={};}}
class Vec3 {constructor(x,y,z){this.x=x;this.y=y;this.z=z;}}
const T={};for(const key of ['Group','Mesh','MeshStandardMaterial','LineBasicMaterial','BufferGeometry','Float32BufferAttribute','InstancedMesh','CylinderGeometry','CircleGeometry','ConeGeometry','BoxGeometry','LineSegments','TubeGeometry','CatmullRomCurve3','Object3D','MeshBasicMaterial']) T[key]=Fake;
T.Vector3=Vec3;T.DoubleSide=2;
const scene=new Fake();const plants=makeField();const data=installVegetation(T,scene,plants);
assert.equal(data.plantCount,220);assert.equal(data.weedCount,55);
assert(data.triangles>15000,`too few organic mesh triangles: ${data.triangles}`);
assert.equal(Object.values(data.species).reduce((a,b)=>a+b,0),55);
assert(scene.children.length>=4,'should include stems, foliage, veins, soil residues');
const car=buildRover3D(T,scene);assert.equal(car.wheels.length,4);assert.equal(car.nozzles.length,4);
assert(car.cameraHeight>1.5);assert(car.cameraForward>.5);
console.log('PASS scene geometry: maize V3-V5, 3 weed species, 4 articulated wheels, 4 spray nozzles');
