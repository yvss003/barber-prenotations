import{json,body,sha}from'../../_shared.js';
export async function onRequestPost({request,env}){
  try{
    const ip=request.headers.get('CF-Connecting-IP')||'unknown',row=await env.DB.prepare("select attempts,window_start from login_attempts where ip=?").bind(ip).first(),now=Date.now();
    if(row&&now-new Date(row.window_start).getTime()<900000&&row.attempts>=8)return json({message:'Troppi tentativi. Riprova tra 15 minuti.'},429);
    const{pin}=await body(request);if(!/^\d{6}$/.test(String(pin))||String(pin)!==String(env.ADMIN_PIN||'')){
      await env.DB.prepare("insert into login_attempts(ip,attempts,window_start) values(?,1,?) on conflict(ip) do update set attempts=case when julianday(excluded.window_start)-julianday(window_start)>.0104 then 1 else attempts+1 end,window_start=case when julianday(excluded.window_start)-julianday(window_start)>.0104 then excluded.window_start else window_start end").bind(ip,new Date().toISOString()).run();return json({message:'PIN non corretto'},401);
    }
    await env.DB.prepare('delete from login_attempts where ip=?').bind(ip).run();const token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await sha(token),expires=new Date(now+30*86400000).toISOString();await env.DB.prepare('insert into admin_sessions(token_hash,expires_at) values(?,?)').bind(tokenHash,expires).run();
    return json({ok:true},200,{'Set-Cookie':`abdul_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});
  }catch(e){return json({message:'Accesso non disponibile'},500)}
}
