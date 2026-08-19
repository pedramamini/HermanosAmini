#!/usr/bin/env python3
"""
Resend client for the SKLZ request pipeline.

WHY THE CREDENTIAL LIVES HERE AND NOT IN THE WORKER
---------------------------------------------------
`/api/requests` is a public, unauthenticated endpoint. A Resend key inside the
Worker would mean any visitor could drive mail with our credentials: a spam
relay running on our sending domain, which is the fastest way to lose the
domain's reputation and take the real mail down with it. Exactly the reasoning
that keeps the GitHub token out of the Worker (see drain_requests.py).

The drain has no public surface, already knows which rows owe mail, and already
runs on a schedule. So it holds the key, in `worker/.env`, mode 0600, gitignored.
No `op` lookup at runtime: an unattended Cue job must never depend on an
interactive 1Password session.

USAGE
-----
    from emails import send
    ok, info = send.email(to, subject, html)      # (bool, id-or-error)
    send.configured()                             # is a key present at all?

Self-test (sends one mail to the account owner):
    python3 worker/emails/send.py --test
"""

import json
import pathlib
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ENV_FILE = HERE.parent / ".env"
API = "https://api.resend.com/emails"

# Resend's shared sender. It can ONLY deliver to the account owner, so it is
# useless for real requesters, but it means the pipeline is testable before a
# domain is verified rather than being untestable until the last step.
FALLBACK_FROM = "onboarding@resend.dev"

# Once hermanosamini.com is verified, set FROM_ADDR in worker/.env to
# something like "SKLZ <hola@send.hermanosamini.com>" and this picks it up.
DEFAULT_FROM = "SKLZ <hola@send.hermanosamini.com>"


def _env():
    """Parse the 0600 secrets file. Absent file is not an error: the caller
    decides what to do about a missing credential, and the drain's whole design
    is that it degrades to 'reported but not sent' rather than crashing."""
    out = {}
    try:
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    except OSError:
        pass
    return out


def configured():
    return bool(_env().get("RESEND_API_KEY"))


def sender():
    """The From address. Falls back to Resend's shared sender when no verified
    domain is configured, which keeps the failure loud and local (it will only
    reach the account owner) instead of silently not sending."""
    return _env().get("FROM_ADDR") or DEFAULT_FROM


def email(to, subject, html, text=None, frm=None):
    """Send one message. Returns (ok, id_or_error).

    Never raises. A mail failure must not take down a drain run that has
    already filed issues: the caller leaves notified_* at 0 and the row is
    retried on the next pass, which is why every send is reported honestly
    rather than assumed."""
    key = _env().get("RESEND_API_KEY")
    if not key:
        return False, "no RESEND_API_KEY in worker/.env"

    payload = {"from": frm or sender(), "to": [to], "subject": subject, "html": html}
    if text:
        payload["text"] = text
    req = urllib.request.Request(
        API,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            # Resend sits behind Cloudflare and 403s urllib's default agent
            # with "error code: 1010". Cost twenty minutes to find, because a
            # bot-block looks exactly like a bad credential from here.
            "User-Agent": "curl/8.7.1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as f:
            return True, json.load(f).get("id", "sent")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        try:
            body = json.loads(body).get("message", body)
        except ValueError:
            pass
        return False, f"HTTP {e.code}: {body}"
    except (urllib.error.URLError, OSError, ValueError) as e:
        return False, str(e)[:200]


if __name__ == "__main__":
    import sys

    if "--test" not in sys.argv:
        print(__doc__)
        print("configured:", configured())
        print("from:      ", sender())
        raise SystemExit(0)

    # The owner address is the only guaranteed-deliverable target before a
    # domain is verified, and Resend tells us what it is in the 403 body.
    ok, info = email(
        "pedram@hermanosamini.com",
        "SKLZ: mail self-test",
        "<p>The SKLZ drain can send mail.</p>",
        text="The SKLZ drain can send mail.",
        frm=FALLBACK_FROM,
    )
    print(("OK  " if ok else "FAIL ") + str(info))
    raise SystemExit(0 if ok else 1)
