"""Tests for export_traces.py on a synthetic OpenCode store (standard library only).

Run from the repository root:  python3 -m unittest scripts/telemetry/test_export_traces.py
Kept apart from `npm test`, which does not need Python.
"""

import json
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_traces as E  # noqa: E402

TZ = ZoneInfo("America/New_York")
T0 = datetime(2030, 1, 1, 10, 0, tzinfo=TZ)
BROKEN = "{not json"  # json_extract raises on this, so reading such a row fails the test


def ms(when):
    return round(when.timestamp() * 1000)


def at(**delta):
    return ms(T0 + timedelta(**delta))


class Store:
    """A minimal OpenCode-shaped SQLite file with the tables the exporter may and may not read."""

    def __init__(self, path):
        self.path = path
        self.db = sqlite3.connect(path)
        self.db.executescript("""
            create table session (id text primary key, project_id text, parent_id text, slug text,
              title text, agent text, time_created integer, time_updated integer);
            create table message (id text primary key, session_id text, time_created integer,
              time_updated integer, data text);
            create table part (id text primary key, message_id text, session_id text,
              time_created integer, time_updated integer, data text);
            create table account (id text primary key, token text);
            insert into account values ('a1', 'not-a-real-token');
        """)
        self.n = 0

    def _id(self, prefix):
        self.n += 1
        return f"{prefix}{self.n:04d}"

    def session(self, slug, created, parent=None, agent="build", title="private title"):
        sid = self._id("s")
        self.db.execute("insert into session values (?,?,?,?,?,?,?,?)",
                        (sid, "p", parent, slug, title, agent, created, created))
        return sid

    def user(self, sid, created, broken=False):
        mid = self._id("m")
        data = BROKEN if broken else json.dumps({"role": "user", "time": {"created": created}, "agent": "build"})
        self.db.execute("insert into message values (?,?,?,?,?)", (mid, sid, created, created, data))
        return mid

    def assistant(self, sid, parent, created, completed, agent="build", model="test-model", broken=False):
        mid = self._id("m")
        data = BROKEN if broken else json.dumps({
            "role": "assistant", "parentID": parent, "agent": agent, "mode": agent, "modelID": model,
            "providerID": "test", "cost": 1.5, "time": {"created": created, "completed": completed},
            "tokens": {"input": 10, "output": 20, "reasoning": 5, "cache": {"read": 100, "write": 7}},
        })
        self.db.execute("insert into message values (?,?,?,?,?)", (mid, sid, created, completed, data))
        return mid

    def tool(self, sid, mid, tool, start, end, status="completed", command=None, child=None, broken=False):
        state = {"status": status, "time": {"start": start, "end": end}, "input": {}, "output": "secret output",
                 "title": "secret title", "metadata": {}}
        if command is not None:
            state["input"]["command"] = command
        if child is not None:
            state["metadata"]["sessionId"] = child
        data = BROKEN if broken else json.dumps({"type": "tool", "tool": tool, "callID": "c", "state": state})
        self.db.execute("insert into part values (?,?,?,?,?,?)", (self._id("p"), mid, sid, start, end, data))

    def text(self, sid, mid, created, broken=False):
        data = BROKEN if broken else json.dumps({"type": "text", "text": "private words"})
        self.db.execute("insert into part values (?,?,?,?,?,?)", (self._id("p"), mid, sid, created, created, data))

    def close(self):
        self.db.commit()
        self.db.close()


