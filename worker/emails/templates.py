#!/usr/bin/env python3
"""
SKLZ transactional email templates.

Two states in the loop:
  received  -> "your request is filed, here is the issue"
  shipped   -> "the artist approved it, it is live, go look"

Email HTML rules that shaped this: tables not flexbox, inline styles only,
no webfonts (Anton will not load in Gmail, so the display face falls back
through Impact), and a dark background that survives clients which ignore
body styles. Every color is pulled from the piece's own palette.
"""

INK        = "#f5eadf"   # bone
DIM        = "#a99cb0"
BG         = "#0a0414"   # deep space
CARD       = "#160724"   # nebula dark
MAGENTA    = "#ff2fa0"
TEAL       = "#2fe8d0"
GOLD       = "#ffb347"
VIOLET     = "#9146FF"
SITE       = "https://hermanosamini.com"
OG         = SITE + "/og.jpg"

_SHELL = """\
<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{preheader}</title></head>
<body style="margin:0;padding:0;background:{BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:{BG};padding:28px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="max-width:560px;background:{CARD};border:1px solid rgba(245,234,223,.14);
                border-radius:16px;overflow:hidden;">

   <tr><td style="padding:0;">
     <a href="{SITE}" style="text-decoration:none;">
       <img src="{OG}" width="560" alt="SKLZ"
            style="display:block;width:100%;max-width:560px;height:auto;border:0;">
     </a>
   </td></tr>

   <tr><td style="padding:26px 30px 8px;">
     <div style="font:700 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.28em;
                 text-transform:uppercase;color:{GOLD};">{eyebrow}</div>
     <h1 style="margin:14px 0 0;font:700 27px/1.15 Impact,'Arial Black',Helvetica,sans-serif;
                letter-spacing:.02em;color:{INK};">{headline}</h1>
   </td></tr>

   <tr><td style="padding:12px 30px 4px;font:400 15px/1.62 Helvetica,Arial,sans-serif;color:{INK};">
     {body}
   </td></tr>

   {quote}

   <tr><td align="center" style="padding:26px 30px 8px;">
     <a href="{cta_url}"
        style="display:inline-block;padding:14px 30px;border-radius:9px;
               background:{VIOLET};color:#ffffff;text-decoration:none;
               font:700 14px/1 Helvetica,Arial,sans-serif;letter-spacing:.06em;">
       {cta}
     </a>
   </td></tr>

   <tr><td style="padding:22px 30px 26px;">
     <div style="height:1px;background:rgba(245,234,223,.12);margin-bottom:18px;"></div>
     <div style="font:400 12px/1.6 Helvetica,Arial,sans-serif;color:{DIM};">
       {footnote}
     </div>
   </td></tr>

   <tr><td align="center" style="padding:0 30px 26px;">
     <div style="font:400 10px/1.5 Helvetica,Arial,sans-serif;letter-spacing:.24em;
                 text-transform:uppercase;color:rgba(245,234,223,.42);">
       una obra psicod&eacute;lica de los hermanos amini
     </div>
     <div style="margin-top:9px;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:rgba(245,234,223,.3);">
       <a href="{SITE}" style="color:{TEAL};text-decoration:none;">hermanosamini.com</a>
       &nbsp;&middot;&nbsp; los que amamos nunca mueren
     </div>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>"""


def _quote_block(text):
    if not text:
        return ""
    return f"""\
   <tr><td style="padding:16px 30px 0;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:rgba(255,47,160,.08);border-left:3px solid {MAGENTA};border-radius:6px;">
      <tr><td style="padding:14px 16px;font:400 14px/1.55 Helvetica,Arial,sans-serif;
                     color:{INK};font-style:italic;">&ldquo;{text}&rdquo;</td></tr>
     </table>
   </td></tr>"""


def _render(**kw):
    kw.setdefault("quote", "")
    return _SHELL.format(BG=BG, CARD=CARD, INK=INK, DIM=DIM, GOLD=GOLD,
                         TEAL=TEAL, VIOLET=VIOLET, SITE=SITE, OG=OG, **kw)


def received(request_text, issue_url=None, issue_number=None):
    """Sent the moment a request is filed as a public issue."""
    ref = f"issue #{issue_number}" if issue_number else "a public issue"
    return _render(
        preheader="Your request is on the board.",
        eyebrow="request received",
        headline="The skulls heard you.",
        body=(f"Your idea is now {ref} on the piece&rsquo;s public board, where "
              f"anyone can see it and argue with it."
              f"<p style='margin:14px 0 0;'>Next it goes to the artist. Pedram "
              f"reviews every request himself &mdash; nothing gets built until he "
              f"says so. If he approves it, an agent implements it, it gets "
              f"tagged and deployed, and <strong style='color:{INK};'>we&rsquo;ll "
              f"email you the moment it&rsquo;s live in the art.</strong></p>"),
        quote=_quote_block(request_text),
        cta="Follow the issue" if issue_url else "Open the art",
        cta_url=issue_url or SITE,
        footnote=("You&rsquo;re getting this because you asked for something at "
                  "hermanosamini.com. This is the only kind of mail we send: one "
                  "when your request lands, one when it ships. No list, no digest, "
                  "nothing else."),
    )


def shipped(request_text, issue_url=None, issue_number=None, version=None):
    """Sent when the issue closes: the thing they asked for is live."""
    tag = f" in {version}" if version else ""
    return _render(
        preheader="What you asked for is live in the art.",
        eyebrow="it shipped",
        headline="Your idea is in the piece.",
        body=(f"What you asked for was approved, built, and deployed{tag}. It is "
              f"running right now at hermanosamini.com, along with everything "
              f"everyone else has added."
              f"<p style='margin:14px 0 0;'>Go look for it. Turn the sound on. "
              f"And if it sparks the next idea, the request box is still open &mdash; "
              f"that&rsquo;s the whole point of this thing.</p>"),
        quote=_quote_block(request_text),
        cta="See it live",
        cta_url=SITE,
        footnote=(f"Curious how it got built? The whole piece is open source at "
                  f"<a href='https://github.com/pedramamini/HermanosAmini' "
                  f"style='color:{TEAL};text-decoration:none;'>github.com/pedramamini/HermanosAmini</a>"
                  f"{f', and this change is {version}' if version else ''}."),
    )


if __name__ == "__main__":
    import sys, pathlib
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    (out / "preview-received.html").write_text(
        received("a comet that sheds marigold petals in its wake",
                 "https://github.com/pedramamini/HermanosAmini/issues/1", 1))
    (out / "preview-shipped.html").write_text(
        shipped("a comet that sheds marigold petals in its wake",
                "https://github.com/pedramamini/HermanosAmini/issues/1", 1, "v1.2.0"))
    print("wrote preview-received.html and preview-shipped.html to", out)
