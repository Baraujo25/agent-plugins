# Contributing

Thanks for looking under the hood. This file covers what fits in the
collection, how to add or change a plugin, and how releases work.

## What belongs here

Every plugin in this repository is a prosthesis for **one executive function**
a coding agent lacks — or, as with termination-self-monitoring, the removal of
one artifact it has too much of. Before proposing one, check it against the
five rules the existing plugins follow:

1. **One function per plugin.** It answers one question (*am I on the plan?*,
   *is this verified?*, *is it worth another try?*). If it answers two, it is
   two plugins that cross-reference each other.
2. **Anchored to something outside the agent's own reflection** — an external
   artifact (the plan, the docs, the code) or an objective count from a hook
   (edits to the same file, failed runs, tool calls). "Reflect harder" is not
   a mechanism.
3. **Never blocking by default.** Hooks fail silent; an error lets the prompt,
   tool call or stop proceed. A blocking mode may exist only as an explicit
   opt-in, and it must fire at most once (no loops).
4. **The skill is the source of truth and is host-neutral.** Hooks only decide
   *when*; they never carry the protocol. Anything project-specific (drift
   patterns of a particular codebase, metrics of a particular domain) belongs
   in the user's `CLAUDE.md` or rules, not in the skill.
5. **Name the monitored decision or variable, never an internal state.**
   `executive`, `epistemic`, `persistence`, `termination`, `coverage`,
   `handoff`, `progress`, `integrity`, `aspiration`, `hygiene` name what is checked —
   alignment to the plan, the status of a claim, the persist-or-quit decision,
   the reason for a stop, the parts delivered, the handoff to the reader, the
   residue across sessions, where a result comes from, the bar a result is
   held to. A
   name like *affective* or *avoidance* would assert a state the agent does
   not have; what looks like one from outside is a training-data artifact,
   and the plugin's job is to name the artifact, not to adopt it. The same
   rule applies to the text of the skills: an agent has counts, gates and
   observations, not moods.

Open a **plugin proposal** issue first — the template asks exactly these
questions — so the design is agreed before code is written.

## Repository conventions

- **Plain Node, no dependencies.** Built-ins only (`fs`, `os`, `path`). Each
  hook script should be readable in a minute; `node --check` is the build.
- **No network, no telemetry, no state outside the OS temp dir**, and no log
  files unless the plugin's `*_LOG` env var is set. [SECURITY.md](SECURITY.md)
  states this as a contract; a change that breaks it is a security issue, not
  a feature.
- **Self-contained plugins.** Plugins install individually, so nothing under
  `plugins/<a>/` may `require` anything under `plugins/<b>/`. Shared
  behaviour (the logger, for instance) is a per-plugin copy, on purpose.
- **Both adapters, or say why not.** A hook behaviour ships for Claude Code
  and Codex (`hooks/`, one adapter: Codex exposes the same events, payload
  and output envelope) and for Cursor (`cursor/`) unless a host cannot
  express it — then the README of the plugin explains the difference, as
  executive-self-monitoring does for Cursor's once-per-session cadence.
- **Droid runs `hooks/` too.** Factory Droid installs the Claude Code layout
  and runs `hooks/hooks.json`, so a match on a tool name also names Droid's
  tools (`Create`, `ApplyPatch`, `Execute`), and a close that reads the final
  message has nothing to read there: Droid's `Stop` does not send it.
- **OpenCode runs `hooks/` from one package.** `opencode/bridge.js` spawns the
  same scripts with Claude-shaped JSON. There is no third copy of the scanners.
  OpenCode cannot refuse the end of a turn, so strict mode parks the finding
  for the next prompt instead of blocking. Do not add an `@opencode/plugin`
  import under `plugins/`.
- **Hooks write the envelope, never plain text.** Everything a `hooks/`
  script says to the model goes out as
  `{"hookSpecificOutput":{"hookEventName":…,"additionalContext":…}}`
  (`context()` in `lib/host.js`). Claude Code also accepts plain stdout;
  Codex reads stdout that starts with `[` as JSON and drops it when it is
  not — and every message here starts with `[<plugin> self-monitoring]`.
- **A finding also tells the user, in one line.** The same envelope carries
  a top-level `systemMessage` (`context(event, text, note)` and `notice()` in
  `lib/host.js`), which Claude Code and Codex show to the user and do not
  give the model. Only on a finding - never on the load message or a cadence
  reminder - and off with the plugin's `*_NOTICE=0`. Cursor has no
  user-visible field on the events these plugins use.
