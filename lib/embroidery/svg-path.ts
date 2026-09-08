import type { Point } from "./types";
import { distance, lerp } from "./geometry";
export type Matrix = [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]; }
export const transformPoint = (p: Point, m: Matrix): Point => ({ x:m[0]*p.x+m[2]*p.y+m[4], y:m[1]*p.x+m[3]*p.y+m[5] });
export function parseTransform(text: string): Matrix {
  let m = identity;
  for (const match of text.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const n = (match[2].match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || []).map(Number); let t: Matrix = identity;
    switch (match[1]) {
      case "matrix": if(n.length!==6) throw new Error("Invalid SVG transform."); t=n as Matrix; break;
      case "translate": t=[1,0,0,1,n[0]||0,n[1]||0]; break;
      case "scale": t=[n[0],0,0,n[1]??n[0],0,0]; break;
      case "rotate": { const a=n[0]*Math.PI/180, r:Matrix=[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]; t=n.length>2?multiply(multiply([1,0,0,1,n[1],n[2]],r),[1,0,0,1,-n[1],-n[2]]):r; break; }
      case "skewX": t=[1,0,Math.tan(n[0]*Math.PI/180),1,0,0]; break;
      case "skewY": t=[1,Math.tan(n[0]*Math.PI/180),0,1,0,0]; break;
      default: throw new Error("Unsupported SVG transform.");
    }
    m=multiply(m,t);
  }
  if(m.some(x=>!Number.isFinite(x))) throw new Error("Invalid SVG transform.");
  return m;
}
function cubic(a: Point,b: Point,c: Point,d: Point,tolerance: number,out:Point[],depth=0) {
  const deviation=(p:Point)=>{const dx=d.x-a.x,dy=d.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return distance(p,lerp(a,d,t));};
  if(depth>=12||Math.max(deviation(b),deviation(c))<=tolerance) { out.push(d); return; }
  const ab=lerp(a,b,.5),bc=lerp(b,c,.5),cd=lerp(c,d,.5),abc=lerp(ab,bc,.5),bcd=lerp(bc,cd,.5),mid=lerp(abc,bcd,.5);
  cubic(a,ab,abc,mid,tolerance,out,depth+1);cubic(mid,bcd,cd,d,tolerance,out,depth+1);
}
function ellipticalArc(from:Point,to:Point,rx:number,ry:number,rotation:number,large:number,sweep:number,tolerance:number,out:Point[]) {
  rx=Math.abs(rx);ry=Math.abs(ry); if(!rx||!ry||distance(from,to)<1e-9){out.push(to);return;}
  const phi=rotation*Math.PI/180,cos=Math.cos(phi),sin=Math.sin(phi),dx=(from.x-to.x)/2,dy=(from.y-to.y)/2;
  const xp=cos*dx+sin*dy,yp=-sin*dx+cos*dy;
  const ratio=xp*xp/(rx*rx)+yp*yp/(ry*ry);if(ratio>1){rx*=Math.sqrt(ratio);ry*=Math.sqrt(ratio);}
  const divisor=rx*rx*yp*yp+ry*ry*xp*xp;
  const coef=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rx*rx*ry*ry-divisor)/Math.max(divisor,1e-20)));
  const cxp=coef*rx*yp/ry,cyp=-coef*ry*xp/rx,cx=cos*cxp-sin*cyp+(from.x+to.x)/2,cy=sin*cxp+cos*cyp+(from.y+to.y)/2;
  const start=Math.atan2((yp-cyp)/ry,(xp-cxp)/rx),end=Math.atan2((-yp-cyp)/ry,(-xp-cxp)/rx);
  let delta=end-start;if(!sweep&&delta>0)delta-=Math.PI*2;if(sweep&&delta<0)delta+=Math.PI*2;
  const step=2*Math.acos(Math.max(-1,Math.min(1,1-tolerance/Math.max(rx,ry))));
  const n=Math.min(3000,Math.max(2,Math.ceil(Math.abs(delta)/Math.max(.01,step))));
  for(let i=1;i<=n;i++){const a=start+delta*i/n;out.push({x:cx+cos*rx*Math.cos(a)-sin*ry*Math.sin(a),y:cy+sin*rx*Math.cos(a)+cos*ry*Math.sin(a)});}
  out[out.length-1]=to;
}
export function parsePath(d:string,tolerance=.1):{paths:Point[][];closed:boolean[]} {
  const tokens=d.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  if(tokens.length>150000)throw new Error("SVG path is too complex. Simplify the source paths first.");
  const paths:Point[][]=[],closed:boolean[]=[];let path:Point[]=[],i=0,cmd="",prev="",current:Point={x:0,y:0},start=current,control:Point|null=null;
  const counts:Record<string,number>={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  const flush=()=>{if(path.length){paths.push(path);closed.push(false);}path=[];};
  while(i<tokens.length){
    if(/^[a-zA-Z]$/.test(tokens[i]))cmd=tokens[i++];
    const upper=cmd.toUpperCase(),relative=cmd!==upper;
    if(upper==="Z"){if(path.length){if(distance(current,start)>1e-9)path.push({...start});paths.push(path);closed.push(true);path=[];}current={...start};control=null;prev="Z";cmd="";continue;}
    const count=counts[upper];if(!count||i+count>tokens.length)throw new Error("Unsupported or incomplete SVG path command.");
    const nums=tokens.slice(i,i+count).map(Number);if(nums.some(n=>!Number.isFinite(n)))throw new Error("Malformed SVG path.");i+=count;
    const p=(k:number):Point=>({x:nums[k]+(relative?current.x:0),y:nums[k+1]+(relative?current.y:0)});
    let end:Point=current,nextControl:Point|null=null;
    if(upper==="M"){flush();end=p(0);start={...end};path=[end];cmd=relative?"l":"L";}
    else{
      if(!path.length)path.push({...current});
      switch(upper){
        case "L":end=p(0);path.push(end);break;
        case "H":end={x:nums[0]+(relative?current.x:0),y:current.y};path.push(end);break;
        case "V":end={x:current.x,y:nums[0]+(relative?current.y:0)};path.push(end);break;
        case "C":{const c1=p(0),c2=p(2);end=p(4);cubic(current,c1,c2,end,tolerance,path);nextControl=c2;break;}
        case "S":{const c1=(prev==="C"||prev==="S")&&control?{x:2*current.x-control.x,y:2*current.y-control.y}:current,c2=p(0);end=p(2);cubic(current,c1,c2,end,tolerance,path);nextControl=c2;break;}
        case "Q":case "T":{const q:Point=upper==="Q"?p(0):(prev==="Q"||prev==="T")&&control?{x:2*current.x-control.x,y:2*current.y-control.y}:current;end=p(upper==="Q"?2:0);cubic(current,lerp(current,q,2/3),lerp(end,q,2/3),end,tolerance,path);nextControl=q;break;}
        case "A":end=p(5);ellipticalArc(current,end,nums[0],nums[1],nums[2],nums[3],nums[4],tolerance,path);break;
      }
    }
    current=end;control=nextControl;prev=upper;
    if(path.length>50000)throw new Error("SVG path needs simplification before import.");
  }
  flush();return{paths,closed};
}
