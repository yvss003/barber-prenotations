import{SERVICES,json,localParts,zonedToUtc,openMinute}from'../_shared.js';
export async function onRequestGet({request,env}){
  try{
    const url=new URL(request.url),date=url.searchParams.get('date')||'',service=url.searchParams.get('service'),cfg=SERVICES[service];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!cfg)return json({message:'Data o servizio non valido'},400);
    const midday=zonedToUtc(date,12,0),weekday=+localParts(midday).weekday||midday.getUTCDay(),open=openMinute(weekday),dayStart=zonedToUtc(date,0,0),dayEnd=zonedToUtc(date,23,59);
    const now=new Date(),today=localParts(now),todayKey=`${today.year}-${today.month}-${today.day}`;if(date<todayKey||midday-now>15*86400000)return json({message:'Data fuori intervallo'},400);
    const busy=(await env.DB.prepare("select start_at,end_at from bookings where status='confirmed' and start_at<? and end_at>? union all select start_at,end_at from blocked_periods where start_at<? and end_at>?").bind(dayEnd.toISOString(),dayStart.toISOString(),dayEnd.toISOString(),dayStart.toISOString()).all()).results;
    const slots=[];for(let minute=open;minute+cfg.minutes<=1140;minute+=5){if(minute<840&&minute+cfg.minutes>780)continue;const start=zonedToUtc(date,Math.floor(minute/60),minute%60),end=new Date(+start+cfg.minutes*60000);if(start<=now)continue;if(!busy.some(x=>start<new Date(x.end_at)&&end>new Date(x.start_at)))slots.push(start.toISOString())}
    return json({slots});
  }catch(e){return json({message:'Impossibile caricare gli orari'},500)}
}
