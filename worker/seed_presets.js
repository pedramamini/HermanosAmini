#!/usr/bin/env node
/* Curated gallery presets, generated from the live CFG_SCHEMA.
 *
 * Why this exists: the first curated set was hand-written when the Worker's
 * LIMITS whitelist had no color keys, so sanitize() silently dropped palette,
 * bgMode, and every hue/sat value. Eight "different" presets all rendered in
 * the default palette on the default smoke background. Hand-writing them
 * again invites the same class of bug, so this generates them instead:
 * defaults + overrides, every value range-checked against the real schema,
 * every preset FULL (all keys) so loading one is deterministic rather than a
 * blend with whatever the visitor had before.
 *
 *   node seed_presets.js            # print SQL (review it)
 *   node seed_presets.js --apply    # pipe straight into wrangler d1
 */
const fs = require('fs');
const path = require('path');

/* eval() here is deliberate and safe: the only input is this repo's own
 * index.html, read from disk at build time, never a request or user string.
 * Reading the schema from the real source is the entire point. A copied
 * table is exactly how the color keys went missing the first time, and
 * JSON.parse cannot read a JS object literal with unquoted keys and
 * comments. This script never runs in the Worker or in the page. */
const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = {};
eval(page.match(/const CFG_SCHEMA = \{[\s\S]*?\n\};/)[0].replace('const CFG_SCHEMA', 'ctx.S'));
eval(page.match(/const CFG_TOGGLES = \{[\s\S]*?\n\};/)[0].replace('const CFG_TOGGLES', 'ctx.T'));
const SCHEMA = Object.assign({}, ctx.S, ctx.T);

/* Each preset is only its DIFFERENCES from the default look. Everything else
 * fills in from the schema, so a new dial cannot silently leave these stale:
 * it lands at its default until someone deliberately varies it here. */
const PRESETS = [
  {
    name: 'Dia de los Muertos',
    // The reference look, dialed up. Warm marigold smoke, full tunnel.
    o: { palette: 0, bgMode: 0, nebulaHue: 20, nebulaSat: 1.2, bgBright: 1.1,
         petalCount: 16, socketGlow: 1.4, auraSize: 1.3, vignette: 0.45,
         tunnelCount: 56, tunnelSpeed: 0.032, rayCount: 18, starDensity: 1.3,
         eventMinGap: 5, eventMaxGap: 14 },
  },
  {
    name: 'Deep Space Cathedral',
    // Vast and still: giant skull, near-empty tunnel, cold bone, rare events.
    o: { palette: 2, bgMode: 4, skullSize: 1.7, skullOnTop: 1,
         skullBreathe: 1, breatheRate: 3, tunnelCount: 14, tunnelSpeed: 0.008,
         starDensity: 2.5, dustCount: 0.3, boneHue: -170, boneSat: 0.5,
         socketGlow: 2.0, auraSize: 2.2, vignette: 0.9, tempoMax: 1.2,
         eventMinGap: 20, eventMaxGap: 60, wanderPace: 0.5, ringSpeed: 0.05 },
  },
  {
    name: 'Ember Ritual',
    // Intimate: candlelight, small breathing skull, heavy smoke, deep frame.
    o: { palette: 1, bgMode: 3, skullSize: 0.85, skullBreathe: 1,
         breatheRate: 5, auraSize: 1.8, socketGlow: 1.8, vignette: 1.0,
         dustCount: 1.8, nebulaHue: -15, bgBright: 0.75, tunnelCount: 30,
         tunnelSpeed: 0.015, smokeScale: 1.8, smokeDrift: 0.5,
         starDensity: 0.6, rayLength: 0.7 },
  },
  {
    name: 'Acid Trip',
    // Everything at once, as fast as the dials go.
    o: { palette: 3, bgMode: 2, satMul: 2.0, hueShift: 120, nebulaSat: 2.0,
         nebulaHue: 90, skullSpinMax: 2.0, ringSpeed: 0.9, spiralSpeed: 0.85,
         raySpeed: 0.35, rayCount: 28, tunnelSpeed: 0.10, tunnelBreath: 0.22,
         skullBreathe: 1, breatheRate: 30, eventMinGap: 1, eventMaxGap: 4,
         pupilBeat: 0.6, tempoMax: 3, beatSensitivity: 1.05, dayCycleMin: 2,
         vignette: 0.2, flickForce: 2.2 },
  },
  {
    name: 'Noir',
    // All color drained. Grayscale bone, hard vignette, sparse everything.
    o: { palette: 4, bgMode: 4, satMul: 0, nebulaSat: 0, boneSat: 0,
         vignette: 1.2, bgBright: 0.5, starDensity: 0.5, dustCount: 0.4,
         socketGlow: 0.4, auraSize: 0.3, skullSize: 1.25, tunnelCount: 20,
         tunnelSpeed: 0.012, rayCount: 6, rayLength: 0.4, petalCount: 4,
         eventMinGap: 15, eventMaxGap: 40 },
  },
  {
    name: 'Bubblegum Nebula',
    // Loud and bright: candy on galaxy, max petals, barely any vignette.
    o: { palette: 5, bgMode: 1, satMul: 1.8, nebulaSat: 1.7, bgBright: 1.5,
         nebulaHue: -130, hueShift: 25, petalCount: 20, socketGlow: 1.6,
         auraSize: 1.6, skullSize: 1.1, starDensity: 2.0, dustCount: 1.6,
         tunnelCount: 44, vignette: 0.15, ringSpeed: 0.3, rayCount: 22 },
  },
  {
    name: 'Jade Temple',
    // Slow and green. Huge lazy smoke marble, eyes that barely wander.
    o: { palette: 6, bgMode: 0, nebulaHue: -180, nebulaSat: 1.2,
         smokeScale: 2.4, smokeDrift: 0.35, bgBright: 0.85, skullSize: 1.15,
         skullBreathe: 1, breatheRate: 4, tunnelCount: 24, tunnelSpeed: 0.010,
         eventMinGap: 18, eventMaxGap: 45, vignette: 0.6, boneHue: 80,
         boneSat: 0.7, ringSpeed: 0.05, wanderPace: 0.4, spiralSpeed: 0.03 },
  },
  {
    name: 'Blood Moon',
    // Big, red, and slow. The skull owns the foreground.
    o: { palette: 7, bgMode: 3, hueShift: -20, nebulaHue: -40, nebulaSat: 1.6,
         bgBright: 0.7, vignette: 1.1, skullSize: 1.5, skullOnTop: 1,
         socketGlow: 2.3, auraSize: 1.9, tunnelCount: 18, tunnelSpeed: 0.010,
         skullBreathe: 1, breatheRate: 3, tempoRef: 70, tempoMax: 1.3,
         starDensity: 0.8 },
  },
  {
    name: 'Cosmic Swarm',
    // Tiny skull, maximum tunnel, constant events. Deliberately overwhelming.
    o: { palette: 0, bgMode: 1, hueShift: 150, nebulaHue: -100, skullSize: 0.6,
         tunnelCount: 56, tunnelSpeed: 0.115, tunnelBassBoost: 2.5,
         tunnelBreath: 0.25, starDensity: 2.4, dustCount: 2.0,
         eventMinGap: 1, eventMaxGap: 3, flickForce: 2.5, skullSpinMax: 1.5,
         vignette: 0.3, ringBeatKick: 4 },
  },
  {
    name: 'Zen Void',
    // Nothing happens on purpose: no events, no text, one breathing skull.
    o: { palette: 6, bgMode: 4, hueShift: -60, autoEvents: 0, textOn: 0,
         beatSync: 0, starDensity: 0.2, dustCount: 0.2, skullSize: 1.6,
         skullBreathe: 1, breatheRate: 2, skullOnTop: 1, tunnelCount: 12,
         tunnelSpeed: 0.005, ringSpeed: 0.02, spiralSpeed: 0.02,
         raySpeed: 0.01, wanderPace: 0.3, gazeRange: 0.5, socketGlow: 0.8,
         auraSize: 1.0, vignette: 0.75, nosePulse: 0, teethClack: 0,
         pupilBeat: 0.05, smokeStir: 0.1, tempoMax: 1.0 },
  },
];

