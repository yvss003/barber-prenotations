const { getMyBookings, cancelMyBooking } = window.AbdulAPI;
const $ = selector => document.querySelector(selector);
const localeCode = () => ({it:'it-IT',ar:'ar',fr:'fr-FR',es:'es-ES'}[I18n.locale()] || 'it-IT');
let currentPhone = '';
let currentBookings = [];

function formatDate(date) {
  return new Intl.DateTimeFormat(localeCode(), {
    timeZone:'Europe/Rome', weekday:'long', day:'numeric', month:'long',
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(localeCode(), {
    timeZone:'Europe/Rome', hour:'2-digit', minute:'2-digit',
  }).format(date);
}

function renderBookings() {
  const results = $('#booking-results');
  results.replaceChildren();
  if (!currentBookings.length) {
    $('#lookup-message').textContent = I18n.t('noBookings');
    return;
  }

  const title = document.createElement('h2');
  title.textContent = I18n.t('yourBookings');
  results.appendChild(title);
  currentBookings.forEach(booking => {
    const item = document.createElement('article');
    item.className = 'customer-booking';
    const details = document.createElement('div');
    const service = document.createElement('strong');
    service.textContent = I18n.t(booking.service_id);
    const when = document.createElement('span');
    const start = new Date(booking.start_at);
    when.textContent = `${formatDate(start)} · ${formatTime(start)}`;
    details.append(service, when);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cancel-button';
    button.textContent = I18n.t('cancelAppointment');
    button.addEventListener('click', () => cancelBooking(booking.id, button));
    item.append(details, button);
    results.appendChild(item);
  });
}

async function cancelBooking(id, button) {
  if (!confirm(I18n.t('cancelConfirm'))) return;
  button.disabled = true;
  $('#lookup-message').textContent = '';
  try {
    await cancelMyBooking(id, currentPhone);
    currentBookings = currentBookings.filter(booking => booking.id !== id);
    $('#cancel-search').classList.add('hidden');
    $('#cancel-success').classList.remove('hidden');
  } catch (error) {
    $('#lookup-message').textContent = error.message || I18n.t('cancelError');
    $('#lookup-message').classList.add('error');
    button.disabled = false;
  }
}

$('#lookup-form').addEventListener('submit', async event => {
  event.preventDefault();
  currentPhone = $('#lookup-phone').value.trim();
  const message = $('#lookup-message');
  message.classList.remove('error');
  if (currentPhone.replace(/\D/g, '').length < 8) {
    message.textContent = I18n.t('phoneInvalid');
    message.classList.add('error');
    return;
  }
  const button = $('#lookup-button');
  button.disabled = true;
  message.textContent = I18n.t('searchingBookings');
  $('#booking-results').replaceChildren();
  try {
    currentBookings = await getMyBookings(currentPhone);
    message.textContent = '';
    renderBookings();
  } catch (error) {
    message.textContent = error.message || I18n.t('lookupError');
    message.classList.add('error');
  } finally {
    button.disabled = false;
  }
});

$('#language-select').addEventListener('change', event => I18n.apply(event.target.value));
document.addEventListener('languagechange', () => { if (currentBookings.length) renderBookings(); });
I18n.apply(I18n.locale());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
