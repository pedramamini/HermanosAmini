/**
 * The hidden admin dashboard. One self-contained HTML document; the token is
 * baked into the fetch URLs so the page never has to ask for it again.
 *
 * No external anything: no fonts, no chart library, no analytics. A dashboard
 * that phones out is a dashboard that leaks the very traffic it is reporting.
 */
export function dashboardHTML(token) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>SKLZ · signals</title>
<style>
  :root{--bg:#0d0b12;--panel:#16121f;--line:#2a2137;--ink:#e8e2f2;--dim:#9186a8;--acc:#9146FF;--warm:#f0a03c;--good:#4ec9a0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  header{position:sticky;top:0;z-index:5;background:rgba(13,11,18,.94);backdrop-filter:blur(8px);
    border-bottom:1px solid var(--line);padding:14px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
  h1{margin:0;font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}
  .win a{color:var(--dim);text-decoration:none;padding:3px 9px;border:1px solid var(--line);border-radius:99px;margin-right:5px;font-size:12px}
  .win a.on{color:#fff;background:var(--acc);border-color:var(--acc)}
  main{padding:20px;display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));max-width:1900px}
  section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}
  section.wide{grid-column:1/-1}
  h2{margin:0 0 10px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;color:var(--dim);font-weight:500;border-bottom:1px solid var(--line);padding:5px 8px 5px 0;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
  td{padding:5px 8px 5px 0;border-bottom:1px solid rgba(42,33,55,.5);vertical-align:top}
  tr:last-child td{border-bottom:0}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .kpi{display:flex;gap:26px;flex-wrap:wrap}
  .kpi div b{display:block;font-size:30px;line-height:1.1;color:#fff;font-weight:600}
  .kpi div span{font-size:11px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase}
  .bar{height:6px;background:var(--acc);border-radius:3px;min-width:2px;display:block}
  .bar.w{background:var(--warm)}
  .muted{color:var(--dim)}
  .trunc{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom}
  .tag{display:inline-block;padding:1px 7px;border-radius:99px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase}
  .tag.gate{background:#3a2f4d;color:#c9bde4}
  .tag.demo{background:#1e4438;color:var(--good)}
  .tag.signage{background:#4d3a1a;color:var(--warm)}
  .tag.kiosk{background:#1c3350;color:#7fb2f0}
  .keycap{display:inline-block;min-width:22px;text-align:center;padding:1px 5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;background:#221a2e;color:#fff}
  input,button{font:inherit;background:#221a2e;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:5px 9px}
  button{cursor:pointer;border-color:var(--acc);color:#fff}
  button:hover{background:var(--acc)}
  .rowform{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .days{display:flex;align-items:flex-end;gap:3px;height:64px;margin:6px 0 4px}
  .days i{flex:1;background:var(--acc);border-radius:2px 2px 0 0;min-height:2px;opacity:.85}
  .days i:hover{opacity:1;outline:1px solid #fff}
  code{color:var(--warm)}
</style></head><body>
<header>
  <h1>SKLZ &middot; signals</h1>
  <nav class="win" id="win"></nav>
  <span class="muted" id="stamp"></span>
</header>
<main id="app"><section class="wide"><h2>loading</h2></section></main>
<script>
const TOKEN = ${JSON.stringify(token)};
const P = new URLSearchParams(location.search);
let WIN = P.get('win') || '7d';
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const when = ts => ts ? new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
const KEYNAME = {' ':'space','ArrowUp':'up','ArrowDown':'down','ArrowLeft':'left','ArrowRight':'right','Enter':'enter','Escape':'esc'};

function barTable(rows, label, cls) {
  if (!rows.length) return '<p class="muted">nothing yet</p>';
  const max = Math.max(...rows.map(r => r.n));
  return '<table>' + rows.map(r =>
    '<tr><td>' + label(r) + '</td><td class="num">' + r.n + '</td>' +
    '<td style="width:38%"><span class="bar ' + (cls||'') + '" style="width:' + (r.n/max*100).toFixed(1) + '%"></span></td></tr>'
  ).join('') + '</table>';
}

function render(d) {
  const t = d.totals;
  const dayMax = Math.max(1, ...d.byDay.map(x => x.n));
  const modeTag = m => '<span class="tag ' + (['gate','demo','signage','kiosk'].includes(m)?m:'gate') + '">' + esc(m||'?') + '</span>';

  document.getElementById('app').innerHTML = [
    '<section><h2>reach</h2><div class="kpi">' +
      '<div><b>' + t.loads + '</b><span>page loads</span></div>' +
      '<div><b>' + t.sessions + '</b><span>sessions</span></div>' +
      '<div><b>' + t.ips + '</b><span>unique ips</span></div>' +
    '</div><div class="days">' +
      d.byDay.map(x => '<i title="' + x.d + ': ' + x.n + ' loads, ' + x.ips + ' ips" style="height:' + (x.n/dayMax*100) + '%"></i>').join('') +
    '</div><div class="muted" style="font-size:11px;display:flex;justify-content:space-between">' +
      '<span>' + esc(d.byDay[0]?.d||'') + '</span><span>' + esc(d.byDay.at(-1)?.d||'') + '</span></div></section>',

    '<section><h2>how they arrive</h2>' +
      barTable(d.byMode, r => modeTag(r.mode)) +
      '<p class="muted" style="font-size:11.5px;margin:10px 0 0">' +
      '<b>gate</b> landed on / and must click through &middot; <b>demo</b> typed /demo &middot; ' +
      '<b>signage</b> matched a force-demo rule &middot; <b>kiosk</b> the screensaver</p></section>',

    '<section><h2>keys pressed</h2>' +
      barTable(d.topKeys, r => '<span class="keycap">' + esc(KEYNAME[r.name] || r.name) + '</span>') + '</section>',

    '<section><h2>dials touched</h2>' +
      barTable(d.topCfg, r => esc(r.name), 'w') + '</section>',

    '<section><h2>screensaver downloads</h2>' +
      barTable(d.downloads, r => esc(r.name), 'w') + '</section>',

    '<section><h2>effects fired</h2>' + barTable(d.byFx, r => esc(r.name)) + '</section>',

    '<section><h2>panels opened</h2>' + barTable(d.byPanel, r => esc(r.name)) + '</section>',

    '<section><h2>other signals</h2>' + barTable(d.misc, r => esc(r.kind)) + '</section>',

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
      '<p class="muted" style="font-size:11.5px">A matching visitor is answered <code>{demo:true}</code> on its first ' +
      'call and boots straight into demo mode. No page deploy needed.</p></section>',

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
      document.getElementById('stamp').textContent = 'updated ' + new Date().toLocaleTimeString();
    })
    .catch(e => { document.getElementById('app').innerHTML = '<section class="wide"><h2>failed</h2><p>' + esc(e) + '</p></section>'; });
}
load();
setInterval(load, 60000);
</script></body></html>`;
}
