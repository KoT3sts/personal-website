#!/usr/bin/env python3
"""Export the agent runs that built this site as OpenInference-shaped traces.

Reads the local OpenCode session store (SQLite, opened read-only) and writes
web/lab/data/agent-traces.json for the agent observability lab, a small summary
for the homepage and the same spans as OpenInference-style JSON lines.

The output is public, so the exporter publishes structure and numbers only:
span kinds, generic agent names, model ids, allowlisted tool names, run-relative
times, status, token counts, error classes and the results of deterministic code
evaluators. It never reads prompts, responses, reasoning or tool output. It reads
tool input only for bash calls, to sort each command into a category, and the
error text only of failed calls, to sort it into an error class, both inside this
process. See scripts/telemetry/README.md.

Usage: python3 scripts/telemetry/export_traces.py [--db PATH] [--out PATH]
                                                  [--summary-out PATH] [--jsonl-out PATH]
                                                  [--roots PATH]
Standard library only. The same database, root config and git history give the
same files. The root sessions and their windows live in a git-ignored local
config (scripts/telemetry/roots.local.json; format in roots.example.json).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sqlite3
import subprocess
import sys
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/New_York")
REPO = Path(__file__).resolve().parents[2]
DEFAULT_DB = Path.home() / ".local/share/opencode/opencode.db"
DEFAULT_OUT = REPO / "web/lab/data/agent-traces.json"
DEFAULT_ROOTS = Path(__file__).resolve().parent / "roots.local.json"
SIZE_BUDGET = 360_000  # bytes (agent-traces.json only)

# Build rounds, each closed by a commit in this repository (see HANDOFF.md). The
# times are a fallback for when git is unavailable; git wins when present.
ROUNDS = [
    ("Recruiter content", "374f67f", "2026-11-07T19:55:03-05:00"),
    ("Build tour", "74e2231", "2026-11-09T10:40:35-05:00"),
    ("Round 1", "4c9440c", "2026-11-09T17:17:20-05:00"),
    ("Round 2", "78d3e3b", "2026-11-10T00:56:39-05:00"),
    ("Round 3", "3839873", "2026-11-10T10:12:11-05:00"),
    ("Round 4", "1a90798", "2026-11-11T00:02:12-05:00"),
    ("Round 5", "3d05d87", "2026-11-11T11:40:54-05:00"),
    ("Security", "7395a47", "2026-11-11T12:03:09-05:00"),
    ("Round 6", "f928ac2", "2026-11-11T16:41:27-05:00"),
    ("Round 7", "b7b7cac", "2026-11-11T18:01:19-05:00"),
    ("Round 8", "92a6746", "2026-11-11T18:15:21-05:00"),
    ("Round 9", "a994e37", "2026-11-12T00:13:19-05:00"),
    ("Round 10", "6842a84", "2026-11-12T01:45:56-05:00"),
    ("Round 11", "2007495", "2026-11-12T02:44:21-05:00"),
    # round 12 (November 12) in its four commit groups
    ("Hover lag", "bf27f72", "2026-11-12T10:32:04-05:00"),
    ("First visit", "b925b1e", "2026-11-12T11:17:52-05:00"),
    ("Layout shift", "028f38f", "2026-11-12T14:03:03-05:00"),
    ("Follow up", "1fcb6eb", "2026-11-12T15:11:29-05:00"),
]
# The round still open: its label applies to every trace that starts after the last
# commit in ROUNDS (no end date, so it cannot go stale). When the round closes, add its
# commit to ROUNDS and name the next open round here.
OPEN_ROUND = {"label": "Evaluators"}

# Plain words for each work label, for the homepage summary. Must match TOPICS in
# web/lab/obs-data.js (tests/agent-traces.test.js checks every trace).
TOPICS = {
    "Recruiter content": "recruiter content",
    "Build tour": "entrance and build tour",
    "Round 1": "type, header and motion",
    "Round 2": "portrait hero and approach",
    "Round 3": "beam art and experience",
    "Round 4": "hero, Icarus and layout",
    "Round 4–5": "layout and copy polish",
    "Round 5": "copy and polish",
    "Security": "security hardening",
    "Round 6": "real-trace tour and lab",
    "Round 7": "proof strip and essay",
    "Round 7–8": "evidence-first case studies",
    "Round 9": "case studies and charts",
    "Round 10": "homepage work previews",
    "Round 10–11": "observability lab",
    "Round 11": "observability lab",
    "Hover lag": "hover lag and copy",
    "Hover lag – First visit": "hover lag, copy and tour",
    "First visit": "first-visit tour and charts",
    "Layout shift": "layout shift",
    "Follow up": "résumé and table labels",
    "Evaluators": "dashboard evaluators",
}
DEFAULT_TOPIC = "site work"

CORE_TOOLS = {"bash", "read", "edit", "write", "glob", "grep", "task", "todowrite",
              "question", "skill", "webfetch"}
BROWSER_PREFIX = "chrome-devtools_"
AGENTS = {"build", "plan", "orchestrator", "implementation-worker", "quality-reviewer",
          "verification-runner", "ui-design-director", "general", "explore", "work-analyst",
          "compaction"}

# Bash commands are classified here and only the category is published.
BASH_RULES = [
    ("git-commit", re.compile(r"\bgit\b[^;&|\n]*\bcommit\b")),
    ("test", re.compile(r"node\s+--test\b|\bnpm\s+(?:run\s+)?(?:-s\s+)?test\b|\bpytest\b"
                        r"|-m\s+unittest\b|harness-run|tour-run|\bplaywright\b|\bvitest\b|\bjest\b"
                        r"|\bverify[\w-]*\.sh\b")),
    ("build", re.compile(r"\bnpm\s+run\s+(?:-s\s+)?(?:build|check)\b|scripts/build\.mjs"
                         r"|node\s+--check\b")),
    ("git-other", re.compile(r"\bgit\b")),
    ("server", re.compile(r"serve\.mjs|http\.server|\blsof\b"
                          r"|curl\s[^\n]*(?:127\.0\.0\.1|localhost)")),
]
BASH_CATEGORIES = [name for name, _ in BASH_RULES] + ["other"]
# A bash call in one of these categories that completed with exit code 0 (or no
# recorded exit code) counts as a check of the work: tests, `npm run check`, builds.
VERIFY_CATEGORIES = {"test", "build"}
EDIT_TOOLS = {"edit", "write"}

# Failed tool calls are sorted into one class from their error text, which is read
# for failed calls only, matched here and discarded. A JavaScript runtime error thrown
# by a script the agent ran (JS_RUNTIME) is "other" before any rule is tried; then the
# rules are tried in this order and the first match wins; nothing matched is "other".
JS_RUNTIME = re.compile(r"\bis not (?:a function|defined)\b|cannot read propert(?:y|ies) of undefined", re.I)


def _http(codes):
    """An HTTP status code only next to "status", "HTTP" or "code" (e.g. "status code
    (404", "HTTP 403", "HTTP/1.1 503"), never a bare number."""
    return (r"(?:\bstatus(?:[ _-]?code)?|\bhttp(?:/[\d.]+)?|\bcode)\b[^\d\n]{0,12}\b(?:" + codes + r")\b")


ERROR_RULES = [
    ("timeout", re.compile(r"timed?[ -]?out\b|timeout|deadline exceeded|etimedout", re.I)),
    ("permission", re.compile(r"permission|not allowed|forbidden|access denied|\bdenied\b|unauthori[sz]ed"
                              r"|\beacces\b|\beperm\b|rule which prevents|securityerror|" + _http(r"40[13]"), re.I)),
    ("not_found", re.compile(r"not found|no such file|\benoent\b|does not exist|no page found|" + _http(r"404")
                             + r"|cannot read propert(?:y|ies) of null", re.I)),
    ("bad_arguments", re.compile(r"invalid|schema ?error|missing key|oldstring|no changes to apply"
                                 r"|failed to find expected lines|unknown (?:option|argument|flag)"
                                 r"|unexpected argument|expected [^\n]{0,40}(?:got|received)|syntaxerror"
                                 r"|illegal invocation", re.I)),
    ("test_failure", re.compile(r"assertion ?error|tests? failed|\bnot ok\b|# fail\s+[1-9]|failing tests?", re.I)),
    ("network", re.compile(r"econnrefused|econnreset|enotfound|eai_again|getaddrinfo|socket hang up|network"
                           r"|fetch ?error|failed to fetch|fetch failed|connection (?:refused|reset|closed)"
                           r"|err_connection|(?:cannot|could not) connect|transport error"
                           r"|" + _http(r"429|50[0-4]"), re.I)),
]
ERROR_CLASSES = ["timeout", "not_found", "permission", "test_failure", "bad_arguments", "network", "other"]
assert {name for name, _ in ERROR_RULES} | {"other"} == set(ERROR_CLASSES)

# Strings that must never appear in the published file (case-insensitive).
DENYLIST = [
    r"adp", r"jira", r"spark-", r"bitbucket", r"jenkins", r"confluence", r"splunk",
    r"servicenow", r"/users/", r"/home/", r"\\users\\", r"http", r"@",
    r"ses_", r"prj_", r"msg_", r"prt_", r"[\w.+-]+@[\w-]+\.\w+",
    # long opaque ids (workspace, project or session ids): letters and digits mixed
    r"(?=[a-z0-9+/=_-]*\d)(?=[a-z0-9+/=_-]*[a-z])[a-z0-9+/=_-]{20,}",
]
# the local account name too, without writing it into this public file
_USER = Path.home().name
if len(_USER) >= 4:
    DENYLIST.append(re.escape(_USER))
DENY_RE = re.compile("|".join(f"(?:{p})" for p in DENYLIST), re.IGNORECASE)

# Only these tables and columns may be read; SQLite's authorizer refuses everything
# else. It cannot see inside the JSON `data` column, so the JSON paths the queries
# extract are checked separately against ALLOWED_JSON_PATHS before any query runs.
ALLOWED_COLUMNS = {
    "session": {"id", "parent_id", "slug", "agent", "time_created"},
    "message": {"id", "session_id", "time_created", "data"},
    "part": {"id", "message_id", "session_id", "time_created", "data"},
}

# Compaction settings, most detailed first; the first that fits SIZE_BUDGET is used:
# (steps kept at each end of an orchestrator run, of a subagent run, error steps kept per run)
COMPACTION_LADDER = [(8, 2, 3), (6, 2, 2), (4, 1, 1), (3, 1, 1), (3, 0, 1), (2, 0, 1), (1, 0, 1),
                     (1, 0, 0), (0, 0, 0)]

# Every pass/fail evaluator has a numeric score and passes when the score meets its
# threshold in the given direction (atMost: score <= threshold, below: score <
# threshold, atLeast: score >= threshold). Labels are computed from the published
# (rounded) score with these values, and both are published so a reader can re-score.
THRESHOLDS = {
    "tool_error_rate": {"threshold": 0.10, "direction": "atMost"},
    "recovered_after_error": {"threshold": 1, "direction": "atLeast"},
    "delegation_fit": {"threshold": 0.5, "direction": "atLeast"},
    "review_before_commit": {"threshold": 1, "direction": "atLeast"},
    "tests_run_before_commit": {"threshold": 1, "direction": "atLeast"},
    "verified_after_last_edit": {"threshold": 1, "direction": "atLeast"},
    "review_addressed": {"threshold": 1, "direction": "atLeast"},
    "stuck_loop": {"threshold": 3, "direction": "below"},
    "latency_budget": {"threshold": 30, "direction": "below"},
}
# delegation_fit scores only "large" traces: at least this many tool calls, or at
# least this many edit/write calls, counted over the whole trace (subagents included).
# Its score is the share of those tool calls that subagents made.
LARGE_TRACE = {"minToolCalls": 40, "minEdits": 3}


# ---------------------------------------------------------------- database

def _authorizer(action, arg1, arg2, _db, _trigger):
    if action == sqlite3.SQLITE_READ:
        if arg1 not in ALLOWED_COLUMNS or arg2 not in ALLOWED_COLUMNS[arg1]:
            return sqlite3.SQLITE_DENY
    elif action not in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_FUNCTION):
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def connect(db_path: Path) -> sqlite3.Connection:
    check_json_paths()
    uri = "file:" + urllib.parse.quote(str(db_path.resolve())) + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.set_authorizer(_authorizer)
    return conn


# Rows are filtered by time in SQL ({ranges} becomes "time_created between ? and ?"
# per range), so messages and parts outside the configured windows are never read.
# JSON is only extracted in the select list, i.e. for rows that passed the filter.
MESSAGE_SQL = """
select id, time_created,
  json_extract(data, '$.role'), json_extract(data, '$.parentID'),
  json_extract(data, '$.agent'), json_extract(data, '$.modelID'),
  json_extract(data, '$.time.created'), json_extract(data, '$.time.completed'),
  json_extract(data, '$.tokens.input'), json_extract(data, '$.tokens.output'),
  json_extract(data, '$.tokens.reasoning'), json_extract(data, '$.tokens.cache.read'),
  json_extract(data, '$.tokens.cache.write'), json_extract(data, '$.error.name')
from message where session_id = ? and ({ranges}) order by time_created, id
"""

PART_SQL = """
select id, message_id, json_extract(data, '$.type'), json_extract(data, '$.tool'),
  json_extract(data, '$.state.status'),
  json_extract(data, '$.state.time.start'), json_extract(data, '$.state.time.end'),
  json_extract(data, '$.state.metadata.sessionId'),
  case when json_extract(data, '$.type') = 'tool' and json_extract(data, '$.tool') = 'bash'
       then json_extract(data, '$.state.input.command') end,
  case when json_extract(data, '$.type') = 'tool' and json_extract(data, '$.state.status') = 'error'
       then json_extract(data, '$.state.error') end,
  case when json_extract(data, '$.type') = 'tool' and json_extract(data, '$.tool') = 'bash'
       then json_extract(data, '$.state.metadata.exit') end
from part where session_id = ? and message_id in (
  select id from message where session_id = ? and ({ranges}))
order by id
"""

# Every JSON path the queries may extract. $.state.input.command is read for bash
# calls only, classified in memory and discarded (see classify_bash). $.state.error
# is read for failed tool calls only, sorted into a class and discarded (see
# classify_error). $.state.metadata.exit is the exit code of a bash call (a number).
ALLOWED_JSON_PATHS = {
    "message": {"$.role", "$.parentID", "$.agent", "$.modelID", "$.time.created",
                "$.time.completed", "$.tokens.input", "$.tokens.output", "$.tokens.reasoning",
                "$.tokens.cache.read", "$.tokens.cache.write", "$.error.name"},
    "part": {"$.type", "$.tool", "$.state.status", "$.state.time.start", "$.state.time.end",
             "$.state.metadata.sessionId", "$.state.input.command", "$.state.error",
             "$.state.metadata.exit"},
}
QUERIES = {"message": [MESSAGE_SQL], "part": [PART_SQL]}
JSON_PATH_RE = re.compile(r"json_extract\(\s*(?:\w+\.)?data\s*,\s*'([^']*)'\s*\)")


def check_json_paths(queries=None):
    """Abort unless every json_extract path in the queries is on the allowlist."""
    for table, sqls in (queries or QUERIES).items():
        for sql in sqls:
            if "json_extract" in sql and not JSON_PATH_RE.search(sql):
                raise SystemExit(f"unparsed json_extract in a {table} query")
            calls = sql.count("json_extract")
            paths = JSON_PATH_RE.findall(sql)
            if len(paths) != calls:
                raise SystemExit(f"a json_extract in a {table} query does not use a literal path")
            bad = sorted(set(paths) - ALLOWED_JSON_PATHS.get(table, set()))
            if bad:
                raise SystemExit(f"JSON path(s) not on the {table} allowlist: {', '.join(bad)}")


def _ranges_sql(ranges):
    if not ranges:
        raise ValueError("at least one time range is required")
    return " or ".join(["time_created between ? and ?"] * len(ranges))


def load_session(conn, session_id, ranges):
    """Messages and tool parts of one session whose message was created inside
    `ranges` (inclusive (lo, hi) ms pairs)."""
    bounds = [v for pair in ranges for v in pair]
    where = _ranges_sql(ranges)
    messages = []
    for row in conn.execute(MESSAGE_SQL.format(ranges=where), (session_id, *bounds)):
        (mid, created_row, role, parent, agent, model, created, completed,
         t_in, t_out, t_reason, t_cread, t_cwrite, error) = row
        messages.append({
            "id": mid, "role": role, "parent": parent, "agent": agent, "model": model,
            "created": int(created or created_row), "completed": completed,
            "tokens": [int(t or 0) for t in (t_in, t_out, t_reason, t_cread, t_cwrite)],
            "error": error,
        })
    tools = defaultdict(list)
    for pid, mid, kind, tool, status, start, end, child, command, error, exit_code in conn.execute(
            PART_SQL.format(ranges=where), (session_id, session_id, *bounds)):
        if kind != "tool":
            continue
        # the command and the error text stop here: only their categories are kept
        tools[mid].append({"id": pid, "tool": tool, "status": status, "start": start,
                           "end": end, "child": child,
                           "category": classify_bash(command) if tool == "bash" else None,
                           "error_class": classify_error(error) if status == "error" else None,
                           "exit": exit_code if isinstance(exit_code, int) else None})
    for calls in tools.values():
        calls.sort(key=lambda c: (c["start"] or 0, c["id"]))
    return messages, tools


def children_of(conn, session_id, ranges):
    """Direct child sessions created inside `ranges`."""
    sql = (f"select id, agent, time_created from session where parent_id = ? and ({_ranges_sql(ranges)}) "
           "order by time_created, id")
    return [{"id": sid, "agent": agent, "created": created}
            for sid, agent, created in conn.execute(sql, (session_id, *[v for r in ranges for v in r]))]


def child_session(conn, session_id, parent_id):
    """The session a task call started, if it is a child of the calling session."""
    row = conn.execute("select id, agent, time_created from session where id = ? and parent_id = ?",
                       (session_id, parent_id)).fetchone()
    return {"id": row[0], "agent": row[1], "created": row[2]} if row else None


def resolve_root(conn, slug, created_day):
    hits = [(sid, created) for sid, created in conn.execute(
        "select id, time_created from session where slug = ? and parent_id is null "
        "order by time_created", (slug,)) if local_day(created) == created_day]
    if len(hits) != 1:
        raise SystemExit(f"expected one root session {slug} created {created_day}, found {len(hits)}")
    return hits[0]


# ---------------------------------------------------------------- helpers

def local_day(ms):
    return datetime.fromtimestamp(ms / 1000, TZ).date().isoformat()


def parse_ms(iso):
    return None if iso is None else round(datetime.fromisoformat(iso).timestamp() * 1000)


def classify_bash(command):
    if not command:
        return "other"
    for name, pattern in BASH_RULES:
        if pattern.search(command):
            return name
    return "other"


def classify_error(text):
    """The class of a failed tool call's error text (see ERROR_RULES)."""
    if not isinstance(text, str) or not text or JS_RUNTIME.search(text):
        return "other"
    for name, pattern in ERROR_RULES:
        if pattern.search(text):
            return name
    return "other"


def tool_name(raw):
    if raw in CORE_TOOLS:
        return raw
    if raw and raw.startswith(BROWSER_PREFIX):
        action = raw[len(BROWSER_PREFIX):]
        if re.fullmatch(r"[a-z][a-z_]{0,39}", action):
            return "browser." + action
    return None


def agent_name(raw):
    return raw if raw in AGENTS else "other"


def percentile(values, q):
    """Nearest-rank percentile (deterministic, returns an observed value)."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(q / 100 * len(ordered)))
    return ordered[rank - 1]


def pct(values):
    return {"n": len(values), "p50": percentile(values, 50), "p90": percentile(values, 90),
            "p99": percentile(values, 99)}


TOKEN_KEYS = ["input", "output", "reasoning", "cacheRead", "cacheWrite"]


def token_dict(values):
    return dict(zip(TOKEN_KEYS, values))


def add_tokens(total, values):
    for i, value in enumerate(values):
        total[i] += value


# ---------------------------------------------------------------- span building

class Run:
    """Collects raw spans (absolute ms) for one trace."""

    def __init__(self, conn, stats):
        self.conn = conn
        self.stats = stats
        self.spans = []
        self.used_children = set()

    def add(self, **span):
        span["key"] = len(self.spans)
        self.spans.append(span)
        return span

    def steps(self, session_id, messages, tools, parent, agent_fallback, depth):
        """Add LLM and TOOL spans for assistant messages; returns the end time."""
        end = 0
        for msg in messages:
            if msg["role"] != "assistant":
                continue
            agent = agent_name(msg["agent"] or agent_fallback)
            calls = tools.get(msg["id"], [])
            starts = [c["start"] for c in calls if c["start"]]
            completed = msg["completed"] or max([msg["created"]] + [c["end"] or c["start"] or 0 for c in calls])
            gen_end = max(starts) if starts else completed
            gen_end = max(msg["created"], min(gen_end, completed))
            llm = self.add(parent=parent["key"], kind="LLM", name="llm", agent=agent,
                           model=msg["model"], start=msg["created"], end=gen_end,
                           status="error" if msg["error"] else "ok", tokens=msg["tokens"],
                           depth=depth)
            llm["step_tools"] = 0
            end = max(end, completed, gen_end)
            for call in calls:
                if call["status"] not in ("completed", "error") or not call["start"]:
                    self.stats["incomplete"] += 1
                    continue
                name = tool_name(call["tool"])
                if name is None:
                    self.stats["dropped"] += 1
                    continue
                span = self.add(parent=parent["key"], kind="TOOL", name=name, agent=agent,
                                start=call["start"], end=max(call["start"], call["end"] or call["start"]),
                                status="ok" if call["status"] == "completed" else "error",
                                category=call["category"], error_class=call["error_class"],
                                exit=call["exit"], step=llm["key"], depth=depth)
                llm["step_tools"] += 1
                end = max(end, span["end"])
                child = child_session(self.conn, call["child"], session_id) if name == "task" and call["child"] else None
                if child:
                    # a task call can resume an earlier subagent session: take only
                    # the child's steps that ran during this call
                    end = max(end, self.subagent(child, span, depth + 1,
                                                 (call["start"], span["end"])))
        return end

    def subagent(self, info, parent, depth, window):
        session_id = info["id"]
        self.used_children.add(session_id)
        messages, tools = load_session(self.conn, session_id, [window])
        assistants = [m for m in messages if m["role"] == "assistant"]
        start = assistants[0]["created"] if assistants else info["created"]
        agent = agent_name(info["agent"] or (assistants[0]["agent"] if assistants else None))
        span = self.add(parent=parent["key"], kind="AGENT", name=agent, agent=agent,
                        start=max(start, parent["start"]), end=start, status="ok", depth=depth)
        if any(m["error"] for m in assistants):
            span["status"] = "error"
        span["end"] = max(span["end"], self.steps(session_id, messages, tools, span, agent, depth))
        return span["end"]


def load_roots(path):
    """Read and validate the local root-session config (see roots.example.json)."""
    path = Path(path)
    if not path.exists():
        raise SystemExit(
            f"root-session config not found: {path}\n"
            "Copy scripts/telemetry/roots.example.json to scripts/telemetry/roots.local.json "
            "(git-ignored) and list the root sessions and their windows, or pass --roots PATH.")
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"{path}: not valid JSON ({error})")
    roots = config.get("roots") if isinstance(config, dict) else None
    if not isinstance(roots, list) or not roots:
        raise SystemExit(f"{path}: expected {{\"roots\": [...]}} with at least one root")
    out = []
    for i, root in enumerate(roots):
        where = f"{path}: roots[{i}]"
        if not isinstance(root, dict) or not isinstance(root.get("slug"), str) or not root["slug"]:
            raise SystemExit(f"{where}: needs a slug")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(root.get("created", ""))):
            raise SystemExit(f"{where}: needs created as YYYY-MM-DD")
        windows = root.get("windows")
        if not isinstance(windows, list) or not windows:
            raise SystemExit(f"{where}: needs at least one window")
        ranges = []
        for j, window in enumerate(windows):
            spot = f"{where}.windows[{j}]"
            if not isinstance(window, dict) or not window.get("from") or not window.get("to"):
                raise SystemExit(f"{spot}: every window needs an explicit from and to")
            try:
                lo, hi = parse_ms(window["from"]), parse_ms(window["to"])
            except (TypeError, ValueError):
                raise SystemExit(f"{spot}: from/to must be ISO 8601 times with an offset")
            if datetime.fromisoformat(window["from"]).tzinfo is None or datetime.fromisoformat(window["to"]).tzinfo is None:
                raise SystemExit(f"{spot}: from/to need a UTC offset")
            if lo >= hi:
                raise SystemExit(f"{spot}: from must be before to")
            ranges.append((lo, hi - 1))  # inclusive ms; `to` itself is excluded
        ranges.sort()
        for (_, a_hi), (b_lo, _) in zip(ranges, ranges[1:]):
            if b_lo <= a_hi:
                raise SystemExit(f"{where}: windows overlap")
        out.append({"slug": root["slug"], "created": root["created"], "ranges": ranges})
    return out


def check_turns(root, turns):
    """Abort if an included turn lies outside its root's windows or after its end."""
    end = max(hi for _, hi in root["ranges"])
    for t in turns:
        if t > end or not any(lo <= t <= hi for lo, hi in root["ranges"]):
            raise SystemExit(f"a turn of root {root['slug']} starts outside its configured windows "
                             f"(after the configured end or between windows); refusing to export")


def build_traces(conn, roots):
    stats = Counter()
    traces = []
    for root in roots:
        root_id, root_created = resolve_root(conn, root["slug"], root["created"])
        ranges = root["ranges"]
        messages, tools = load_session(conn, root_id, ranges)
        users = [m for m in messages if m["role"] == "user"]
        check_turns(root, [u["created"] for u in users])
        replies = defaultdict(list)
        for m in messages:
            if m["role"] == "assistant":
                replies[m["parent"]].append(m)
        root_traces = []
        for user in users:
            t = user["created"]
            answer = replies.get(user["id"], [])
            if not answer:
                stats["turns_without_reply"] += 1
                continue
            run = Run(conn, stats)
            agent = agent_name(answer[0]["agent"])
            root_span = run.add(parent=None, kind="AGENT", name=agent, agent=agent,
                                start=t, end=t, status="ok", depth=0)
            root_span["end"] = max(t, run.steps(root_id, answer, tools, root_span, agent, 0))
            root_traces.append({"run": run, "root": root_span, "start": t, "root_id": root_id,
                                "root_created": root_created})
        # subagent sessions not reached through a task call: attach by creation time
        used = set().union(*(tr["run"].used_children for tr in root_traces)) if root_traces else set()
        for info in children_of(conn, root_id, ranges):
            sid = info["id"]
            if sid in used:
                continue
            host = next((tr for tr in root_traces
                         if tr["start"] <= info["created"] <= tr["root"]["end"]), None)
            if host is None:
                stats["children_outside_window"] += 1
                continue
            run = host["run"]
            end = run.subagent(info, host["root"], 1, (host["start"], host["root"]["end"]))
            host["root"]["end"] = max(host["root"]["end"], end)
            used.add(sid)
        traces.extend(root_traces)
    traces.sort(key=lambda tr: (tr["start"], tr["root_id"]))
    for tr in traces:
        spans = tr["run"].spans
        # an agent span ends when its last descendant ends
        for span in sorted(spans, key=lambda s: -s["depth"]):
            if span["parent"] is not None:
                parent = spans[span["parent"]]
                parent["end"] = max(parent["end"], span["end"])
        tr["end"] = max(s["end"] for s in spans)
    return traces, stats, len(roots)


# ---------------------------------------------------------------- rounds

def git_commits():
    try:
        out = subprocess.run(["git", "log", "--format=%h|%aI"], cwd=REPO, capture_output=True,
                             text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    commits = []
    for line in out.splitlines():
        sha, _, when = line.partition("|")
        if when:
            commits.append((sha, parse_ms(when)))
    return commits


def round_table(commits):
    by_sha = {sha: ms for sha, ms in commits or []}
    table = []
    for label, sha, fallback in ROUNDS:
        table.append((label, by_sha.get(sha, parse_ms(fallback))))
    return table


def round_of_time(table, ms):
    for label, closed in table:
        if ms <= closed:
            return label
    return None


def round_label(table, commits, start, end):
    inside = sorted({round_of_time(table, ms) for _, ms in commits or []
                     if start <= ms <= end + 60_000} - {None},
                    key=lambda label: [r[0] for r in table].index(label))
    if not inside:
        label = round_of_time(table, start)
        if label is None and table and table[-1][1] < start:
            label = OPEN_ROUND["label"]
        return label
    if len(inside) == 1:
        return inside[0]
    first, last = inside[0], inside[-1]
    if first.startswith("Round ") and last.startswith("Round "):
        return f"{first}–{last.split(' ', 1)[1]}"
    return f"{first} – {last}"


# ---------------------------------------------------------------- evaluators

def _pf(**extra):
    return {"output": "pass/fail", **extra}


EVALUATORS = [
    {"id": "tool_error_rate", "name": "Tool error rate", "kind": "code", **_pf(),
     "description": "Share of tool calls in the trace that returned an error. Fails above 10%. Score: the share (0–1).",
     "question": "Did the agents mostly call their tools correctly?"},
    {"id": "recovered_after_error", "name": "Recovered after error", "kind": "code", **_pf(),
     "description": "For every failed tool call, a later call of the same tool in the same trace succeeded. Score: the share of failed calls recovered (0–1). Only scored on traces with an error.",
     "question": "When a tool call failed, did the agent retry or fix it?"},
    {"id": "delegation_fit", "name": "Delegation on large tasks", "kind": "code", **_pf(scope=LARGE_TRACE),
     "description": "On a large trace (at least 40 tool calls, or at least 3 edit/write calls, counted over the whole trace), subagents made at least half of the trace's tool calls. Score: the share of tool calls made by subagents (0–1). Small traces are not scored.",
     "question": "On big jobs, did specialists do most of the hands-on work?"},
    {"id": "review_before_commit", "name": "Review before commit", "kind": "code", **_pf(),
     "description": "A quality-reviewer run finished after the previous commit in the session and before the trace's last commit. Score: 1 or 0. Only scored on traces that commit.",
     "question": "Was the change reviewed before it was saved?"},
    {"id": "tests_run_before_commit", "name": "Tests before commit", "kind": "code", **_pf(),
     "description": "A test command ran after the previous commit in the session and before the trace's last commit. Commands are classified inside the exporter; only the category is published. Score: 1 or 0. Only scored on traces that commit.",
     "question": "Were the tests run before the change was saved?"},
    {"id": "verified_after_last_edit", "name": "Checked after the last edit", "kind": "code", **_pf(),
     "description": "After the trace's last successful edit or write (by any agent, subagents included), a test, check or build command finished with exit code 0, or with no exit code recorded, before the trace ended. Score: 1 or 0. Only scored on traces that edit.",
     "question": "Was the final state of the change tested or built?"},
    {"id": "stuck_loop", "name": "No stuck loop", "kind": "code", **_pf(),
     "description": "No agent run called the same tool and failed 3 or more times in a row (its calls in time order). Score: the longest such streak. Scored on traces with tool calls.",
     "question": "Did an agent keep repeating a failing call?"},
    {"id": "review_addressed", "name": "Changes after review", "kind": "code", **_pf(),
     "description": "Where a quality-reviewer run finished before a commit (the same interval as Review before commit), at least one edit or write followed a review and came before the next commit. A clean review with nothing to fix also fails, so read it as \u201cthe review changed something\u201d. Score: the most edits that followed one review. Only scored when a review preceded the commit.",
     "question": "Did the review lead to changes before the commit?"},
    {"id": "latency_budget", "name": "Model latency budget", "kind": "code", **_pf(),
     "description": "p90 of model step latency (step start to its last tool call) in the trace is under 30 s. Score: the p90 in seconds.",
     "question": "Did the model respond quickly enough to keep the loop moving?"},
    {"id": "tokens_per_tool_call", "name": "Generated tokens per tool call", "kind": "code", "output": "number",
     "description": "Output plus reasoning tokens divided by tool calls in the trace (a number, not pass/fail). Lower means terser actions.",
     "question": "How much did the model write for each action it took?"},
    {"id": "parallel_fanout", "name": "Parallel subagents", "kind": "code", "output": "number",
     "description": "The most subagent runs open at the same moment in the trace (a number, not pass/fail). Only scored on traces with a subagent run.",
     "question": "How much work ran in parallel?"},
    {"id": "cache_reuse", "name": "Prompt cache reuse", "kind": "code", "output": "number",
     "description": "Cache-read tokens divided by all prompt tokens (input, cache read and cache write) over the trace's model steps (a number from 0 to 1, not pass/fail).",
     "question": "How much of each prompt came from the cache?"},
    {"id": "error_class", "name": "Most common error", "kind": "code", "output": "category", "classes": ERROR_CLASSES,
     "description": "Each failed tool call is sorted into one class (timeout, not found, permission, test failure, bad arguments, network, other) by rules applied to its error text inside the exporter; the text is not published. Label: the most common class; score: its count. Only scored on traces with a failed call.",
     "question": "What kind of failure was most common?"},
]
for _e in EVALUATORS:
    if _e["output"] == "pass/fail":
        _e.update(THRESHOLDS[_e["id"]])
assert {e["id"] for e in EVALUATORS if e["output"] == "pass/fail"} == set(THRESHOLDS)
PASS_FAIL = [e["id"] for e in EVALUATORS if e["output"] == "pass/fail"]


def label_for(evaluator, score):
    """pass/fail from a published score and the evaluator's threshold."""
    rule = THRESHOLDS[evaluator]
    t, direction = rule["threshold"], rule["direction"]
    ok = score <= t if direction == "atMost" else score < t if direction == "below" else score >= t
    return "pass" if ok else "fail"


def _plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def is_edit(s):
    return s["kind"] == "TOOL" and s["name"] in EDIT_TOOLS and s["status"] == "ok"


def is_commit(s):
    return s["kind"] == "TOOL" and s.get("category") == "git-commit" and s["status"] == "ok"


def is_check(s):
    return (s["kind"] == "TOOL" and s["name"] == "bash" and s.get("category") in VERIFY_CATEGORIES
            and s["status"] == "ok" and s.get("exit") in (None, 0))


def _order(s):
    return (s["start"], s["key"] if isinstance(s["key"], int) else 0)


def longest_failure_streak(spans):
    """Longest run of consecutive failed calls of one tool inside one agent run."""
    by_run = defaultdict(list)
    for s in spans:
        if s["kind"] == "TOOL":
            by_run[s["parent"]].append(s)
    best = 0
    for calls in by_run.values():
        streak, last = 0, None
        for s in sorted(calls, key=_order):
            if s["status"] == "error":
                streak = streak + 1 if streak and s["name"] == last else 1
                last = s["name"]
                best = max(best, streak)
            else:
                streak, last = 0, None
    return best


def max_fanout(spans):
    """The most subagent runs open at one moment (half-open intervals; a run of zero
    length counts at its start)."""
    runs = [s for s in spans if s["kind"] == "AGENT" and s["depth"] > 0]
    best = 0
    for a in runs:
        best = max(best, sum(1 for b in runs if b is a or (b["start"] <= a["start"] < b["end"])))
    return best


def cache_share(llms):
    tokens = [0] * 5
    for s in llms:
        add_tokens(tokens, s["tokens"])
    prompt = tokens[0] + tokens[3] + tokens[4]
    return None if prompt == 0 else round(tokens[3] / prompt, 4)


def error_class_counts(spans):
    counts = Counter(s.get("error_class") or "other" for s in spans if s["kind"] == "TOOL" and s["status"] == "error")
    return {c: counts[c] for c in ERROR_CLASSES if counts[c]}


def edits_after_reviews(pool, since, last):
    """Reviews finished in (since, last]; for each, the edits after it and before the
    next commit. Returns (reviews, most edits after one review) or None without a review."""
    reviews = sorted((s for s in pool if s["kind"] == "AGENT" and s["agent"] == "quality-reviewer"
                      and since < s["end"] <= last), key=lambda s: s["end"])
    if not reviews:
        return None
    commits = sorted(s["start"] for s in pool if is_commit(s))
    best = 0
    for r in reviews:
        nxt = next((c for c in commits if c >= r["end"]), last)
        best = max(best, sum(1 for s in pool if is_edit(s) and s["start"] >= r["end"] and s["end"] <= nxt))
    return len(reviews), best


def evaluate(traces):
    results = []

    def emit(tid, evaluator, score, explanation, label=None):
        results.append({"trace": tid, "evaluator": evaluator,
                        "label": label if label is not None else label_for(evaluator, score),
                        "score": score, "explanation": explanation})

    # commit / review / test events per root session, in time order
    by_root = defaultdict(list)
    for tr in traces:
        by_root[tr["root_id"]].append(tr)
    for root_traces in by_root.values():
        previous_commit = None
        for tr in root_traces:
            spans = tr["run"].spans
            tools = [s for s in spans if s["kind"] == "TOOL"]
            llms = [s for s in spans if s["kind"] == "LLM"]
            tid = tr["id"]
            commits = sorted(s["start"] for s in tools if is_commit(s))
            edits = [s for s in tools if is_edit(s)]
            delegated = sum(1 for s in spans if s["kind"] == "AGENT" and s["depth"] > 0)
            by_subagents = sum(1 for s in tools if s["depth"] > 0)
            if tools:
                errors = sum(s["status"] == "error" for s in tools)
                emit(tid, "tool_error_rate", round(errors / len(tools), 4),
                     f"{errors} of {len(tools)} tool calls failed.")
                failed = [s for s in tools if s["status"] == "error"]
                if failed:
                    recovered = sum(any(o["name"] == f["name"] and o["status"] == "ok" and o["start"] > f["start"]
                                        for o in tools) for f in failed)
                    emit(tid, "recovered_after_error", round(recovered / len(failed), 4),
                         f"{recovered} of {len(failed)} failed calls later succeeded.")
            edit_calls = sum(1 for s in tools if s["name"] in EDIT_TOOLS)
            if len(tools) >= LARGE_TRACE["minToolCalls"] or edit_calls >= LARGE_TRACE["minEdits"]:
                emit(tid, "delegation_fit", round(by_subagents / len(tools), 4),
                     f"{_plural(len(tools), 'tool call')}, {_plural(edit_calls, 'edit')}; "
                     f"{by_subagents} made by subagents in {_plural(delegated, 'run')}.")
            if commits:
                last = commits[-1]
                since = previous_commit if previous_commit is not None else -1
                pool = [s for t in root_traces if t["start"] <= last for s in t["run"].spans]
                reviewed = any(s["kind"] == "AGENT" and s["agent"] == "quality-reviewer"
                               and since < s["end"] <= last for s in pool)
                tested = any(s["kind"] == "TOOL" and s.get("category") == "test" and s["status"] == "ok"
                             and since < s["end"] <= last for s in pool)
                scope = "since the previous commit" if previous_commit is not None else "before the first commit"
                emit(tid, "review_before_commit", int(reviewed),
                     f"{'A' if reviewed else 'No'} review finished {scope}.")
                emit(tid, "tests_run_before_commit", int(tested),
                     f"{'Tests ran' if tested else 'No test run'} {scope}.")
                addressed = edits_after_reviews(pool, since, last)
                if addressed:
                    n_reviews, best = addressed
                    emit(tid, "review_addressed", best,
                         f"{_plural(n_reviews, 'review')} {scope}; at most {_plural(best, 'edit')} followed one before the next commit.")
                previous_commit = max(s["end"] for s in tools if is_commit(s))
            if edits:
                last_edit = max(s["end"] for s in edits)
                checks = sum(1 for s in tools if is_check(s) and s["start"] >= last_edit)
                emit(tid, "verified_after_last_edit", int(checks > 0),
                     f"{_plural(checks, 'passing test or build run')} after the last of {_plural(len(edits), 'edit')}.")
            if tools:
                streak = longest_failure_streak(spans)
                emit(tid, "stuck_loop", streak, f"Longest run of one tool failing in a row: {streak}.")
            if llms:
                p90 = percentile([s["end"] - s["start"] for s in llms], 90)
                emit(tid, "latency_budget", round(p90 / 1000, 3), f"p90 {p90 / 1000:.1f} s over {len(llms)} steps.")
            if tools:
                generated = sum(s["tokens"][1] + s["tokens"][2] for s in llms)
                per_call = round(generated / len(tools), 1)
                emit(tid, "tokens_per_tool_call", per_call, f"{generated} tokens / {len(tools)} calls.", label=per_call)
            if delegated:
                fan = max_fanout(spans)
                emit(tid, "parallel_fanout", fan, f"{fan} of {_plural(delegated, 'subagent run')} open at once at most.",
                     label=fan)
            share = cache_share(llms)
            if share is not None:
                emit(tid, "cache_reuse", share, f"{round(share * 100, 1)}% of prompt tokens read from the cache.",
                     label=share)
            classes = error_class_counts(spans)
            if classes:
                top = max(classes, key=lambda c: (classes[c], -ERROR_CLASSES.index(c)))
                emit(tid, "error_class", classes[top],
                     ", ".join(f"{n} {c.replace('_', ' ')}" for c, n in classes.items()) + ".", label=top)
    order = {e["id"]: i for i, e in enumerate(EVALUATORS)}
    results.sort(key=lambda r: (r["trace"], order[r["evaluator"]]))
    return results


# ---------------------------------------------------------------- rollups

def agent_path(spans):
    """Distinct agents in order of first appearance."""
    path = []
    for s in sorted((s for s in spans if s["kind"] == "AGENT"), key=lambda s: (s["start"], s["depth"], s["key"])):
        if s["agent"] not in path:
            path.append(s["agent"])
    return path


def agent_edges(spans):
    """(from, to) -> subagent runs started by `from` (through a task call, or attached
    to the turn's root agent when no task call points at the subagent session)."""
    edges = Counter()
    for s in spans:
        if s["kind"] == "AGENT" and s["depth"] > 0:
            edges[(spans[s["parent"]]["agent"], s["agent"])] += 1
    return edges


def edge_list(edges):
    return [{"from": a, "to": b, "count": n} for (a, b), n in sorted(edges.items(), key=lambda kv: (-kv[1], kv[0]))]


def session_rollups(traces, evaluations):
    by_session = {}
    labels = defaultdict(lambda: defaultdict(Counter))
    for e in evaluations:
        if e["label"] in ("pass", "fail"):
            labels[e["trace"]][e["evaluator"]][e["label"]] += 1
    for tr in traces:
        summary = trace_summary(tr)
        row = by_session.setdefault(tr["session"], {"traces": 0, "days": [], "toolCalls": 0, "toolErrors": 0,
                                                    "subagentRuns": 0, "checks": defaultdict(Counter)})
        row["traces"] += 1
        if tr["day"] not in row["days"]:
            row["days"].append(tr["day"])
        for key in ("toolCalls", "toolErrors", "subagentRuns"):
            row[key] += summary[key]
        for evaluator, counts in labels[tr["id"]].items():
            row["checks"][evaluator].update(counts)
    out = {}
    for sid, row in by_session.items():
        checks = {}
        for evaluator in PASS_FAIL:
            c = row["checks"].get(evaluator)
            if c:
                scored = c["pass"] + c["fail"]
                checks[evaluator] = {"pass": c["pass"], "scored": scored, "rate": round(c["pass"] / scored, 4)}
        out[sid] = {**{k: v for k, v in row.items() if k != "checks"}, "checks": checks}
    return out


def rollups(traces, evaluations=()):
    by_day = defaultdict(lambda: Counter())
    by_agent = defaultdict(lambda: {"runs": 0, "llmSteps": 0, "toolCalls": 0, "toolErrors": 0,
                                    "tokens": [0] * 5})
    by_model = defaultdict(lambda: {"llmSteps": 0, "tokens": [0] * 5})
    kind_latency = defaultdict(list)
    tool_latency = defaultdict(list)
    tool_errors = Counter()
    error_classes = Counter()
    graph_nodes = defaultdict(Counter)
    graph_edges = Counter()
    delegations = Counter()
    bash = Counter()
    rounds = {}
    per_step = []
    for tr in traces:
        day = tr["day"]
        by_day[day]["traces"] += 1
        label = tr["round"] or "unassigned"
        rounds[label] = rounds.get(label, 0) + 1
        graph_edges.update(agent_edges(tr["run"].spans))
        for s in tr["run"].spans:
            kind_latency[s["kind"]].append(s["end"] - s["start"])
            node = graph_nodes[s["agent"]]
            node["spans"] += 1
            node["runs"] += s["kind"] == "AGENT"
            if s["kind"] == "TOOL":
                node["toolCalls"] += 1
                node["toolErrors"] += s["status"] == "error"
                if s["status"] == "error":
                    error_classes[s.get("error_class") or "other"] += 1
            agent = by_agent[s["agent"]]
            if s["kind"] == "AGENT":
                agent["runs"] += 1
                if s["depth"] > 0:
                    delegations[s["agent"]] += 1
                    by_day[day]["subagentRuns"] += 1
            elif s["kind"] == "LLM":
                agent["llmSteps"] += 1
                add_tokens(agent["tokens"], s["tokens"])
                model = by_model[s["model"] or "unknown"]
                model["llmSteps"] += 1
                add_tokens(model["tokens"], s["tokens"])
                by_day[day]["llmSteps"] += 1
                by_day[day]["tokens"] += sum(s["tokens"])
                per_step.append(s["step_tools"])
            elif s["kind"] == "TOOL":
                agent["toolCalls"] += 1
                by_day[day]["toolCalls"] += 1
                tool_latency[s["name"]].append(s["end"] - s["start"])
                if s["status"] == "error":
                    agent["toolErrors"] += 1
                    tool_errors[s["name"]] += 1
                    by_day[day]["toolErrors"] += 1
                if s["name"] == "bash":
                    bash[s["category"]] += 1
    hist = Counter(min(n, 6) for n in per_step)
    totals = {e["id"]: Counter() for e in EVALUATORS if e["output"] == "pass/fail"}
    for e in evaluations:
        if e["evaluator"] in totals:
            totals[e["evaluator"]][e["label"]] += 1
    day_keys = ["traces", "subagentRuns", "llmSteps", "toolCalls", "toolErrors", "tokens"]
    return {
        "byDay": {d: {k: by_day[d][k] for k in day_keys} for d in sorted(by_day)},
        "byRound": dict(rounds),  # in trace order (labels can span two rounds)
        "byAgent": {a: {**v, "tokens": token_dict(v["tokens"])} for a, v in sorted(by_agent.items())},
        "byModel": {m: {**v, "tokens": token_dict(v["tokens"])} for m, v in sorted(by_model.items())},
        "latencyByKind": {k: pct(kind_latency[k]) for k in ("AGENT", "LLM", "TOOL")},
        "tools": {name: {**pct(vals), "errors": tool_errors[name],
                         "errorRate": round(tool_errors[name] / len(vals), 4)}
                  for name, vals in sorted(tool_latency.items(), key=lambda kv: (-len(kv[1]), kv[0]))},
        "delegations": dict(sorted(delegations.items(), key=lambda kv: (-kv[1], kv[0]))),
        "bashCategories": {c: bash[c] for c in BASH_CATEGORIES if bash[c]},
        "toolCallsPerStep": {
            "mean": round(sum(per_step) / len(per_step), 3) if per_step else 0,
            "p50": percentile(per_step, 50), "p90": percentile(per_step, 90),
            "max": max(per_step) if per_step else 0,
            "histogram": {("6+" if n == 6 else str(n)): hist[n] for n in range(7) if hist[n]},
        },
        "errorClasses": {c: error_classes[c] for c in ERROR_CLASSES},
        "checks": {k: {"pass": c["pass"], "fail": c["fail"], "notScored": len(traces) - c["pass"] - c["fail"]}
                   for k, c in totals.items()},
        "sessions": session_rollups(traces, evaluations) if traces and "session" in traces[0] else {},
        "agentGraph": {
            "nodes": [{"agent": a, "runs": n["runs"], "spans": n["spans"], "toolCalls": n["toolCalls"],
                       "toolErrors": n["toolErrors"]}
                      for a, n in sorted(graph_nodes.items(), key=lambda kv: (-kv[1]["spans"], kv[0]))],
            "edges": edge_list(graph_edges),
        },
    }


# ---------------------------------------------------------------- compaction + output

def publish_trace(tr, root_edge, sub_edge, max_errors):
    """Turn raw spans into published spans, merging unremarkable steps into CHAIN spans."""
    spans = tr["run"].spans
    t0 = tr["start"]
    tools_by_step = defaultdict(list)
    for s in spans:
        if s["kind"] == "TOOL":
            tools_by_step[s["step"]].append(s)
    llm_by_parent = defaultdict(list)
    for s in spans:
        if s["kind"] == "LLM":
            llm_by_parent[s["parent"]].append(s)
    hidden = set()
    chains = []
    for parent_key, steps in llm_by_parent.items():
        n = len(steps)
        edge = root_edge if spans[parent_key]["depth"] == 0 else sub_edge
        errors_kept = 0

        def important(i, step):
            nonlocal errors_kept
            calls = tools_by_step[step["key"]]
            if i < edge or i >= n - edge:
                return True
            if any(c["name"] == "task" or c.get("category") == "git-commit" for c in calls):
                return True
            if step["status"] == "error" or any(c["status"] == "error" for c in calls):
                if max_errors is None or errors_kept < max_errors:
                    errors_kept += 1
                    return True
            return False

        run = []
        for i, step in enumerate(steps + [None]):
            mergeable = step is not None and not important(i, step)
            # a merged span holds steps of one agent and one model only
            if mergeable and (not run or (run[0]["agent"], run[0]["model"]) == (step["agent"], step["model"])):
                run.append(step)
                continue
            if len(run) >= 2:
                calls = [c for st in run for c in tools_by_step[st["key"]]]
                tokens = [0] * 5
                for st in run:
                    add_tokens(tokens, st["tokens"])
                models = sorted({st["model"] for st in run if st["model"]})
                chain = {"parent": parent_key, "kind": "CHAIN", "name": "steps",
                         "agent": run[0]["agent"],
                         "model": models[0] if len(models) == 1 else None,
                         "start": run[0]["start"],
                         "end": max([st["end"] for st in run] + [c["end"] for c in calls]),
                         "status": "ok", "tokens": tokens, "steps": len(run),
                         "tools": dict(sorted(Counter(c["name"] for c in calls).items())),
                         "errors": dict(sorted(Counter(c["name"] for c in calls if c["status"] == "error").items())),
                         "error_classes": error_class_counts(calls),
                         "key": ("chain", run[0]["key"])}
                chains.append(chain)
                hidden.update(st["key"] for st in run)
                hidden.update(c["key"] for c in calls)
            run = [step] if mergeable else []
    visible = [s for s in spans if s["key"] not in hidden] + chains
    visible.sort(key=lambda s: (s["start"], 0 if s["kind"] == "AGENT" else 1,
                                s["key"] if isinstance(s["key"], int) else s["key"][1]))
    # parents always come before their children in the published order
    ids = {}
    ordered, placed = [], set()
    children = defaultdict(list)
    for s in visible:
        children[s["parent"]].append(s)

    def place(s):
        ordered.append(s)
        placed.add(id(s))
        for c in children.get(s["key"], []):
            place(c)

    for s in children[None]:
        place(s)
    assert len(ordered) == len(visible), "every span hangs off the root agent"
    for i, s in enumerate(ordered, 1):
        ids[s["key"]] = f"s{i}"
    out = []
    for s in ordered:
        span = {"id": ids[s["key"]], "parent": ids.get(s["parent"]), "kind": s["kind"],
                "name": s["name"], "agent": s["agent"]}
        if s.get("model"):
            span["model"] = s["model"]
        span["start"] = max(0, s["start"] - t0)
        span["end"] = max(span["start"], s["end"] - t0)
        span["status"] = s["status"]
        if s["kind"] == "TOOL" and s.get("category"):
            span["category"] = s["category"]
        if s["kind"] == "TOOL" and s["status"] == "error":
            span["errorClass"] = s.get("error_class") or "other"
        if s["kind"] in ("LLM", "CHAIN"):
            span["tokens"] = token_dict(s["tokens"])
        if s["kind"] == "LLM":
            span["toolCalls"] = s["step_tools"]
        if s["kind"] == "CHAIN":
            span["steps"] = s["steps"]
            span["tools"] = s["tools"]
            if s["errors"]:
                span["errors"] = s["errors"]
                span["errorClasses"] = s["error_classes"]
        out.append(span)
    return out, len(hidden)


def trace_summary(tr):
    spans = tr["run"].spans
    llms = [s for s in spans if s["kind"] == "LLM"]
    tools = [s for s in spans if s["kind"] == "TOOL"]
    tokens = [0] * 5
    for s in llms:
        add_tokens(tokens, s["tokens"])
    return {
        "llmSteps": len(llms), "toolCalls": len(tools),
        "toolErrors": sum(s["status"] == "error" for s in tools),
        "subagentRuns": sum(1 for s in spans if s["kind"] == "AGENT" and s["depth"] > 0),
        "commits": sum(1 for s in tools if s.get("category") == "git-commit" and s["status"] == "ok"),
        "tokens": token_dict(tokens),
    }


def deny_hits(value, path="$"):
    hits = []
    if isinstance(value, dict):
        for k, v in value.items():
            if DENY_RE.search(str(k)):
                hits.append(f"{path} key {k!r}")
            hits += deny_hits(v, f"{path}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            hits += deny_hits(v, f"{path}[{i}]")
    elif isinstance(value, str) and DENY_RE.search(value):
        hits.append(f"{path} = {value!r}")
    return hits


def serialize(doc):
    """Compact JSON with one span per line, so diffs between exports stay readable."""
    dump = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    lines = ["{", f'"meta":{dump(doc["meta"])},', '"traces":[']
    for i, tr in enumerate(doc["traces"]):
        head = {k: v for k, v in tr.items() if k != "spans"}
        body = ",\n".join(dump(s) for s in tr["spans"])
        lines.append(dump(head)[:-1] + ',"spans":[\n' + body + "\n]}" + ("," if i < len(doc["traces"]) - 1 else ""))
    lines.append("],")
    lines.append(f'"evaluators":{dump(doc["evaluators"])},')
    lines.append('"evaluations":[\n' + ",\n".join(dump(e) for e in doc["evaluations"]) + "\n],")
    lines.append(f'"rollups":{dump(doc["rollups"])}')
    lines.append("}")
    return "\n".join(lines) + "\n"


def build_summary(meta, published, evaluations):
    """What the homepage preview needs: per-trace counts, a plain-words topic, the
    pass/fail labels (grouped by evaluator, then by trace), the window and the
    evaluator names."""
    grouped = {e: {} for e in PASS_FAIL}
    for e in evaluations:
        if e["evaluator"] in grouped:
            grouped[e["evaluator"]][e["trace"]] = e["label"]
    return {
        "meta": {"source": "Summary of agent-traces.json, exported by scripts/telemetry/export_traces.py",
                 "window": meta["window"], "traces": meta["traces"]},
        "evaluators": [{"id": e["id"], "name": e["name"], "kind": e["kind"], "output": e["output"]}
                       for e in EVALUATORS],
        "traces": [{"id": t["id"], "day": t["day"], "topic": t["topic"],
                    "toolCalls": t["toolCalls"], "toolErrors": t["toolErrors"]} for t in published],
        "evaluations": grouped,
    }


def serialize_summary(doc):
    dump = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return "\n".join([
        "{",
        f'"meta":{dump(doc["meta"])},',
        f'"evaluators":{dump(doc["evaluators"])},',
        '"traces":[\n' + ",\n".join(dump(t) for t in doc["traces"]) + "\n],",
        '"evaluations":{\n' + ",\n".join(f"{dump(k)}:{dump(v)}" for k, v in doc["evaluations"].items()) + "\n}",
        "}",
    ]) + "\n"


# OpenInference export: one line per published span. Times are ISO strings on a
# synthetic clock: each trace starts at 00:00:00.000Z on its real (local) calendar
# day and every span keeps its offset from the trace start, so the date is real and
# the time of day is not.
def _iso(day, offset_ms):
    base = datetime.fromisoformat(day + "T00:00:00+00:00").timestamp() * 1000
    when = datetime.fromtimestamp((base + offset_ms) / 1000, ZoneInfo("UTC"))
    return when.strftime("%Y-%m-%dT%H:%M:%S.") + f"{when.microsecond // 1000:03d}Z"


def openinference_rows(published):
    rows = []
    for t in published:
        for s in t["spans"]:
            attrs = {"openinference.span.kind": s["kind"], "session.id": t["session"], "agent.name": s["agent"]}
            if s["kind"] == "TOOL":
                attrs["tool.name"] = s["name"]
            if s.get("model"):
                attrs["llm.model_name"] = s["model"]
            if "tokens" in s:
                k = s["tokens"]
                prompt = k["input"] + k["cacheRead"] + k["cacheWrite"]
                completion = k["output"] + k["reasoning"]
                attrs.update({
                    "llm.token_count.prompt": prompt,
                    "llm.token_count.completion": completion,
                    "llm.token_count.total": prompt + completion,
                    "llm.token_count.prompt_details.cache_read": k["cacheRead"],
                    "llm.token_count.prompt_details.cache_write": k["cacheWrite"],
                    "llm.token_count.completion_details.reasoning": k["reasoning"],
                })
            if "errorClass" in s:
                attrs["error.class"] = s["errorClass"]
            # A CHAIN holds merged tool calls: its failed calls are counted, in total and
            # per class, and the row is ERROR when any failed (the JSON keeps status "ok"
            # and the counts in errors / errorClasses).
            failed = sum(s.get("errors", {}).values()) if s["kind"] == "CHAIN" else 0
            if failed:
                attrs["error.count"] = failed
                for c, n in s["errorClasses"].items():
                    attrs[f"error.class.{c}"] = n
            rows.append({
                "trace_id": t["id"], "span_id": f"{t['id']}.{s['id']}",
                "parent_id": f"{t['id']}.{s['parent']}" if s["parent"] else None,
                "name": s["name"], "span_kind": s["kind"],
                "start_time": _iso(t["day"], s["start"]), "end_time": _iso(t["day"], s["end"]),
                "status_code": "ERROR" if s["status"] == "error" or failed else "OK",
                "attributes": attrs,
            })
    return rows


def serialize_jsonl(rows):
    return "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows)


def dataset_id(traces):
    """A short, stable name for this export's set of traces: a hash of each trace's id,
    day, session, duration and tool-call count. Human labels are keyed by trace id, so a
    label file is only valid for the dataset it was made on (a new or re-cut trace
    shifts the ids and changes this value)."""
    digest = hashlib.sha256()
    for tr in traces:
        digest.update(f"{tr['id']}|{tr['day']}|{tr['session']}|{tr['end'] - tr['start']}|"
                      f"{trace_summary(tr)['toolCalls']}\n".encode())
    return digest.hexdigest()[:12]


NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="OpenCode SQLite store (opened read-only)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output JSON path")
    parser.add_argument("--summary-out", type=Path, default=None,
                        help="homepage summary JSON path (default: <out stem>-summary.json next to --out)")
    parser.add_argument("--jsonl-out", type=Path, default=None,
                        help="OpenInference span lines (default: <out stem>.openinference.jsonl next to --out)")
    parser.add_argument("--roots", type=Path, default=DEFAULT_ROOTS,
                        help="root-session config (default: scripts/telemetry/roots.local.json)")
    args = parser.parse_args(argv)
    summary_out = args.summary_out or args.out.with_name(args.out.stem + "-summary.json")
    jsonl_out = args.jsonl_out or args.out.with_name(args.out.stem + ".openinference.jsonl")
    roots = load_roots(args.roots)
    if not args.db.exists():
        raise SystemExit(f"database not found: {args.db}")

    conn = connect(args.db)
    try:
        traces, stats, root_count = build_traces(conn, roots)
    finally:
        conn.close()
    if not traces:
        raise SystemExit("no traces found in the configured windows")

    commits = git_commits() or [(sha, parse_ms(when)) for _, sha, when in ROUNDS]
    table = round_table(commits)
    # pseudonymous session ids in order of the root sessions' creation
    session_order = sorted({(tr["root_created"], tr["root_id"]) for tr in traces})
    session_ids = {root_id: f"S{i}" for i, (_, root_id) in enumerate(session_order, 1)}
    for i, tr in enumerate(traces, 1):
        tr["id"] = f"t{i:02d}"
        tr["day"] = local_day(tr["start"])
        tr["round"] = round_label(table, commits, tr["start"], tr["end"])
        tr["session"] = session_ids[tr["root_id"]]

    evaluations = evaluate(traces)
    roll = rollups(traces, evaluations)
    total_spans = sum(len(tr["run"].spans) for tr in traces)
    subagent_sessions = len(set().union(*(tr["run"].used_children for tr in traces)))

    # most detailed first; the first one that fits the size budget is used
    for root_edge, sub_edge, max_errors in COMPACTION_LADDER:
        published, merged = [], 0
        for tr in traces:
            spans, hidden = publish_trace(tr, root_edge, sub_edge, max_errors)
            merged += hidden
            head = {"id": tr["id"], "day": tr["day"], "session": tr["session"]}
            if tr["round"]:
                head["round"] = tr["round"]
            head["topic"] = TOPICS.get(tr["round"], DEFAULT_TOPIC)
            raw = tr["run"].spans
            head.update({"rootAgent": tr["root"]["agent"], "start": 0, "end": tr["end"] - tr["start"],
                         **trace_summary(tr), "agentPath": agent_path(raw),
                         "agentEdges": edge_list(agent_edges(raw)), "spans": spans})
            published.append(head)
        published_spans = sum(len(t["spans"]) for t in published)
        first, last = traces[0]["start"], max(tr["end"] for tr in traces)
        meta = {
            "title": "Agent runs that built this site",
            "source": "OpenCode session store (local), exported by scripts/telemetry/export_traces.py",
            "generated": local_day(last),
            "dataset": dataset_id(traces),
            "window": {"from": local_day(first), "to": local_day(last)},
            "sessions": root_count,
            "subagentSessions": subagent_sessions,
            "traces": len(published),
            "spans": total_spans,
            "publishedSpans": published_spans,
            "mergedSpans": merged,
            "droppedSpans": stats["dropped"],
            "incompleteSpans": stats["incomplete"],
            "compaction": {"orchestratorEdgeSteps": root_edge, "subagentEdgeSteps": sub_edge,
                           "errorStepsPerRun": max_errors},
            "thresholds": {k: dict(v) for k, v in THRESHOLDS.items()},
            "largeTrace": dict(LARGE_TRACE),
            "errorClasses": ERROR_CLASSES,
            "files": {"openinference": jsonl_out.name, "summary": summary_out.name},
            "notes": [
                f"One trace per user turn in the {NUMBER_WORDS[root_count] if root_count < len(NUMBER_WORDS) else root_count} root session{'s' if root_count != 1 else ''} of the website work; subagent runs nest under the task call that started them. Sessions are numbered S1, S2, … in the order they were created.",
                "Times are milliseconds from the start of each trace. Only the calendar day is kept.",
                "An LLM span is one model step, from its start to the start of its last tool call (an estimate of generation time). TOOL spans are the tool executions.",
                "Published fields are structural only: span kind, generic agent name, model id, allowlisted tool name, times, status and token counts. Prompts, responses, reasoning, tool inputs and outputs, error messages, file names, commands and titles are not included.",
                "Bash calls carry only a category (test, build, git-commit, git-other, server, other) assigned inside the exporter. Failed tool calls carry only an error class (timeout, not_found, permission, test_failure, bad_arguments, network, other) assigned inside the exporter from the error text, which is not kept.",
                f"Tools outside the allowlist were dropped entirely ({stats['dropped']} spans). Unfinished calls ({stats['incomplete']}) were dropped too.",
                "Cost is omitted: the runs used a flat-rate subscription, so a list-price cost would mislead.",
                "Evaluators are deterministic code checks. There is no LLM-as-judge: the exporter has no model access. Every pass/fail evaluation has a numeric score; its label follows from the evaluator's threshold and direction (meta.thresholds).",
                f"Long runs are compacted for size. Kept as single spans: the first and last {root_edge} steps of each orchestrator run and {sub_edge} of each subagent run, every step that delegates or commits, and {f'the first {max_errors} step(s)' if max_errors else 'no step'} with an error in each run beyond those. The steps between are merged into CHAIN spans that keep their step, tool-call, error and token totals. Rollups, trace totals and evaluations use every span before compaction.",
                "Round labels come from commit times in this repository's git history.",
                "meta.dataset is a hash of every trace's id, day, session, duration and tool-call count. Human labels (data/human-labels.json, or a reviewer's download) carry it, and labels made on another dataset are set aside, because trace ids can shift between exports.",
                "Percentiles use the nearest-rank method.",
                "The OpenInference file has one line per published span; its timestamps put each trace's start at midnight UTC on the trace's real calendar day, so only the offsets are real. A merged (CHAIN) row with failed calls carries error.count and error.class.<class> counts and status ERROR, so the file's failed calls add up to the trace totals.",
            ],
        }
        doc = {"meta": meta, "traces": published, "evaluators": EVALUATORS,
               "evaluations": evaluations, "rollups": roll}
        text = serialize(doc)
        if len(text.encode()) <= SIZE_BUDGET:
            break
    else:
        raise SystemExit(f"output is {len(text.encode())} bytes, over the {SIZE_BUDGET} byte budget")

    summary_text = serialize_summary(build_summary(meta, published, evaluations))
    jsonl_text = serialize_jsonl(openinference_rows(published))
    hits = deny_hits(json.loads(text)) + deny_hits(json.loads(summary_text), "summary")
    for i, line in enumerate(jsonl_text.splitlines(), 1):
        hits += deny_hits(json.loads(line), f"jsonl:{i}")
    if hits:
        raise SystemExit("denylist match, nothing written:\n  " + "\n  ".join(hits[:20]))

    for path, body in ((args.out, text), (summary_out, summary_text), (jsonl_out, jsonl_text)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
    print(f"wrote {args.out} ({len(text.encode())} bytes): {len(published)} traces, "
          f"{total_spans} spans ({published_spans} published, {merged} merged), "
          f"{stats['dropped']} dropped, {subagent_sessions} subagent sessions; "
          f"{summary_out.name} ({len(summary_text.encode())} bytes); "
          f"{jsonl_out.name} ({len(jsonl_text.encode())} bytes)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