- **Text the agent will read is written for the agent.** Reminder messages and
  skills are short, concrete and honest; no exclamation marks, no
  motivational filler. A nudge carries a fact (a count, a rule) and one
  question.

## Adding a plugin

1. Create `plugins/<name>/` with:

   ```
   .plugin/plugin.json             # Agent Plugins manifest ($schema 1.0.0, portable core) - never at the root, see below
   .claude-plugin/plugin.json      # Claude Code manifest
   .codex-plugin/plugin.json       # Codex manifest (skills: ./skills/, hooks: ./hooks/hooks.json)
   .cursor-plugin/plugin.json      # Cursor manifest (skills: ./skills/, hooks: ./cursor/hooks.json, logo)
   skills/<name>/SKILL.md          # frontmatter: name: <name>, description: ...
   hooks/hooks.json + *.js         # Claude Code + Codex adapter
   cursor/hooks.json + *.js        # Cursor adapter
   lib/                            # host-neutral logic; keep the counters/parsers here, testable in isolation
   assets/logo.svg                 # an open-loop mark like the others (see assets/README.md)
   README.md                       # what it does, why it works, host table, log events, layout
   ```

   The portable manifest lives under `.plugin/` because Codex (0.155) loads a
   root `plugin.json` through its Agent Plugins loader, which has no hooks
   slot, and then ignores `.codex-plugin/` — every hook silently off
   ([openai/codex#39895](https://github.com/openai/codex/issues/39895)).
   `scripts/test.js` fails on a root `plugin.json` for that reason.

2. Register it in all four marketplaces: `.claude-plugin/marketplace.json`,
   `.cursor-plugin/marketplace.json` and `.factory-plugin/marketplace.json`
   (Factory Droid) with `source: "./plugins/<name>"`,
   and `.agents/plugins/marketplace.json` (Codex) with
   `source: { "source": "local", "path": "./plugins/<name>" }`.
3. Set its version once for all four manifests — never edit it by hand:

   ```
   node scripts/version.js <name> 0.1.0
   ```

4. Run `node scripts/test.js`. The structural tests pick the plugin up
   automatically (manifests, skill frontmatter, marketplace entries, hook
   scripts, syntax). Add behaviour tests for its adapters next to the existing
   ones: drive each hook with the JSON its host sends and assert on stdout,
   stderr and exit code, for both hosts.
5. Add it everywhere the collection is listed: the tables in the root README
   (the ten moments, which one first, plugins), `docs/HOW-IT-WORKS.md` (the
   questions and the blocks), `docs/FAQ.md` (what you get, which one first),
   `docs/RESEARCH.md` (its related work), and `CHANGELOG.md` under
   *Unreleased*. Every count of the collection changes too ("N independent
   plugins", "all N installed", "the N plugins", the canonical cases in
   `bench/README.md`); `scripts/test.js` fails on one that does not match
   `plugins/`.

## Changing a plugin

- Behaviour changes bump the plugin's version (`scripts/version.js`) and get a
  `CHANGELOG.md` line under *Unreleased*. Docs-only changes do not bump.
- If you change what a hook reads, writes or emits, update the plugin README's
  log-events table and re-check [SECURITY.md](SECURITY.md)'s contract.
- Keep the message texts in `lib/messages.js` — both adapters share them.

### Improving a detector from real closes

The corpus says how a detector does on the lines someone thought to write
down. What agents actually write is another population. On 2026-09-25,
coverage's close scan held precision 0.97 on its corpus, and 0.34 on the
closes of this repository's own Claude Code sessions and 0.18 on the bench's.
So every eval and bench stage leaves the evidence, and a review turns it into
corpus lines before any pattern changes:

1. **Collect.** Each invocation leaves `<base>.misreads.json` beside its
   stream (`evallib.js` `misreadTrace`). Transcripts are the other source:
   `--sessions ~/.claude/projects/<project>` replays each turn's final message
   as the Stop hook read it.
2. **List.** `node scripts/misreads.js <results dirs> --md`, or
   `--sessions <dir> --md`. That gives one row per sentence, with the pattern
   that matched, whether the turn was `open` (the hook raised it) or `closed`,
   and the runs it came from.
3. **Judge.** Mark each row `deferral`, `misread` or `unsure`, with what it
   was. An agent can do this first pass. Group the misreads by what they have
   in common: an article, a negation, a block, a word with a second sense.
4. **Fix a class, not a row.** A fix is kept only for a class that recurs
   and that the words can tell apart. When a misread and a real deferral read
   the same ("still pending from the owner" in both), the class stays open;
   the agent's `misread` answer covers the single case.
5. **Lock it in the corpus first.** For each fix, add at least one `miss`
   from a real close and one `hit` that must keep firing. The new misses must
   fire on HEAD and stay quiet after the fix. `node scripts/corpus.js --check`
   holds the floors. Corpus lines are public. Paraphrase every line: no names,
   paths, hostnames or text from a project, only the phrasing that makes the
   class. The review sheets quote real closes, so they stay out of the
   repository (the scratchpad, or `bench/results/` and `evals/results/`, which
   are ignored).
6. **Measure on the labelled rows.** Re-scan the same sources and count the
   misreads removed and the deferrals kept. Explain every deferral that went
   quiet before calling the fix good. A deferral inside a `[HANDOFF]` is
   already returned, and that is a closure, not a loss.
7. **Record** the numbers in `CHANGELOG.md`.

## Checking that a change still works

Five layers, cheapest first. The first four are deterministic, take seconds and
run in CI on every push. The fifth — behaviour, one arm per host — costs API
calls and is run deliberately: before a release, or after a change to a skill
or to a message.

| Layer | Command | Answers |
|---|---|---|
| structure + adapters | `node scripts/test.js` | does every hook run, on both adapters, and emit the right shape? |
| docs vs code | `node scripts/samples.js --check` | does the README still quote the message the code actually emits? |
| detector quality | `node scripts/corpus.js --check` | does each detector still catch what it exists to catch, without firing on what it must leave alone? |
| host parity | `node scripts/hosts.js --check` | does every declared adapter survive its host's payload, and is every Claude-Code/Cursor asymmetry a decision someone wrote down? |
| behaviour (Claude Code) | `claude plugin eval plugins/<name> --ablation with-without` | does the plugin actually change what the model does — measured against a no-plugin baseline arm? |
| behaviour (Cursor) | `node scripts/cursor-eval.js --probe`, then `… --isolate --model <id>` | the same question through the Cursor Agent CLI — skill, `sessionStart` and `postToolUse`; not the response scan or the stop gate, see below |
| behaviour (Codex) | `node scripts/codex-eval.js --probe`, then `… <plugin>` | the same question through `codex exec` — hooks AND skill, like the Claude Code arm, see below |

### What each layer needs

| Layer | Command | Needs |
|-------|---------|-------|
| Suite: structure, hook adapters, corpus, samples, host parity | `node scripts/test.js` | Node 18 or later. No agent, no network. The node-fence test is skipped on 18. |
| Versions, fixtures | `node scripts/version.js --check`, `node scripts/bench-check.js` | Node 18 or later |
| Behavioural evals | `node scripts/cursor-eval.js`, `claude-eval.js`, `codex-eval.js` | The host's CLI, logged in. With `--isolate`, Cursor needs `CURSOR_API_KEY`. These spend model calls. |
| Outcome bench | `node scripts/bench.js --host <cursor\|claude>` (`cursor-bench.js`, `claude-bench.js`) | The host's CLI, logged in. Cursor on Windows: run from PowerShell or cmd, not Git Bash, or no hook runs. **Node 20 or later on the runner** for the node fence (`--permission` from 22.13, `--experimental-permission` on 20). On 18 the agent's `node` runs unfenced, and `run.json` records `nodeGuard: false`. These spend model calls. |

The evals and the bench start agents on your machine. The shell allowlist
admits only `node`, and the bench fences that `node` to the run's workspace.
It is not a sandbox: see [bench/GUARDS.md](bench/GUARDS.md).

**Neither behaviour layer runs in CI, and that is enforced rather than assumed.**
They cost API calls, need an authenticated account and are non-deterministic;
a push-triggered matrix across three OSes and three Node versions is the wrong
place for either. `scripts/test.js` fails if a CI step shells out to an
agent CLI, if a CI-invoked script starts one, or if a script that does start
one gets added to the workflow. A script that drives a CLI declares itself with
an `AGENT_CLI_DRIVER` binding — a real binding, not a comment, because the
check strips comments before it looks.

A few notes on using them.

**`scripts/samples.js`** generates the "What your agent sees" fences in the
README from `lib/messages.js` (and, for executive, by running the hook). When
you change a message, run `node scripts/samples.js --fix` and commit the README
with the code change. This exists because commit `40d7dac` changed four
messages and the README kept quoting the old ones for a release.

**`scripts/corpus.js`** scores each detector against `evals/corpus/*.jsonl`,
lines labelled `hit` (must fire) or `miss` (must NOT fire — out of scope by
design). It reports recall and precision against a floor.

- The floors are set at *where the detector stands today*, so the check is a
  regression guard, not a wish. Improving a detector means raising its floor in
  the same PR.
- Precision is the expensive side: these hooks interrupt an agent mid-work, so
  a labelled `miss` that fires is a defect, not a tuning preference.
- Lines tagged `"gap": true` are known misses, each with a `why`. They are the
  to-do list. `node scripts/corpus.js --misses` prints them.
- **When you add a pattern to a detector, add the corpus lines first.** That is
  the only way the number moves for a reason you can point at.

**`scripts/hosts.js`** drives all 44 declared adapters with host-shaped
payloads and asserts they exit 0 and stay off stderr. A capability present on
one host and not the other must be listed in `ACCEPTED` in that file with a
reason — that is how a deliberate asymmetry is told apart from a Cursor adapter
that quietly stopped being wired.

**`claude plugin eval`** is the only layer that measures the thing the
collection is actually for: whether the model behaves differently. Each plugin
ships one case under `plugins/<name>/evals/<case>/` — a `prompt.md` written to
induce the failure the plugin exists to catch, plus graders in `graders/*.md`.
`--ablation with-without` runs a no-plugin baseline arm and reports the delta;
a case both arms pass is a case that proves nothing, so rewrite the prompt.
Graders marked `with_only: true` (the `tool_used: Skill` indicator) show the
plugin fired and are reported apart from the score.

A case whose discipline leaves a **file** rather than a block — progress's
ledger is the one so far — is graded on that file. Put what the workspace
should contain before the run under `evals/<case>/files/` (both runners copy
it into the scratch workspace; a seeded ledger and a previous "session's"
code is how one prompt stands in for the second session of a two-session
failure), list the plugin in `ARTIFACT` in `scripts/evallib.js`, and name the
rules in `case.json` under `artifact`: `exists`, `changed` (against the
seeded copy), `open_min` / `open_max` (per the plugin's own parser). The
file is kept beside the transcript as `<run>.artifact.md`, so `--rescore`
grades it the same way. A quiet case of this kind asks that the file be
absent, or exactly as seeded.

> `plugin eval` is in early access. Until it is enabled on your account the
> command exits without running, so `scripts/test.js` holds the suites to the
> shape the runner expects instead — every case must have a non-empty
> `prompt.md`, at least one scored grader, and at least one with-only
> indicator.

**`scripts/cursor-eval.js`** is the Cursor side of the behaviour layer, built on
the Cursor Agent CLI (`cursor-agent`, aliased `agent`). It reuses the same
`prompt.md` files, so one case set serves both hosts. Two things about it were
measured before it was written, and both limit what it may claim:

- `--plugin-dir <path>` **does** load a local plugin's skills — verified with a
  synthetic plugin holding a uniquely named skill that the agent then listed.
  So the WITH arm is real.
- Headless `-p` **runs hooks, depending on how it was started**. Measured on
  `2026.09.18-9a7762b` (Windows), from PowerShell or cmd: `sessionStart`,
  `preToolUse`, `postToolUse`, `beforeReadFile` and `sessionEnd` fire, from
  `--plugin-dir` (the plugins' relative `node ./cursor/…` commands work) and
  from a project `.cursor/hooks.json`, and the `additional_context` of
  `sessionStart` and `postToolUse` reaches the model. `afterAgentResponse` and
  `stop` do not fire. `afterAgentThought` fires and ends the turn in an error;
  no plugin wires it.
- **From a process tree under Git Bash no hook fires, and nothing says so.** It
  held with `SHELL`, `MSYSTEM`, `PATH` and the whole environment reset, so it
  is the ancestry, not a variable. An earlier revision of this section measured
  only from Git Bash and concluded "no hooks".

The second one is the important one. A WITH arm may or may not have had the
hooks, so every Cursor run loads a witness plugin in both arms
(`evallib.js` `hookWitness`) and prints how many runs had hooks, per arm; a
WITH arm with none is the skill alone and is flagged. `node
scripts/cursor-eval.js --probe-hooks --model <id>` measures the whole split in
one model call. None of this says anything about Cursor the IDE.

The hook adapters are covered deterministically instead: `scripts/test.js` and
`scripts/hosts.js` drive all of them with Cursor-shaped payloads, which is what
catches a broken Cursor wiring.

**`scripts/codex-eval.js`** is the Codex side, through `codex exec`, and it
measures hooks AND skill like the Claude Code runner does — Codex runs the
same `hooks/` adapter. How each arm is built was measured on codex-cli
0.155.1 before the script existed, because the obvious routes do not work:

- Installing the plugin for real (`codex plugin add`) writes to the user's
  `config.toml` and cache, and its hooks stay off until someone trusts them
  in the TUI (`/hooks`); `--dangerously-bypass-hook-trust` does not reach
  plugin-bundled hooks. A project-level `.codex/hooks.json` needs the project
  trusted, and no `-c projects.…trust_level` override was honoured.
- What does work: the WITH arm copies the skill from the working copy into the
  workspace's `.agents/skills/` (Codex lists it) and passes the plugin's
  `hooks/hooks.json` as **session hooks** — one `-c 'hooks.<Event>=[…]'`
  per event, script paths made absolute — under
  `--dangerously-bypass-hook-trust`. Both arms run with
  `--ignore-user-config`, which drops installed plugins, marketplaces and
  user hooks but keeps the login. Nothing under `~/.codex` is written. One
  value is read back out of it on Windows: `[windows] sandbox`, without which
  `workspace-write` silently falls back to read-only and every "work" case
  answers that it cannot write.

On Windows the `codex` on PATH is a `.cmd` shim, and a shell would mangle
the quoted TOML, so the runner starts the package's `bin/codex.js` with node
directly. Transcripts use the same file names as the other runners, so
`--rescore` works across all three.

**A skill text before it ships** is measured with `--skill-variant <name>` on `claude-bench.js` or `claude-eval.js`: the WITH arm loads `evals/variants/<plugin>/<name>.md` in place of the plugin's `SKILL.md`. Run the shipped text and each variant against the same baseline, then adopt the variant only if it wins on the case it was written for and loses nothing on the plugin's canonical case.

One more constraint worth knowing before you read a delta: these plugins are
usually installed globally under `~/.cursor/plugins/local`, the CLI loads them
with no flag, and there is no way to disable them. A WITHOUT arm that still has
the skill measures nothing, so the script detects a global install and refuses
to report a delta. `--isolate` gives it a scratch `HOME` with no plugins;
authentication then has to come from `CURSOR_API_KEY`, because the session file
lives in the real `~/.cursor` and the script will not copy credentials
elsewhere.

## Contributing to the bench and the research

The bench's cases, graders and detector corpora are written by the plugins'
author. That is the project's largest limitation ([docs/RESEARCH.md](docs/RESEARCH.md#threats-to-validity)),
and outside work is the remedy. If you work on agents, evaluation or human
factors, these help most:

- **A case.** A task the unaided model gets wrong under realistic pressure,
  scored on the workspace. Follow [bench/README.md](bench/README.md), "How a
  case is written": the score is what the user asked for, never the opposite
  of an instruction; the pressure comes from the situation. Stamp the answer
  key with the canary (`node scripts/integrity.js --stamp`) and add pass and
  fail fixtures (`node scripts/bench-check.js`).
- **Corpus lines** from real sessions, paraphrased (see "Improving a detector
  from real closes" above).
- **A review** of a grader, a case, or a claim in
  [docs/EVIDENCE.md](docs/EVIDENCE.md). A result that does not hold is worth
  more than one that does.
- **Runs** on a model or a host not yet measured, with their `run.json`.
- **References**, and corrections where a citation says less than the text
  that cites it.

Evidence pages are dated: a change to a published number updates
`docs/EVIDENCE.md` with the date, the versions and the sample size.

## Pull requests

- One plugin or one concern per PR.
- `node scripts/test.js` and `node scripts/version.js --check` pass locally;
  CI runs them on Ubuntu, Windows and macOS, Node 18/20/22 ("What each layer needs",
  above). `scripts/test.js` also
  runs the samples, corpus and host-parity checks, so passing it locally
  covers all four cheap layers.
- The PR template has the checklist; it is short on purpose.

## Releases

Versions are **per plugin** (each `plugin.json`); the **repository** has its own
release number that only says "which changelog is this". Cutting one:

1. Bump the plugins that changed: `node scripts/version.js <name> X.Y.Z`.
2. Move the *Unreleased* section of `CHANGELOG.md` under a new heading with
   the repo version and date; list each plugin's version in it.
3. Commit, tag (`git tag -a vX.Y.Z -m "agent-plugins X.Y.Z"`), push with tags.
4. Create the GitHub Release from the tag; paste the changelog section as the
   notes. The release is the only tag: plugins are not tagged individually -
   the release lists which plugin versions it ships.

Repo versioning: *minor* when a plugin gains capability or a new one lands,
*patch* for fixes; 1.0 when the default thresholds and gates have been tuned
against real session logs rather than reasoned — `node scripts/calibrate.js`
is the tool for that: it reads the opt-in logs and prints what-if nudge rates
per threshold, and the tuning decision (with the numbers) goes in the
changelog.
