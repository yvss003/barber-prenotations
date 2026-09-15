const SERVICES = {
  haircut: { minutes: 50, name: 'Taglio di capelli' },
  beard: { minutes: 15, name: 'Barba' },
  combo: { minutes: 60, name: 'Taglio + barba' },
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL CHECK(service_id IN ('haircut','beard','combo')),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    notes TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
    locale TEXT NOT NULL DEFAULT 'it' CHECK(locale IN ('it','ar','fr','es')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS blocked_periods (
    id TEXT PRIMARY KEY,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_start TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS bookings_start_idx ON bookings(start_at)',
  'CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status)',
  'CREATE INDEX IF NOT EXISTS blocks_start_idx ON blocked_periods(start_at)',
  'CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON admin_sessions(expires_at)',
];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 10000) {
    throw new Error('Richiesta troppo grande');
  }
  return request.json();
}

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zonedToUtc(date, hour, minute) {
  const guess = new Date(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
  const shown = localParts(guess);
  const shownUtc = Date.UTC(
    +shown.year,
    +shown.month - 1,
    +shown.day,
    +shown.hour,
    +shown.minute,
    +shown.second,
  );
  const wantedUtc = Date.UTC(
    +date.slice(0, 4),
    +date.slice(5, 7) - 1,
    +date.slice(8, 10),
    hour,
    minute,
    0,
  );
  return new Date(guess.getTime() + wantedUtc - shownUtc);
}

function openMinute(weekday) {
  if (weekday === 1) return 12 * 60;
  if (weekday === 3) return 10 * 60;
  return 9 * 60;
}

function pauseMinutes(weekday) {
  return {
    start: weekday === 5 ? 12 * 60 + 30 : 13 * 60,
    end: 14 * 60,
  };
}

function overlapsPause(startMinute, endMinute, weekday) {
  const pause = pauseMinutes(weekday);
  return startMinute < pause.end && endMinute > pause.start;
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0039')) digits = digits.slice(4);
  else if (digits.startsWith('39') && digits.length > 10) digits = digits.slice(2);
  return digits;
}

function getCookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  for (const part of all.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

async function digest(value) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))),
  );
}

async function hash(value) {
  const bytes = await digest(value);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function safeEqual(left, right) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function requireAdmin(request, env) {
  const token = getCookie(request, 'abdul_session');
  if (!token) return null;
  const tokenHash = await hash(token);
  const row = await env.DB.prepare(
    "SELECT token_hash FROM admin_sessions WHERE token_hash=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  ).bind(tokenHash).first();
  return row ? tokenHash : null;
}

function validRange(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  return !Number.isNaN(+start)
    && !Number.isNaN(+end)
    && end > start
    && end - start <= 1000 * 60 * 60 * 24 * 32;
}

async function ensureDatabase(env) {
  if (!env.DB) throw new Error('Binding D1 DB non configurato');
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('bookings','blocked_periods','admin_sessions','login_attempts')",
  ).first();
  if (Number(row?.total) < 4) {
    await env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql)));
  }
}

async function getSlots(request, env) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || '';
  const service = url.searchParams.get('service');
  const serviceConfig = SERVICES[service];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !serviceConfig) {
    return json({ message: 'Data o servizio non valido' }, 400);
  }

  const midday = zonedToUtc(date, 12, 0);
  const weekday = midday.getUTCDay();
  const opening = openMinute(weekday);
  const dayStart = zonedToUtc(date, 0, 0);
  const dayEnd = zonedToUtc(date, 23, 59);
  const now = new Date();
  const today = localParts(now);
  const todayKey = `${today.year}-${today.month}-${today.day}`;
  if (date < todayKey || midday - now > 15 * 86400000) {
    return json({ message: 'Data fuori intervallo' }, 400);
  }

  const busy = (await env.DB.prepare(
    "SELECT start_at,end_at FROM bookings WHERE status='confirmed' AND start_at<? AND end_at>? UNION ALL SELECT start_at,end_at FROM blocked_periods WHERE start_at<? AND end_at>?",
  ).bind(
    dayEnd.toISOString(),
    dayStart.toISOString(),
    dayEnd.toISOString(),
    dayStart.toISOString(),
  ).all()).results;

  const slots = [];
  for (let minute = opening; minute + serviceConfig.minutes <= 19 * 60; minute += 15) {
    if (overlapsPause(minute, minute + serviceConfig.minutes, weekday)) continue;
    const start = zonedToUtc(date, Math.floor(minute / 60), minute % 60);
    const end = new Date(+start + serviceConfig.minutes * 60000);
    if (start <= now) continue;
    if (!busy.some((item) => start < new Date(item.end_at) && end > new Date(item.start_at))) {
      slots.push(start.toISOString());
    }
  }
  return json({ slots });
}

