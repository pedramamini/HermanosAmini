/**
 * The hidden admin dashboard. One self-contained HTML document; the token is
 * baked into the fetch URLs so the page never has to ask for it again.
 *
 * No external anything: no fonts, no chart library, no analytics. A dashboard
 * that phones out is a dashboard that leaks the very traffic it is reporting.
 *
 * ART DIRECTION APPLIES HERE TOO (2026-08-27). This is a back office, but it
 * is the back office OF a Dia de los Muertos altar, so it wears the piece's own
 * `muertos` palette, its own calavera, and its own marigolds. Every ornament is
 * inline SVG or a CSS gradient, drawn to the same rule as the art: festive,
 * never gory. The palette is lifted verbatim from PALETTES[0] in index.html;
 * if that ever changes, change it here in one place.
 */
const MUERTOS = {
  magenta: '#ff2fa0',
  teal: '#2fe8d0',
  gold: '#ffb347',
  violet: '#9146FF',   // Pedurple, the house accent
  bone: '#f5eadf',
};

/* One calavera, drawn small enough to be a mark rather than a picture. Same
   vocabulary as the hero: marigold eye rosettes, a heart nose, a stitched
   grin, a third-eye bloom. Never a plain white skull-and-crossbones. */
function calaveraSVG(size) {
  const P = MUERTOS;
  return `<svg class="cal" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <radialGradient id="calbone" cx=".42" cy=".34" r=".78">
      <stop offset="0" stop-color="#fffaf3"/><stop offset=".7" stop-color="${P.bone}"/>
      <stop offset="1" stop-color="#c9b8a6"/>
    </radialGradient>
  </defs>
  <path d="M32 4C17 4 8 14 8 27c0 8 4 13 8 16 2 1.4 2 3 2 5v5c0 4 3 7 7 7h14c4 0 7-3 7-7v-5c0-2 0-3.6 2-5 4-3 8-8 8-16C56 14 47 4 32 4Z" fill="url(#calbone)"/>
  <g>
    <circle cx="21" cy="28" r="7.6" fill="#1a1020"/>
    <circle cx="43" cy="28" r="7.6" fill="#1a1020"/>
    ${[21, 43].map(cx => Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return `<ellipse cx="${(cx + Math.cos(a) * 5.1).toFixed(2)}" cy="${(28 + Math.sin(a) * 5.1).toFixed(2)}" rx="2.5" ry="1.5"
        transform="rotate(${(a * 180 / Math.PI).toFixed(1)} ${(cx + Math.cos(a) * 5.1).toFixed(2)} ${(28 + Math.sin(a) * 5.1).toFixed(2)})"
        fill="${i % 2 ? P.gold : P.magenta}" opacity=".95"/>`;
    }).join('')).join('')}
    <circle cx="21" cy="28" r="2.4" fill="${P.teal}"/>
    <circle cx="43" cy="28" r="2.4" fill="${P.teal}"/>
  </g>
  <path d="M32 34c-2.6 2.4-4 4-4 5.6 0 1.6 1.8 2.6 4 2.6s4-1 4-2.6c0-1.6-1.4-3.2-4-5.6Z" fill="${P.magenta}"/>
  <g stroke="#1a1020" stroke-width="1.5" stroke-linecap="round">
    <path d="M20 49h24"/>
    ${[24, 28, 32, 36, 40].map(x => `<path d="M${x} 45.5v7"/>`).join('')}
  </g>
  <g>
    <circle cx="32" cy="17" r="3.4" fill="${P.violet}"/>
    ${Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return `<ellipse cx="${(32 + Math.cos(a) * 4.6).toFixed(2)}" cy="${(17 + Math.sin(a) * 4.6).toFixed(2)}" rx="2.2" ry="1.3"
        transform="rotate(${(a * 180 / Math.PI).toFixed(1)} ${(32 + Math.cos(a) * 4.6).toFixed(2)} ${(17 + Math.sin(a) * 4.6).toFixed(2)})"
        fill="${P.gold}"/>`;
    }).join('')}
  </g>
</svg>`;
}

