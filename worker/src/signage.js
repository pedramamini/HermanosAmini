/**
 * demo.hermanosamini.com: the signage domain.
 *
 * Kitcast's Apple TV, and every player like it, accepts a BARE DOMAIN and
 * nothing else. It cannot be talked into a path, and on tvOS it renders the
 * page somewhere we never see. Every other approach here (a referrer regex, D1
 * rules, the no-pointer capability probe) is a heuristic that has to recognise
 * the client. A hostname whose ROOT is the demo needs no heuristic at all: the
 * only thing it can possibly serve is the art already in demo mode.
 *
 * This is a PROXY, not a redirect, and that is load-bearing. index.html loads
 * version.json, both audio files, gritos/*.mp3 and qr.png by RELATIVE name, and
 * `music` is piped into masterBus with createMediaElementSource. A cross-origin
 * media element without CORS taints that graph and the track goes SILENT
 * (invariant 7). Proxying keeps every asset same-origin, so the page cannot
 * tell it is anywhere unusual.
 */
const ORIGIN = 'https://hermanosamini.com';

/* Injected into <head>, so it lands before the page's own <script> in <body>.
   demoPath() reads the global.

   THE <style> IS THE HALF THAT MATTERS, and it is CSS rather than JS on
   purpose. `#gate` is markup: it paints the instant the parser reaches it,
   which on this page is 266 KB of script BEFORE `demoPath()` can run and clear
   it, and `enterGate()` then only adds `.gone`, which carries an
   `opacity 1.8s` transition. So a display showed the framed "enter the other
   side" blurb for the whole script-parse plus a near-two-second fade, every
   single boot. Measured 2026-08-28; Pedram: "it still shows the framed art
   piece, I don't want that, drop straight into demo."

   A rule in <head> cannot lose that race, because there is no race: the gate
   is never laid out at all. `display:none` rather than `.gone`'s opacity fade
   for the same reason, and it matches how kiosk mode has always done it
   (`body.kiosk #gate { display: none !important }`).

   The class goes on <html>, not <body>: <body> does not exist yet at the
   moment this <style> is parsed, and a rule keyed to a class the Worker also
   writes here is self-contained. index.html carries the matching selector so
   the behaviour is visible to anyone reading the page on its own. */
const FLAG =
  '<script>window.SKLZ_DEMO_HOST=1;document.documentElement.className+=" demohost";</script>' +
  '<style>html.demohost #gate{display:none!important}</style>';

export async function serveSignage(request, url) {
  /* The Worker's own API lives on this hostname too (the page posts to
     /api/hit from wherever it is loaded), so anything under /api or /adm must
     fall through to the normal handler rather than be proxied to Apache,
     which does not have those routes and would 404. */
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/adm')) return null;

  const target = ORIGIN + url.pathname + url.search;

  /* THE DOCUMENT AND version.json ARE NEVER CACHED BY THIS PROXY, and that is
     the single most important line here. A wall display self-updates by
     polling version.json and reloading; if the edge hands this Worker a stale
     copy of either, the display sits on an old build FOREVER with nothing on
     screen to say so. That exact failure is why `.htaccess` still redirects
     /demo/ to /demo. Assets keep their normal caching: they are content-hashed
     by name or they never change. */
  const doc = url.pathname === '/' || !/\.[a-z0-9]{2,5}$/i.test(url.pathname)
              || /version\.json$/i.test(url.pathname);

  const upstream = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
    cf: doc ? { cacheTtl: 0, cacheEverything: false } : undefined,
  });

  /* A 301 from .htaccess (the canonical-host rule, /demo/ -> /demo) would send
     the display to hermanosamini.com and undo the whole point. Rewrite any
     redirect back onto this hostname. */
  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get('Location') || '';
    const h = new Headers(upstream.headers);
    h.set('Location', loc.replace(/^https?:\/\/(www\.)?hermanosamini\.com/i, 'https://demo.hermanosamini.com'));
    return new Response(null, { status: upstream.status, headers: h });
  }

  const ct = upstream.headers.get('Content-Type') || '';
  if (!/text\/html/i.test(ct)) return upstream;      // assets stream through untouched

  const h = new Headers(upstream.headers);
  h.delete('Content-Length');                        // the body grows by FLAG
  h.set('X-SKLZ-Signage', 'demo-host');
  return new HTMLRewriter()
    .on('head', { element(e) { e.prepend(FLAG, { html: true }); } })
    .transform(new Response(upstream.body, { status: upstream.status, headers: h }));
}
