# Agent trace export

`export_traces.py` turns the local OpenCode session store into three files for
the agent observability lab:

- `web/lab/data/agent-traces.json`: OpenInference-shaped traces of the agent runs
  that built this site, with code-evaluator results, thresholds and rollups.
- `web/lab/data/agent-traces-summary.json`: the small cut the homepage preview
  loads (per-trace id, day, plain-words topic, tool calls and errors; the
  pass/fail labels grouped by evaluator, `{"evaluations": {evaluator: {trace:
  "pass"|"fail"}}}`; the window; evaluator ids, names, kinds and outputs).
- `web/lab/data/agent-traces.openinference.jsonl`: the same published spans as
  one OpenTelemetry-style JSON object per line, with OpenInference attribute
  names, for download (see "OpenInference file" below).

All three are public, so the exporter publishes structure and numbers only.

```sh
python3 scripts/telemetry/export_traces.py [--db PATH] [--out PATH] [--summary-out PATH] [--jsonl-out PATH] [--roots PATH]
node --test tests/agent-traces.test.js            # the published files
python3 -m unittest scripts/telemetry/test_export_traces.py   # the exporter, on a synthetic store
```

Defaults: `--db ~/.local/share/opencode/opencode.db`,
`--out web/lab/data/agent-traces.json`, the summary next to it as
`agent-traces-summary.json`, the span lines as `agent-traces.openinference.jsonl`,
`--roots scripts/telemetry/roots.local.json`.
Python 3.9+ standard library only. `npm test` does not need Python; the unit test
runs separately.

`meta.dataset` is a 12-hex-digit hash of every trace's id, day, session, duration and
tool-call count. Human labels are keyed by trace id, and ids shift when a trace is
added or re-cut, so `web/lab/data/human-labels.json` and the dashboard's stored and
downloaded labels carry the dataset they were made on; labels from another dataset
are set aside (kept, and still downloadable, but not compared).

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
    call; for `bash` calls the command, which is classified in memory and
    discarded, and the exit code (a number, used only by
    `verified_after_last_edit`); for failed calls (`status = error`) the error
    text (`$.state.error`), which is sorted into an error class in memory and
    discarded.
- Messages, parts and child sessions are filtered by `time_created` in SQL, so
  rows outside the windows are never read. JSON is extracted only in the select
  list, i.e. for rows that passed the filter. The unit test puts malformed JSON in
  every excluded row to prove it.
- Text, reasoning, prompts, titles and tool outputs are never extracted. Error
  text and commands never leave the process: only their class or category is
  published.

## Trace model

- One **trace** per included user turn. `day` is the local calendar day;
  `start` is 0 and every span time is milliseconds from the user message.
- Per trace: `session` is a pseudonymous root-session id (`S1`, `S2`, … in the
  order the root sessions were created; never the slug), `topic` the plain-words
  topic, `agentPath` the distinct agents in order of first appearance, and
  `agentEdges` (`{from, to, count}`) the subagent runs each agent started (`to`
  is a subagent started by `from` through a task call, or attached to the turn's
  root agent when no task call points at it).
- **AGENT** span: the root agent's answer to the turn (`build`, `plan`), and one
  per subagent run, nested under the `task` TOOL span that started it.
- **LLM** span: one model step (one assistant message), from its start to the
  start of its last tool call, an estimate of generation time. `toolCalls` is
  the number of tool calls it made. Tokens: input, output, reasoning, cacheRead,
  cacheWrite.
- **TOOL** span: one tool execution, sibling of the LLM step under its agent. A
  failed one carries `errorClass` (see "Error classes").
- **CHAIN** span (`name: "steps"`): consecutive steps of one agent and model
  merged for size, with their step count, tool-call counts per tool, error counts
  per tool and per error class (`errorClasses`) and summed tokens.
- `round` is inferred from git: each build round ends at a commit (table
  `ROUNDS`); a trace takes the rounds of the commits made while it ran (e.g.
  "Round 7–8"), otherwise the round its start falls in. Round 12 (November 12)
  is split into its commit groups (`Hover lag`, `First visit`, `Layout shift`,
  `Follow up`); a trace that starts after the last commit in `ROUNDS` gets the open
  round's label (`OPEN_ROUND`, now `Evaluators`). The open round has no end date, so it
  cannot go stale; when it closes, add its commit to `ROUNDS` and name the next one. Each trace's
  `topic` is the plain-words topic for its label (`TOPICS`; `web/lab/obs-data.js`
  keeps a copy, and the node tests check the two agree).

## Privacy rules

- Tool names come from an allowlist: `bash read edit write glob grep task
  todowrite question skill webfetch`, and `chrome-devtools_<action>` becomes
  `browser.<action>`. Any other tool is dropped entirely and only counted
  (`meta.droppedSpans`).
