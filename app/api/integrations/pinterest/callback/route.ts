import { database, identity, failure, HttpError } from "@/lib/server/http";
import { pinterestConfig, exchange, encryptToken } from "@/lib/server/pinterest";
export async function GET(request:Request){try{
  const owner=await identity(request),url=new URL(request.url),state=url.searchParams.get("state"),code=url.searchParams.get("code"),config=pinterestConfig();
  if(!state||state.length>150||!config)throw new HttpError(400,"This Pinterest authorization is invalid. Start again from Inspiration.");
  const record=await database().prepare("DELETE FROM studio_oauth_states WHERE state=? AND owner=? AND expires_at>? RETURNING owner").bind(state,owner,Date.now()).first();if(!record)throw new HttpError(400,"This Pinterest authorization expired or was already used. Start again from Inspiration.");
  if(url.searchParams.has("error")||!code||code.length>5000)return Response.redirect(new URL("/?workspace=inspiration&pinterest=cancelled",request.url),303);
  const token=await exchange(new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:config.redirect}));
  await database().prepare("INSERT INTO studio_connections(owner,encrypted_token,expires_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET encrypted_token=excluded.encrypted_token,expires_at=excluded.expires_at,updated_at=excluded.updated_at").bind(owner,await encryptToken(token,owner),Date.now()+token.expires_in*1000,Date.now()).run();
  return Response.redirect(new URL("/?workspace=inspiration&pinterest=connected",request.url),303);
}catch(error){return failure(error);}}
