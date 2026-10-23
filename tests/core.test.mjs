import assert from 'node:assert/strict';
import {makeField,initState,estimateRows,rowMotion,recordVisual,boundingBoxesFromYolo,ROWS,SPACE,laneX} from '../core.mjs';
const p={speed:.8,gain:1.3,look:1.1,spray:.35,conf:.35};
// Verify feedback depends on PIXEL error rather than ground-truth x: same pose, different camera result.
const a=initState(makeField()),b=initState(makeField());
a.visionFound=b.visionFound=true;a.visionErr=.6;b.visionErr=-.6;
rowMotion(a,.2,p);rowMotion(b,.2,p);
assert(a.theta>b.theta,'Pixel camera feedback should steer in different directions');
assert(a.x>b.x,'Pixel feedback must change lateral motion');
// Only crop boundaries on both sides define a recognized corridor.
const w=160,h=100,pixels=new Uint8ClampedArray(w*h*4);
for(let y=40;y<86;y++)for(const x of [40,41,42,115,116,117]){let i=(y*w+x)*4;pixels[i]=27;pixels[i+1]=172;pixels[i+2]=30;pixels[i+3]=255;}
const vision=estimateRows(pixels,w,h);assert(vision.ok,'Two green row boundaries should be recognized');
assert(Math.abs(vision.opticalErr)<.15,`Expected nearly centered row, got ${vision.opticalErr}`);
recordVisual(a,vision);assert(a.visionSamples===1 && a.visionFound);
// Curvature-constrained continuous turn: no teleport; integrated arc ends 2.1 m to the right.
for(const even of [true,false]){
 const s=initState(makeField());s.lane=even?0:1;s.theta=even?0:Math.PI;s.phase='turn';s.turnAngle=0;s.z=even?7:-7;s.x=laneX(s.lane);
 const x0=s.x,z0=s.z;let maxJump=0;
 for(let i=0;i<110 && s.phase==='turn';i++){let oldx=s.x,oldz=s.z;rowMotion(s,.04,p);maxJump=Math.max(maxJump,Math.hypot(s.x-oldx,s.z-oldz));}
 assert(s.phase==='row'&&s.turns===1,'Full U-turn must finish');
 assert(Math.abs(s.x-x0-SPACE)<.006,`turn x shift should equal row spacing: ${s.x-x0}`);
 assert(Math.abs(s.z-z0)<.008,`turn endpoint longitudinal error ${s.z-z0}`);
 assert(maxJump<.036,`teleport/jump detected: ${maxJump}`);
 assert(Math.abs(s.steering)>0.46&&Math.abs(s.steering)<0.49,'U-turn steering must respect kinematic geometry and steering limit');
}
const pred=[new Float32Array([320,320,100,100,.8,.2, 160,160,80,80,.1,.9])];
const ans=boundingBoxesFromYolo(pred[0],[1,2,6],.35);assert(ans.length===2&&ans.some(b=>b.cls===1));
// Image evidence perturbation: left vs right crop boundary changes pixel-derived steering.
function artificialRows(lx,rx){const W=160,H=100,rgba=new Uint8ClampedArray(W*H*4);for(let y=40;y<86;y++){for(const base of [lx,rx])for(let dx=-2;dx<=2;dx++){let x=base+dx,j=(y*W+x)*4;rgba[j]=25;rgba[j+1]=165;rgba[j+2]=39;rgba[j+3]=255;}}return estimateRows(rgba,W,H);}
const leftImage=artificialRows(26,98),rightImage=artificialRows(62,132);
assert(leftImage.ok&&rightImage.ok&&leftImage.opticalErr>rightImage.opticalErr,'shifted crop rows should change steering evidence');
const leftRover=initState(makeField()),rightRover=initState(makeField());recordVisual(leftRover,leftImage);recordVisual(rightRover,rightImage);rowMotion(leftRover,.3,p);rowMotion(rightRover,.3,p);assert(leftRover.theta>rightRover.theta);
console.log('PASS core: camera pixel steering, two-row detection, odd/even continuous turn, YOLO decode');
