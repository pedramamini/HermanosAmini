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

Email goes out through Resend (emails/send.py), which reads the key from
worker/.env. A row is marked notified_* ONLY after the API confirms the send,
so a failure is retried on the next run rather than being lost. Without a
credential the rows are reported and left unmarked, exactly as before.

Usage:
    python3 drain_requests.py              # dry run, shows what it would do
    python3 drain_requests.py --apply      # file issues, mark rows
    python3 drain_requests.py --close-sweep --apply   # also reconcile closures
"""

import argparse
import json
import re
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from emails import send as mailer, templates          # noqa: E402

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



def quote_viewer(text):
    """Viewer text goes on the public board UNDER OUR ACCOUNT, so it must read
    as quoted speech, never as our Markdown. Three things are neutralised:
    `@name` (would ping a stranger from pedramamini), `#123` / URLs that
    GitHub autolinks, and Markdown syntax (images, headings, HTML) that would
    render as if we wrote it. Everything stays legible; nothing executes."""
    ZW = "\u200b"                                  # zero-width space
    t = str(text or "")
    t = t.replace("@", "@" + ZW)                   # defuses the mention
    t = re.sub(r"(?<![\w/])#(\d+)", lambda m: "#" + ZW + m.group(1), t)   # issue autolink
    t = re.sub(r"https?://", lambda m: m.group(0)[:-2] + ZW + "//", t)  # no live links
    t = re.sub(r"[<>*_`~\[\]!|]", lambda m: "\\" + m.group(0), t)  # Markdown/HTML inert
    return t


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

    # The follow-up exchange. `detail` is a JSON array of {q,a} turns from
    # 2026-08-19 onward and a bare string before that, so both render. Shown as
    # a dialogue rather than glued onto the request, because who said what
    # matters: an agent reading this later should not have to guess which half
    # we prompted for.
    followup = ""
    turns = []
    chat = None
    raw = row.get("detail")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                turns = [t for t in parsed if isinstance(t, dict) and t.get("q")]
            elif isinstance(parsed, dict) and parsed.get("spec"):
                # the agentic chat's interview (2026-08-21 onward): the model's
                # distilled spec plus the spoken exchange it came from
                chat = parsed
        except (ValueError, TypeError):
            turns = [{"q": row.get("probe_q") or "What should it look like?",
                      "a": raw}]
    if chat:
        # Spec first, because that is what gets built. Transcript under a
        # fold so the summary can be checked against what was actually said
        # without taking over the issue.
        lines = [f"\n## Spec\n\n{quote_viewer(chat['spec'].strip())}\n"]
        tx = [m for m in (chat.get("transcript") or [])
              if isinstance(m, dict) and (m.get("content") or "").strip()]
        if tx:
            lines.append("\n<details><summary>The conversation this came from"
                         " (spoken, via the agentic chat)</summary>\n")
            for m in tx:
                speaker = "**Calavera:**" if m.get("role") == "assistant" else "**Viewer:**"
                lines.append(f"\n{speaker} {quote_viewer(m['content'].strip())}\n")
            lines.append("\n</details>\n")
        followup = "".join(lines)
    elif turns:
        lines = []
        for t in turns:
            a = quote_viewer((t.get("a") or "").strip())
            lines.append(f"\n**We asked:** {quote_viewer(t['q'].strip())}\n")
            lines.append(f"\n**They said:**\n\n> {a}\n" if a
                         else "\nThey skipped that one.\n")
        followup = "".join(lines)
    elif row.get("probe_q"):
        followup = (f"\n**We asked:** {quote_viewer(row['probe_q'].strip())}\n\n"
                    f"They skipped it, so this one still needs scoping before it "
                    f"can be built.\n")

    return (
        f"> {quote_viewer(row['body'])}\n"
        f"{followup}\n"
        f"Asked at hermanosamini.com on {when}. The viewer {who}.\n\n"
        f"**This is not approved yet.** Per "
        f"[ART_DIRECTION.md](https://github.com/{REPO}/blob/main/ART_DIRECTION.md), "
        f"nothing gets built until one of the Hermanos Amini applies the "
        f"`approved` label. Anyone may discuss it in the meantime."
        f"{cfg}\n\n"
        f"<!-- sklz-request-id: {row['id']} -->"
    )


def labels_for(row):
    """Flag the ones that are not buildable yet.

    An issue with no follow-up answer is a one-line wish, and approving it
    means an agent invents the missing half. `needs-detail` makes that visible
    on the board instead of discovering it at build time."""
    raw = row.get("detail")
    if raw:
        try:
            parsed = json.loads(raw)
            # An array of turns where every answer is blank is a SKIPPED
            # conversation, not a scoped one. Length alone would have marked
            # those as detailed and quietly defeated the label.
            if isinstance(parsed, list):
                if any((t or {}).get("a", "").strip() for t in parsed):
                    return LABELS
                return LABELS + ",needs-detail"
            # a chat interview with a real spec is the most scoped kind there is
            if isinstance(parsed, dict) and len((parsed.get("spec") or "").strip()) >= 20:
                return LABELS
        except (ValueError, TypeError):
            pass
        return LABELS
    return LABELS + ",needs-detail"


def title_for(body):
    t = " ".join(quote_viewer(body).split())
    return (t[:68] + "...") if len(t) > 71 else t


def file_issues(apply):
    rows = d1("SELECT id, body, email, config, created_at, probe_q, detail FROM requests "
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
                  "--label", labels_for(r)]).strip().splitlines()[-1]
        num = int(url.rstrip("/").rsplit("/", 1)[-1])
        d1(f"UPDATE requests SET issue_number = {num}, filed_at = {int(time.time()*1000)} "
           f"WHERE id = '{q(r['id'])}';")
        print(f"FILED  #{num}  {url}")
        filed.append({"id": r["id"], "issue": num, "email": r.get("email"),
                      "body": r["body"], "url": url})
    return filed


def close_sweep(apply):
    """Reconcile every filed row against its issue and send what it owes.

    Two mails exist and they are mutually exclusive per state, which is the
    subtlety worth spelling out. A backlog row that was filed before mail was
    wired has notified_open = 0 forever, because the 'we got it' mail is only
    ever offered to rows filed in the SAME run. If such a row's issue has
    since closed, sending 'your request is on the board' and 'it shipped' back
    to back would read as a broken system. So a closed issue gets the ship
    mail and its notified_open is marked too: the received mail is moot once
    the thing is already live."""
    rows = d1("SELECT id, body, email, issue_number, notified_open, notified_closed "
              "FROM requests WHERE issue_number IS NOT NULL "
              "AND email IS NOT NULL AND email != '' "
              "AND (notified_open = 0 OR notified_closed = 0);")
    due, backlog = [], []
    for r in rows:
        state = json.loads(sh(["gh", "issue", "view", str(r["issue_number"]),
                               "--repo", REPO, "--json", "state"]))["state"]
        if state == "CLOSED":
            if not r["notified_closed"]:
                due.append(r)
        elif not r["notified_open"]:
            backlog.append(r)

    sent = failed = 0
    if backlog:
        print(f"{len(backlog)} open issue(s) never got a 'we got it' email:")
        s2, f2 = mail_rows(backlog, "open", apply)
        sent += s2; failed += f2
    if due:
        print(f"{len(due)} closed issue(s) owe a 'it shipped' email:")
        s2, f2 = mail_rows(due, "closed", apply)
        sent += s2; failed += f2
    if not backlog and not due:
        print("close-sweep: every filed request has been notified")
    return sent, failed


def issue_url(num):
    return f"https://github.com/{REPO}/issues/{num}"


def mail_rows(rows, kind, apply):
    """Send one mail per row and mark it, but only on a confirmed send.

    The marking is the whole point of the ordering here: mark-then-send would
    silently swallow a request the moment Resend has a bad minute, and the
    requester would never learn their idea shipped. Send-then-mark costs at
    worst a duplicate if the process dies between the two, which is the far
    cheaper failure."""
    if not rows:
        return 0, 0
    if not mailer.configured():
        for r in rows:
            print(f"  MAIL DUE ({kind})  {r['email']}  ->  #{r['issue_number']}")
        print(f"Not sent: no RESEND_API_KEY in worker/.env. notified_{kind} stays 0 "
              f"so these send once it exists, rather than being lost.")
        return 0, len(rows)

    col = "notified_open" if kind == "open" else "notified_closed"
    sent = failed = 0
    for r in rows:
        num = r["issue_number"]
        if kind == "open":
            html = templates.received(r["body"], issue_url(num), num)
            subject = "Your request is on the board"
        else:
            html = templates.shipped(r["body"], issue_url(num), num)
            subject = "It shipped: your idea is in the art"

        if not apply:
            print(f"  WOULD MAIL ({kind})  {r['email']}  ->  #{num}")
            continue

        ok, info = mailer.email(r["email"], subject, html)
        if ok:
            # A ship mail supersedes the received mail: marking both stops a
            # backlog row from being told "we got it" after it already shipped.
            sets = f"{col} = 1" if kind == "open" else "notified_closed = 1, notified_open = 1"
            d1(f"UPDATE requests SET {sets} WHERE id = '{q(r['id'])}';")
            print(f"  MAILED ({kind})  {r['email']}  #{num}  [{info}]")
            sent += 1
        else:
            print(f"  MAIL FAILED ({kind})  {r['email']}  #{num}: {info}")
            failed += 1
    return sent, failed


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
    ap.add_argument("--mail-test", action="store_true",
                    help="send one test mail to the account owner and exit")
    a = ap.parse_args()

    if a.mail_test:
        print("configured:", mailer.configured(), " from:", mailer.sender())
        ok, info = mailer.email("pedram@hermanosamini.com",
                                "SKLZ: drain mail self-test",
                                templates.received("a test request, ignore me",
                                                   issue_url(1), 1),
                                frm=mailer.FALLBACK_FROM)
        print(("OK  " if ok else "FAIL  ") + str(info))
        return 0 if ok else 1

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
    swept = (0, 0)
    if a.close_sweep:
        print()
        swept = close_sweep(a.apply)

    pending_mail = [{"id": f["id"], "email": f["email"], "body": f["body"],
                     "issue_number": f["issue"]}
                    for f in filed if f["email"]]
    sent = 0
    if pending_mail:
        print(f"\n{len(pending_mail)} filed request(s) owe a 'we got it' email:")
        sent, _ = mail_rows(pending_mail, "open", apply)

    if a.apply:
        # close_sweep's mail used to be INVISIBLE here: this line only counted
        # what file_issues sent, so a run that mailed six people still logged
        # "mail_sent=0". Worse than no log, because it reports the pipeline as
        # idle while it is doing the most consequential thing it does, and it
        # is the only record that survives the run.
        log_run(f"filed={len(filed)} mail_sent={sent + swept[0]} "
                f"mail_failed={swept[1]} mail_pending={len(pending_mail) - sent}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
