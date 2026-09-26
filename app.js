const { SERVICES, getAvailableSlots, createBooking, isDemoMode } = window.AbdulAPI;

const state = { step:1, serviceKey:null, date:null, startAt:null, name:'', phone:'', notes:'' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const localeCode = () => ({it:'it-IT',ar:'ar',fr:'fr-FR',es:'es-ES'}[I18n.locale()] || 'it-IT');
const formatDate = date => new Intl.DateTimeFormat(localeCode(), { timeZone:'Europe/Rome', weekday:'long', day:'numeric', month:'long' }).format(date);
const formatTime = date => new Intl.DateTimeFormat(localeCode(), { timeZone:'Europe/Rome', hour:'2-digit', minute:'2-digit' }).format(date);
const italianHour = date => Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',hourCycle:'h23'}).format(date));

function isoDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function capital(text) { return text.charAt(0).toUpperCase()+text.slice(1); }
function todayHours() { const day=new Date().getDay();if(day===1)return I18n.t('closed');const open=day===3?'10:00':'09:00',pause=day===5?'12:30–14:00':'13:00–14:00'; return `${open}–19:00 · ${I18n.t('pause')} ${pause}`; }

function goTo(step) {
  state.step=step;
  $$('.step').forEach(el=>el.classList.remove('active'));
  $(`#step-${step}`)?.classList.add('active');
  $$('.progress-dot').forEach((el,i)=>el.classList.toggle('active',i<step));
  $$('.progress i').forEach((el,i)=>el.classList.toggle('active',i<step-1));
  $('.booking-card').scrollIntoView({behavior:'smooth',block:'start'});
}

function buildDates() {
  const list=$('#date-list'); list.innerHTML='';
  for(let i=0;i<14;i++){
    const date=new Date(); date.setHours(12,0,0,0); date.setDate(date.getDate()+i);
    if(date.getDay()===1)continue;
    const parts=new Intl.DateTimeFormat(localeCode(),{weekday:'short',day:'numeric',month:'short'}).formatToParts(date);
    const val=isoDate(date); const button=document.createElement('button');
    button.type='button'; button.className='date-button'; button.dataset.date=val;
    button.innerHTML=`<span class="weekday">${i===0?I18n.t('todayShort'):parts.find(p=>p.type==='weekday').value}</span><span class="day">${parts.find(p=>p.type==='day').value}</span><span class="weekday">${parts.find(p=>p.type==='month').value}</span>`;
    button.addEventListener('click',()=>chooseDate(val,button)); list.appendChild(button);
  }
}

async function chooseDate(date, button) {
  state.date=date; state.startAt=null;
  $$('.date-button').forEach(b=>b.classList.remove('selected')); button.classList.add('selected');
  $('#time-area').classList.remove('hidden'); $('#time-list').innerHTML=''; $('#time-message').textContent=I18n.t('searching');
  try {
    const slots=await getAvailableSlots(date,state.serviceKey); $('#time-message').textContent=slots.length?'':I18n.t('noSlots');
    const groups=[{key:'morning',slots:slots.filter(slot=>italianHour(new Date(slot))<13)},{key:'afternoon',slots:slots.filter(slot=>italianHour(new Date(slot))>=14)}];
    groups.filter(group=>group.slots.length).forEach(group=>{const section=document.createElement('section');section.className='time-group';section.innerHTML=`<h4>${I18n.t(group.key)}</h4><div class="time-buttons"></div>`;group.slots.forEach(slot=>{const b=document.createElement('button');b.type='button';b.className='time-button';b.textContent=formatTime(new Date(slot));b.addEventListener('click',()=>{state.startAt=slot;goTo(3)});section.querySelector('.time-buttons').appendChild(b)});$('#time-list').appendChild(section)});
  } catch { $('#time-message').textContent=I18n.t('loadError'); }
}

function summaryMarkup() {
  return `<div class="summary-row"><span>${I18n.t('service')}</span><strong>${I18n.t(state.serviceKey)}</strong></div><div class="summary-row"><span>${I18n.t('when')}</span><strong>${capital(formatDate(new Date(state.startAt)))}<br>${I18n.t('at')} ${formatTime(new Date(state.startAt))}</strong></div><div class="summary-row"><span>${I18n.t('name')}</span><strong>${escapeHtml(state.name)}</strong></div>`;
}
function escapeHtml(value) { const d=document.createElement('div'); d.textContent=value; return d.innerHTML; }

function calendarUrl() {
  const start=new Date(state.startAt), end=new Date(start.getTime()+SERVICES[state.serviceKey].minutes*60000);
  const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const body=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Abdul Barber//Prenotazioni//IT','BEGIN:VEVENT',`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${I18n.t(state.serviceKey)} - Abdul Barber`,'LOCATION:Via Roma 56/A, Reggio Emilia','END:VEVENT','END:VCALENDAR'].join('\r\n');
  return URL.createObjectURL(new Blob([body],{type:'text/calendar'}));
}

$$('.service-card').forEach(button=>button.addEventListener('click',()=>{state.serviceKey=button.dataset.service;buildDates();goTo(2)}));
$$('[data-back]').forEach(button=>button.addEventListener('click',()=>goTo(Number(button.dataset.back))));
$('#details-form').addEventListener('submit',event=>{event.preventDefault();state.name=$('#customer-name').value.trim();state.phone=$('#customer-phone').value.trim();state.notes=$('#customer-notes').value.trim();if(state.phone.replace(/\D/g,'').length<8){$('#customer-phone').setCustomValidity(I18n.t('phoneInvalid'));$('#customer-phone').reportValidity();return}$('#customer-phone').setCustomValidity('');$('#summary').innerHTML=summaryMarkup();goTo(4)});
$('#customer-phone').addEventListener('input',e=>e.target.setCustomValidity(''));
$('#confirm-button').addEventListener('click',async()=>{
  const error=$('#booking-error'); error.textContent='';
  if(!$('#privacy').checked){error.textContent=I18n.t('consent');return}
  const button=$('#confirm-button'); button.disabled=true; button.textContent=I18n.t('confirming');
  try { await createBooking({...state,locale:I18n.locale()}); $('#success-summary').innerHTML=summaryMarkup(); $('#calendar-link').href=calendarUrl(); const message=`${I18n.t('bookingMessage')}: ${I18n.t(state.serviceKey)}, ${formatDate(new Date(state.startAt))} ${I18n.t('bookingAt')} ${formatTime(new Date(state.startAt))}. ${state.name} - ${state.phone}`; $('#whatsapp-confirm').href=`https://wa.me/393294507407?text=${encodeURIComponent(message)}`; $$('.step').forEach(el=>el.classList.remove('active')); $('#success').classList.add('active'); $$('.progress-dot').forEach(el=>el.classList.add('active')); }
  catch(err){ error.textContent=err.message; }
  finally{button.disabled=false;button.textContent=I18n.t('confirm')}
});
$('#new-booking').addEventListener('click',()=>location.reload());
$('#today-hours').textContent=todayHours();
$('#language-select').addEventListener('change',event=>I18n.apply(event.target.value));
document.addEventListener('languagechange',()=>{$('#today-hours').textContent=todayHours();if(state.serviceKey&&state.step===2)buildDates();if(state.startAt){$('#summary').innerHTML=summaryMarkup();$('#success-summary').innerHTML=summaryMarkup()}});
I18n.apply(I18n.locale());
if(isDemoMode()) console.info('Abdul Barber: modalità dimostrativa locale attiva.');
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
