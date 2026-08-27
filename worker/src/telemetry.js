/**
 * SKLZ telemetry + the hidden admin dashboard.
 *
 *   POST /api/hit   one row per page load, answers {demo, why}
 *   POST /api/ev    a batch of interaction events (sendBeacon)
 *   GET  /adm/<ADMIN_TOKEN>        the dashboard
 *   GET  /adm/<ADMIN_TOKEN>/data   its JSON
 *   POST /adm/<ADMIN_TOKEN>/signage  add/remove a force-demo rule
 *
 * Why the hit endpoint answers rather than just recording: a bulletin board
 * cannot click through the gate, and it cannot tell us what it is either. The
 * only party that knows the client's real IP and network is this Worker, so
 * the decision "you are a display, go to demo mode" has to be made here and
 * handed back to the page.
 */

/* Signage patterns that ship in code, so an empty `signage` table still does
   the right thing. Anything added through the dashboard lands in D1 and is
   merged on top of these. `ref:` matches the referrer the PAGE reports, which
   is how a player that frames us identifies itself no matter what IP it
   arrives from: measured 2026-08-27, every kitcast request in the Apache log
   carried Referer https://player.next.kitcast.tv/ while its Cloudflare-facing
   address moved across eight different edge PoPs. */
const BUILTIN_SIGNAGE = [
  { pat: 'ref:kitcast.tv', note: 'Kitcast player (built in)' },
  { pat: 'ua:BrightSign', note: 'BrightSign player (built in)' },
];

let sigCache = null, sigCacheAt = 0;
async function signageRules(env) {
  const now = Date.now();
  /* Cached per isolate, and there are many isolates. `signageWrite` can only
     clear the one it runs in, so a NEW rule takes up to this long to reach
     every edge: measured 2026-08-27, a load 27s after an insert still saw the
     old set while loads at 10s and 90s matched. That is fine for a display
     that runs for months and would be maddening while testing, so keep it
     short. Do not "fix" it with a KV read per hit; this is one D1 query per
     isolate per window. */
  if (sigCache && now - sigCacheAt < 30000) return sigCache;
  let rows = [];
  try {
    const r = await env.sklz_presets.prepare('SELECT pat, note FROM signage').all();
    rows = r.results || [];
  } catch (_) { /* table not migrated yet: built-ins still work */ }
  const seen = new Set(rows.map(r => r.pat));
  sigCache = rows.concat(BUILTIN_SIGNAGE.filter(b => !seen.has(b.pat)));
  sigCacheAt = now;
  return sigCache;
}

/* One rule against one visitor. Returns the matching pattern or ''. */
function matchSignage(rules, v) {
  for (const r of rules) {
    const p = String(r.pat || '');
    const i = p.indexOf(':');
    if (i < 0) continue;
    const kind = p.slice(0, i), val = p.slice(i + 1);
    if (!val) continue;
    if (kind === 'ip'  && v.ip === val) return p;
    if (kind === 'net' && v.ip && v.ip.startsWith(val)) return p;
    if (kind === 'asn' && String(v.asn) === val) return p;
    /* `ref:` tests the referrer AND the framing ancestor. A parent page can
       suppress document.referrer with a referrer policy, and it cannot
       suppress location.ancestorOrigins, so a player that tightened its
       policy would otherwise go invisible to this rule while still being
       plainly identifiable. Found 2026-08-27 while testing why a display
       still saw the gate: the LOCAL trigger already had this backstop and
       the remote one did not. */
    if (kind === 'ref' && ((v.ref && v.ref.toLowerCase().includes(val.toLowerCase())) ||
                           (v.anc && v.anc.toLowerCase().includes(val.toLowerCase())))) return p;
    if (kind === 'ua'  && v.ua  && v.ua.toLowerCase().includes(val.toLowerCase())) return p;
  }
  return '';
}

const s = (x, n) => (x == null ? null : String(x).slice(0, n));

/* Rows are cheap but not free, and D1's free tier is a daily WRITE budget.
   Sweep on roughly one hit in fifty rather than on a cron we would have to
   remember exists. */
async function sweep(env) {
  if (Math.random() > 0.02) return;
  const cut = Date.now() - 60 * 86400 * 1000;
  try {
    await env.sklz_presets.batch([
      env.sklz_presets.prepare('DELETE FROM hits WHERE ts < ?').bind(cut),
      env.sklz_presets.prepare('DELETE FROM events WHERE ts < ?').bind(cut),
    ]);
  } catch (_) {}
}

