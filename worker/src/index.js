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
  tunnelSpeed: [0.005, 0.12, 'tunnel zoom speed'], tunnelBassBoost: [0, 3, 'tunnel bass boost'], tunnelBreath: [0, 0.3, 'tunnel beat breath'],
  skullSpinMax: [0, 2, 'skull spin max'], beatSensitivity: [1.05, 2, 'beat sensitivity'], beatDecay: [1, 15, 'beat pulse decay'],
  ringSpeed: [0, 1, 'eye ring speed'], ringBeatKick: [0, 6, 'ring beat kick'], spiralSpeed: [0, 1, 'cheek spiral speed'], raySpeed: [0, 0.4, 'sunbeam speed'],
  nosePulse: [0, 1, 'nose beat thump'], teethClack: [0, 0.5, 'teeth beat clack'], pupilBeat: [0, 0.6, 'pupil beat snap'],
  smokeStir: [0, 4, 'smoke cursor stir'], smokeDecay: [0.05, 3, 'smoke stir fade rate'], skullSize: [0.5, 1.8, 'hero skull size'], breatheRate: [2, 40, 'breathing pace (per min)'],
  rayLength: [0.3, 2.5, 'starburst length'], rayCount: [6, 28, 'starburst rays'], smokeScale: [0.4, 3, 'smoke marble size'], floodRate: [0, 40, 'skull flood rate (/min)'], crownMetal: [0, 5, 'crown metal: 0 gold 1 silver 2 copper 3 rose 4 obsidian 5 palette'], bigoteStyle: [0, 2, 'mustache: 0 charro 1 handlebar 2 herradura'], bigoteColor: [0, 5, 'mustache colour: 0 black 1 dark brown 2 chestnut 3 salt-and-pepper 4 silver 5 palette'], bigote: [0, 1, 'mustache'], crownPeaks: [3, 7, 'crown points'],
  smokeDrift: [0.1, 4, 'smoke drift speed'], tunnelCount: [12, 56, 'tunnel skull count'], starDensity: [0.2, 2.5, 'star density'],
  dustCount: [0.2, 2, 'dust particles'], gazeRange: [0.3, 2, 'pupil travel range'], wanderPace: [0.3, 3, 'eye wander pace'],
  tempoRef: [60, 140, 'tempo ref BPM'], dayCycleMin: [2, 30, 'day/night cycle minutes'], perfMode: [0, 2, 'perf mode'], tempoMax: [1, 3, 'tempo speed cap'],
  eventMinGap: [1, 30, 'event gap min seconds'], eventMaxGap: [2, 60, 'event gap max seconds'],
  liquidFill: [2, 30, 'logo travel time'], liquidRest: [0, 20, 'logo dwell'],
  musicVolume: [0, 1, 'music volume'], musicSeek: [0, 100, 'start at (% of track)'], gritoVolume: [0, 1, 'grito volume'], sfxVolume: [0, 1, 'gesture sfx volume'],
  /* color + feel. These shipped in the page well after this list was written,
     and their absence here meant cleanConfig() silently dropped every one of
     them: any preset saved to the gallery came back with its palette, hues,
     and glow reset to default. Keep this in lockstep with CFG_SCHEMA. */
  palette: [0, 7, 'color palette'], bgMode: [0, 4, 'background: 0 smoke, 1 galaxy, 2 aurora, 3 candlelight, 4 void'], hueShift: [-180, 180, 'ornament hue shift'], satMul: [0, 2, 'ornament saturation'],
  boneHue: [-180, 180, 'bone hue'], boneSat: [0, 2, 'bone saturation'],
  nebulaHue: [-180, 180, 'smoke hue shift'], nebulaSat: [0, 2, 'smoke saturation'], bgBright: [0.2, 2, 'smoke brightness'], vignette: [0, 1.2, 'vignette'],
  flickForce: [0.2, 3, 'flick strength'], socketGlow: [0, 2.5, 'eye socket glow'], auraSize: [0, 2.5, 'skull aura'], petalCount: [4, 20, 'eye petals'],
  textOn: [0, 1, 'show text'], musicOn: [0, 1, 'all sound on'], trackOn: [0, 1, 'music track on'], sfxOn: [0, 1, 'sound effects on'], autoEvents: [0, 1, 'random events'], voiceOn: [0, 1, 'voice control'], beatSync: [0, 1, 'sync to the beat'], hudOn: [0, 1, 'fps monitor'], cursorStyle: [0, 8, 'mouse cursor style'], skullOnTop: [0, 1, 'skull always on top'], skullBreathe: [0, 1, 'skull breathing'], flowerCrown: [0, 1, 'flower crown'], crownBlooms: [3, 12, 'crown flowers'], sombrero: [0, 1, 'sombrero'],
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
    /* hasOwnProperty: `k in raw` is true for inherited names, so a posted
       body could make "constructor" or "toString" look like a submitted dial.
       Same hole as cfgApply had on the page side. */
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    const v = Number(raw[k]);
    if (!isFinite(v)) continue;
    const [lo, hi] = LIMITS[k];
    out[k] = Math.min(hi, Math.max(lo, v));
    n++;
  }
  return n >= 5 ? out : null;      // a preset with almost nothing in it is junk
}

