/**
 * Chart builders for the admin dashboard.
 *
 * Hand-rolled SVG, no charting library, for the same reason the art has no
 * framework: this is one file with no build step, and a dashboard that pulls a
 * script from a CDN leaks the very traffic it reports.
 *
 * Every function here returns an SVG STRING and is pure. The interaction layer
 * is one delegated mousemove per chart in dashboard.js, which reads
 * `data-tip` off whatever mark is under the pointer. That keeps hover working
 * on marks that are rebuilt on every refresh without rebinding a listener per
 * element.
 *
 * ── the palette, and why it is not the art's palette ──
 * The art's `muertos` colours are tuned to glow on black. As a CATEGORICAL
 * chart palette they fail on measurement, not on taste: run through
 * `validate_palette.js`, teal (OKLCH L 0.839) and gold (0.821) sit outside the
 * dark-mode lightness band, so those two series would shout while magenta and
 * violet whisper.
 *
 * CHART is the same four HUE ANGLES re-stepped to L 0.67 and re-ORDERED so
 * magenta and teal are never adjacent. That reorder is the whole fix: at equal
 * lightness those two collapse to ΔE 3.4 under deuteranopia (indistinguishable),
 * and separating them by lightness instead pushes one below 3:1 contrast on
 * this surface. Verified, all five checks PASS on #1b1526:
 *   lightness band · chroma floor · CVD adjacent ΔE 12.0 deutan · normal-vision
 *   floor ΔE 20.9 · contrast all >= 3:1
 * Re-run before changing any value here:
 *   node scripts/validate_palette.js "#f0518f,#c88507,#00ac9a,#a870ff" \
 *        --mode dark --surface "#1b1526"
 *
 * NOTE: that pass is for ADJACENT pairs, which covers bars, stacks and lines.
 * All-pairs (scatter, bubble) is a harder test this set does not clear, so the
 * scatter below uses ONE hue and encodes its second dimension with size.
 */
export const CHART = ['#f0518f', '#c88507', '#00ac9a', '#a870ff'];

/* Sequential ramp: ONE hue (Pedurple 296), monotonic light to dark. Never a
   rainbow for magnitude: a rainbow has no order, so the reader has to consult
   a legend for every cell instead of just seeing "darker is more". */
const SEQ = ['#241243', '#3a0074', '#5716a4', '#713dc5', '#8857e0', '#a071fc', '#b495ff'];

const INK = '#efe6f5', DIM = '#9186a8', GRID = 'rgba(145,70,255,.13)';

const esc = t => String(t == null ? '' : t)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Modes get FIXED colours by name, never by position in whatever the query
   returned. A filter that drops one mode must not repaint the survivors:
   colour follows the entity, not its rank. */
export const MODE_COLOR = {
  subdomain: CHART[2], demo: CHART[2], signage: CHART[1],
  gate: CHART[3], kiosk: CHART[0],
};

const empty = (w, h, msg) =>
  `<svg viewBox="0 0 ${w} ${h}" class="cx" preserveAspectRatio="none"><text x="${w / 2}" y="${h / 2}"
     fill="${DIM}" font-size="11" text-anchor="middle" font-family="ui-monospace,monospace">${esc(msg)}</text></svg>`;

/* ────────────────────────── traffic over time ──────────────────────────
   A STACKED AREA, because the question is "how much, and made of what". The
   x scale is real time, not row index: gaps in traffic have to look like gaps,
   and an index scale silently closes them, which turns a quiet night into a
   busy one. */