/* A preset must never hijack the visitor's session: no starting speech
 * recognition, no muting their music, no turning on the fps monitor. These
 * win over anything an entry above sets. */
const PINNED = { voiceOn: 0, musicOn: 1, hudOn: 0, perfMode: 0 };

let bad = 0;
const rows = PRESETS.map(p => {
  const cfg = {};
  for (const k in SCHEMA) cfg[k] = SCHEMA[k][0];          // full, deterministic
  for (const k in p.o) {
    if (!(k in SCHEMA)) { console.error(`!! ${p.name}: unknown key ${k}`); bad++; continue; }
    const [, min, max] = SCHEMA[k];
    const v = p.o[k];
    if (v < min || v > max) { console.error(`!! ${p.name}: ${k}=${v} outside [${min}..${max}]`); bad++; continue; }
    cfg[k] = v;
  }
  Object.assign(cfg, PINNED);
  return { name: p.name, cfg };
});
if (bad) { console.error(`\n${bad} problem(s); nothing emitted.`); process.exit(1); }

/* Variance report: the point of the exercise, so it gets measured, not
 * assumed. Two presets that differ in under ~20 keys are too close. */
const keys = Object.keys(SCHEMA);
let closest = { n: 1e9 };
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const n = keys.filter(k => rows[i].cfg[k] !== rows[j].cfg[k]).length;
    if (n < closest.n) closest = { n, a: rows[i].name, b: rows[j].name };
  }
}
const spread = k => new Set(rows.map(r => r.cfg[k])).size;
console.error(`presets: ${rows.length}, keys each: ${keys.length}`);
console.error(`backgrounds used: ${spread('bgMode')}/5, palettes used: ${spread('palette')}/8`);
console.error(`closest pair: ${closest.a} vs ${closest.b} differ in ${closest.n} keys`);

const esc = s => String(s).replace(/'/g, "''");
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
const id = n => 'sklz' + norm(n).replace(/[^a-z0-9]/g, '').slice(0, 10);

const sql = [
  "-- curated gallery seed. Leaves visitor-authored presets alone.",
  `DELETE FROM presets WHERE name_key IN (${rows.map(r => `'${esc(norm(r.name))}'`).join(', ')});`,
  ...rows.map((r, i) =>
    `INSERT INTO presets (id, name, name_key, config, created_at, author_hash, loads, views) VALUES ` +
    `('${id(r.name)}', '${esc(r.name)}', '${esc(norm(r.name))}', ` +
    `'${esc(JSON.stringify(r.cfg))}', ${1786830000000 + i * 1000}, 'curated', 0, 0);`),
].join('\n');

console.log(sql);
