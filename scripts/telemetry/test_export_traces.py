"""Tests for export_traces.py on a synthetic OpenCode store (standard library only).

Run from the repository root:  python3 -m unittest scripts/telemetry/test_export_traces.py
Kept apart from `npm test`, which does not need Python.
"""

import gzip
import json
import sqlite3
import sys
import tempfile
import unittest
from collections import Counter
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

    def tool(self, sid, mid, tool, start, end, status="completed", command=None, child=None, broken=False,
             error=None, exit_code=None):
        state = {"status": status, "time": {"start": start, "end": end}, "input": {}, "output": "secret output",
                 "title": "secret title", "metadata": {}}
        if command is not None:
            state["input"]["command"] = command
        if status == "error":
            del state["output"]
            state["error"] = error if error is not None else "secret error"
        if exit_code is not None:
            state["metadata"]["exit"] = exit_code
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
    s.tool(root, a1, "read", at(seconds=2), at(seconds=2, milliseconds=5), status="error",
           error="File not found: /Users/someone/secret-plan.txt (see https://corp.example/x)")
    s.tool(root, a1, "read", at(seconds=3), at(seconds=3, milliseconds=5))
    child = s.session("child-one", at(seconds=5), parent=root, agent="implementation-worker")
    s.tool(root, a1, "task", at(seconds=4), at(seconds=50), child=child)
    s.tool(root, a1, "bash", at(seconds=51), at(seconds=52), command="git add -A && git commit -m 'x'", exit_code=0)
    s.tool(root, a1, "atlassian_getJiraIssue", at(seconds=53), at(seconds=54))
    cu = s.user(child, at(seconds=5))
    ca = s.assistant(child, cu, at(seconds=6), at(seconds=40), agent="implementation-worker", model=model)
    s.tool(child, ca, "edit", at(seconds=6, milliseconds=500), at(seconds=6, milliseconds=900))
    s.tool(child, ca, "bash", at(seconds=7), at(seconds=30), command="node --test tests/x.test.js", exit_code=0)
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
                                                 "windows": windows}]}), encoding="utf-8")


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

    def export(self, name="out"):
        out = self.dir / name / "agent-traces.json"
        self.assertEqual(E.main(["--db", str(self.db), "--out", str(out), "--roots", str(self.roots)]), 0)
        return out, out.with_name("agent-traces-summary.json"), out.with_name("agent-traces.openinference.jsonl")

    def test_export_writes_the_full_file_the_summary_and_the_openinference_lines(self):
        out, summary_path, jsonl_path = self.export()
        full = json.loads(out.read_text(encoding="utf-8"))
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        self.assertEqual(full["meta"]["traces"], 1)
        for path in (out, summary_path, jsonl_path):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn('"cost"', text)
            for leak in ("secret", "someone", "corp", "plan.txt", "File not found", "private"):
                self.assertNotIn(leak, text, f"{leak} in {path.name}")
        self.assertEqual([t["id"] for t in summary["traces"]], ["t01"])
        # the synthetic turn comes after the last commit in ROUNDS, so it takes the open round's topic
        self.assertEqual(summary["traces"][0]["topic"], E.TOPICS[E.OPEN_ROUND["label"]])
        self.assertEqual(full["traces"][0]["topic"], E.TOPICS[E.OPEN_ROUND["label"]])
        self.assertEqual(list(summary["evaluations"]), E.PASS_FAIL)
        for labels in summary["evaluations"].values():
            self.assertTrue(all(v in ("pass", "fail") for v in labels.values()))
        self.assertEqual(full["meta"]["thresholds"], E.THRESHOLDS)
        for name in ("agent-traces.json", "agent-traces-summary.json", "agent-traces.openinference.jsonl"):
            self.assertIn(name, json.dumps(full["meta"]["files"]) + "agent-traces.json")

    def test_export_is_byte_identical_on_a_second_run(self):
        first = self.export("one")
        second = self.export("two")
        for a, b in zip(first, second):
            self.assertEqual(a.read_bytes(), b.read_bytes(), f"{a.name}: same store, same bytes")

    def test_error_class_session_and_agent_path_are_published_without_text(self):
        out, _, jsonl_path = self.export()
        full = json.loads(out.read_text(encoding="utf-8"))
        trace = full["traces"][0]
        self.assertEqual(trace["session"], "S1")
        self.assertEqual(trace["agentPath"], ["build", "implementation-worker"])
        self.assertEqual(trace["agentEdges"], [{"from": "build", "to": "implementation-worker", "count": 1}])
        failed = [s for s in trace["spans"] if s["kind"] == "TOOL" and s["status"] == "error"]
        self.assertEqual([(s["name"], s["errorClass"]) for s in failed], [("read", "not_found")])
        self.assertTrue(all("errorClass" not in s for s in trace["spans"] if s["status"] == "ok"))
        roll = full["rollups"]
        self.assertEqual(roll["errorClasses"]["not_found"], 1)
        self.assertEqual(sum(roll["errorClasses"].values()), trace["toolErrors"])
        self.assertEqual(roll["agentGraph"]["edges"], [{"from": "build", "to": "implementation-worker", "count": 1}])
        self.assertEqual({n["agent"] for n in roll["agentGraph"]["nodes"]}, {"build", "implementation-worker"})
        self.assertEqual(roll["sessions"]["S1"]["traces"], 1)
        self.assertEqual(roll["sessions"]["S1"]["toolCalls"], trace["toolCalls"])
        evals = {e["evaluator"]: e for e in full["evaluations"]}
        self.assertEqual(evals["error_class"]["label"], "not_found")
        self.assertEqual(evals["error_class"]["score"], 1)
        self.assertEqual(evals["verified_after_last_edit"]["label"], "pass", "the subagent's edit was followed by its test run")
        for e in full["evaluations"]:
            if e["label"] in ("pass", "fail"):
                self.assertIsInstance(e["score"], (int, float), e["evaluator"])
                self.assertEqual(E.label_for(e["evaluator"], e["score"]), e["label"], e["evaluator"])
        # one OpenInference line per published span, consistent with the JSON
        lines = [json.loads(line) for line in jsonl_path.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(lines), full["meta"]["publishedSpans"])
        by_id = {f"{trace['id']}.{s['id']}": s for s in trace["spans"]}
        for row in lines:
            span = by_id[row["span_id"]]
            attrs = row["attributes"]
            self.assertEqual(row["span_kind"], span["kind"])
            self.assertEqual(attrs["openinference.span.kind"], span["kind"])
            self.assertEqual(attrs["session.id"], "S1")
            self.assertEqual(attrs["agent.name"], span["agent"])
            failed = sum(span.get("errors", {}).values()) if span["kind"] == "CHAIN" else 0
            self.assertEqual(row["status_code"], "ERROR" if span["status"] == "error" or failed else "OK")
            self.assertEqual(attrs.get("error.class"), span.get("errorClass"))
            self.assertTrue(row["start_time"].startswith(trace["day"] + "T"))
            start = datetime.fromisoformat(row["start_time"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(row["end_time"].replace("Z", "+00:00"))
            self.assertEqual(round((end - start).total_seconds() * 1000), span["end"] - span["start"])
            self.assertFalse({"input.value", "output.value"} & set(attrs))
            if "tokens" in span:
                k = span["tokens"]
                self.assertEqual(attrs["llm.token_count.prompt"], k["input"] + k["cacheRead"] + k["cacheWrite"])
                self.assertEqual(attrs["llm.token_count.completion"], k["output"] + k["reasoning"])
                self.assertEqual(attrs["llm.token_count.total"],
                                 attrs["llm.token_count.prompt"] + attrs["llm.token_count.completion"])
        self.assertLess(len(gzip.compress(jsonl_path.read_bytes())), len(jsonl_path.read_bytes()))
        # every failed tool call is in the file: one per failed TOOL row plus each CHAIN's error.count
        failed_rows = sum(1 for r in lines if r["span_kind"] == "TOOL" and r["status_code"] == "ERROR")
        failed_rows += sum(r["attributes"].get("error.count", 0) for r in lines if r["span_kind"] == "CHAIN")
        self.assertEqual(failed_rows, sum(t["toolErrors"] for t in full["traces"]))
        # the dataset id: short, stable, and in the meta
        self.assertRegex(full["meta"]["dataset"], r"^[0-9a-f]{12}$")

    def test_dataset_id_changes_when_trace_ids_shift(self):
        def tr(tid, day, end, calls):
            run = run_of(AG(0, end), *[TL("read", i) for i in range(1, calls + 1)])
            return {"id": tid, "day": day, "session": "S1", "start": 0, "end": end, "run": run}
        a = [tr("t01", "2030-01-01", 100, 2), tr("t02", "2030-01-02", 50, 1)]
        self.assertEqual(E.dataset_id(a), E.dataset_id([dict(t) for t in a]))
        shifted = [tr("t01", "2029-12-31", 70, 3), tr("t02", "2030-01-01", 100, 2), tr("t03", "2030-01-02", 50, 1)]
        self.assertNotEqual(E.dataset_id(a), E.dataset_id(shifted))
        self.assertNotEqual(E.dataset_id(a), E.dataset_id(a[:1]))

    def test_openinference_chain_rows_carry_their_failed_calls(self):
        published = [{"id": "t01", "day": "2030-01-01", "session": "S1", "spans": [
            {"id": "s1", "parent": None, "kind": "AGENT", "name": "build", "agent": "build", "start": 0, "end": 9, "status": "ok"},
            {"id": "s2", "parent": "s1", "kind": "CHAIN", "name": "steps", "agent": "build", "start": 1, "end": 8, "status": "ok",
             "tokens": {"input": 1, "output": 1, "reasoning": 0, "cacheRead": 0, "cacheWrite": 0}, "steps": 3,
             "tools": {"read": 4, "bash": 2}, "errors": {"read": 2, "bash": 1}, "errorClasses": {"not_found": 2, "other": 1}},
            {"id": "s3", "parent": "s1", "kind": "CHAIN", "name": "steps", "agent": "build", "start": 8, "end": 9, "status": "ok",
             "tokens": {"input": 1, "output": 1, "reasoning": 0, "cacheRead": 0, "cacheWrite": 0}, "steps": 2, "tools": {"read": 2}},
            {"id": "s4", "parent": "s1", "kind": "TOOL", "name": "read", "agent": "build", "start": 9, "end": 9, "status": "error",
             "errorClass": "timeout"},
        ]}]
        rows = {r["span_id"]: r for r in E.openinference_rows(published)}
        chain = rows["t01.s2"]
        self.assertEqual(chain["status_code"], "ERROR")
        self.assertEqual(chain["attributes"]["error.count"], 3)
        self.assertEqual((chain["attributes"]["error.class.not_found"], chain["attributes"]["error.class.other"]), (2, 1))
        clean = rows["t01.s3"]
        self.assertEqual(clean["status_code"], "OK")
        self.assertFalse([k for k in clean["attributes"] if k.startswith("error.")])
        self.assertEqual((rows["t01.s4"]["status_code"], rows["t01.s4"]["attributes"]["error.class"]), ("ERROR", "timeout"))
        self.assertNotIn("error.count", rows["t01.s4"]["attributes"])

    def test_the_open_round_has_no_end_date(self):
        table = [("Round 1", 1_000)]
        self.assertNotIn("until", E.OPEN_ROUND)
        self.assertEqual(E.round_label(table, [], 500, 600), "Round 1")
        self.assertEqual(E.round_label(table, [], 2_000, 3_000), E.OPEN_ROUND["label"])
        self.assertEqual(E.round_label(table, [], 10 ** 13, 10 ** 13 + 1), E.OPEN_ROUND["label"], "no date makes it stale")

    def test_a_denylisted_string_aborts_and_writes_nothing(self):
        db = self.dir / "leaky.db"
        build_store(db, model="corp-model@example")
        out = self.dir / "leak" / "agent-traces.json"
        with self.assertRaises(SystemExit) as raised:
            E.main(["--db", str(db), "--out", str(out), "--roots", str(self.roots)])
        self.assertIn("denylist", str(raised.exception))
        self.assertFalse(out.exists())
        self.assertFalse(out.with_name("agent-traces-summary.json").exists())
        self.assertFalse(out.with_name("agent-traces.openinference.jsonl").exists())

    def test_deny_hits_cover_the_new_fields(self):
        self.assertTrue(E.deny_hits({"errorClass": "see http://x"}))
        self.assertTrue(E.deny_hits({"session": "ses_abc"}))
        self.assertTrue(E.deny_hits({"agentPath": ["build", "jira-bot"]}))
        self.assertTrue(E.deny_hits({"attributes": {"error.class": "/Users/x"}}))
        self.assertFalse(E.deny_hits({"errorClass": "not_found", "session": "S1",
                                      "start_time": "2030-01-01T00:00:01.250Z"}))


def run_of(*specs):
    """A synthetic trace: specs are dicts of raw span fields; `parent` indexes an earlier spec."""
    run = E.Run(None, Counter())
    for spec in specs:
        span = {"parent": None, "agent": "build", "status": "ok", "depth": 0, "category": None,
                "error_class": None, "exit": None, "tokens": [0] * 5, **spec}
        span.setdefault("name", span["agent"] if span["kind"] == "AGENT" else "llm")
        run.add(**span)
    return run


def AG(start, end, agent="build", depth=0, parent=None):
    return {"kind": "AGENT", "agent": agent, "name": agent, "start": start, "end": end, "depth": depth, "parent": parent}


def TL(name, start, end=None, parent=0, agent="build", status="ok", **extra):
    return {"kind": "TOOL", "name": name, "start": start, "end": end if end is not None else start + 1,
            "parent": parent, "agent": agent, "status": status, **extra}


def LLM(start, end, tokens=(10, 20, 5, 100, 7), parent=0):
    return {"kind": "LLM", "name": "llm", "start": start, "end": end, "parent": parent, "tokens": list(tokens)}


def evals(*specs, root="r", tid="t01"):
    run = run_of(*specs)
    tr = {"id": tid, "run": run, "root_id": root, "start": 0, "end": max(s["end"] for s in run.spans)}
    return {e["evaluator"]: e for e in E.evaluate([tr])}


class EvaluatorTest(unittest.TestCase):
    def test_classify_error_on_synthetic_strings(self):
        cases = {
            "MCP error -32001: Request timed out": "timeout",
            "Navigation timeout of 10000 ms exceeded": "timeout",
            "File not found: /tmp/x.txt": "not_found",
            "Error: No page found": "not_found",
            "StatusCode: non 2xx status code (404 GET x)": "not_found",
            "Error: Cannot read properties of null (reading 'click')": "not_found",
            "TypeError: Cannot read properties of undefined (reading 'x')": "other",
            "ReferenceError: foo is not defined": "other",
            "TypeError: x.timeout is not a function": "other",
            "HTTP 404 Not Found": "not_found",
            "HTTP/1.1 403 Forbidden": "permission",
            "status: 401": "permission",
            "code 429 from the server": "network",
            "expected 404 rows, got 403": "bad_arguments",
            "line 503: unexpected end": "other",
            "The user has specified a rule which prevents you from using this specific tool call.": "permission",
            "EACCES: permission denied, open 'x'": "permission",
            "StatusCode: non 2xx status code (403 GET x)": "permission",
            "AssertionError [ERR_ASSERTION]: expected 1 to equal 2": "test_failure",
            "# fail 3": "test_failure",
            "The question tool was called with invalid arguments: SchemaError(Missing key)": "bad_arguments",
            "Could not find oldString in the file.": "bad_arguments",
            "No changes to apply: oldString and newString are identical.": "bad_arguments",
            "connect ECONNREFUSED 127.0.0.1:4183": "network",
            "StatusCode: non 2xx status code (503 GET x)": "network",
            "Could not connect to Chrome.": "network",
            "Tool execution aborted": "other",
            "": "other",
            None: "other",
        }
        for text, expected in cases.items():
            self.assertEqual(E.classify_error(text), expected, text)
        self.assertEqual(set(E.ERROR_CLASSES), {n for n, _ in E.ERROR_RULES} | {"other"})

    def test_every_pass_fail_evaluator_has_a_threshold_and_scores_follow_it(self):
        for e in E.EVALUATORS:
            if e["output"] == "pass/fail":
                self.assertIn(e["direction"], ("atMost", "below", "atLeast"), e["id"])
                self.assertIsInstance(e["threshold"], (int, float), e["id"])
        self.assertEqual(E.label_for("tool_error_rate", 0.1), "pass")
        self.assertEqual(E.label_for("tool_error_rate", 0.1001), "fail")
        self.assertEqual(E.label_for("latency_budget", 30), "fail")
        self.assertEqual(E.label_for("stuck_loop", 2), "pass")
        self.assertEqual(E.label_for("stuck_loop", 3), "fail")
        self.assertNotIn("delegation_used", {e["id"] for e in E.EVALUATORS})

    def test_delegation_fit_scores_only_large_traces(self):
        small = evals(AG(0, 100), *[TL("read", i) for i in range(1, 6)], TL("edit", 7))
        self.assertNotIn("delegation_fit", small)
        by_calls = evals(AG(0, 100), *[TL("read", i) for i in range(1, 41)])
        self.assertEqual((by_calls["delegation_fit"]["label"], by_calls["delegation_fit"]["score"]), ("fail", 0))
        # 3 edits by the orchestrator, 1 task call; the subagent makes 1 of the 5 calls
        token = evals(AG(0, 100), TL("edit", 1), TL("write", 2), TL("edit", 2.5), TL("task", 3, 50),
                      AG(4, 50, "implementation-worker", 1, parent=4),
                      TL("edit", 5, parent=5, agent="implementation-worker", depth=1))
        self.assertEqual((token["delegation_fit"]["label"], token["delegation_fit"]["score"]), ("fail", 0.2),
                         "one subagent run that did little does not pass")
        self.assertEqual(token["delegation_fit"]["explanation"], "5 tool calls, 4 edits; 1 made by subagents in 1 run.")
        # the orchestrator makes 2 calls (the task call included), the subagent 3
        most = evals(AG(0, 100), TL("read", 1), TL("task", 3, 50), AG(4, 50, "implementation-worker", 1, parent=2),
                     *[TL("edit", 5 + i, parent=2, agent="implementation-worker", depth=1) for i in range(3)])
        self.assertEqual((most["delegation_fit"]["label"], most["delegation_fit"]["score"]), ("pass", 0.6))
        self.assertEqual(E.label_for("delegation_fit", 0.5), "pass")
        self.assertEqual(E.label_for("delegation_fit", 0.4999), "fail")

    def test_verified_after_last_edit(self):
        test = dict(category="test")
        ok = evals(AG(0, 100), TL("edit", 1), TL("bash", 5, 8, exit=0, **test))
        self.assertEqual((ok["verified_after_last_edit"]["label"], ok["verified_after_last_edit"]["score"]), ("pass", 1))
        failed_exit = evals(AG(0, 100), TL("edit", 1), TL("bash", 5, 8, exit=1, **test))
        self.assertEqual(failed_exit["verified_after_last_edit"]["label"], "fail")
        before = evals(AG(0, 100), TL("bash", 1, 2, category="build"), TL("edit", 5))
        self.assertEqual(before["verified_after_last_edit"]["label"], "fail")
        unrelated = evals(AG(0, 100), TL("edit", 1), TL("bash", 5, category="git-other"))
        self.assertEqual(unrelated["verified_after_last_edit"]["label"], "fail")
        sub = evals(AG(0, 100), TL("task", 1, 50), AG(2, 50, "implementation-worker", 1, parent=1),
                    TL("write", 3, parent=2, agent="implementation-worker"),
                    TL("bash", 10, 20, parent=2, agent="implementation-worker", category="build"))
        self.assertEqual(sub["verified_after_last_edit"]["label"], "pass", "edits and checks inside subagents count")
        failed_edit_only = evals(AG(0, 100), TL("edit", 1, status="error"))
        self.assertNotIn("verified_after_last_edit", failed_edit_only)

    def test_stuck_loop(self):
        err = dict(status="error", error_class="timeout")
        stuck = evals(AG(0, 100), TL("read", 1, **err), TL("read", 2, **err), TL("read", 3, **err), TL("read", 4))
        self.assertEqual((stuck["stuck_loop"]["label"], stuck["stuck_loop"]["score"]), ("fail", 3))
        broken = evals(AG(0, 100), TL("read", 1, **err), TL("read", 2, **err), TL("grep", 3, **err), TL("read", 4, **err))
        self.assertEqual((broken["stuck_loop"]["label"], broken["stuck_loop"]["score"]), ("pass", 2))
        split = evals(AG(0, 100), TL("task", 0.5, 50), TL("read", 1, **err), AG(2, 50, "general", 1, parent=1),
                      TL("read", 3, parent=3, agent="general", **err), TL("read", 5, **err))
        self.assertEqual(split["stuck_loop"]["score"], 2, "streaks are counted per agent run")
        clean = evals(AG(0, 100), TL("read", 1))
        self.assertEqual((clean["stuck_loop"]["label"], clean["stuck_loop"]["score"]), ("pass", 0))
        self.assertNotIn("stuck_loop", evals(AG(0, 100), LLM(1, 2)))

    def test_review_addressed(self):
        commit = dict(category="git-commit")
        review = [TL("task", 1, 20), AG(2, 20, "quality-reviewer", 1, parent=1)]
        fixed = evals(AG(0, 100), *review, TL("edit", 25), TL("edit", 26), TL("bash", 30, **commit))
        self.assertEqual((fixed["review_addressed"]["label"], fixed["review_addressed"]["score"]), ("pass", 2))
        self.assertEqual(fixed["review_before_commit"]["score"], 1)
        clean = evals(AG(0, 100), *review, TL("bash", 30, **commit), TL("edit", 40))
        self.assertEqual((clean["review_addressed"]["label"], clean["review_addressed"]["score"]), ("fail", 0))
        unreviewed = evals(AG(0, 100), TL("edit", 2), TL("bash", 30, **commit))
        self.assertNotIn("review_addressed", unreviewed)
        self.assertEqual((unreviewed["review_before_commit"]["label"], unreviewed["review_before_commit"]["score"]), ("fail", 0))

    def test_parallel_fanout_and_cache_reuse(self):
        three = evals(AG(0, 100), TL("task", 1, 50), TL("task", 1, 40), TL("task", 45, 60),
                      AG(2, 50, "implementation-worker", 1, parent=1), AG(3, 40, "general", 1, parent=2),
                      AG(46, 60, "quality-reviewer", 1, parent=3), LLM(0, 1, tokens=(10, 1, 0, 80, 10)))
        self.assertEqual((three["parallel_fanout"]["label"], three["parallel_fanout"]["score"]), (2, 2))
        self.assertEqual(three["cache_reuse"]["score"], 0.8)
        self.assertNotIn("parallel_fanout", evals(AG(0, 100), LLM(0, 1)))
        self.assertNotIn("cache_reuse", evals(AG(0, 100), TL("read", 1)))

    def test_error_class_evaluation_takes_the_most_common_class(self):
        ev = evals(AG(0, 100), TL("read", 1, status="error", error_class="not_found"),
                   TL("bash", 2, status="error", error_class="permission"),
                   TL("grep", 3, status="error", error_class="permission"), TL("read", 4))
        self.assertEqual((ev["error_class"]["label"], ev["error_class"]["score"]), ("permission", 2))
        self.assertEqual(ev["error_class"]["explanation"], "1 not found, 2 permission.")
        self.assertNotIn("error_class", evals(AG(0, 100), TL("read", 1)))

    def test_agent_path_and_edges(self):
        run = run_of(AG(0, 100), TL("task", 1, 50), AG(2, 50, "implementation-worker", 1, parent=1),
                     TL("task", 3, 40, parent=2, agent="implementation-worker"),
                     AG(4, 40, "general", 2, parent=3), TL("task", 60, 70), AG(61, 70, "implementation-worker", 1, parent=5))
        self.assertEqual(E.agent_path(run.spans), ["build", "implementation-worker", "general"])
        self.assertEqual(E.agent_edges(run.spans), Counter({("build", "implementation-worker"): 2,
                                                             ("implementation-worker", "general"): 1}))
        self.assertEqual(E.max_fanout(run.spans), 2)

if __name__ == "__main__":
    unittest.main()