async function createBooking(request, env) {
  const data = await readBody(request);
  const serviceConfig = SERVICES[data.service];
  const name = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  const notes = String(data.notes || '').trim();
  const locale = ['it', 'ar', 'fr', 'es'].includes(data.locale) ? data.locale : 'it';
  const start = new Date(data.startAt);

  if (
    !serviceConfig
    || name.length < 2
    || name.length > 100
    || phone.replace(/\D/g, '').length < 8
    || phone.length > 30
    || notes.length > 300
    || Number.isNaN(+start)
  ) return json({ message: 'Controlla i dati inseriti' }, 400);

  const now = new Date();
  const parts = localParts(start);
  const minute = +parts.hour * 60 + +parts.minute;
  const weekday = start.getUTCDay();
  const opening = openMinute(weekday);
  const endMinute = minute + serviceConfig.minutes;
  if (
    start <= now
    || start - now > 15 * 86400000
    || +parts.minute % 15 !== 0
    || minute < opening
    || endMinute > 19 * 60
    || overlapsPause(minute, endMinute, weekday)
  ) return json({ message: 'Orario non valido' }, 400);

  const id = crypto.randomUUID();
  const end = new Date(+start + serviceConfig.minutes * 60000);
  const result = await env.DB.prepare(
    "INSERT INTO bookings(id,service_id,customer_name,customer_phone,notes,start_at,end_at,status,locale) SELECT ?,?,?,?,?,?,?,'confirmed',? WHERE NOT EXISTS(SELECT 1 FROM bookings WHERE status='confirmed' AND start_at<? AND end_at>?) AND NOT EXISTS(SELECT 1 FROM blocked_periods WHERE start_at<? AND end_at>?)",
  ).bind(
    id,
    data.service,
    name,
    phone,
    notes || null,
    start.toISOString(),
    end.toISOString(),
    locale,
    end.toISOString(),
    start.toISOString(),
    end.toISOString(),
    start.toISOString(),
  ).run();

  if (!result.meta?.changes) {
    return json({ message: 'Questo orario non è più disponibile. Scegline un altro.' }, 409);
  }
  return json({ id, startAt: start.toISOString(), endAt: end.toISOString() }, 201);
}

async function getCustomerBookings(request, env) {
  const data = await readBody(request);
  const phone = normalizePhone(data.phone);
  if (phone.length < 8 || phone.length > 15) {
    return json({ message: 'Numero di telefono non valido' }, 400);
  }

  const rows = (await env.DB.prepare(
    "SELECT id,service_id,customer_phone,start_at,end_at FROM bookings WHERE status='confirmed' AND start_at>? ORDER BY start_at",
  ).bind(new Date().toISOString()).all()).results;

  const bookings = rows
    .filter((booking) => normalizePhone(booking.customer_phone) === phone)
    .map(({ customer_phone, ...booking }) => booking);
  return json({ bookings });
}

async function cancelCustomerBooking(request, env, id) {
  const data = await readBody(request);
  const phone = normalizePhone(data.phone);
  if (phone.length < 8 || phone.length > 15) {
    return json({ message: 'Numero di telefono non valido' }, 400);
  }

  const booking = await env.DB.prepare(
    'SELECT id,customer_phone,start_at,status FROM bookings WHERE id=?',
  ).bind(id).first();
  if (!booking || normalizePhone(booking.customer_phone) !== phone) {
    return json({ message: 'Appuntamento non trovato' }, 404);
  }
  if (booking.status !== 'confirmed') {
    return json({ message: 'Questo appuntamento è già stato disdetto' }, 409);
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE bookings SET status='cancelled' WHERE id=? AND status='confirmed' AND start_at>?",
  ).bind(id, now).run();
  if (!result.meta?.changes) {
    return json({ message: 'Non è possibile disdire un appuntamento già iniziato' }, 409);
  }
  return json({ ok: true });
}

async function getBookings(request, env) {
  if (!await requireAdmin(request, env)) return json({ message: 'Accesso scaduto' }, 401);
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!validRange(from, to)) return json({ message: 'Intervallo non valido' }, 400);
  const rows = (await env.DB.prepare(
    "SELECT id,service_id,CASE service_id WHEN 'haircut' THEN 'Taglio di capelli' WHEN 'combo' THEN 'Taglio + barba' ELSE 'Barba' END service_name,customer_name,customer_phone,notes,start_at,end_at,status,locale,created_at FROM bookings WHERE start_at>=? AND start_at<? ORDER BY start_at",
  ).bind(from, to).all()).results;
  return json({ bookings: rows });
}