export function trafficChart(series, bucket, since, W = 1180, H = 190) {
  if (!series.length) return empty(W, H, 'no traffic in this window');
  const P = { l: 42, r: 14, t: 12, b: 24 };
  const buckets = [...new Set(series.map(r => r.b))].sort((a, b) => a - b);
  const modes = [...new Set(series.map(r => r.mode))]
    .sort((a, b) => (MODE_COLOR[a] ? 0 : 1) - (MODE_COLOR[b] ? 0 : 1));

  const at = {};
  for (const r of series) (at[r.b] ||= {})[r.mode] = r.n;
  const totals = buckets.map(b => modes.reduce((s, m) => s + (at[b]?.[m] || 0), 0));
  const yMax = Math.max(1, ...totals);

  /* Span the whole window, not just the buckets that have rows. A chart that
     starts at the first hit implies traffic began there. */
  const t0 = Math.min(since, buckets[0]);
  const t1 = Math.max(Date.now(), buckets.at(-1) + bucket);
  const x = t => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = v => H - P.b - (v / yMax) * (H - P.t - P.b);

  /* Stack bottom-up so the biggest, steadiest mode is the floor and the
     interesting spiky ones ride on top where their shape is readable. */
  const running = {};
  let bands = '';
  for (let mi = modes.length - 1; mi >= 0; mi--) {
    const m = modes[mi];
    const top = [], bot = [];
    for (const b of buckets) {
      const base = running[b] || 0, v = at[b]?.[m] || 0;
      top.push([x(b + bucket / 2), y(base + v)]);
      bot.push([x(b + bucket / 2), y(base)]);
      running[b] = base + v;
    }
    const c = MODE_COLOR[m] || CHART[3];
    bands = `<path d="M${top.map(p => p.join(',')).join(' L')} L${bot.reverse().map(p => p.join(',')).join(' L')} Z"
       fill="${c}" fill-opacity=".34" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>` + bands;
  }

  /* One invisible full-height column per bucket: the hit target is the whole
     column, not the 2px line, so the crosshair is catchable with a real hand. */
  const cw = Math.max(2, (W - P.l - P.r) / Math.max(1, buckets.length));
  const hits = buckets.map((b, i) => {
    const parts = modes.map(m => at[b]?.[m] ? `${m} ${at[b][m]}` : null).filter(Boolean).join(' · ');
    const when = new Date(b).toLocaleString(undefined,
      { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<rect class="hz" x="${(x(b) - cw / 2).toFixed(1)}" y="${P.t}" width="${cw.toFixed(1)}"
       height="${H - P.t - P.b}" fill="transparent"
       data-tip="${esc(when)} — ${esc(parts || 'nothing')} · ${totals[i]} total"/>`;
  }).join('');

  /* Distinct tick VALUES only. At yMax 1 the 0/0.5/1 fractions all round to
     0 or 1 and the axis printed "1" twice at different heights, which reads as
     a broken scale rather than a small one. */
  const ticks = [...new Set([0, Math.round(yMax / 2), yMax])].map(v =>
    `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}"/>
     <text x="${P.l - 6}" y="${y(v) + 3.5}" fill="${DIM}" font-size="10" text-anchor="end">${v}</text>`
  ).join('');

  /* The axis label carries a DATE whenever the span crosses midnight. Without
     it a 24h window reads "10:40 PM -> 11:01 PM", which looks like twenty
     minutes and is actually a full day: the same clock time with no date is
     the most confidently wrong label a time axis can print. */
  const sameDay = new Date(t0).toDateString() === new Date(t1).toDateString();
  const fmt = t => new Date(t).toLocaleString(undefined,
    bucket >= 86400e3 ? { month: 'short', day: 'numeric' }
    : sameDay ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `<svg viewBox="0 0 ${W} ${H}" class="cx" preserveAspectRatio="none">
    ${ticks}${bands}${hits}
    <text x="${P.l}" y="${H - 8}" fill="${DIM}" font-size="10">${esc(fmt(t0))}</text>
    <text x="${W - P.r}" y="${H - 8}" fill="${DIM}" font-size="10" text-anchor="end">${esc(fmt(t1))}</text>
  </svg>`;
}

/* ─────────────────────────── hour x weekday heatmap ───────────────────────
   Sequential, one hue, light to dark. Cells carry a 2px surface gap so
   adjacent values read as separate cells rather than one blurred field. */
export function heatChart(heat, W = 560, H = 190) {
  if (!heat.length) return empty(W, H, 'no arrivals yet');
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const P = { l: 32, r: 8, t: 16, b: 18 };
  const cw = (W - P.l - P.r) / 24, ch = (H - P.t - P.b) / 7;
  const max = Math.max(...heat.map(r => r.n));
  const grid = {};
  for (const r of heat) grid[r.dow + ':' + r.hr] = r.n;

  let cells = '';
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    const n = grid[d + ':' + h] || 0;
    const step = n === 0 ? null : SEQ[Math.min(SEQ.length - 1, Math.ceil((n / max) * (SEQ.length - 1)))];
    cells += `<rect class="hz" x="${(P.l + h * cw + 1).toFixed(1)}" y="${(P.t + d * ch + 1).toFixed(1)}"
      width="${(cw - 2).toFixed(1)}" height="${(ch - 2).toFixed(1)}" rx="2"
      fill="${step || 'rgba(145,70,255,.07)'}"
      data-tip="${DAYS[d]} ${String(h).padStart(2, '0')}:00 — ${n} load${n === 1 ? '' : 's'}"/>`;
  }
  const hrs = [0, 6, 12, 18].map(h =>
    `<text x="${(P.l + h * cw + cw / 2).toFixed(1)}" y="${H - 5}" fill="${DIM}" font-size="9"
       text-anchor="middle">${String(h).padStart(2, '0')}</text>`).join('');
  const dys = DAYS.map((d, i) =>
    `<text x="${P.l - 6}" y="${(P.t + i * ch + ch / 2 + 3).toFixed(1)}" fill="${DIM}" font-size="9"
       text-anchor="end">${d}</text>`).join('');
  /* The legend is the ramp itself: a reader should never have to hover a cell
     to learn which end is "more". */
  const key = SEQ.map((c, i) =>
    `<rect x="${W - P.r - 84 + i * 12}" y="2" width="10" height="7" rx="1.5" fill="${c}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="cx" preserveAspectRatio="none">
    ${cells}${hrs}${dys}
    <text x="${W - P.r - 90}" y="9" fill="${DIM}" font-size="9" text-anchor="end">less</text>
    ${key}<text x="${W - P.r + 2}" y="9" fill="${DIM}" font-size="9" text-anchor="end"></text>
    <text x="${P.l}" y="9" fill="${DIM}" font-size="9">local hour (CST)</text>
  </svg>`;
}

/* ──────────────────────────────── funnel ────────────────────────────────
   Horizontal bars, widest first, each labelled with its own count AND its
   conversion from the stage above. The drop between two stages is the whole
   point, so it is printed rather than left to be eyeballed off two lengths. */
export function funnelChart(rows, W = 560, H = 190) {
  const stages = rows.filter(r => r.n != null);
  if (!stages.length || !stages[0].n) return empty(W, H, 'no sessions in this window');
  const LABEL = {
    loaded: 'loaded the page', entered: 'went through the gate',
    touched: 'touched something', tuned: 'changed the board', kept: 'took something home',
  };
  const top = stages[0].n;
  const P = { l: 128, r: 96, t: 10, b: 8 };
  const bh = (H - P.t - P.b) / stages.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="cx" preserveAspectRatio="none">` + stages.map((s, i) => {
    const w = (s.n / top) * (W - P.l - P.r);
    const y = P.t + i * bh;
    const prev = i ? stages[i - 1].n : null;
    const pct = prev ? (prev ? Math.round((s.n / prev) * 100) : 0) : 100;
    return `<text x="${P.l - 8}" y="${y + bh / 2 + 3.5}" fill="${DIM}" font-size="10.5"
        text-anchor="end">${esc(LABEL[s.stage] || s.stage)}</text>
      <rect class="hz" x="${P.l}" y="${y + 3}" width="${Math.max(2, w).toFixed(1)}" height="${bh - 8}" rx="4"
        fill="${CHART[i % CHART.length]}" fill-opacity=".85"
        data-tip="${esc(LABEL[s.stage] || s.stage)} — ${s.n} session${s.n === 1 ? '' : 's'}${prev ? ', ' + pct + '% of the stage above' : ''}"/>
      <text x="${P.l + Math.max(2, w) + 8}" y="${y + bh / 2 + 3.5}" fill="${INK}" font-size="11"
        font-weight="600">${s.n}</text>
      ${prev ? `<text x="${W - 6}" y="${y + bh / 2 + 3.5}" fill="${pct < 40 ? CHART[0] : DIM}" font-size="10"
        text-anchor="end">${pct}%</text>` : ''}`;
  }).join('') + '</svg>';
}

/* ───────────────────────────── session depth ─────────────────────────────
   A histogram, not a mean. "Average 3.2 interactions" describes nobody when
   the truth is that most sessions do nothing and a few do forty. */
export function depthChart(rows, W = 560, H = 190) {
  if (!rows.length) return empty(W, H, 'no sessions in this window');
  const BINS = [[0, 0, 'none'], [1, 2, '1-2'], [3, 5, '3-5'], [6, 10, '6-10'],
                [11, 25, '11-25'], [26, 1e9, '26+']];
  const bins = BINS.map(([lo, hi, label]) =>
    ({ label, n: rows.filter(r => r.k >= lo && r.k <= hi).reduce((s, r) => s + r.sessions, 0) }));
  const max = Math.max(1, ...bins.map(b => b.n));
  const total = bins.reduce((s, b) => s + b.n, 0) || 1;
  /* P.t leaves room for BOTH the caption at y=11 and the value label a full
     bar puts at P.t-5. At t=22 the caption and the tallest bar's number
     overlapped, which only showed up in a render. */
  const P = { l: 10, r: 10, t: 34, b: 26 };
  const bw = (W - P.l - P.r) / bins.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="cx" preserveAspectRatio="none">` + bins.map((b, i) => {
    const h = (b.n / max) * (H - P.t - P.b);
    const x = P.l + i * bw, y = H - P.b - h;
    /* The "none" bin is the bounce bin, so it wears the alert hue on purpose:
       it is the one bar whose being tall is bad news. */
    const c = i === 0 ? CHART[0] : CHART[2];
    return `<rect class="hz" x="${(x + 6).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 12).toFixed(1)}"
        height="${Math.max(2, h).toFixed(1)}" rx="4" fill="${c}" fill-opacity=".85"
        data-tip="${b.n} session${b.n === 1 ? '' : 's'} fired ${b.label} interaction${b.label === '1-2' ? '' : 's'} — ${Math.round(b.n / total * 100)}% of all"/>
      ${b.n ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" fill="${INK}" font-size="11"
        font-weight="600" text-anchor="middle">${b.n}</text>` : ''}
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 9}" fill="${DIM}" font-size="10"
        text-anchor="middle">${esc(b.label)}</text>`;
  }).join('') + `<text x="${P.l}" y="11" fill="${DIM}" font-size="9">interactions per session</text></svg>`;
}

/* ─────────────────────────────── viewports ───────────────────────────────
   ONE hue plus size, deliberately. All-pairs CVD is a harder test than
   adjacent-pairs and the four-hue set does not clear it, so a multi-hue
   scatter here would be a palette I cannot defend. Size carries volume; a
   ring carries the one categorical bit that matters (did it reach demo mode). */
export function viewportChart(rows, W = 560, H = 200) {
  if (!rows.length) return empty(W, H, 'no viewports recorded');
  const P = { l: 40, r: 16, t: 14, b: 26 };
  const maxW = Math.max(2000, ...rows.map(r => r.w));
  const maxH = Math.max(1200, ...rows.map(r => r.h));
  const maxN = Math.max(...rows.map(r => r.n));
  const x = v => P.l + (v / maxW) * (W - P.l - P.r);
  const y = v => H - P.b - (v / maxH) * (H - P.t - P.b);
  /* Area-proportional, not radius-proportional: radius makes a 4x count look
     16x, which is the classic bubble lie. Floor of 4px keeps a single hit
     clickable. */
  const r = n => 4 + Math.sqrt(n / maxN) * 13;

  /* Reference lines at the common display sizes, so a mark's position means
     something without measuring it off the axis. Vertical only: width is what
     names a display class, and a second set of horizontals would be grid noise
     for no added meaning. */
  const guides = [[1280, '720p'], [1920, '1080p'], [3840, '4K']]
    .filter(([gw]) => gw <= maxW * 1.05)
    .map(([gw, label]) =>
      `<line x1="${x(gw)}" x2="${x(gw)}" y1="${P.t}" y2="${H - P.b}" stroke="${GRID}" stroke-dasharray="2 4"/>
       <text x="${x(gw) + 4}" y="${P.t + 9}" fill="${DIM}" font-size="9">${label}</text>`).join('');

  const dots = rows.map(rw => {
    const allBig = rw.big === rw.n;
    return `<circle class="hz" cx="${x(rw.w).toFixed(1)}" cy="${y(rw.h).toFixed(1)}" r="${r(rw.n).toFixed(1)}"
      fill="${CHART[3]}" fill-opacity="${allBig ? '.30' : '.62'}"
      stroke="${allBig ? CHART[2] : CHART[3]}" stroke-width="2"
      data-tip="~${rw.w}x${rw.h} — ${rw.n} load${rw.n === 1 ? '' : 's'}${rw.big ? ', ' + rw.big + ' in demo/kiosk' : ', none in demo mode'}"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="cx" preserveAspectRatio="none">
    ${guides}${dots}
    <text x="${P.l}" y="${H - 8}" fill="${DIM}" font-size="9">viewport width →</text>
    <text x="6" y="${P.t + 6}" fill="${DIM}" font-size="9">height ↑</text>
    <text x="${W - 16}" y="${H - 8}" fill="${DIM}" font-size="9" text-anchor="end">ring = reached demo mode</text>
  </svg>`;
}

/* ──────────────────────────────── dwell ─────────────────────────────────
   Ordered buckets, so this is a small ordinal bar rather than a pie. A pie of
   six ordered spans destroys the order for no gain. */
export function dwellChart(rows, W = 560, H = 150) {
  const ORDER = ['0-10s', '10-30s', '30-60s', '1-5m', '5-30m', '30m+'];
  const by = Object.fromEntries(rows.map(r => [r.bucket, r]));
  const bars = ORDER.map(b => ({ label: b, n: by[b]?.n || 0 }));
  const total = bars.reduce((s, b) => s + b.n, 0);
  if (!total) return empty(W, H, 'no completed sessions yet');
  const max = Math.max(...bars.map(b => b.n));
  const longest = Math.max(0, ...rows.map(r => r.longest || 0));
  const P = { l: 10, r: 10, t: 32, b: 26 };   // same caption/label clearance as depthChart
  const bw = (W - P.l - P.r) / bars.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="cx" preserveAspectRatio="none">` + bars.map((b, i) => {
    const h = (b.n / max) * (H - P.t - P.b);
    const x = P.l + i * bw, y = H - P.b - h;
    return `<rect class="hz" x="${(x + 6).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 12).toFixed(1)}"
        height="${Math.max(2, h).toFixed(1)}" rx="4" fill="${SEQ[Math.min(6, 2 + i)]}"
        data-tip="${b.n} session${b.n === 1 ? '' : 's'} stayed ${b.label} — ${Math.round(b.n / total * 100)}%"/>
      ${b.n ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" fill="${INK}" font-size="11"
        font-weight="600" text-anchor="middle">${b.n}</text>` : ''}
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 9}" fill="${DIM}" font-size="10"
        text-anchor="middle">${esc(b.label)}</text>`;
  }).join('') + `<text x="${P.l}" y="12" fill="${DIM}" font-size="9">time on page${
    longest ? ' · longest ' + (longest >= 3600 ? (longest / 3600).toFixed(1) + 'h' : Math.round(longest / 60) + 'm') : ''}</text></svg>`;
}

/* ───────────────────────── what people touch ─────────────────────────────
   Replaces five near-empty single-column tables with one dense panel. Rows are
   sorted by count, coloured by KIND (a fixed map, not by rank), and every row
   is direct-labelled: the number is always visible, so this reads without
   hovering and the hover only adds the share. */
export function touchChart(groups, W = 560, H = 300) {
  const rows = [];
  for (const [kind, list] of Object.entries(groups)) {
    for (const r of list) rows.push({ kind, name: r.name || r.kind, n: r.n });
  }
  if (!rows.length) return empty(W, H, 'nobody has touched anything yet');
  rows.sort((a, b) => b.n - a.n);
  const shown = rows.slice(0, 18);
  const max = Math.max(...shown.map(r => r.n));
  const KIND_C = { key: CHART[3], cfg: CHART[1], fx: CHART[2], panel: CHART[0], dl: CHART[1] };
  const P = { l: 116, r: 46, t: 6, b: 6 };
  const rh = (H - P.t - P.b) / shown.length;
  const total = rows.reduce((s, r) => s + r.n, 0);
  return `<svg viewBox="0 0 ${W} ${H}" class="cx" preserveAspectRatio="none">` + shown.map((r, i) => {
    const w = (r.n / max) * (W - P.l - P.r);
    const y = P.t + i * rh;
    return `<text x="${P.l - 8}" y="${(y + rh / 2 + 3.5).toFixed(1)}" fill="${DIM}" font-size="10.5"
        text-anchor="end">${esc(r.kind)} · ${esc(r.name)}</text>
      <rect class="hz" x="${P.l}" y="${(y + 2).toFixed(1)}" width="${Math.max(2, w).toFixed(1)}"
        height="${Math.max(4, rh - 5).toFixed(1)}" rx="3"
        fill="${KIND_C[r.kind] || CHART[3]}" fill-opacity=".85"
        data-tip="${esc(r.kind)} ${esc(r.name)} — ${r.n}, ${Math.round(r.n / total * 100)}% of all interactions"/>
      <text x="${P.l + Math.max(2, w) + 7}" y="${(y + rh / 2 + 3.5).toFixed(1)}" fill="${INK}"
        font-size="10.5">${r.n}</text>`;
  }).join('') + '</svg>';
}