- Agent names come from an allowlist of generic OpenCode agent types; anything
  else would become `other`.
- Bash commands are reduced to one category: `git-commit`, `test` (node --test,
  npm test, pytest, `python -m unittest`, `*verify*.sh` scripts, the browser
  harness and headless tour runs), `build` (npm run build/check, node --check;
  checks count as build), `git-other`, `server` (local server and port checks),
  `other`. First match wins in that order.
- Failed tool calls are reduced to one error class (below); the error text is
  not kept.
- No cost: the runs used a flat-rate subscription, so a list-price figure would
  mislead.
- Before writing, every key and string in all three files is checked against
  `DENYLIST` in the script (internal names, ticket prefixes, home paths, URLs,
  `@`, emails, id prefixes, long opaque ids) and the local account name. Any match
  aborts the export and nothing is written. The node test repeats the scan.

## Size

The full export has about 17,400 spans; the budget for `agent-traces.json` is
360 KB (about 45 KB gzipped). Rollups, trace
totals and evaluations are computed from every span. The published spans are
then compacted with the most detailed setting that fits (`COMPACTION_LADDER`,
recorded in `meta.compaction`): the first and last steps of each orchestrator
run, every step that delegates or commits, and the first error step of each run
stay as single spans; the rest become CHAIN spans. All traces are kept. Counts
and tokens stay exact; per-span latency inside a CHAIN is not published. The
summary is about 14 KB; the OpenInference file about 440 KB (about 37 KB
gzipped; the node test caps it at 480 KB).

## Evaluators (code only)

There is no LLM-as-judge: the exporter has no model access. Each check is
deterministic and scored per trace; rows are emitted only where the check
applies. Every evaluation has a numeric `score`. For pass/fail checks the label
follows from the score and the evaluator's `threshold` and `direction`
(`atMost`: score ≤ threshold, `below`: score < threshold, `atLeast`: score ≥
threshold), all kept in `THRESHOLDS` and published on each evaluator and in
`meta.thresholds`, so a reader can re-score with other thresholds. Each
evaluator also says its `output`: `pass/fail`, `number` or `category`.

| id | Pass when (score) | Applies to |
| --- | --- | --- |
| `tool_error_rate` | ≤ 10% of the trace's tool calls returned an error (score = rate) | traces with tool calls |
| `recovered_after_error` | every failed tool call is followed later in the trace by a successful call of the same tool (score = share recovered, pass at 1) | traces with an error |
| `delegation_fit` | subagents made at least half of the trace's tool calls (score = share of tool calls made at depth > 0, 0–1, pass at 0.5): on a large task, specialists did most of the hands-on work. One token subagent run does not pass | large traces: ≥ 40 tool calls or ≥ 3 edit/write calls, counted over the whole trace including subagents (`LARGE_TRACE`, published as `meta.largeTrace`) |
| `review_before_commit` | a quality-reviewer run finished after the previous commit in the same root session (or the window start) and before this trace's last commit (score 1/0) | traces that commit |
| `tests_run_before_commit` | a `test`-category bash call finished in that same interval (score 1/0) | traces that commit |
| `verified_after_last_edit` | a `test` or `build` bash call that completed with exit code 0, or with no exit code recorded (older store rows have none; the dashboard says so), started after the trace's last successful edit/write ended; edits and checks inside subagents count (score 1/0) | traces with a successful edit/write |
| `stuck_loop` | no agent run has 3 or more consecutive failed calls of the same tool, in time order within that run; any other call breaks the streak (score = longest streak, pass below 3) | traces with tool calls |
| `review_addressed` ("Changes after review") | for the reviews of `review_before_commit`'s interval, at least one successful edit/write started after a review finished and ended before the next commit (score = the most edits that followed one review). A clean review with nothing to fix also fails, so read it as "the review changed something" | traces that commit with a review in the interval |
| `latency_budget` | p90 of the trace's LLM step latency < 30 s (score = p90 seconds, ms precision) | traces with LLM steps |
| `tokens_per_tool_call` | number: (output + reasoning tokens) / tool calls | traces with tool calls |
| `parallel_fanout` | number: the most subagent (depth > 0) runs open at one moment (half-open intervals) | traces with a subagent run |
| `cache_reuse` | number 0–1: cacheRead / (input + cacheRead + cacheWrite) over the trace's LLM steps | traces with prompt tokens |
| `error_class` | category: label = the most common error class (ties go to the earlier class in the list), score = its count; the explanation lists the count per class | traces with a failed tool call |

A commit is a successful bash call in the `git-commit` category; an edit is a
successful `edit` or `write` call.

## Error classes