/* Papel picado: the cut-paper banner strung over every ofrenda.
   A REAL inline <svg> in the DOM, deliberately not a CSS `url(data:...)`
   background. Measured 2026-08-27: the data-URI version rendered nothing at
   all and reported no error, which is the documented failure mode for
   URL-encoded SVG in this project (an unescaped `#` in a colour is read as a
   fragment and the rest of the document is silently dropped). An inline
   element cannot fail that way and is inspectable in devtools.
   The tiling is an SVG <pattern> filling one full-width rect, so it repeats at
   any viewport with no JS and no media query. */
function papelSVG() {
  const P = MUERTOS;
  /* The cutouts are a DIAMOND and a scalloped hem, not three dots. The first
     pass used a big circle with two small ones above it and one below, which
     at this size reads unmistakably as a FACE: two eyes and a nose, twenty
     times across the top of the page. Real papel picado is geometric, and a
     row of little faces competes with the calavera that is supposed to be the
     only face on the screen. */
  const flag = (x, fill) => `
      <g transform="translate(${x} 0)">
        <path d="M0 0h40v12c0 5-3 7-6.7 9.5C29.6 24 24.4 26 20 29c-4.4-3-9.6-5-13.3-7.5C3 19 0 17 0 12Z" fill="${fill}"/>
        <path d="M20 6.5 25 12 20 17.5 15 12Z" fill="#0b0912"/>
        <path d="M8.5 6.5 11 9.5 8.5 12.5 6 9.5Z" fill="#0b0912"/>
        <path d="M31.5 6.5 34 9.5 31.5 12.5 29 9.5Z" fill="#0b0912"/>
        <circle cx="13.5" cy="17" r="1.5" fill="#0b0912"/>
        <circle cx="26.5" cy="17" r="1.5" fill="#0b0912"/>
        <path d="M0 1.5h40" stroke="#0b0912" stroke-width="1.2" opacity=".5"/>
      </g>`;
  const cols = [P.magenta, P.gold, P.teal, P.violet];
  return `<svg class="papel" width="100%" height="30" aria-hidden="true">
    <defs><pattern id="pp" width="160" height="30" patternUnits="userSpaceOnUse">
      ${cols.map((c, i) => flag(i * 40, c)).join('')}
    </pattern></defs>
    <rect x="0" y="0" width="100%" height="1.4" fill="#3a2f4d"/>
    <rect x="0" y="0" width="100%" height="30" fill="url(#pp)"/>
  </svg>`;
}

