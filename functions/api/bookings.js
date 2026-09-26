import{SERVICES,json,body,localParts,openMinute,requireAdmin,validRange}from'../_shared.js';
export async function onRequestPost({request,env}){
  try{
    const data=await body(request),cfg=SERVICES[data.service],name=String(data.name||'').trim(),phone=String(data.phone||'').trim(),notes=String(data.notes||'').trim(),locale=['it','ar','fr','es'].includes(data.locale)?data.locale:'it',start=new Date(data.startAt);
    if(!cfg||name.length<2||name.length>100||phone.replace(/\D/g,'').length<8||phone.length>30||notes.length>300||Number.isNaN(+start))return json({message:'Controlla i dati inseriti'},400);
    const now=new Date(),p=localParts(start),minute=+p.hour*60 + +p.minute,weekday=start.getUTCDay(),opening=openMinute(weekday),endMinute=minute+cfg.minutes;
    if(start<=now||start-now>15*86400000||+p.minute%5!==0||opening===null||minute<opening||endMinute>1140||(minute<840&&endMinute>780))return json({message:'Orario non valido'},400);
    const id=crypto.randomUUID(),end=new Date(+start+cfg.minutes*60000);
    await env.DB.prepare("insert into bookings(id,service_id,customer_name,customer_phone,notes,start_at,end_at,status,locale) values(?,?,?,?,?,?,?,'confirmed',?)").bind(id,data.service,name,phone,notes||null,start.toISOString(),end.toISOString(),locale).run();
    return json({id,startAt:start.toISOString(),endAt:end.toISOString()},201);
  }catch(e){return json({message:String(e.message).includes('slot_unavailable')?'Questo orario non è più disponibile. Scegline un altro.':'Non è stato possibile prenotare'},409)}
}
export async function onRequestGet(context){
  if(!await requireAdmin(context))return json({message:'Accesso scaduto'},401);
  const url=new URL(context.request.url),from=url.searchParams.get('from'),to=url.searchParams.get('to');if(!validRange(from,to))return json({message:'Intervallo non valido'},400);
  const rows=(await context.env.DB.prepare("select id,service_id,case service_id when 'haircut' then 'Taglio di capelli' when 'combo' then 'Taglio + barba' else 'Barba' end service_name,customer_name,customer_phone,notes,start_at,end_at,status,locale,created_at from bookings where start_at>=? and start_at<? order by start_at").bind(from,to).all()).results;
  return json({bookings:rows});
}