async function login(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { pin } = await readBody(request);
  const enteredPin = String(pin || '').trim();
  const configuredPin = String(env.ADMIN_PIN || '').trim();

  if (!configuredPin) {
    return json({ message: 'ADMIN_PIN non è configurato nel Worker Cloudflare.' }, 503);
  }
  if (!/^\d{6}$/.test(configuredPin)) {
    return json({ message: 'ADMIN_PIN deve contenere esattamente 6 numeri, senza virgolette.' }, 503);
  }

  const previous = await env.DB.prepare(
    'SELECT attempts,window_start FROM login_attempts WHERE ip=?',
  ).bind(ip).first();
  const now = Date.now();
  const pinMatches = /^\d{6}$/.test(enteredPin)
    && await safeEqual(enteredPin, configuredPin);

  if (!pinMatches) {
    if (
      previous
      && now - new Date(previous.window_start).getTime() < 15 * 60000
      && previous.attempts >= 8
    ) return json({ message: 'Troppi tentativi. Riprova tra 15 minuti.' }, 429);

    await env.DB.prepare(
      "INSERT INTO login_attempts(ip,attempts,window_start) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET attempts=CASE WHEN julianday(excluded.window_start)-julianday(window_start)>.0104 THEN 1 ELSE attempts+1 END,window_start=CASE WHEN julianday(excluded.window_start)-julianday(window_start)>.0104 THEN excluded.window_start ELSE window_start END",
    ).bind(ip, new Date().toISOString()).run();
    return json({ message: 'PIN non corretto' }, 401);
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE ip=?').bind(ip).run();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await hash(token);
  const expires = new Date(now + 30 * 86400000).toISOString();
  await env.DB.prepare(
    'INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)',
  ).bind(tokenHash, expires).run();
  return json({ ok: true }, 200, {
    'Set-Cookie': `abdul_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
  });
}

async function logout(request, env) {
  const token = getCookie(request, 'abdul_session');
  if (token) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?')
      .bind(await hash(token)).run();
  }
  return json({ ok: true }, 200, {
    'Set-Cookie': 'abdul_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
  });
}

async function getBlocks(request, env) {
  if (!await requireAdmin(request, env)) return json({ message: 'Accesso scaduto' }, 401);
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!validRange(from, to)) return json({ message: 'Intervallo non valido' }, 400);
  const rows = (await env.DB.prepare(
    'SELECT id,start_at,end_at,reason FROM blocked_periods WHERE start_at<? AND end_at>? ORDER BY start_at',
  ).bind(to, from).all()).results;
  return json({ blocks: rows });
}

async function createBlock(request, env) {
  if (!await requireAdmin(request, env)) return json({ message: 'Accesso scaduto' }, 401);
  const data = await readBody(request);
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  const reason = String(data.reason || '').trim();
  if (
    Number.isNaN(+start)
    || Number.isNaN(+end)
    || end <= start
    || end - start > 86400000
    || reason.length > 100
  ) return json({ message: 'Controlla gli orari' }, 400);
  const result = await env.DB.prepare(
    'INSERT INTO blocked_periods(id,start_at,end_at,reason) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM blocked_periods WHERE start_at<? AND end_at>?)',
  ).bind(
    crypto.randomUUID(),
    start.toISOString(),
    end.toISOString(),
    reason || null,
    end.toISOString(),
    start.toISOString(),
  ).run();
  if (!result.meta?.changes) return json({ message: 'Questo periodo è già bloccato' }, 409);
  return json({ ok: true }, 201);
}

async function updateBooking(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ message: 'Accesso scaduto' }, 401);
  const data = await readBody(request);
  if (data.status !== 'cancelled') return json({ message: 'Stato non valido' }, 400);
  await env.DB.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").bind(id).run();
  return json({ ok: true });
}

async function deleteBlock(request, env, id) {
  if (!await requireAdmin(request, env)) return json({ message: 'Accesso scaduto' }, 401);
  await env.DB.prepare('DELETE FROM blocked_periods WHERE id=?').bind(id).run();
  return json({ ok: true });
}

function matchRoute(request) {
  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  const fixed = {
    'GET /api/slots': getSlots,
    'GET /api/bookings': getBookings,
    'POST /api/bookings': createBooking,
    'POST /api/my-bookings': getCustomerBookings,
    'POST /api/admin/login': login,
    'POST /api/admin/logout': logout,
    'GET /api/admin/blocks': getBlocks,
    'POST /api/admin/blocks': createBlock,
  };
  const handler = fixed[`${request.method} ${path}`];
  if (handler) return { handler, id: null };

  const booking = path.match(/^\/api\/admin\/bookings\/([^/]+)$/);
  if (booking && request.method === 'PATCH') {
    return { handler: updateBooking, id: decodeURIComponent(booking[1]) };
  }
  const customerCancellation = path.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
  if (customerCancellation && request.method === 'POST') {
    return { handler: cancelCustomerBooking, id: decodeURIComponent(customerCancellation[1]) };
  }
  const block = path.match(/^\/api\/admin\/blocks\/([^/]+)$/);
  if (block && request.method === 'DELETE') {
    return { handler: deleteBlock, id: decodeURIComponent(block[1]) };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = matchRoute(request);
    if (!route) {
      if (url.pathname.startsWith('/api/')) {
        return json({ message: 'Indirizzo API non trovato' }, 404);
      }
      return env.ASSETS.fetch(request);
    }

    try {
      await ensureDatabase(env);
      return await route.handler(request, env, route.id);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'api_error',
        path: url.pathname,
        message: error instanceof Error ? error.message : String(error),
      }));
      return json({ message: 'Servizio temporaneamente non disponibile' }, 503);
    }
  },
};