A failed tool call (`status = error`) gets one class from its error text,
matched in memory. A JavaScript runtime error from a script the agent ran ("is not
defined", "is not a function", "cannot read properties of undefined"; `JS_RUNTIME`)
is `other` before any rule is tried. Otherwise `ERROR_RULES` apply in this order,
first match wins. HTTP status codes count only next to "status", "HTTP" or "code"
("status code (404", "HTTP/1.1 403"), never as a bare number:

- `timeout`: "timed out", "timeout", "deadline exceeded", ETIMEDOUT.
- `permission`: "permission", "not allowed", "forbidden", "access denied",
  "denied", "unauthorized", EACCES, EPERM, a user rule blocking the call,
  SecurityError, HTTP 401/403.
- `not_found`: "not found", "no such file", ENOENT, "does not exist", "no page
  found", HTTP 404, reading a property of null (a selector found nothing).
- `bad_arguments`: "invalid", schema errors, missing keys, an edit whose old text
  does not match or changes nothing, unknown options, "expected … got",
  SyntaxError, "illegal invocation".
- `test_failure`: AssertionError, "tests failed", TAP "not ok", "# fail N".
- `network`: ECONNREFUSED/ECONNRESET/ENOTFOUND, socket and fetch errors,
  "network", connection refused/reset/closed, "could not connect", transport
  errors, HTTP 429 and 500–504.
- `other`: JavaScript runtime errors and anything else (aborted or cancelled
  calls, oversized responses, …).

Published: `errorClass` on each failed TOOL span, `errorClasses` on CHAIN spans,
the `error_class` evaluation per trace, and `rollups.errorClasses`.

## OpenInference file

`agent-traces.openinference.jsonl` has one JSON object per published span:
`trace_id` (`t01`), `span_id` and `parent_id` (`t01.s3`), `name`, `span_kind`,
`start_time` and `end_time`, `status_code` (`OK`/`ERROR`) and `attributes`:
`openinference.span.kind`, `session.id`, `agent.name`, `tool.name` (TOOL),
`llm.model_name`, `llm.token_count.prompt` (input + cache read + cache write),
`llm.token_count.completion` (output + reasoning), `llm.token_count.total`,
`llm.token_count.prompt_details.cache_read`,
`llm.token_count.prompt_details.cache_write`,
`llm.token_count.completion_details.reasoning` (LLM and CHAIN spans) and the
custom `error.class` (failed TOOL spans). A CHAIN row whose merged calls include
failures carries the custom `error.count` (failed calls) and `error.class.<class>`
(failed calls per class), and its `status_code` is `ERROR` (in the JSON the CHAIN
keeps `status: "ok"` and the counts in `errors` / `errorClasses`). So the file's
failed calls, one per failed TOOL row plus each CHAIN's `error.count`, add up to the
traces' `toolErrors` (162 in the current export; tools outside the allowlist are
dropped before counting, so they are in neither). There is no `input.value` or
`output.value`. Times use a synthetic clock: every trace starts at
`00:00:00.000Z` on its real calendar day, and spans keep their real offsets from
that start, so the date is real and the time of day is not.

## Kappa intervals

`node scripts/telemetry/kappa-intervals.mjs --write` reads `agent-traces.json` and `human-labels.json`, recomputes the three kappas the dashboard quotes (all required checks, the under-40-calls size rule, and "Recovered after error" on long runs) with the page's own code (`web/lab/obs-eval.js`), and writes percentile-bootstrap 95% intervals (5,000 resamples of the traces, fixed seed) to `web/lab/data/agent-traces-kappa.json`. It needs no session store, so it can run after any export. `tests/agent-observability.test.js` recomputes the file and checks the numbers written into the page.

## Rollups

`byDay`, `byRound`, `byAgent` (runs, steps, tool calls, errors, tokens),
`byModel`, `latencyByKind` and `tools` (n, p50/p90/p99 in ms, errors, error
rate), `delegations` by subagent type, `bashCategories`, and
`toolCallsPerStep` (mean, p50, p90, max, histogram), `errorClasses` (failed calls
per class), `checks` (pass, fail and not-scored traces per pass/fail evaluator),
`sessions` (per pseudonymous session: traces, days, tool calls, tool errors,
subagent runs and, per pass/fail evaluator, pass / scored / rate) and
`agentGraph` (`nodes`: agent, runs, spans, tool calls, tool errors; `edges`:
from, to, count, aggregated from the traces' `agentEdges`). Percentiles use the
nearest-rank method, so every value is an observed duration. `question` tool
latency includes the time waiting for the owner's answer.

## Limits

- LLM latency is an estimate from timestamps (the store does not record time to
  first token); steps without tool calls run to the message's completion time.
- Token counts are as reported by the provider; cache reads dominate.
- Round labels, topics and session windows are judgement calls, recorded in
  `ROUNDS`, `TOPICS` and the local root config.