export async function recordHit(request, env, ctx, body) {
  const cf = request.cf || {};
  const v = {
    ip: request.headers.get('CF-Connecting-IP') || '',
    asn: cf.asn || null,
    ua: request.headers.get('User-Agent') || '',
    ref: s(body.ref, 300) || '',
    anc: s(body.ancestor, 120) || '',
  };
  const rules = await signageRules(env);
  const hit = matchSignage(rules, v);

  /* The page tells us which mode it ALREADY resolved on its own (a typed
     /demo, ?kiosk=1). Recording that verbatim is what makes "they keep
     landing on the gate" a number instead of an anecdote. */
  const mode = hit && body.mode === 'gate' ? 'signage' : (s(body.mode, 12) || 'gate');
  const sid = s(body.sid, 24) || 'anon';

  ctx.waitUntil((async () => {
    try {
      await env.sklz_presets.prepare(
        `INSERT INTO hits (ts, sid, ip, asn, org, country, city, colo, ua, path, ref,
                           mode, vw, vh, dpr, framed, ancestor, build)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        Date.now(), sid, v.ip, v.asn, s(cf.asOrganization, 80), s(cf.country, 4),
        s(cf.city, 60), s(cf.colo, 8), s(v.ua, 300), s(body.path, 120), v.ref,
        mode, body.vw | 0, body.vh | 0, +body.dpr || 1,
        body.framed ? 1 : 0, s(body.ancestor, 120), s(body.build, 24)
      ).run();
      if (hit) {
        await env.sklz_presets.prepare(
          'UPDATE signage SET hits = hits + 1, last_at = ? WHERE pat = ?'
        ).bind(Date.now(), hit).run();
      }
      await sweep(env);
    } catch (_) {}
  })());

  return { demo: !!hit, why: hit || '' };
}

const EV_KINDS = new Set(['key', 'cfg', 'dl', 'fx', 'panel', 'chat', 'share',
                          'photo', 'preset', 'voice', 'gate', 'end']);

export async function recordEvents(request, env, ctx, body) {
  const list = Array.isArray(body.e) ? body.e.slice(0, 80) : [];
  const sid = s(body.sid, 24) || 'anon';
  if (!list.length) return { ok: true, n: 0 };
  const now = Date.now();
  const stmt = env.sklz_presets.prepare(
    'INSERT INTO events (ts, sid, kind, name, val) VALUES (?,?,?,?,?)');
  const rows = [];
  for (const e of list) {
    const kind = s(e.k, 12);
    if (!EV_KINDS.has(kind)) continue;             // unknown kinds are dropped, never stored
    rows.push(stmt.bind(now, sid, kind, s(e.n, 48), s(e.v, 64)));
  }
  if (!rows.length) return { ok: true, n: 0 };
  ctx.waitUntil((async () => {
    try { await env.sklz_presets.batch(rows); } catch (_) {}
  })());
  return { ok: true, n: rows.length };
}

const WINDOWS = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3, all: 3650 * 86400e3 };

export async function adminData(env, url) {
  const win = WINDOWS[url.searchParams.get('win')] ? url.searchParams.get('win') : '7d';
  const since = Date.now() - WINDOWS[win];
  const db = env.sklz_presets;
  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);

  const [totals, byMode, byDay, topKeys, topCfg, downloads, byFx, byPanel,
         visitors, recent, signage, uaRows, misc] = await Promise.all([
    q(`SELECT COUNT(*) loads, COUNT(DISTINCT sid) sessions, COUNT(DISTINCT ip) ips
         FROM hits WHERE ts >= ?`, since),
    q(`SELECT mode, COUNT(*) n FROM hits WHERE ts >= ? GROUP BY mode ORDER BY n DESC`, since),
    q(`SELECT date(ts/1000,'unixepoch') d, COUNT(*) n, COUNT(DISTINCT ip) ips
         FROM hits WHERE ts >= ? GROUP BY d ORDER BY d`, since),
    q(`SELECT name, COUNT(*) n FROM events WHERE kind='key' AND ts >= ?
         GROUP BY name ORDER BY n DESC LIMIT 60`, since),
    q(`SELECT name, COUNT(*) n FROM events WHERE kind='cfg' AND ts >= ?
         GROUP BY name ORDER BY n DESC LIMIT 60`, since),
    q(`SELECT name, COUNT(*) n FROM events WHERE kind='dl' AND ts >= ?
         GROUP BY name ORDER BY n DESC`, since),
    q(`SELECT name, COUNT(*) n FROM events WHERE kind='fx' AND ts >= ?
         GROUP BY name ORDER BY n DESC LIMIT 40`, since),
    q(`SELECT name, COUNT(*) n FROM events WHERE kind='panel' AND ts >= ?
         GROUP BY name ORDER BY n DESC LIMIT 40`, since),
    q(`SELECT ip, MAX(org) org, MAX(country) country, MAX(city) city, MAX(asn) asn,
              COUNT(*) loads, MAX(ts) last, MAX(ua) ua, MAX(ref) ref,
              GROUP_CONCAT(DISTINCT mode) modes
         FROM hits WHERE ts >= ? GROUP BY ip ORDER BY loads DESC LIMIT 80`, since),
    q(`SELECT ts, ip, org, country, city, ua, path, ref, mode, framed, ancestor, vw, vh
         FROM hits WHERE ts >= ? ORDER BY ts DESC LIMIT 120`, since),
    q(`SELECT pat, note, hits, last_at, added_at FROM signage ORDER BY hits DESC`),
    q(`SELECT ua, COUNT(*) n FROM hits WHERE ts >= ? GROUP BY ua ORDER BY n DESC LIMIT 25`, since),
    q(`SELECT kind, COUNT(*) n FROM events WHERE ts >= ? AND kind IN
         ('chat','share','photo','preset','voice','gate','end') GROUP BY kind ORDER BY n DESC`, since),
  ]);

  return {
    win, since,
    totals: totals[0] || { loads: 0, sessions: 0, ips: 0 },
    byMode, byDay, topKeys, topCfg, downloads, byFx, byPanel,
    visitors, recent, signage, uaRows, misc,
    builtin: BUILTIN_SIGNAGE,
  };
}

export async function signageWrite(env, body) {
  const pat = String(body.pat || '').trim().slice(0, 80);
  if (!/^(ip|net|asn|ref|ua):.+/.test(pat)) return { error: 'pat must be ip:|net:|asn:|ref:|ua: plus a value' };
  sigCache = null;
  if (body.remove) {
    await env.sklz_presets.prepare('DELETE FROM signage WHERE pat = ?').bind(pat).run();
    return { ok: true, removed: pat };
  }
  await env.sklz_presets.prepare(
    `INSERT INTO signage (pat, note, added_at) VALUES (?,?,?)
     ON CONFLICT(pat) DO UPDATE SET note = excluded.note`
  ).bind(pat, String(body.note || '').slice(0, 120), Date.now()).run();
  return { ok: true, added: pat };
}
