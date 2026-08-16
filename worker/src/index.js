/**
 * SKLZ preset gallery API.
 *
 *   POST /api/presets        {name, config}  -> {id, name}
 *   GET  /api/presets?sort=top|new&limit=N   -> [{id,name,loads,views,created_at}]
 *   GET  /api/presets/:id                    -> {id,name,config,...}  (counts a load)
 *   POST /api/presets/:id/view               -> bumps the view counter
 *
 * Everything is public and unauthenticated by design (it is an art toy), so the
 * write path is defended by: a name filter, a strict config whitelist, a size
 * cap, and a per-IP hourly write quota.
 */

const ALLOWED_ORIGINS = [
  'https://hermanosamini.com',
  'https://www.hermanosamini.com',
  'https://pedramamini.com',
];

/* Config keys the page is allowed to persist, with hard numeric bounds.
   Anything not on this list is dropped, so a hostile client cannot smuggle
   arbitrary JSON into other people's browsers. */
const LIMITS = {
  tunnelSpeed: [0.005, 0.12], tunnelBassBoost: [0, 3], tunnelBreath: [0, 0.3],
  skullSpinMax: [0, 2], beatSensitivity: [1.05, 2], beatDecay: [1, 15],
  ringSpeed: [0, 1], ringBeatKick: [0, 6], spiralSpeed: [0, 1], raySpeed: [0, 0.4],
  nosePulse: [0, 1], teethClack: [0, 0.5], pupilBeat: [0, 0.6],
  smokeStir: [0, 4], smokeDecay: [0.05, 3], skullSize: [0.5, 1.8],
  rayLength: [0.3, 2.5], rayCount: [6, 28], smokeScale: [0.4, 3],
  smokeDrift: [0.1, 4], tunnelCount: [12, 56], starDensity: [0.2, 2.5],
  dustCount: [0.2, 2], gazeRange: [0.3, 2], wanderPace: [0.3, 3],
  tempoRef: [60, 140], dayCycleMin: [2, 30], perfMode: [0, 2], tempoMax: [1, 3],
  eventMinGap: [1, 30], eventMaxGap: [2, 60],
  liquidFill: [2, 30], liquidRest: [0, 20],
  musicVolume: [0, 1], gritoVolume: [0, 1],
  textOn: [0, 1], musicOn: [0, 1], autoEvents: [0, 1], voiceOn: [0, 1], hudOn: [0, 1],
};

/* Deliberately blunt list: slurs and profanity roots. Matching happens after
   leet-normalization, on word boundaries where a root is also a legit
   substring (the Scunthorpe problem), and anywhere for the unambiguous ones. */
const BAD_ANY = [
  'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'dick', 'cock', 'pussy',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'spic', 'chink',
  'wetback', 'tranny', 'rape', 'nazi', 'hitler', 'porn', 'cum', 'jizz',
  'blowjob', 'handjob', 'dildo', 'anal', 'penis', 'vagina', 'boob', 'tits',
  'asshole', 'bastard', 'douche', 'wank', 'twat', 'bollock', 'pedo', 'incest',
  'molest', 'kill yourself', 'kys', 'suicide', 'heroin', 'meth', 'cocaine',
];
/* Roots that are fine inside real words, blocked only as standalone words.
   "hell", "damn" and "crap" are deliberately NOT here: they are PG-permissible
   and blocking them kills legitimate names like "Hell of a View". */
const BAD_WORD = ['ass', 'sex', 'weed', 'nude', 'coke', 'dope'];

function normalizeForFilter(s) {
  return s.toLowerCase()
    .replace(/[4@]/g, 'a').replace(/[3€]/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't')
    .replace(/[^a-z ]/g, '');          // strip spacers used to evade filters
}
function nameProblem(name) {
  if (typeof name !== 'string') return 'name required';
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'name too short';
  if (trimmed.length > 28) return 'name too long (28 max)';
  if (!/^[A-Za-z0-9 '\-!?.]+$/.test(trimmed)) return 'letters, numbers and simple punctuation only';
  const flat = normalizeForFilter(trimmed);
  const squished = flat.replace(/ /g, '');
  for (const w of BAD_ANY) {
    if (squished.includes(w.replace(/ /g, ''))) return 'keep it PG';
  }
  const words = flat.split(/\s+/).filter(Boolean);
  for (const w of BAD_WORD) if (words.includes(w)) return 'keep it PG';
  if (/(.)\1{5,}/.test(trimmed)) return 'no keyboard mashing';
  return null;
}

function cleanConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const k in LIMITS) {
    if (!(k in raw)) continue;
    const v = Number(raw[k]);
    if (!isFinite(v)) continue;
    const [lo, hi] = LIMITS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
    n++;
  }
  return n >= 5 ? out : null;      // a preset with almost nothing in it is junk
}

