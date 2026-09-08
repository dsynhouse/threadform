import { generatePlan } from "./engine";
self.onmessage=(event:MessageEvent)=>{const{id,project}=event.data;try{self.postMessage({id,plan:generatePlan(project)});}catch(error){self.postMessage({id,error:error instanceof Error?error.message:"Stitch generation failed."});}};
export {};
