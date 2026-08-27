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

import { trafficChart, heatChart, funnelChart, depthChart, viewportChart,
         dwellChart, touchChart, MODE_COLOR, CHART } from './charts.js';

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
                          'photo', 'preset', 'voice', 'gate', 'end', 'cap']);

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

/* Time-bucket width per window, so the traffic chart always lands around
   30-60 columns. A fixed bucket makes 1h a single bar and 30d a hairball. */
const BUCKETS = { '1h': 120e3, '24h': 1800e3, '7d': 6 * 3600e3, '30d': 86400e3, all: 86400e3 };
const bucketMs = w => BUCKETS[w] || 3600e3;

/* CST. The dashboard is read from one timezone and an "arrivals by hour"
   chart in UTC is quietly wrong by five hours, which is exactly the kind of
   error that looks like an insight. Seconds, because strftime takes seconds. */
const TZ_OFF = 5 * 3600;

export async function adminData(env, url) {
  const win = WINDOWS[url.searchParams.get('win')] ? url.searchParams.get('win') : '7d';
  const since = Date.now() - WINDOWS[win];
  const db = env.sklz_presets;
  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);

  const [totals, byMode, byDay, topKeys, topCfg, downloads, byFx, byPanel,
         visitors, recent, signage, uaRows, misc, capRows,
         series, heat, depth, funnel, viewports, dwell] = await Promise.all([
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
    /* The capability probe. `name` is flip|keep, `val` carries the raw
       hover/touch reading, and the JOIN pulls the UA and viewport of the load
       that produced it: a row that says `keep` on a 1920x1080 screen with no
       referrer is a display this trigger FAILED to rescue, which is the only
       way it can go wrong on hardware I cannot hold. */
    q(`SELECT e.name, e.val, COUNT(*) n, MAX(e.ts) last,
              MAX(h.vw) vw, MAX(h.vh) vh, MAX(h.ua) ua, MAX(h.org) org
         FROM events e LEFT JOIN hits h ON h.sid = e.sid
        WHERE e.kind = 'cap' AND e.ts >= ?
        GROUP BY e.name, e.val ORDER BY n DESC LIMIT 20`, since),

    /* ── the exploration set ──
       Every one of these is bucketed IN SQL rather than in the page. The rows
       are small and the arithmetic is exact; shipping raw hits to the browser
       to group them there would scale with traffic instead of with the shape
       of the answer. */

    /* Traffic over time, split by mode. The bucket width follows the window so
       a 1h view is per-minute and a 30d view is per-day: a fixed bucket makes
       the short windows a single bar and the long ones unreadable. */
    /* CAST(... AS INTEGER) is LOAD-BEARING. SQLite's `/` on two integers is
       integer division, but `ts / ?` with a bound parameter promotes to REAL,
       so `(ts/1800000)*1800000` returned ts EXACTLY and every hit landed in
       its own bucket. Measured: a 24h window that can hold 48 half-hour
       buckets came back with 66 of them, one per row, and the area chart drew
       66 one-tall stripes instead of a shape. The chart looked plausible,
       which is why this needed the numbers to catch. */
    q(`SELECT CAST(ts / ? AS INTEGER) * ? AS b, mode, COUNT(*) n
         FROM hits WHERE ts >= ? GROUP BY b, mode ORDER BY b`,
      bucketMs(win), bucketMs(win), since),

    /* Local-hour x weekday. strftime works in UTC, so the offset is applied to
       the timestamp before formatting; the dashboard is read from CST and an
       "arrivals by hour" chart in UTC would be quietly wrong by five hours. */
    q(`SELECT CAST(strftime('%w', (ts/1000) - ?, 'unixepoch') AS INTEGER) dow,
              CAST(strftime('%H', (ts/1000) - ?, 'unixepoch') AS INTEGER) hr,
              COUNT(*) n
         FROM hits WHERE ts >= ? GROUP BY dow, hr`, TZ_OFF, TZ_OFF, since),

    /* Session depth: how many interactions each session produced. This is the
       bounce question, and it is the one number that says whether anyone
       actually TOUCHES the piece rather than glancing at it. */
    q(`SELECT k, COUNT(*) sessions FROM (
         SELECT h.sid, (SELECT COUNT(*) FROM events e WHERE e.sid = h.sid) k
           FROM hits h WHERE h.ts >= ? GROUP BY h.sid
       ) GROUP BY k ORDER BY k`, since),

    /* The funnel, widest to narrowest. Each stage is a DISTINCT sid, so a
       session that fired forty keys counts once: this measures people, not
       enthusiasm. */
    q(`SELECT 'loaded' stage, COUNT(DISTINCT sid) n FROM hits WHERE ts >= ?
       UNION ALL SELECT 'entered', COUNT(DISTINCT sid) FROM events
         WHERE kind='gate' AND ts >= ?
       UNION ALL SELECT 'touched', COUNT(DISTINCT sid) FROM events
         WHERE kind IN ('key','fx','panel','cfg') AND ts >= ?
       UNION ALL SELECT 'tuned', COUNT(DISTINCT sid) FROM events
         WHERE kind IN ('cfg','preset','share') AND ts >= ?
       UNION ALL SELECT 'kept', COUNT(DISTINCT sid) FROM events
         WHERE kind IN ('dl','share','photo') AND ts >= ?`,
      since, since, since, since, since),

    /* Viewports, snapped to a 160px grid so a thousand near-identical laptops
       land on one mark instead of a smear. `mode` comes along because the
       whole point is spotting a 1920x1080 that is NOT in demo mode. */
    q(`SELECT (vw/160)*160 w, (vh/160)*160 h, COUNT(*) n,
              SUM(CASE WHEN mode IN ('demo','signage','subdomain','kiosk') THEN 1 ELSE 0 END) big
         FROM hits WHERE ts >= ? AND vw > 0 AND vh > 0
        GROUP BY w, h ORDER BY n DESC LIMIT 60`, since),

    /* Dwell: the `end` event carries seconds-on-page in `name`. Bucketed into
       human spans rather than a mean, because one wall display running for
       hours would drag an average somewhere no real visitor ever sat. */
    q(`SELECT CASE
           WHEN CAST(name AS INTEGER) < 10  THEN '0-10s'
           WHEN CAST(name AS INTEGER) < 30  THEN '10-30s'
           WHEN CAST(name AS INTEGER) < 60  THEN '30-60s'
           WHEN CAST(name AS INTEGER) < 300 THEN '1-5m'
           WHEN CAST(name AS INTEGER) < 1800 THEN '5-30m'
           ELSE '30m+' END bucket,
           COUNT(*) n, MAX(CAST(name AS INTEGER)) longest
         FROM events WHERE kind='end' AND ts >= ? GROUP BY bucket`, since),
  ]);

  return {
    win, since,
    totals: totals[0] || { loads: 0, sessions: 0, ips: 0 },
    byMode, byDay, topKeys, topCfg, downloads, byFx, byPanel,
    visitors, recent, signage, uaRows, misc, capRows,
    funnel,
    /* The raw series ships too. It is small, and without it there is no way to
       check a chart's numbers against its picture from outside the browser,
       which is how the x-axis label bug below was found. */
    series, heat, depth, viewports, dwell, bucket: bucketMs(win),
    /* ── charts are rendered HERE, in the Worker, not in the page ──
       charts.js is a Worker module, so its exports exist in this scope and
       NOT in the browser's. Shipping the functions to the page would mean a
       second copy of every chart to keep in lockstep, which is exactly the
       CFG_SCHEMA/LIMITS drift that cost every gallery preset its colours.
       One implementation, rendered once per refresh, sent as SVG strings.
       Found the hard way: the first cut imported them into dashboard.js and
       the page threw `trafficChart is not defined` on load. */
    charts: {
      traffic: trafficChart(series, bucketMs(win), since),
      heat: heatChart(heat),
      funnel: funnelChart(funnel),
      depth: depthChart(depth),
      viewports: viewportChart(viewports),
      dwell: dwellChart(dwell),
      touch: touchChart({ key: topKeys, cfg: topCfg, fx: byFx,
                          panel: byPanel, dl: downloads }),
    },
    /* Legends travel with the data so identity is never colour-alone, and so
       the page never has to know the palette. */
    legends: {
      traffic: [...new Set(series.map(r => r.mode))]
        .map(m => [MODE_COLOR[m] || CHART[3], m]),
      touch: [[CHART[3], 'key'], [CHART[1], 'dial / download'],
              [CHART[2], 'effect'], [CHART[0], 'panel']],
    },
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
