# Agent trace export

`export_traces.py` turns the local OpenCode session store into two files for the
agent observability lab:

- `web/lab/data/agent-traces.json`: OpenInference-shaped traces of the agent runs
  that built this site, with code-evaluator results and rollups.
- `web/lab/data/agent-traces-summary.json`: the small cut the homepage preview
  loads (per-trace id, day, plain-words topic, tool calls and errors; the
  pass/fail evaluations; the window; evaluator ids and names).

Both are public, so the exporter publishes structure and numbers only.

```sh
python3 scripts/telemetry/export_traces.py [--db PATH] [--out PATH] [--summary-out PATH] [--roots PATH]
node --test tests/agent-traces.test.js            # the published files
python3 -m unittest scripts/telemetry/test_export_traces.py   # the exporter, on a synthetic store
```

Defaults: `--db ~/.local/share/opencode/opencode.db`,
`--out web/lab/data/agent-traces.json`, the summary next to it as
`agent-traces-summary.json`, `--roots scripts/telemetry/roots.local.json`.
Python 3.9+ standard library only. `npm test` does not need Python; the unit test
runs separately.

The same database, root config and git history give byte-identical files (stable
ids, fixed ordering; the "generated" date is the last day in the data, not the
clock). Without the root config the exporter prints how to create it and exits
non-zero.

## Root config (local only)

Which sessions count as work on this site is private, so it lives in
`scripts/telemetry/roots.local.json`, which is git-ignored. The format is in
`roots.example.json` (fake values):

- `slug` and `created`: the OpenCode slug of a top-level session and its local
  creation date (slugs repeat).
- `windows`: one or more `{from, to}` ranges, both required, ISO 8601 with a UTC
  offset, `to` excluded, not overlapping. A session that was only about the site
  gets one window around all of it; a session that mixed in other work gets one
  window per stretch of site work, each starting before the turn that begins it
  and ending before the next turn about something else.
- `note`: free text for the owner, never read into the output.

Selection rules:

- Root sessions are chosen by reading their transcripts: only sessions whose turns
  were about this site, conservatively.
- A turn still running at export time is left out, so the files do not change
  when the session continues.
- Subagent sessions come in through the `task` calls made inside included turns
  (only the child's steps that ran during that call, because a task can resume an
  earlier session), or, if no task call points at them, by being created during an
  included turn.
- The exporter aborts if a turn it would include starts outside its root's
  windows or after the root's last configured end.

## What it reads

- The database is opened read-only (`file:...?mode=ro`) and never copied.
- A SQLite authorizer refuses reads of any table or column outside this list, and
  any statement other than a read:
  - `session`: `id`, `parent_id`, `slug`, `agent`, `time_created`
  - `message`: `id`, `session_id`, `time_created`, `data`
  - `part`: `id`, `message_id`, `session_id`, `time_created`, `data`
- The authorizer cannot see inside the JSON `data` column. So every
  `json_extract` path in the queries is checked against `ALLOWED_JSON_PATHS`
  before any query runs, and a non-literal or unlisted path aborts the export:
  - message: role, parent message, agent, model id, created and completed times,
    token counts, error name. Not cost.
  - part: type, tool name, status, start and end, the child session of a `task`
    call, and for `bash` calls the command, which is classified in memory and
    discarded.
- Messages, parts and child sessions are filtered by `time_created` in SQL, so
  rows outside the windows are never read. JSON is extracted only in the select
  list, i.e. for rows that passed the filter. The unit test puts malformed JSON in
  every excluded row to prove it.
- Text, reasoning, prompts, titles and tool outputs are never extracted.

## Trace model

- One **trace** per included user turn. `day` is the local calendar day;
  `start` is 0 and every span time is milliseconds from the user message.
- **AGENT** span: the root agent's answer to the turn (`build`, `plan`), and one
  per subagent run, nested under the `task` TOOL span that started it.
- **LLM** span: one model step (one assistant message), from its start to the
  start of its last tool call, an estimate of generation time. `toolCalls` is
  the number of tool calls it made. Tokens: input, output, reasoning, cacheRead,
  cacheWrite.