def build_store(path, model="test-model"):
    """One root session: a turn before the window, one inside it (with a commit, a failed read
    and a delegated subagent that runs tests) and one after it (with its own subagent). Rows of
    the excluded turns and their subagent hold malformed JSON, so reading them would fail."""
    s = Store(path)
    root = s.session("root-one", at(hours=-2))
    # before the window
    u0 = s.user(root, at(hours=-1), broken=True)
    a0 = s.assistant(root, u0, at(hours=-1, seconds=1), at(hours=-1, seconds=9), broken=True)
    s.tool(root, a0, "bash", at(hours=-1, seconds=2), at(hours=-1, seconds=3), broken=True)
    # inside the window
    u1 = s.user(root, at(seconds=0))
    a1 = s.assistant(root, u1, at(seconds=1), at(seconds=60), model=model)
    s.text(root, a1, at(seconds=1))
    s.tool(root, a1, "read", at(seconds=2), at(seconds=2, milliseconds=5), status="error")
    s.tool(root, a1, "read", at(seconds=3), at(seconds=3, milliseconds=5))
    child = s.session("child-one", at(seconds=5), parent=root, agent="implementation-worker")
    s.tool(root, a1, "task", at(seconds=4), at(seconds=50), child=child)
    s.tool(root, a1, "bash", at(seconds=51), at(seconds=52), command="git add -A && git commit -m 'x'")
    s.tool(root, a1, "atlassian_getJiraIssue", at(seconds=53), at(seconds=54))
    cu = s.user(child, at(seconds=5))
    ca = s.assistant(child, cu, at(seconds=6), at(seconds=40), agent="implementation-worker", model=model)
    s.tool(child, ca, "bash", at(seconds=7), at(seconds=30), command="node --test tests/x.test.js")
    # after the window
    u2 = s.user(root, at(hours=1), broken=True)
    a2 = s.assistant(root, u2, at(hours=1, seconds=1), at(hours=1, seconds=90), broken=True)
    late = s.session("child-two", at(hours=1, seconds=5), parent=root, agent="quality-reviewer")
    s.tool(root, a2, "task", at(hours=1, seconds=4), at(hours=1, seconds=80), child=late, broken=True)
    lu = s.user(late, at(hours=1, seconds=5), broken=True)
    s.assistant(late, lu, at(hours=1, seconds=6), at(hours=1, seconds=70), broken=True)
    s.close()


def write_roots(path, windows=None):
    windows = windows or [{"from": (T0 - timedelta(minutes=10)).isoformat(),
                           "to": (T0 + timedelta(minutes=30)).isoformat()}]
    Path(path).write_text(json.dumps({"roots": [{"slug": "root-one", "created": "2030-01-01",
                                                 "windows": windows}]}))


class ExporterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.db = self.dir / "store.db"
        self.roots = self.dir / "roots.json"
        build_store(self.db)
        write_roots(self.roots)

    def tearDown(self):
        self.tmp.cleanup()

    def test_authorizer_refuses_columns_and_tables_outside_the_allowlist(self):
        conn = E.connect(self.db)
        try:
            for sql in ("select title from session", "select * from session", "select token from account",
                        "select count(*) from account", "select project_id from session"):
                with self.assertRaises(sqlite3.DatabaseError, msg=sql):
                    conn.execute(sql).fetchall()
            self.assertEqual(conn.execute("select count(*) from session where slug = 'root-one'").fetchone()[0], 1)
            with self.assertRaises(sqlite3.DatabaseError):  # read-only, and writes are refused anyway
                conn.execute("delete from message")
        finally:
            conn.close()

    def test_json_paths_are_checked_against_the_allowlist(self):
        E.check_json_paths()
        with self.assertRaises(SystemExit):
            E.check_json_paths({"part": ["select json_extract(data, '$.state.output') from part"]})
        with self.assertRaises(SystemExit):
            E.check_json_paths({"message": ["select json_extract(data, ?) from message"]})
        with self.assertRaises(SystemExit):
            E.check_json_paths({"account": ["select json_extract(data, '$.role') from account"]})

    def test_turns_outside_the_windows_and_their_subagents_are_excluded_and_never_read(self):
        conn = E.connect(self.db)
        try:
            traces, stats, roots = E.build_traces(conn, E.load_roots(self.roots))
        finally:
            conn.close()
        self.assertEqual(roots, 1)
        self.assertEqual(len(traces), 1)
        spans = traces[0]["run"].spans
        agents = sorted(s["agent"] for s in spans if s["kind"] == "AGENT")
        self.assertEqual(agents, ["build", "implementation-worker"])
        self.assertNotIn("quality-reviewer", {s["agent"] for s in spans})
        self.assertEqual(len(traces[0]["run"].used_children), 1)
        tools = [(s["name"], s["status"], s.get("category")) for s in spans if s["kind"] == "TOOL"]
        self.assertIn(("bash", "ok", "git-commit"), tools)
        self.assertIn(("bash", "ok", "test"), tools)
        self.assertIn(("read", "error", None), tools)
        self.assertEqual(stats["dropped"], 1, "the non-allowlisted tool is dropped")

    def test_every_window_needs_an_explicit_end(self):
        for window in ({"from": T0.isoformat()}, {"from": T0.isoformat(), "to": None},
                       {"from": T0.isoformat(), "to": T0.isoformat()},
                       {"from": "2030-01-01T09:00:00", "to": "2030-01-01T11:00:00"}):
            write_roots(self.roots, [window])
            with self.assertRaises(SystemExit, msg=window):
                E.load_roots(self.roots)
        with self.assertRaises(SystemExit):
            E.load_roots(self.dir / "missing.json")

    def test_a_turn_after_the_configured_end_aborts(self):
        root = E.load_roots(self.roots)[0]
        E.check_turns(root, [at(seconds=0)])
        with self.assertRaises(SystemExit):
            E.check_turns(root, [at(seconds=0), at(hours=1)])
        with self.assertRaises(SystemExit):
            E.check_turns(root, [at(minutes=-20)])

    def test_classify_bash(self):
        cases = {
            "git add -A && git commit -m 'x'": "git-commit",
            "git -C repo commit --amend --no-edit": "git-commit",
            "npm test": "test",
            "node --test tests/a.test.js": "test",
            "npm run -s check && npm run build": "build",
            "node --check web/app.js": "build",
            "git status --short": "git-other",
            "git log --oneline | grep commit": "git-other",
            "node scripts/serve.mjs &": "server",
            "curl -s http://127.0.0.1:4183/": "server",
            "ls -la": "other",
            "": "other",
            None: "other",
        }
        for command, category in cases.items():
            self.assertEqual(E.classify_bash(command), category, command)

    def test_export_writes_the_full_file_and_the_summary(self):
        out = self.dir / "out" / "agent-traces.json"
        self.assertEqual(E.main(["--db", str(self.db), "--out", str(out), "--roots", str(self.roots)]), 0)
        full = json.loads(out.read_text())
        summary = json.loads((self.dir / "out" / "agent-traces-summary.json").read_text())
        self.assertEqual(full["meta"]["traces"], 1)
        self.assertNotIn('"cost"', out.read_text())
        self.assertNotIn("secret", out.read_text())
        self.assertEqual([t["id"] for t in summary["traces"]], ["t01"])
        self.assertEqual(summary["traces"][0]["topic"], E.DEFAULT_TOPIC)
        self.assertTrue(all(e["label"] in ("pass", "fail") for e in summary["evaluations"]))
        again = self.dir / "again.json"
        E.main(["--db", str(self.db), "--out", str(again), "--roots", str(self.roots)])
        self.assertEqual(again.read_bytes(), out.read_bytes(), "same store, same bytes")

    def test_a_denylisted_string_aborts_and_writes_nothing(self):
        db = self.dir / "leaky.db"
        build_store(db, model="corp-model@example")
        out = self.dir / "leak" / "agent-traces.json"
        with self.assertRaises(SystemExit) as raised:
            E.main(["--db", str(db), "--out", str(out), "--roots", str(self.roots)])
        self.assertIn("denylist", str(raised.exception))
        self.assertFalse(out.exists())
        self.assertFalse(out.with_name("agent-traces-summary.json").exists())


if __name__ == "__main__":
    unittest.main()