const slugChars = 'abcdefghijkmnpqrstuvwxyz23456789';   // no look-alikes
function makeId() {
  let s = '';
  const b = crypto.getRandomValues(new Uint8Array(8));
  for (const x of b) s += slugChars[x % slugChars.length];
  return s;
}
async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(salt + '|' + ip);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join('');
}

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
const json = (obj, status, request) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(request) },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    try {
      /* ── list ── */
      if (request.method === 'GET' && path === '/api/presets') {
        const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
        const order = sort === 'new'
          ? 'created_at DESC'
          : '(loads * 3 + views) DESC, created_at DESC';   // loads count more than looks
        const { results } = await env.sklz_presets.prepare(
          `SELECT id, name, loads, views, created_at FROM presets
            WHERE hidden = 0 ORDER BY ${order} LIMIT ?`
        ).bind(limit).all();
        return json({ presets: results || [] }, 200, request);
      }

      /* ── fetch one (counts as a load) ── */
      const one = path.match(/^\/api\/presets\/([a-z0-9]{4,16})$/);
      if (request.method === 'GET' && one) {
        const row = await env.sklz_presets.prepare(
          'SELECT id, name, config, loads, views, created_at FROM presets WHERE id = ? AND hidden = 0'
        ).bind(one[1]).first();
        if (!row) return json({ error: 'not found' }, 404, request);
        await env.sklz_presets.prepare('UPDATE presets SET loads = loads + 1 WHERE id = ?')
          .bind(one[1]).run();
        return json({
          id: row.id, name: row.name, config: JSON.parse(row.config),
          loads: row.loads + 1, views: row.views, created_at: row.created_at,
        }, 200, request);
      }

      /* ── view ping ── */
      const vw = path.match(/^\/api\/presets\/([a-z0-9]{4,16})\/view$/);
      if (request.method === 'POST' && vw) {
        await env.sklz_presets.prepare('UPDATE presets SET views = views + 1 WHERE id = ?')
          .bind(vw[1]).run();
        return json({ ok: true }, 200, request);
      }

      /* ── element request from the site ──
         Stored here; a separate pipeline files the GitHub issue and mails the
         requester. We deliberately do NOT file the issue inline: that needs a
         GH token, and a public unauthenticated endpoint holding one is a bad
         trade. The pipeline runs with its own credentials. */
      if (request.method === 'POST' && path === '/api/requests') {
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: 'bad json' }, 400, request);

        const text = String(body.request || '').trim();
        if (text.length < 8) return json({ error: 'say a little more' }, 400, request);
        if (text.length > 400) return json({ error: 'keep it under 400 characters' }, 400, request);
        /* same PG bar as preset names: this becomes a public issue */
        if (nameProblem(text.slice(0, 28)) === 'keep it PG' ||
            BAD_ANY.some(w => normalizeForFilter(text).replace(/ /g, '').includes(w.replace(/ /g, '')))) {
          return json({ error: 'keep it PG' }, 400, request);
        }

        const email = String(body.email || '').trim().slice(0, 120);
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
          return json({ error: 'that email does not look right' }, 400, request);
        }

        const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
        const author = await hashIp(ip, env.SALT || 'sklz');
        const hour = Math.floor(Date.now() / 3600000);
        const quota = await env.sklz_presets.prepare(
          'SELECT n FROM writes WHERE author_hash = ? AND hour_bucket = ?'
        ).bind(author, hour).first();
        if (quota && quota.n >= 10) return json({ error: 'easy there, try again later' }, 429, request);

        const id = makeId();
        await env.sklz_presets.prepare(
          `INSERT INTO requests (id, body, email, config, created_at, author_hash)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(id, text, email || null,
               body.config ? JSON.stringify(cleanConfig(body.config) || {}) : null,
               Date.now(), author).run();
        await env.sklz_presets.prepare(
          `INSERT INTO writes (author_hash, hour_bucket, n) VALUES (?, ?, 1)
           ON CONFLICT(author_hash, hour_bucket) DO UPDATE SET n = n + 1`
        ).bind(author, hour).run();

        return json({ id, queued: true }, 200, request);
      }

      /* ── save ── */
      if (request.method === 'POST' && path === '/api/presets') {
        const body = await request.json().catch(() => null);
        if (!body) return json({ error: 'bad json' }, 400, request);

        const problem = nameProblem(body.name);
        if (problem) return json({ error: problem }, 400, request);

        const config = cleanConfig(body.config);
        if (!config) return json({ error: 'config missing or unrecognized' }, 400, request);

        const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
        const author = await hashIp(ip, env.SALT || 'sklz');
        const hour = Math.floor(Date.now() / 3600000);
        const quota = await env.sklz_presets.prepare(
          'SELECT n FROM writes WHERE author_hash = ? AND hour_bucket = ?'
        ).bind(author, hour).first();
        if (quota && quota.n >= 10) {
          return json({ error: 'easy there, try again later' }, 429, request);
        }

        const nameKey = normalizeForFilter(body.name).replace(/\s+/g, ' ').trim();
        const dupe = await env.sklz_presets.prepare(
          'SELECT id FROM presets WHERE name_key = ?'
        ).bind(nameKey).first();
        if (dupe) return json({ error: 'that name is taken' }, 409, request);

        const id = makeId();
        await env.sklz_presets.prepare(
          `INSERT INTO presets (id, name, name_key, config, created_at, author_hash)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(id, body.name.trim(), nameKey, JSON.stringify(config), Date.now(), author).run();
        await env.sklz_presets.prepare(
          `INSERT INTO writes (author_hash, hour_bucket, n) VALUES (?, ?, 1)
           ON CONFLICT(author_hash, hour_bucket) DO UPDATE SET n = n + 1`
        ).bind(author, hour).run();

        return json({ id, name: body.name.trim() }, 200, request);
      }

      return json({ error: 'not found' }, 404, request);
    } catch (e) {
      return json({ error: 'server error', detail: String(e).slice(0, 200) }, 500, request);
    }
  },
};