export function dashboardHTML(token) {
  const P = MUERTOS;
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="theme-color" content="${P.violet}">
<title>SKLZ &middot; el altar de las señales</title>
<style>
  :root{
    --bg:#0b0912; --panel:#16121f; --panel2:#1b1526; --line:#2f2440;
    --ink:#efe6f5; --dim:#9186a8;
    --magenta:${P.magenta}; --teal:${P.teal}; --gold:${P.gold}; --violet:${P.violet}; --bone:${P.bone};
  }
  *{box-sizing:border-box}
  body{
    margin:0; color:var(--ink); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
    background:
      radial-gradient(1200px 700px at 12% -8%, rgba(145,70,255,.16), transparent 62%),
      radial-gradient(900px 600px at 92% 4%, rgba(255,47,160,.11), transparent 60%),
      radial-gradient(700px 500px at 50% 108%, rgba(47,232,208,.07), transparent 62%),
      var(--bg);
    background-attachment:fixed;
  }
  /* the starfield: two static layers of tiny dots, no animation, no cost */
  body::before{
    content:''; position:fixed; inset:0; pointer-events:none; z-index:0; opacity:.5;
    background-image:
      radial-gradient(1px 1px at 12% 22%, #fff 50%, transparent),
      radial-gradient(1px 1px at 68% 8%,  #fff 50%, transparent),
      radial-gradient(1px 1px at 34% 71%, #ffd9a8 50%, transparent),
      radial-gradient(1px 1px at 88% 54%, #fff 50%, transparent),
      radial-gradient(1px 1px at 52% 38%, #cfe9ff 50%, transparent),
      radial-gradient(1px 1px at 22% 89%, #fff 50%, transparent),
      radial-gradient(1px 1px at 78% 82%, #ffd9a8 50%, transparent),
      radial-gradient(1px 1px at 6% 58%,  #fff 50%, transparent);
  }
  header,main{position:relative; z-index:1}

  header{
    position:sticky; top:0; z-index:5;
    background:linear-gradient(180deg, rgba(11,9,18,.97), rgba(11,9,18,.90));
    backdrop-filter:blur(10px);
    border-bottom:1px solid var(--line);
    padding:12px 20px 0; display:flex; gap:16px; align-items:center; flex-wrap:wrap;
  }
  header .cal{flex:0 0 auto; filter:drop-shadow(0 0 12px rgba(255,47,160,.35))}
  h1{
    margin:0; font-size:15px; letter-spacing:.2em; text-transform:uppercase; font-weight:700;
    background:linear-gradient(90deg,var(--gold),var(--magenta) 45%,var(--violet));
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  h1 small{display:block; font-size:9.5px; letter-spacing:.26em; color:var(--dim);
    -webkit-text-fill-color:var(--dim); font-weight:400; margin-top:2px}
  /* the papel picado hangs off the bottom edge of the header. A real element,
     absolutely positioned, so it can overhang without changing the sticky
     header's own height. */
  .papel{
    position:absolute; left:0; right:0; bottom:-30px; height:30px;
    opacity:.46; pointer-events:none; display:block;
  }
  .win{margin-left:auto}
  .win a{
    color:var(--dim); text-decoration:none; padding:3px 10px; border:1px solid var(--line);
    border-radius:99px; margin-left:5px; font-size:11.5px; letter-spacing:.06em;
  }
  .win a:hover{color:var(--ink); border-color:var(--violet)}
  .win a.on{color:#150c22; background:linear-gradient(180deg,var(--gold),#e8912e); border-color:var(--gold); font-weight:700}
  #stamp{width:100%; padding:6px 0 10px; font-size:11px; color:var(--dim); letter-spacing:.1em}

  main{padding:48px 20px 20px; display:grid; gap:18px;
       grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); max-width:1900px}
  section{
    background:linear-gradient(180deg,var(--panel2),var(--panel));
    border:1px solid var(--line); border-radius:14px; padding:14px 16px; min-width:0;
    box-shadow:0 1px 0 rgba(255,255,255,.03) inset, 0 8px 26px rgba(0,0,0,.34);
  }
  section.wide{grid-column:1/-1}
  /* a marigold at the head of every panel, drawn in CSS so it costs no bytes */
  h2{
    margin:0 0 11px; font-size:11px; letter-spacing:.2em; text-transform:uppercase;
    color:var(--dim); font-weight:600; display:flex; align-items:center; gap:9px;
  }
  h2::before{
    content:''; width:11px; height:11px; border-radius:50%; flex:0 0 auto;
    background:
      radial-gradient(circle at 50% 50%, var(--magenta) 0 26%, transparent 27%),
      conic-gradient(from 0deg, var(--gold) 0 12.5%, #e0872a 0 25%, var(--gold) 0 37.5%,
                     #e0872a 0 50%, var(--gold) 0 62.5%, #e0872a 0 75%, var(--gold) 0 87.5%, #e0872a 0);
  }
  h2 .cal{margin-left:auto; opacity:.5}

  table{width:100%; border-collapse:collapse; font-size:12.5px}
  th{text-align:left; color:var(--dim); font-weight:500; border-bottom:1px solid var(--line);
     padding:5px 8px 5px 0; font-size:10.5px; text-transform:uppercase; letter-spacing:.1em}
  td{padding:5px 8px 5px 0; border-bottom:1px solid rgba(47,36,64,.55); vertical-align:top}
  tr:last-child td{border-bottom:0}
  tbody tr:hover td{background:rgba(145,70,255,.07)}
  .num{text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap}

  .kpi{display:flex; gap:26px; flex-wrap:wrap}
  .kpi div b{display:block; font-size:32px; line-height:1.05; font-weight:700;
    background:linear-gradient(180deg,#fff,var(--gold));
    -webkit-background-clip:text; background-clip:text; color:transparent}
  .kpi div span{font-size:10.5px; color:var(--dim); letter-spacing:.14em; text-transform:uppercase}

  .bar{height:7px; border-radius:4px; min-width:3px; display:block;
       background:linear-gradient(90deg,var(--violet),var(--magenta))}
  .bar.w{background:linear-gradient(90deg,#e0872a,var(--gold))}
  .bar.t{background:linear-gradient(90deg,#1f9c8c,var(--teal))}
  .muted{color:var(--dim)}
  .trunc{max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
         display:inline-block; vertical-align:bottom}
  .tag{display:inline-block; padding:1px 8px; border-radius:99px; font-size:10px;
       letter-spacing:.09em; text-transform:uppercase; font-weight:600}
  .tag.gate{background:rgba(145,70,255,.20); color:#cbb2ff; box-shadow:inset 0 0 0 1px rgba(145,70,255,.4)}
  .tag.demo{background:rgba(47,232,208,.16); color:var(--teal); box-shadow:inset 0 0 0 1px rgba(47,232,208,.38)}
  .tag.signage{background:rgba(255,179,71,.18); color:var(--gold); box-shadow:inset 0 0 0 1px rgba(255,179,71,.42)}
  .tag.kiosk{background:rgba(255,47,160,.16); color:#ff8ac8; box-shadow:inset 0 0 0 1px rgba(255,47,160,.38)}
  .tag.subdomain{background:rgba(47,232,208,.26); color:#eafffb; box-shadow:inset 0 0 0 1px var(--teal)}
  .keycap{display:inline-block; min-width:24px; text-align:center; padding:1px 6px;
    border:1px solid var(--line); border-bottom-width:3px; border-radius:5px;
    background:linear-gradient(180deg,#2a2038,#1d1729); color:var(--bone)}
  input,button{font:inherit; background:#221a2e; color:var(--ink); border:1px solid var(--line);
               border-radius:8px; padding:6px 10px}
  input:focus{outline:none; border-color:var(--violet)}
  button{cursor:pointer; border-color:var(--violet); color:#fff; font-weight:600}
  button:hover{background:var(--violet)}
  .rowform{display:flex; gap:8px; flex-wrap:wrap; margin-top:11px}
  .days{display:flex; align-items:flex-end; gap:3px; height:66px; margin:8px 0 4px}
  .days i{flex:1; border-radius:3px 3px 0 0; min-height:3px;
          background:linear-gradient(180deg,var(--magenta),var(--violet)); opacity:.85}
  .days i:hover{opacity:1; outline:1px solid var(--gold)}
  code{color:var(--gold)}
  /* ── charts ──
     .cx sizes to its panel; the viewBox does the scaling, so a chart never
     needs a resize listener. vector-effect keeps 2px strokes at 2px after the
     non-uniform preserveAspectRatio="none" scale, which would otherwise
     stretch every stroke horizontally and make the marks look sloppy.

     NO BACKTICKS ANYWHERE IN THIS <style> BLOCK: it lives inside a template
     literal, so one backtick in a comment ends the string and the build fails
     somewhere unrelated. Cost a deploy on 2026-08-27. */
  .cx{width:100%; height:auto; display:block; overflow:visible}
  .cx line,.cx rect,.cx circle,.cx path{vector-effect:non-scaling-stroke}
  .cx .hz{cursor:crosshair}
  .cx .hz:hover{filter:brightness(1.28)}
  /* One tooltip element for the whole page, moved and refilled on hover. A
     tooltip per mark would be hundreds of nodes rebuilt every refresh. */
  #tip{
    position:fixed; z-index:50; pointer-events:none; opacity:0; transition:opacity .09s;
    background:rgba(12,10,20,.97); border:1px solid var(--violet); border-radius:8px;
    padding:6px 10px; font-size:11.5px; color:var(--ink); max-width:340px;
    box-shadow:0 8px 26px rgba(0,0,0,.6); white-space:nowrap;
  }
  #tip.on{opacity:1}
  .legend{display:flex; gap:14px; flex-wrap:wrap; font-size:10.5px; color:var(--dim);
          letter-spacing:.06em; margin:8px 0 0}
  .legend i{display:inline-block; width:10px; height:10px; border-radius:3px;
            margin-right:5px; vertical-align:-1px}
  .note{font-size:11px; color:var(--dim); margin:9px 0 0; line-height:1.5}
  .verdict{font-weight:700}
  .verdict.flip{color:var(--teal)}
  .verdict.keep{color:var(--dim)}
</style></head><body>
<header>
  ${calaveraSVG(34)}
  <h1>SKLZ &middot; señales<small>el altar de las señales</small></h1>
  <nav class="win" id="win"></nav>
  <span id="stamp"></span>
  ${papelSVG()}
</header>
<main id="app"><section class="wide"><h2>cargando</h2></section></main>
<div id="tip"></div>
<script>
const TOKEN = ${JSON.stringify(token)};
const P = new URLSearchParams(location.search);
let WIN = P.get('win') || '7d';
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when = ts => ts ? new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
const KEYNAME = {' ':'space','ArrowUp':'up','ArrowDown':'down','ArrowLeft':'left','ArrowRight':'right','Enter':'enter','Escape':'esc'};

function barTable(rows, label, cls) {
  if (!rows.length) return '<p class="muted">nada todavía</p>';
  const max = Math.max(...rows.map(r => r.n));
  return '<table>' + rows.map(r =>
    '<tr><td>' + label(r) + '</td><td class="num">' + r.n + '</td>' +
    '<td style="width:38%"><span class="bar ' + (cls||'') + '" style="width:' + (r.n/max*100).toFixed(1) + '%"></span></td></tr>'
  ).join('') + '</table>';
}

function render(d) {
  const t = d.totals;
  const modeTag = m => '<span class="tag ' + (['gate','demo','signage','kiosk','subdomain'].includes(m)?m:'gate') + '">' + esc(m||'?') + '</span>';
  const cap = d.capRows || [];

  /* A legend is PRESENT for every multi-series chart, always. Identity must
     never be colour-alone: the swatch names the mode in text beside it. */
  const legend = items => '<div class="legend">' + (items || []).map(([c, label]) =>
    '<span><i style="background:' + esc(c) + '"></i>' + esc(label) + '</span>').join('') + '</div>';

  /* The Worker renders every chart and sends the SVG as a string. C is just a
     shorter name for that bag; a missing key renders an honest blank rather
     than throwing, which matters because a new chart ships in two files.

     NO BACKTICKS ANYWHERE BELOW THIS POINT: everything from <!doctype to the
     end is one template literal, so a single backtick in a comment ends the
     string and esbuild fails somewhere unrelated. Cost two deploys today. */
  const C = d.charts || {}, L = d.legends || {};

  document.getElementById('app').innerHTML = [
    /* ── the headline row: numbers, then the shape of the traffic ──
       The KPI tiles answer "how much"; the area chart answers "when, and made
       of what". Neither replaces the other, so they sit together at the top. */
    '<section class="wide"><h2>traffic</h2>' +
      '<div class="kpi" style="margin-bottom:10px">' +
      '<div><b>' + t.loads + '</b><span>page loads</span></div>' +
      '<div><b>' + t.sessions + '</b><span>sessions</span></div>' +
      '<div><b>' + t.ips + '</b><span>unique ips</span></div>' +
      '<div><b>' + (d.funnel?.find(f => f.stage === 'touched')?.n ?? 0) + '</b><span>touched it</span></div>' +
      '</div>' +
      (C.traffic || '') + legend(L.traffic) + '</section>',

    /* ── the funnel: the one panel that says whether any of this works ── */
    '<section><h2>what a visit becomes</h2>' + (C.funnel || '') +
      '<p class="note">Each stage counts DISTINCT sessions, so a session that ' +
      'fired forty keys counts once: this measures people, not enthusiasm. The ' +
      'right-hand percentage is conversion from the stage above.</p></section>',

    '<section><h2>how deep they go</h2>' + (C.depth || '') +
      '<p class="note">Sessions by interaction count, not an average. ' +
      '<b>none</b> is the bounce bar and wears the alert hue on purpose: it is the ' +
      'one bar whose being tall is bad news.</p></section>',

    '<section><h2>when they arrive</h2>' + (C.heat || '') +
      '<p class="note">Local hour by weekday. One hue, light to dark, so ' +
      '"more" is readable without consulting a key.</p></section>',

    '<section><h2>how long they stay</h2>' + (C.dwell || '') +
      '<p class="note">From the <code>end</code> event on page unload. Bucketed ' +
      'rather than averaged: one wall display running for hours would drag a mean ' +
      'somewhere no real visitor ever sat.</p></section>',

    '<section><h2>what they are looking at</h2>' + (C.viewports || '') +
      '<p class="note">Viewports snapped to a 160px grid, area-proportional. ' +
      'A <b>ringed</b> mark reached demo or kiosk mode. A big solid mark out near ' +
      '1080p is a display still stuck at the gate.</p></section>',

    '<section><h2>arrival mode</h2>' +
      barTable(d.byMode, r => modeTag(r.mode)) +
      '<p class="note"><b>subdomain</b> came in on demo.hermanosamini.com, which ' +
      'can only ever be the demo &middot; <b>gate</b> landed on / and must click ' +
      'through &middot; <b>demo</b> typed /demo &middot; <b>signage</b> a heuristic ' +
      'rescued it &middot; <b>kiosk</b> the screensaver</p></section>',

    /* ── one dense panel replaces five near-empty single-column tables ── */
    '<section><h2>what they touch</h2>' + (C.touch || '') +
      legend(L.touch) + '</section>',

    '<section class="wide"><h2>capability probe &middot; ¿tiene manos?</h2>' +
      (cap.length ? '<table>' +
        '<tr><th>verdict</th><th>reading</th><th class="num">seen</th><th>screen</th><th>network</th><th>last</th><th>agent</th></tr>' +
        cap.map(r =>
          '<tr><td class="verdict ' + (r.name === 'flip' ? 'flip' : 'keep') + '">' +
            (r.name === 'flip' ? 'FLIPPED to demo' : 'left at the gate') + '</td>' +
          '<td><code>' + esc(r.val) + '</code></td>' +
          '<td class="num">' + r.n + '</td>' +
          '<td class="muted num">' + (r.vw||'?') + '&times;' + (r.vh||'?') + '</td>' +
          '<td class="trunc">' + esc(r.org || '') + '</td>' +
          '<td class="muted">' + when(r.last) + '</td>' +
          '<td class="trunc muted">' + esc(r.ua || '') + '</td></tr>').join('') +
        '</table>' : '<p class="muted">no probe has run in this window</p>') +
      '<p class="note">Six seconds after a load on <code>/</code>, a client with ' +
      '<code>hover=0</code> AND <code>touch=0</code> has no pointing device at all, ' +
      'so the gate is a permanent black screen to it and we drop it. Cancelled by ' +
      'the first real input. <b>A <span class="verdict keep">left at the gate</span> ' +
      'row on a 1920&times;1080 screen with no referrer is the interesting one</b>: ' +
      'that is a display this trigger failed to rescue.</p></section>',

    '<section class="wide"><h2>force-demo rules</h2><table>' +
      '<tr><th>pattern</th><th>note</th><th class="num">matched</th><th>last</th><th></th></tr>' +
      (d.signage.length ? d.signage.map(r =>
        '<tr><td><code>' + esc(r.pat) + '</code></td><td class="muted">' + esc(r.note) + '</td>' +
        '<td class="num">' + r.hits + '</td><td class="muted">' + when(r.last_at) + '</td>' +
        '<td><button data-rm="' + esc(r.pat) + '">remove</button></td></tr>').join('')
        : '<tr><td colspan="5" class="muted">none in the database</td></tr>') +
      d.builtin.map(b => '<tr><td><code>' + esc(b.pat) + '</code></td><td class="muted">' + esc(b.note) +
        '</td><td class="num">&mdash;</td><td class="muted">&mdash;</td><td class="muted">built in</td></tr>').join('') +
      '</table><div class="rowform">' +
      '<input id="pat" placeholder="ip:1.2.3.4 | net:1.2.3. | asn:13335 | ref:kitcast.tv | ua:BrightSign" style="flex:1;min-width:280px">' +
      '<input id="note" placeholder="what is it" style="flex:0 1 220px">' +
      '<button id="add">add rule</button></div>' +
      '<p class="note">A matching visitor is answered <code>{demo:true}</code> on its first ' +
      'call and boots straight into demo mode. No page deploy needed. <code>ref:</code> tests ' +
      'the referrer AND the framing ancestor.</p></section>',

    '<section class="wide"><h2>visitors by network</h2><table>' +
      '<tr><th>ip</th><th>network</th><th>where</th><th class="num">loads</th><th>modes</th><th>last</th><th>referrer</th></tr>' +
      d.visitors.map(r =>
        '<tr><td><code>' + esc(r.ip) + '</code></td>' +
        '<td class="trunc">' + esc(r.org || '') + (r.asn ? ' <span class="muted">AS' + r.asn + '</span>' : '') + '</td>' +
        '<td class="muted">' + esc([r.city, r.country].filter(Boolean).join(', ')) + '</td>' +
        '<td class="num">' + r.loads + '</td>' +
        '<td>' + String(r.modes||'').split(',').map(modeTag).join(' ') + '</td>' +
        '<td class="muted">' + when(r.last) + '</td>' +
        '<td class="trunc muted">' + esc(r.ref || '') + '</td></tr>').join('') +
      '</table></section>',

    '<section class="wide"><h2>recent loads</h2><table>' +
      '<tr><th>when</th><th>mode</th><th>path</th><th>ip</th><th>network</th><th>referrer / framed by</th><th>screen</th><th>agent</th></tr>' +
      d.recent.map(r =>
        '<tr><td class="muted">' + when(r.ts) + '</td><td>' + modeTag(r.mode) + '</td>' +
        '<td><code>' + esc(r.path) + '</code></td><td><code>' + esc(r.ip) + '</code></td>' +
        '<td class="trunc">' + esc(r.org || '') + '</td>' +
        '<td class="trunc muted">' + esc(r.ancestor || r.ref || '') + (r.framed ? ' <span class="tag signage">iframe</span>' : '') + '</td>' +
        '<td class="muted num">' + (r.vw||'?') + '&times;' + (r.vh||'?') + '</td>' +
        '<td class="trunc muted">' + esc(r.ua) + '</td></tr>').join('') +
      '</table></section>',

    '<section class="wide"><h2>user agents</h2>' +
      barTable(d.uaRows.map(r => ({ n: r.n, ua: r.ua })), r => '<span class="trunc">' + esc(r.ua) + '</span>') + '</section>',
  ].join('');

  document.getElementById('add').onclick = () => post({ pat: pat.value.trim(), note: note.value.trim() });
  document.querySelectorAll('[data-rm]').forEach(b =>
    b.onclick = () => post({ pat: b.dataset.rm, remove: 1 }));
}

/* ── the hover layer ──
   ONE delegated listener on document, not one per mark. The charts are rebuilt
   wholesale every 60s refresh, so per-element listeners would either leak or
   need rebinding on every paint; delegation survives the swap for free and
   costs a single closest() per move.

   Positioned with fixed coordinates flipped near the right and bottom edges,
   because a tooltip that runs off screen is the same as no tooltip. */
(function hover() {
  const tip = document.getElementById('tip');
  document.addEventListener('mousemove', e => {
    const m = e.target.closest && e.target.closest('[data-tip]');
    if (!m) { tip.classList.remove('on'); return; }
    tip.textContent = m.getAttribute('data-tip');
    tip.classList.add('on');
    const r = tip.getBoundingClientRect();
    const x = e.clientX + 14 + r.width > innerWidth ? e.clientX - r.width - 14 : e.clientX + 14;
    const y = e.clientY + 14 + r.height > innerHeight ? e.clientY - r.height - 14 : e.clientY + 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }, { passive: true });
  /* Leaving the window entirely never fires mousemove over a non-mark, so the
     tooltip would stick to the last thing hovered. */
  document.addEventListener('mouseleave', () => tip.classList.remove('on'));
})();

async function post(body) {
  const r = await fetch('/adm/' + TOKEN + '/signage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) alert(j.error); else load();
}

function load() {
  document.getElementById('win').innerHTML = ['1h','24h','7d','30d','all']
    .map(w => '<a href="?win=' + w + '" class="' + (w === WIN ? 'on' : '') + '">' + w + '</a>').join('');
  fetch('/adm/' + TOKEN + '/data?win=' + encodeURIComponent(WIN))
    .then(r => r.json()).then(d => {
      render(d);
      document.getElementById('stamp').textContent = 'actualizado ' + new Date().toLocaleTimeString();
    })
    .catch(e => { document.getElementById('app').innerHTML = '<section class="wide"><h2>falló</h2><p>' + esc(e) + '</p></section>'; });
}
load();
setInterval(load, 60000);
</script></body></html>`;
}