- **TOOL** span: one tool execution, sibling of the LLM step under its agent.
- **CHAIN** span (`name: "steps"`): consecutive steps of one agent and model
  merged for size, with their step count, tool-call counts per tool, error counts
  and summed tokens.
- `round` is inferred from git: each build round ends at a commit (table
  `ROUNDS`); a trace takes the rounds of the commits made while it ran (e.g.
  "Round 7–8"), otherwise the round its start falls in. The summary replaces it
  with a plain-words topic (`TOPICS`, which must match `TOPICS` in
  `web/lab/obs-data.js`; the node tests check every trace).

## Privacy rules

- Tool names come from an allowlist: `bash read edit write glob grep task
  todowrite question skill webfetch`, and `chrome-devtools_<action>` becomes
  `browser.<action>`. Any other tool is dropped entirely and only counted
  (`meta.droppedSpans`).
- Agent names come from an allowlist of generic OpenCode agent types; anything
  else would become `other`.
- Bash commands are reduced to one category: `git-commit`, `test` (node --test,
  npm test, the browser harness and headless tour runs), `build` (npm run
  build/check, node --check), `git-other`, `server` (local server and port
  checks), `other`. First match wins in that order.
- No cost: the runs used a flat-rate subscription, so a list-price figure would
  mislead.
- Before writing, every key and string in both files is checked against
  `DENYLIST` in the script (internal names, ticket prefixes, home paths, URLs,
  `@`, emails, id prefixes, long opaque ids) and the local account name. Any match
  aborts the export and nothing is written. The node test repeats the scan.

## Size

The full export has about 14,700 spans; the budget is 300 KB. Rollups, trace
totals and evaluations are computed from every span. The published spans are
then compacted with the most detailed setting that fits (`COMPACTION_LADDER`,
recorded in `meta.compaction`): the first and last steps of each orchestrator
run, every step that delegates or commits, and the first error step of each run
stay as single spans; the rest become CHAIN spans. All traces are kept. Counts
and tokens stay exact; per-span latency inside a CHAIN is not published. The
summary is about 25 KB.

## Evaluators (code only)

There is no LLM-as-judge: the exporter has no model access. Each check is
deterministic and scored per trace; rows are emitted only where the check
applies.

| id | Pass when | Applies to |
| --- | --- | --- |
| `tool_error_rate` | ≤ 10% of the trace's tool calls returned an error (score = rate) | traces with tool calls |
| `recovered_after_error` | every failed tool call is followed later in the trace by a successful call of the same tool (score = share recovered) | traces with an error |
| `delegation_used` | the trace has at least one subagent run (score = runs) | all traces |
| `review_before_commit` | a quality-reviewer run finished after the previous commit in the same root session (or the window start) and before this trace's last commit | traces that commit |
| `tests_run_before_commit` | a `test`-category bash call finished in that same interval | traces that commit |
| `latency_budget` | p90 of the trace's LLM step latency < 30 s (score = p90 seconds) | traces with LLM steps |
| `tokens_per_tool_call` | number, not pass/fail: (output + reasoning tokens) / tool calls | traces with tool calls |

A commit is a successful bash call in the `git-commit` category.

## Rollups

`byDay`, `byRound`, `byAgent` (runs, steps, tool calls, errors, tokens),
`byModel`, `latencyByKind` and `tools` (n, p50/p90/p99 in ms, errors, error
rate), `delegations` by subagent type, `bashCategories`, and
`toolCallsPerStep` (mean, p50, p90, max, histogram). Percentiles use the
nearest-rank method, so every value is an observed duration. `question` tool
latency includes the time waiting for the owner's answer.

## Limits

- LLM latency is an estimate from timestamps (the store does not record time to
  first token); steps without tool calls run to the message's completion time.
- Token counts are as reported by the provider; cache reads dominate.
- Round labels, topics and session windows are judgement calls, recorded in
  `ROUNDS`, `TOPICS` and the local root config.
