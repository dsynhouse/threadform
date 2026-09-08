import { identity, sameOrigin, database, json, failure, HttpError } from "@/lib/server/http";
import { pinterestConfig, pinterestRead } from "@/lib/server/pinterest";
export async function GET(request:Request){try{
  const owner=await identity(request),url=new URL(request.url),mode=url.searchParams.get("mode")??"status",config=pinterestConfig();
  if(mode==="status"){const connected=config?!!await database().prepare("SELECT owner FROM studio_connections WHERE owner=?").bind(owner).first():false;return json({configured:!!config,connected});}
  if(!config)throw new HttpError(503,"Pinterest account sync needs app credentials.");
  const query=new URLSearchParams({page_size:"25"}),bookmark=url.searchParams.get("bookmark");if(bookmark&&bookmark.length<4000)query.set("bookmark",bookmark);
  if(mode==="boards"){const result=await pinterestRead(owner,`boards?${query}`);return json({items:(result.items??[]).map(b=>({id:b.id,name:b.name})),bookmark:result.bookmark??null});}
  if(mode==="pins"){const board=url.searchParams.get("board");if(!board||!/^\d{1,40}$/.test(board))throw new HttpError(400,"Choose a Pinterest board.");const result=await pinterestRead(owner,`boards/${board}/pins?${query}`);return json({items:(result.items??[]).map(p=>{const media=p.media as {images?:Record<string,{url?:string}>}|undefined;const image=Object.values(media?.images??{}).find(i=>{try{const u=new URL(i.url??"");return u.protocol==="https:"&&u.hostname.endsWith(".pinimg.com");}catch{return false;}})?.url;return {id:p.id,title:p.title??"Pinterest reference",description:p.description??"",url:`https://www.pinterest.com/pin/${String(p.id).replace(/\D/g,"")}/`,image:image??null};}),bookmark:result.bookmark??null});}
  throw new HttpError(400,"Unknown Pinterest action.");
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
  sameOrigin(request);const owner=await identity(request),config=pinterestConfig();if(!config)throw new HttpError(503,"Pinterest account sync needs app credentials.");
  const state=crypto.randomUUID()+crypto.randomUUID(),db=database();await db.batch([db.prepare("DELETE FROM studio_oauth_states WHERE expires_at<? OR owner=?").bind(Date.now(),owner),db.prepare("INSERT INTO studio_oauth_states(state,owner,expires_at) VALUES(?,?,?)").bind(state,owner,Date.now()+600000)]);
  const url=new URL("https://www.pinterest.com/oauth/");url.search=new URLSearchParams({client_id:config.id,redirect_uri:config.redirect,response_type:"code",scope:"boards:read,pins:read",state}).toString();return json({url:url.href});
}catch(error){return failure(error);}}
export async function DELETE(request:Request){try{sameOrigin(request);const owner=await identity(request);await database().batch([database().prepare("DELETE FROM studio_connections WHERE owner=?").bind(owner),database().prepare("DELETE FROM studio_oauth_states WHERE owner=?").bind(owner)]);return json({connected:false});}catch(error){return failure(error);}}
