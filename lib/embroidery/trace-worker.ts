import { tracePixels, type TraceOptions } from "./raster";
self.onmessage=(event:MessageEvent<{pixels:Uint8ClampedArray;width:number;height:number;options:TraceOptions;name:string}>)=>{
  try{const {pixels,width,height,options,name}=event.data;self.postMessage({project:tracePixels(pixels,width,height,options,name)});}catch(error){self.postMessage({error:error instanceof Error?error.message:"Could not trace this artwork."});}
};
