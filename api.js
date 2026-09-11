(function () {
const CONFIG = window.ABDUL_CONFIG;
const SERVICES = {
  haircut: { id:'haircut', name:'Taglio di capelli', minutes:50 },
  beard: { id:'beard', name:'Barba', minutes:15 },
  combo: { id:'combo', name:'Taglio + barba', minutes:60 }
};
const demo = CONFIG.demoMode;
const demoBookingsKey='abdul-barber-demo-bookings', demoBlocksKey='abdul-barber-demo-blocks';
const readLocal=key=>JSON.parse(localStorage.getItem(key)||'[]');
const writeLocal=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const overlaps=(a,b,c,d)=>a<d&&b>c;

function demoSlots(dateString,serviceKey){
  const duration=SERVICES[serviceKey].minutes,midday=new Date(`${dateString}T12:00:00`),weekday=midday.getDay(),openHour=weekday===1?12:weekday===3?10:9;
  const bookings=readLocal(demoBookingsKey).filter(b=>b.status==='confirmed'),blocks=readLocal(demoBlocksKey),now=new Date(),slots=[];
  for(let minute=openHour*60;minute+duration<=19*60;minute+=15){
    if(minute<14*60&&minute+duration>13*60)continue;
    const hh=String(Math.floor(minute/60)).padStart(2,'0'),mm=String(minute%60).padStart(2,'0'),start=new Date(`${dateString}T${hh}:${mm}:00`),end=new Date(start.getTime()+duration*60000);
    if(start<=now)continue;
    const busy=bookings.some(x=>overlaps(start,end,new Date(x.start_at),new Date(x.end_at)))||blocks.some(x=>overlaps(start,end,new Date(x.start_at),new Date(x.end_at)));
    if(!busy)slots.push(start.toISOString());
  } return slots;
}
async function request(path,options={}){
  const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.message||'Operazione non riuscita');}
  const text=await response.text();return text?JSON.parse(text):null;
}
function isDemoMode(){return demo}
async function getAvailableSlots(date,serviceKey){if(demo)return demoSlots(date,serviceKey);const result=await request(`/api/slots?date=${encodeURIComponent(date)}&service=${encodeURIComponent(serviceKey)}`);return result.slots}
async function createBooking(data){
  if(demo){const slots=demoSlots(data.date,data.serviceKey);if(!slots.includes(data.startAt))throw new Error('Questo orario non è più disponibile. Scegline un altro.');const item={id:crypto.randomUUID(),customer_name:data.name,customer_phone:data.phone,notes:data.notes,service_id:data.serviceKey,service_name:SERVICES[data.serviceKey].name,start_at:data.startAt,end_at:new Date(new Date(data.startAt).getTime()+SERVICES[data.serviceKey].minutes*60000).toISOString(),status:'confirmed',locale:data.locale||'it',created_at:new Date().toISOString()};const all=readLocal(demoBookingsKey);all.push(item);writeLocal(demoBookingsKey,all);return item}
  return request('/api/bookings',{method:'POST',body:JSON.stringify({service:data.serviceKey,startAt:data.startAt,name:data.name,phone:data.phone,notes:data.notes||'',locale:data.locale||'it'})});
}
async function signIn(pin){if(demo){if(pin==='123456')return'demo-token';throw new Error('PIN non corretto')}await request('/api/admin/login',{method:'POST',body:JSON.stringify({pin})});return'cloudflare-session'}
async function signOut(){if(!demo)await request('/api/admin/logout',{method:'POST'})}
async function getAdminBookings(token,from,to){if(demo)return readLocal(demoBookingsKey).filter(b=>b.start_at>=from&&b.start_at<to).sort((a,b)=>a.start_at.localeCompare(b.start_at));const result=await request(`/api/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);return result.bookings}
async function updateBookingStatus(token,id,status){if(demo){const all=readLocal(demoBookingsKey),item=all.find(b=>b.id===id);if(item)item.status=status;writeLocal(demoBookingsKey,all);return}return request(`/api/admin/bookings/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status})})}
async function getBlocks(token,from,to){if(demo)return readLocal(demoBlocksKey).filter(b=>b.start_at<to&&b.end_at>from).sort((a,b)=>a.start_at.localeCompare(b.start_at));const result=await request(`/api/admin/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);return result.blocks}
async function addBlock(token,startAt,endAt,reason){if(demo){const all=readLocal(demoBlocksKey);all.push({id:crypto.randomUUID(),start_at:startAt,end_at:endAt,reason});writeLocal(demoBlocksKey,all);return}return request('/api/admin/blocks',{method:'POST',body:JSON.stringify({startAt,endAt,reason})})}
async function removeBlock(token,id){if(demo){writeLocal(demoBlocksKey,readLocal(demoBlocksKey).filter(b=>b.id!==id));return}return request(`/api/admin/blocks/${encodeURIComponent(id)}`,{method:'DELETE'})}
window.AbdulAPI={SERVICES,isDemoMode,getAvailableSlots,createBooking,signIn,signOut,getAdminBookings,updateBookingStatus,getBlocks,addBlock,removeBlock};
})();
