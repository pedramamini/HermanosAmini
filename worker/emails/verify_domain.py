#!/usr/bin/env python3
"""
Check whether SKLZ mail is actually ready to send, end to end.

Run this after adding the Resend DNS records. It answers the only question
that matters -- "can we mail a real requester yet?" -- by TRYING, rather than
by inspecting settings that may or may not mean what they look like.

    python3 worker/emails/verify_domain.py

Checks, in order of increasing truth:
  1. the sending subdomain has DKIM + SPF, and the ROOT still has its
     improvmx MX (breaking that silently kills pedram@hermanosamini.com,
     which is the address the Resend account itself is registered under)
  2. FROM_ADDR is set and points at the verified subdomain
  3. a real send to a real third-party address is accepted by Resend

Only check 3 is proof. 1 and 2 exist to say WHICH step is missing when 3
fails, because Resend's 403 says "not verified" no matter the cause.
"""

import subprocess
import sys
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from emails import send as mailer  # noqa: E402

ROOT = "hermanosamini.com"
SUB = "send." + ROOT
# Not a real inbox. Resend rejects example.com outright, so a plausible
# third-party domain is what actually exercises the verified-domain path.
PROBE_TO = "deliverability-probe@gmail.com"

OK, BAD, WARN = "  OK  ", " FAIL ", " WARN "


def dig(rtype, name):
    try:
        out = subprocess.run(["dig", "+short", rtype, name],
                             capture_output=True, text=True, timeout=15)
        return [l.strip() for l in out.stdout.splitlines() if l.strip()]
    except (OSError, subprocess.SubprocessError):
        return []


def main():
    fails = 0

    print("DNS")
    dkim = dig("TXT", "resend._domainkey." + SUB) or dig("TXT", "resend._domainkey." + ROOT)
    if dkim:
        print(OK, "DKIM present")
    else:
        print(BAD, f"no DKIM TXT at resend._domainkey.{SUB}")
        fails += 1

    spf = [r for r in dig("TXT", SUB) if "spf1" in r]
    if spf:
        print(OK, f"SPF on {SUB}: {spf[0][:60]}")
    else:
        print(BAD, f"no SPF TXT on {SUB}")
        fails += 1

    submx = dig("MX", SUB)
    print(OK if submx else WARN,
          f"{SUB} MX: {submx[0] if submx else 'none (Resend uses it for bounces)'}")

    # The one that must NOT have changed.
    rootmx = dig("MX", ROOT)
    if any("improvmx" in r for r in rootmx):
        print(OK, "root MX still improvmx: inbound mail intact")
    else:
        print(BAD, f"ROOT MX IS NOT IMPROVMX: {rootmx or 'empty'}")
        print("       Inbound mail to pedram@" + ROOT + " is broken. That is the")
        print("       address the Resend account is registered under. Fix first.")
        fails += 1

    print("\nCONFIG")
    if not mailer.configured():
        print(BAD, "no RESEND_API_KEY in worker/.env")
        return 1
    print(OK, "RESEND_API_KEY present")
    frm = mailer.sender()
    print((OK if SUB in frm or ROOT in frm else WARN), f"FROM_ADDR: {frm}")

    print("\nLIVE SEND (the only real proof)")
    ok, info = mailer.email(PROBE_TO, "SKLZ deliverability probe",
                            "<p>probe</p>", text="probe")
    if ok:
        print(OK, f"Resend accepted a third-party send [{info}]")
        print("\nREADY. Run the drain to release the queue:")
        print("  python3 worker/drain_requests.py --close-sweep --apply")
        return 0

    print(BAD, str(info)[:200])
    if "not verified" in str(info):
        print("       The domain is still unverified. Records may not have")
        print("       propagated, or 'Verify' has not been clicked at")
        print("       resend.com/domains.")
    return 1 if fails == 0 else fails


if __name__ == "__main__":
    sys.exit(main())
