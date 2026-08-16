#!/usr/bin/env python3
"""
Drain queued viewer requests out of D1 and onto the public issue board.

Why this runs here and not in the Worker: filing an issue needs a GitHub
token with write access, and /api/requests is a public unauthenticated
endpoint. Putting a token behind it would mean any visitor could drive issue
creation with our credentials. So the Worker only queues, and this drains,
using the `gh` CLI already authenticated on this machine. No new secret.

Two states are tracked per row so a crash mid-run never double-files and
never double-mails:

    issue_number IS NULL   -> not yet on the board
    notified_open  = 0     -> requester has not been told it landed
    notified_closed = 0    -> requester has not been told it shipped

Email is a separate concern and is still unwired (no Resend credential). Rows
that need mail are reported, never silently marked sent. See --help.

Usage:
    python3 drain_requests.py              # dry run, shows what it would do
    python3 drain_requests.py --apply      # file issues, mark rows
    python3 drain_requests.py --close-sweep --apply   # also reconcile closures
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = "sklz-presets"
REPO = "pedramamini/HermanosAmini"
LABELS = "viewer-request,needs-artist-approval"
MAESTRO_CLI = "/Applications/Maestro.app/Contents/Resources/maestro-cli.js"
LOG = HERE / "state" / "drain.log"

# A Cue/cron shell does not inherit an interactive PATH, so `gh` and `npx`
# would not resolve and every scheduled run would fail identically. Prepend
# the Homebrew prefix rather than hardcoding binary paths, so this still
# works if either moves.
ENV = dict(os.environ)
ENV["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + ENV.get("PATH", "/usr/bin:/bin")


def require(*bins):
    missing = [b for b in bins if not shutil.which(b, path=ENV["PATH"])]
    if missing:
        raise SystemExit(f"missing required binaries on PATH: {', '.join(missing)}")


def sh(cmd, **kw):
    """Run a command, returning stdout. Raises with stderr on failure."""
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE, env=ENV, **kw)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(p.stderr or p.stdout).strip()[:400]}")
    return p.stdout


def d1(sql, retries=3):
    """
    Query D1. The Cloudflare API intermittently 403s on an OAuth token that is
    otherwise valid, so a bare retry is not papering over a real auth problem.
    """
    last = None
    for attempt in range(retries):
        try:
            out = sh(["npx", "wrangler", "d1", "execute", DB,
                      "--remote", "--json", "--command", sql])
            return json.loads(out)[0]["results"]
        except RuntimeError as e:
            last = e
            if "7403" in str(e) and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last


def q(s):
    """Single-quote escape for inline SQL. Values here are already validated
    by the Worker (length capped, PG filtered), this guards the quote only."""
    return str(s).replace("'", "''")


def issue_body(row):
    cfg = ""
    if row.get("config"):
        try:
            pretty = json.dumps(json.loads(row["config"]), indent=2, sort_keys=True)
            cfg = ("\n\n<details><summary>Viewer's settings when they asked</summary>\n\n"
                   f"```json\n{pretty}\n```\n\n</details>")
        except (ValueError, TypeError):
            pass
    when = time.strftime("%Y-%m-%d %H:%M %Z", time.localtime(row["created_at"] / 1000))
    who = "left an email" if row.get("email") else "asked anonymously"
    return (
        f"> {row['body']}\n\n"
        f"Asked at hermanosamini.com on {when}. The viewer {who}.\n\n"
        f"**This is not approved yet.** Per "
        f"[ART_DIRECTION.md](https://github.com/{REPO}/blob/main/ART_DIRECTION.md), "
        f"nothing gets built until one of the Hermanos Amini applies the "
        f"`approved` label. Anyone may discuss it in the meantime."
        f"{cfg}\n\n"
        f"<!-- sklz-request-id: {row['id']} -->"
    )


def title_for(body):
    t = " ".join(body.split())
    return (t[:68] + "...") if len(t) > 71 else t


def file_issues(apply):
    rows = d1("SELECT id, body, email, config, created_at FROM requests "
              "WHERE issue_number IS NULL ORDER BY created_at ASC;")
    if not rows:
        print("no unfiled requests")
        return []
    filed = []
    for r in rows:
        title = title_for(r["body"])
        if not apply:
            print(f"WOULD FILE  {r['id']}  {title}")
            continue
        url = sh(["gh", "issue", "create", "--repo", REPO,
                  "--title", title, "--body", issue_body(r),
                  "--label", LABELS]).strip().splitlines()[-1]
        num = int(url.rstrip("/").rsplit("/", 1)[-1])
        d1(f"UPDATE requests SET issue_number = {num}, filed_at = {int(time.time()*1000)} "
           f"WHERE id = '{q(r['id'])}';")
        print(f"FILED  #{num}  {url}")
        filed.append({"id": r["id"], "issue": num, "email": r.get("email"),
                      "body": r["body"], "url": url})
    return filed


def close_sweep(apply):
    """Find filed requests whose issue is now closed and needs a ship mail."""
    rows = d1("SELECT id, body, email, issue_number FROM requests "
              "WHERE issue_number IS NOT NULL AND notified_closed = 0 "
              "AND email IS NOT NULL;")
    due = []
    for r in rows:
        state = json.loads(sh(["gh", "issue", "view", str(r["issue_number"]),
                               "--repo", REPO, "--json", "state"]))["state"]
        if state == "CLOSED":
            due.append(r)
    for r in due:
        print(f"SHIP MAIL DUE  #{r['issue_number']}  -> {r['email']}")
    if due and apply:
        print(f"\n{len(due)} closed issue(s) owe a 'it shipped' email. Not sent: "
              f"no Resend credential is configured. Rows left unmarked so they "
              f"send once it is.")
    return due


def log_run(summary):
    """
    One line per run. Without this the only proof the schedule fires is an
    issue appearing, which for a quiet queue means silence is indistinguishable
    from a broken pipeline.
    """
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {summary}\n")
    except OSError:
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="actually file issues and update D1 (default: dry run)")
    ap.add_argument("--close-sweep", action="store_true",
                    help="also check filed issues for closure / ship mail")
    a = ap.parse_args()

    if not a.apply:
        print("DRY RUN. Re-run with --apply to act.\n")
    else:
        require("gh", "npx")

    filed = file_issues(a.apply)
    if filed:
        # The artists are the approval gate, so a filed request is only useful
        # once they know it is waiting. Never let a notify failure lose the drain.
        n = len(filed)
        try:
            sh(["node", MAESTRO_CLI, "notify", "toast",
                f"{n} new SKLZ request{'s' if n > 1 else ''}",
                "; ".join(f"#{f['issue']} {title_for(f['body'])}" for f in filed)])
        except (RuntimeError, OSError) as e:
            print(f"(toast failed, issues still filed: {e})")
    if a.close_sweep:
        print()
        close_sweep(a.apply)

    pending_mail = [f for f in filed if f["email"]]
    if pending_mail:
        print(f"\n{len(pending_mail)} filed request(s) owe a 'we got it' email:")
        for f in pending_mail:
            print(f"  {f['email']}  ->  #{f['issue']}")
        print("Not sent: no Resend credential. notified_open stays 0 so these "
              "send once it exists, rather than being lost.")

    if a.apply:
        log_run(f"filed={len(filed)} mail_pending={len(pending_mail)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