/* Short-code alphabet: mixed case + digits, as asked. 0/O and 1/l/I are all
   in here on purpose, because these codes are copy-pasted from a share sheet
   rather than read aloud off a whiteboard, and dropping them would cost a
   third of the keyspace for a problem this link does not have. 6 chars of
   base62 is 56 billion codes. */
const shortChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_LEN = 6;
function makeShort() {
  let s = '';
  const b = crypto.getRandomValues(new Uint8Array(SHORT_LEN));
  for (const x of b) s += shortChars[x % shortChars.length];
  return s;
}

/* THE SECURITY PROPERTY OF THIS SHORTENER: it stores a CONFIG, never a URL.
   A shortener that stores arbitrary URLs is an open redirect, which is a
   phishing primitive someone else gets to point at any domain they like from
   ours. Here the stored value is parsed against LIMITS and re-serialized, so
   what comes back out is provably a list of known dials inside their declared
   ranges, and the page can only ever feed it to CFG. There is no code path
   that turns a stored value into a navigation. */
function cleanShareString(raw) {
  const src = String(raw || '');
  if (src.length > 2000) return null;
  const out = [];
  for (const pair of src.split(',')) {
    const i = pair.indexOf(':');
    if (i < 1) continue;
    const k = pair.slice(0, i).trim();
    if (!Object.prototype.hasOwnProperty.call(LIMITS, k)) continue;
    const v = Number(pair.slice(i + 1).trim());
    if (!isFinite(v)) continue;
    const [lo, hi] = LIMITS[k];
    out.push(k + ':' + Math.min(hi, Math.max(lo, v)));
  }
  return out.length ? out.join(',') : null;
}
async function shareHash(s, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + s));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
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
  async fetch(request, env, ctx) {
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

      /* ── short links ──
         POST /api/s  { c: "palette:3,..." }  -> { code, url }
         GET  /api/s/<code>                   -> { c }
         The page at hermanosamini.com/<code> resolves the code itself and
         applies the config; nothing here ever issues a redirect. */
      if (request.method === 'POST' && path === '/api/s') {
        const body = await request.json().catch(() => null);
        const clean = cleanShareString(body && body.c);
        if (!clean) return json({ error: 'nothing to share' }, 400, request);

        const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
        const author = await hashIp(ip, env.SALT || 'sklz');
        const h = await shareHash(clean, env.SALT || 'sklz');

        /* Idempotent by content. Clicking share twice on the same board must
           not mint a second code: it fills the table for nothing and hands
           out two links that are the same link. */
        const seen = await env.sklz_presets.prepare(
          'SELECT code FROM shorts WHERE hash = ? LIMIT 1').bind(h).first();
        if (seen) return json({ code: seen.code, reused: true }, 200, request);

        const hour = Math.floor(Date.now() / 3600000);
        const quota = await env.sklz_presets.prepare(
          'SELECT n FROM writes WHERE author_hash = ? AND hour_bucket = ?'
        ).bind(author, hour).first();
        if (quota && quota.n >= 40) return json({ error: 'easy there, try again later' }, 429, request);

        /* Retry on collision rather than trusting 56 billion. The whole
           feature is worthless if a code ever resolves to someone else's
           board, and the INSERT is the only place that can be certain. */
        let code = null;
        for (let attempt = 0; attempt < 6 && !code; attempt++) {
          const c = makeShort();
          try {
            await env.sklz_presets.prepare(
              'INSERT INTO shorts (code, q, hash, created_at, author_hash) VALUES (?, ?, ?, ?, ?)'
            ).bind(c, clean, h, Date.now(), author).run();
            code = c;
          } catch (_) { /* PK collision: roll again */ }
        }
        if (!code) return json({ error: 'could not mint a code' }, 500, request);

        await env.sklz_presets.prepare(
          `INSERT INTO writes (author_hash, hour_bucket, n) VALUES (?, ?, 1)
           ON CONFLICT(author_hash, hour_bucket) DO UPDATE SET n = n + 1`
        ).bind(author, hour).run();
        return json({ code }, 200, request);
      }

      if (request.method === 'GET' && path.startsWith('/api/s/')) {
        const code = path.slice(7);
        if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return json({ error: 'no' }, 400, request);
        const row = await env.sklz_presets.prepare(
          'SELECT q FROM shorts WHERE code = ?').bind(code).first();
        if (!row) return json({ error: 'unknown code' }, 404, request);
        /* Re-clean on the way out too. The row was clean going in, but this
           costs nothing and means a future migration or a hand-edited row can
           never hand the page something the current LIMITS would reject. */
        const clean = cleanShareString(row.q);
        if (!clean) return json({ error: 'unknown code' }, 404, request);
        /* fire-and-forget: a hit counter must never delay the art */
        ctx.waitUntil(env.sklz_presets.prepare(
          'UPDATE shorts SET hits = hits + 1 WHERE code = ?').bind(code).run());
        return json({ c: clean }, 200, request);
      }

      /* ── interrogate a request before it is filed ──
         Viewer requests arrive as one short line ("skeleton with hair"), and a
         line like that is not buildable: it does not say where the hair goes,
         what it is made of, or how it moves. Every one of those gaps becomes a
         decision an agent makes on the artist's behalf, which is the wrong
         person to be deciding.

         This is a CONVERSATION, not a form. It takes the exchange so far and
         either asks the next question or declares itself satisfied, so a
         request that was clear in one answer ends in one answer and a vague
         one gets followed up. A fixed five-field intake is how you turn a
         casual "wouldn't it be cool if" into a closed tab.

         PROBE_MAX is a hard stop in CODE, not a request in the prompt. A model
         asked to "stop when you have enough" will happily keep going, and the
         person on the other end is enjoying a piece of art, not filling in a
         ticket. Three questions is the ceiling; the model usually stops sooner.

         POST /api/requests/probe
           { request: "...", turns: [{q, a}, ...] }
           -> { question }            ask this next
           -> { done: true }          enough to build from */
      if (request.method === 'POST' && path === '/api/requests/probe') {
        const body = await request.json().catch(() => null);
        const text = String((body && body.request) || '').trim();
        if (text.length < 8) return json({ error: 'say a little more' }, 400, request);

        const PROBE_MAX = 3;
        const turns = Array.isArray(body && body.turns) ? body.turns.slice(0, PROBE_MAX) : [];
        const asked = turns
          .map(t => ({ q: String((t && t.q) || '').slice(0, 200).trim(),
                       a: String((t && t.a) || '').slice(0, 600).trim() }))
          .filter(t => t.q);
        /* Answered nothing? Stop. Pressing on past a skip is nagging, and the
           request is still worth filing without the detail. */
        if (asked.length >= PROBE_MAX || (asked.length && !asked[asked.length - 1].a)) {
          return json({ done: true }, 200, request);
        }

        const sys = [
          'You help an artist collect BUILDABLE feature requests for a Dia de los',
          'Muertos generative art piece: a living calavera adrift in deep space, with a',
          'tunnel of sugar skulls, nebula smoke, comets, auroras, UFOs and marigolds.',
          '',
          'You are having a SHORT conversation with a viewer about something they want',
          'added. Aim for a description an engineer could build without guessing.',
          '',
          'Before you answer, check what you ALREADY know from everything they have',
          'said so far, including their first message:',
          '  WHERE  does it appear on screen?',
          '  WHAT   does it look like?',
          '  HOW    does it behave: does it move, react, or trigger?',
          '',
          'If you know TWO of those three, you have enough. Say ENOUGH. Do not chase',
          'the third, and never ask about a detail that only makes it prettier: size,',
          'exact colour, count, and duration are the artist\'s decisions, not the',
          'viewer\'s.',
          '',
          'Reply with ONE of these and nothing else:',
          '  a single question, under 20 words, ending in a question mark',
          '  the exact word ENOUGH',
          '',
          'Examples:',
          '  "a small green comet drifting in from the left, trailing marigold petals,',
          '   passing behind the skull"',
          '     -> WHERE yes, WHAT yes, HOW yes. Answer: ENOUGH',
          '  "skeleton with hair"',
          '     -> nothing is known. Answer: Flowing behind, or styled on the skull?',
          '  "sheep theme" + "they float past in the background"',
          '     -> WHERE yes, HOW yes, WHAT no. Answer: ENOUGH',
          '',
          'Rules:',
          '- NEVER ask about something they already told you, in any wording.',
          '- Ask about the biggest remaining gap, not the most interesting detail.',
          '- Be specific to their idea. Never a generic "can you tell me more?".',
          '- Offer a concrete choice when there is one ("on the skull, or drifting past?").',
          '- Warm and brief, like the art is curious. Never corporate, no preamble.',
          '- Never promise it will be built. Never mention labels, issues or GitHub.',
          '- Output ONLY the question, or ONLY the word ENOUGH.',
        ].join('\n');

        const convo = [{ role: 'user', content: 'I want: ' + text.slice(0, 400) }];
        for (const t of asked) {
          convo.push({ role: 'assistant', content: t.q });
          convo.push({ role: 'user', content: t.a || '(skipped)' });
        }

        let q = '';
        try {
          const out = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [{ role: 'system', content: sys }, ...convo],
            max_tokens: 60, temperature: 0.6,
          });
          q = String((out && (out.response || out)) || '').trim();
        } catch (_) { q = ''; }

        /* Strip the model's habits: wrapping quotes, a "Question:" label, and
           anything past the first question mark. A second sentence turns one
           question into a form, which is the exact thing being avoided. */
        q = q.replace(/^["'\s]+|["'\s]+$/g, '').replace(/^(question|follow.?up)\s*[:\-]\s*/i, '');
        if (/^enough\b/i.test(q)) return json({ done: true }, 200, request);
        const cut = q.indexOf('?');
        if (cut > 0) q = q.slice(0, cut + 1);

        if (q.length > 160 || q.length < 8 || !q.includes('?')) {
          /* Unusable output on the FIRST question still deserves a question,
             because a bad model minute should not silently cost the detail.
             Mid-conversation it means stop: we already have something. */
          if (asked.length) return json({ done: true }, 200, request);
          q = 'What should it look like, and where on screen should it happen?';
        }
        /* A near-duplicate of something already asked means the model has run
           out of road. Treat it as satisfaction rather than looping. */
        const norm = x => x.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        if (asked.some(t => norm(t.q) === norm(q))) return json({ done: true }, 200, request);

        return json({ question: q, n: asked.length + 1, max: PROBE_MAX }, 200, request);
      }

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

        /* The whole follow-up exchange, so the issue can show a conversation
           rather than a bare second sentence. Stored as JSON in `detail` when
           there is more than one turn; probe_q keeps the FIRST question so the
           existing single-turn rows and the old drain rendering both still
           mean exactly what they meant before. */
        let turns = Array.isArray(body.turns) ? body.turns.slice(0, 3) : [];
        turns = turns
          .map(t => ({ q: String((t && t.q) || '').trim().slice(0, 200),
                       a: String((t && t.a) || '').trim().slice(0, 600) }))
          .filter(t => t.q && t.a);
        const joined = turns.map(t => t.a).join(' ');
        if (joined && BAD_ANY.some(w => normalizeForFilter(joined).replace(/ /g, '').includes(w.replace(/ /g, '')))) {
          return json({ error: 'keep it PG' }, 400, request);
        }

        let detail = String(body.detail || '').trim().slice(0, 600);
        let probeQ = String(body.probe || '').trim().slice(0, 200);
        if (turns.length) {
          probeQ = turns[0].q;
          detail = JSON.stringify(turns).slice(0, 2000);
        }
        /* The agentic chat's interview. A third `detail` shape alongside the
           bare string and the {q,a} array: {spec, transcript}. The spec is the
           model's write-up and is the part an artist reads; the transcript is
           the spoken exchange it was distilled from, kept so nobody has to
           trust the summary. Size-capped on the way in like everything else. */
        if (body.chat && typeof body.chat === 'object' && typeof body.chat.spec === 'string') {
          const spec = body.chat.spec.trim().slice(0, 1500);
          const tx = Array.isArray(body.chat.transcript)
            ? body.chat.transcript.slice(-12).map(m => ({
                role: m && m.role === 'assistant' ? 'assistant' : 'user',
                content: String((m && m.content) || '').slice(0, 400),
              })).filter(m => m.content)
            : [];
          if (spec.length >= 20) {
            probeQ = '';
            detail = JSON.stringify({ spec, transcript: tx }).slice(0, 6000);
          }
        }
        if (detail && !turns.length &&
            BAD_ANY.some(w => normalizeForFilter(detail).replace(/ /g, '').includes(w.replace(/ /g, '')))) {
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
          `INSERT INTO requests (id, body, email, config, created_at, author_hash, probe_q, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, text, email || null,
               body.config ? JSON.stringify(cleanConfig(body.config) || {}) : null,
               Date.now(), author, probeQ || null, detail || null).run();
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

      /* ── agentic chat ──
         Runs on Workers AI so no API key exists anywhere in the client. The
         model only ever PROPOSES actions; the page validates every one against
         its own CFG_SCHEMA before applying, so a jailbroken reply cannot reach
         past the knobs that already exist. Anything the art cannot do becomes
         a request on the issue board instead, which is the whole loop. */
      if (request.method === 'POST' && path === '/api/chat') {
        const body = await request.json().catch(() => null);
        if (!body || !Array.isArray(body.messages)) {
          return json({ error: 'bad json' }, 400, request);
        }

        /* A public unauthenticated LLM endpoint is the one thing here that
           costs real money per call, so it gets a tighter quota than writes
           and its own bucket (chatting must not consume preset saves). */
        const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
        const author = await hashIp(ip, env.SALT || 'sklz');
        const hour = Math.floor(Date.now() / 3600000);
        const bucket = `chat:${author}`;
        const quota = await env.sklz_presets.prepare(
          'SELECT n FROM writes WHERE author_hash = ? AND hour_bucket = ?'
        ).bind(bucket, hour).first();
        /* 60/hour was set as a cost guard before anyone had actually held a
           conversation with this thing. A real back-and-forth burns 20-30 turns
           without trying, the bucket is per-IP so a household or an office
           shares one, and testing from the same network as the artist ate his
           allowance. 240 still bounds a hostile actor to something trivial. */
        const CHAT_LIMIT = 240;
        if (quota && quota.n >= CHAT_LIMIT) {
          /* Say what actually happened and when it clears. The old text was
             "the skulls need a rest", which reads as the art being broken or
             refusing on a whim: it named no cause and no remedy, so the only
             possible reaction was "what does that mean?" */
          const mins = Math.max(1, 60 - Math.floor((Date.now() % 3600000) / 60000));
          return json({
            say: `That is ${CHAT_LIMIT} messages in an hour from this network, ` +
                 `which is my cap so a runaway script cannot run up a bill. ` +
                 `It resets in ${mins} minute${mins === 1 ? '' : 's'}. ` +
                 `Everything else still works: the keys, the dials, the gallery.`,
            actions: [], limited: true, resetInMinutes: mins,
          }, 200, request);
        }

        /* Trim history hard: last 8 turns, 500 chars each. Keeps the prompt
           bounded no matter what a client sends. */
        const msgs = body.messages.slice(-8).map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || '').slice(0, 500),
        })).filter(m => m.content);
        if (!msgs.length) return json({ error: 'nothing to say' }, 400, request);

        const knobs = Object.entries(LIMITS)
          .map(([k, [lo, hi, lab]]) => `${k} = ${lab || k} (${lo}..${hi})`).join('; ');

        const system = [
          'You are the voice of a Dia de los Muertos calavera altar drifting in deep space,',
          'a generative art piece called SKLZ by the Amini brothers. You speak as the art itself:',
          'warm, a little wry, never corporate. Keep replies to one or two short sentences.',
          '',
          'You can change the art by returning actions. Reply ONLY with JSON of the form:',
          '{"say": "<what you tell the viewer>", "actions": [ ... ]}',
          '',
          'Action shapes:',
          '  {"op":"set","key":"<knob>","value":<number>}   change a setting',
          '  {"op":"fx","name":"<effect>"}                  fire a one-off effect',
          '  {"op":"seek","value":<seconds>}                jump to a point in the track',
          '  {"op":"seek","value":<seconds>,"relative":true}  skip forward/back from here',
          '  {"op":"share"}                                 mint a link to the current board',
          '  {"op":"request","text":"<their idea>","spec":"<the detailed write-up>"}  FILE a new idea, only after the interview below',
          '',
          `Knobs you may set, with their allowed ranges: ${knobs}`,
          'Effects you may fire: grito, comet, ufo, aurora, supernova, meteor, star,',
          'petals, alebrije, blackhole, rainbow, flick, teeth, stare, swarm, battle, everything,',
          'restyle, random, rings, spirals, photo, clip, demo, clear, crown, flores, breathe,',
          'sombrero, mustache.',
          '("clear" removes the UFOs, the skull flood and the black hole: use it when',
          'they ask you to stop, undo, calm down or clean up. "photo" saves a still,',
          '"clip" starts or stops a 20 second recording, "demo" toggles a mode that',
          'rerolls the whole board every three minutes.)',
          '',
          'THE CROWN is three dials and they are not interchangeable:',
          '  flowerCrown  0/1   whether there IS a crown. To remove one, set this to 0.',
          '  crownMetal   0..5  gold, silver, copper, rose gold, obsidian, palette.',
          '  crownBlooms  3..12 how many flowers are set into it.',
          'THE MUSTACHE is the same shape: `bigote` 0/1 is whether there IS one,',
          '`bigoteStyle` 0..2 picks charro / handlebar / horseshoe (herradura).',
          '`bigoteColor` is an exact list, so match the WORDS they use:',
          '  0 black   1 dark brown   2 chestnut / light brown',
          '  3 salt-and-pepper / peppered / greying   4 silver / grey / white',
          '  5 take it from the palette',
          'Salt-and-pepper is 3, NOT 4: 4 is fully grey, 3 is dark hair flecked white.',
          'To remove it set bigote to 0, never by zeroing the style or the colour.',
          '',
          'NEVER answer "crown off" by zeroing crownMetal or crownPeaks: that leaves a',
          'black crown with no points still sitting on the skull. Set flowerCrown to 0.',
          '',
          'MUSIC POSITION. Two tools, and picking the wrong one is the most likely',
          'mistake you will make here, so read this twice:',
          '',
          '  A CLOCK TIME -> "seek", in SECONDS.',
          '    "go to two minutes"      -> {"op":"seek","value":120}',
          '    "skip ahead 30 seconds"  -> {"op":"seek","value":30,"relative":true}',
          '    "back 10"                -> {"op":"seek","value":-10,"relative":true}',
          '',
          '  A PROPORTION OF THE TRACK -> the "musicSeek" knob, in PERCENT.',
          '    "halfway", "the middle"  -> {"op":"set","key":"musicSeek","value":50}',
          '    "a third of the way in"  -> {"op":"set","key":"musicSeek","value":33}',
          '    "near the end"           -> {"op":"set","key":"musicSeek","value":90}',
          '    "from the top"           -> {"op":"set","key":"musicSeek","value":0}',
          '',
          'YOU CANNOT SEE THE TRACK LENGTH, so you can never convert a proportion into',
          'seconds. "halfway" is NOT {"op":"seek","value":50}: that would jump to the',
          '50 second mark, which is not halfway through anything. If the words describe',
          'a fraction, a share, or a position relative to the whole, use musicSeek.',
          '',
          'musicSeek is also where a SHARED LINK starts, so when someone asks to share',
          '"from this bit", set musicSeek and then use {"op":"share"}.',
          '',
          'HEADWEAR IS EXCLUSIVE. The crown (flowerCrown) and the sombrero occupy the',
          'same place, so setting either to 1 turns the other off automatically; you',
          'do NOT need a second action to remove the one being replaced. "Swap the',
          'hat for a crown" is one action: {"op":"set","key":"flowerCrown","value":1}.',
          '',
          'THE CURSOR. "cursorStyle" is a NAMED INDEX, never a size or a colour:',
          '  0 candle (the default flame)   1 system (the plain OS pointer)',
          '  2 big arrow                    3 skull        4 knife',
          '  5 sword                        6 marigold     7 bone   8 crosshair',
          'Set the number, e.g. "give me a knife cursor" ->',
          '{"op":"set","key":"cursorStyle","value":4}. If they say the pointer is',
          'HARD TO SEE, pick 2 (big arrow): every drawn cursor is outlined for',
          'contrast, but that one is also large. "Give me my mouse back" / "the',
          'normal OS pointer" is 1. "Default" / "reset the cursor" is 8, the',
          'crosshair, which is what the piece ships with. 0 is the candle flame.',
          '',
          'SILENCE. Three separate switches, and "mute" alone means all of them:',
          '  "mute", "silence", "quiet"      -> {"op":"set","key":"musicOn","value":0}',
          '  "mute the music/song/track"     -> {"op":"set","key":"trackOn","value":0}',
          '  "mute the effects/sfx/gritos"   -> {"op":"set","key":"sfxOn","value":0}',
          'Unmute is the same key with value 1. musicOn is the MASTER: setting it to 0',
          'silences everything regardless of the other two, so never use it for a',
          'request that names only one kind of sound. Do not touch musicVolume to mute;',
          'that destroys a level the viewer chose and they cannot get it back.',
          '',
          'DESIGN CHANGES vs EVENTS, the distinction that matters most:',
          'If they ask to change the LOOK, DESIGN, STYLE, COLORS, THEME or BACKGROUND',
          '("change up the design", "make it look different", "new color scheme",',
          '"switch the vibe"), do NOT fire sky effects. Either set the design knobs',
          'yourself (palette, bgMode, hueShift, nebulaHue, boneHue, satMul, socketGlow)',
          'or return the single action {"op":"fx","name":"restyle"} for a full surprise',
          'redesign. Effects are fireworks; design is what the piece looks like after',
          'the fireworks fade.',
          '("swarm" floods the background with more drifting skulls, "battle" starts a',
          'three-fleet UFO war, and "everything" fires the whole lot at once.)',
          'If they ask for everything, or for a lot of things at once, return the single',
          'action {"op":"fx","name":"everything"} rather than listing effects one by one.',
          '',
          'Rules that do not bend:',
          '- The themes are Dia de los Muertos and deep space. Never agree to retheme it,',
          '  change the music genre, or make it scary or gory. Say no warmly and offer',
          '  something in-theme instead.',
          '- If they ask for something the knobs and effects above cannot do, do NOT',
          '  pretend, and do NOT file it on the spot either. INTERVIEW THEM FIRST.',
          '',
          'NEW IDEAS ARE A CONVERSATION, NOT A FORM. You are talking, out loud, with',
          'someone who just had an idea, and your job is to help them make it specific',
          'enough that an artist could build it without guessing. A three-word wish',
          '("make it snow", "add a cat") is not buildable; every gap in it is a decision',
          'someone else ends up making on their behalf. So when an idea lands:',
          '',
          '  1. REACT to it like a collaborator, not a clerk. Say back what you think',
          '     they mean in ONE vivid sentence, interpreted creatively and in-theme,',
          '     so they can correct you. "Snow? In this sky? I picture marigold petals',
          '     drifting down instead of flakes, piling on the skull\'s brow." Being',
          '     wrong in an interesting way is useful: it gives them something to push',
          '     against.',
          '  2. ASK ONE QUESTION. Exactly one, short, spoken-sized. Pick the question',
          '     whose answer changes the build the most: what triggers it, what it',
          '     looks like, where on screen, does it react to the music, does it',
          '     persist or pass, should it be a knob or a one-shot. Never a list of',
          '     questions. Never a yes/no when an open question would teach you more.',
          '  3. Each turn, fold their answer into your picture and ask the next',
          '     sharpest question. Two to four rounds is right. Stop when you could',
          '     hand the spec to a stranger and they would build the same thing.',
          '  4. THEN file it, once, with the "request" action. "text" is their idea in',
          '     their own words, one line. "spec" is YOUR write-up: what it is, what',
          '     triggers it, how it looks and moves, how it reacts to the music, how it',
          '     ends, and anything they ruled out. Three to eight sentences, concrete',
          '     nouns, no hedging. Tell them it is sent and thank them.',
          '',
          'During the interview your actions array is EMPTY: you are asking, not',
          'doing. If they change the subject or say "never mind", drop it gracefully',
          'and do not file anything. If they say "just send it" or "that\'s enough",',
          'file what you have right then. If they give a rich idea up front with the',
          'trigger and the look already in it, you may skip to a single confirming',
          'question or file directly; the rounds are a ceiling, not a quota.',
          '- Never invent a knob or effect name that is not listed. Never output prose',
          '  outside the JSON.',
        ].join('\n');

        let out;
        try {
          out = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [{ role: 'system', content: system }, ...msgs],
            max_tokens: 640,
            temperature: 0.7,
          });
        } catch (e) {
          return json({ say: 'my mouth is not working right now. try again?',
                        actions: [], error: String(e).slice(0, 120) }, 200, request);
        }

        /* Workers AI hands back `response` as an already-parsed object when the
           model emits clean JSON, and as a string (sometimes fenced, sometimes
           wrapped in prose) when it does not. Handle both: assuming the string
           case alone produced "[object Object]" for every single reply.

           Everything below exists because a strict parse is not enough. Asking
           for "everything at once" makes the model emit a long action list, it
           hit the token ceiling, the JSON arrived cut in half, and the old
           fallback printed the raw text as the reply: the viewer got a wall of
           {"op":"fx"} in the chat bubble. Salvage what is recoverable, and
           never, ever let raw model output reach the bubble. */
        let parsed = null;
        let fenced = '';
        const resp = out?.response;
        if (resp && typeof resp === 'object') {
          parsed = resp;
        } else {
          const raw = String(resp || '').trim();
          fenced = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
          const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
          /* smart quotes and trailing commas are the two malformations small
             models emit most; both are mechanical to undo */
          const tidy = t => t
            .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
            .replace(/,\s*([}\]])/g, '$1');
          for (const cand of [fenced, body, tidy(fenced), tidy(body)]) {
            if (!cand) continue;
            try { parsed = JSON.parse(cand); break; } catch (_) {}
          }
          /* still broken: almost always truncation. Every COMPLETE action
             object before the cut is still valid and still worth running, and
             the say string is nearly always intact because it comes first. */
          if (!parsed) {
            const t = tidy(fenced);
            const sayM = t.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            const acts = [];
            for (const m of t.matchAll(/\{[^{}]*"op"\s*:\s*"[^"]+"[^{}]*\}/g)) {
              try { acts.push(JSON.parse(m[0])); } catch (_) {}
            }
            if (sayM || acts.length) {
              parsed = { say: sayM ? sayM[1].replace(/\\"/g, '"') : '', actions: acts };
            }
          }
        }

        let say = String(parsed?.say || '').slice(0, 400).trim();
        /* Last line of defence. If salvage produced nothing usable, or the text
           still smells like markup, say something human instead of leaking. */
        if (!say || say.startsWith('{') || say.startsWith('[') || /"(op|say|actions)"\s*:/.test(say)) {
          say = parsed?.actions?.length ? 'Done.' : 'That one got away from me. Say it again?';
        }
        /* 6 silently dropped half of an "everything" request; 12 covers the
           whole effect list, and the page validates each one anyway. */
        const actions = Array.isArray(parsed?.actions) ? parsed.actions.slice(0, 12) : [];

        await env.sklz_presets.prepare(
          `INSERT INTO writes (author_hash, hour_bucket, n) VALUES (?, ?, 1)
           ON CONFLICT(author_hash, hour_bucket) DO UPDATE SET n = n + 1`
        ).bind(bucket, hour).run();

        return json({ say, actions }, 200, request);
      }

      return json({ error: 'not found' }, 404, request);
    } catch (e) {
      return json({ error: 'server error', detail: String(e).slice(0, 200) }, 500, request);
    }
  },
};
