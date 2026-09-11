import{json,cookie,sha}from'../../_shared.js';
export async function onRequestPost({request,env}){const raw=cookie(request,'abdul_session');if(raw)await env.DB.prepare('delete from admin_sessions where token_hash=?').bind(await sha(raw)).run();return json({ok:true},200,{'Set-Cookie':'abdul_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})}
