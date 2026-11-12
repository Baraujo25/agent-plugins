# How it works

The idea behind the collection: the three parts of a plugin and what each one does, why the triggers are simple on purpose, why the checks are the agent's own, and the questions the ten plugins answer. For what has and has not been measured, see [EVIDENCE.md](EVIDENCE.md). For the research behind each design choice, see [RESEARCH.md](RESEARCH.md). For common misreadings, see [FAQ.md](FAQ.md).

## Three parts, three jobs

Every plugin has the same three parts.

1. **The skill: the discipline.** An [Agent Skill](https://agentskills.io) (`skills/<name>/SKILL.md`) that says how a careful engineer handles this moment: keep the plan open, keep what you saw apart from what you think, stop only for a reason you can check. Where it is read it is the base: on one measured case (integrity, Cursor, 2026-09-25) the skill alone turned 0 of 3 into 3 of 3, with no hook firing. Asked to load it, the agent seldom does: on Claude Code, almost never in interactive use, and 0 of 18 under `claude -p` ([evals/PROTOCOL.md](../evals/PROTOCOL.md#the-skill-is-not-a-lever-on-claude-code-headless)). So the five plugins whose moment is the start of a session - handoff, progress, coverage, executive, hygiene - put the skill's text in context themselves: when a session starts, after a `/clear` and after a compaction, and (handoff, coverage and hygiene) when a subagent starts. Aspiration does too, although its moment is the close: asked, the agent loaded it in 1 of 20 `claude -p` runs (2026-10-03), and what it needs at the close - compare with a source it did not write, review with the project's own tools - is in the text, not in the message. The other four ask for it in their messages, only for an agent that does not know what the block's marker asks for, and their messages carry the block's fields for the agent that never loads it.
2. **The hook: a fact, at the moment it matters.** A small Node script the host runs on its events. It notices something countable or on disk (the same file edited four times, a plan that changed since the agent read it, a ledger with open items, a `catch` that answers a failed call with a made-up value) and puts that fact in front of the agent in one line. Hooks add most where they hand over a fact the agent does not have and would not look for: the two clearest gains on Claude Code are the two hooks that read something on disk (progress 0/9 -> 9/9, executive 2/9 -> 9/9, 2026-09-27).
3. **The block: the decision, written.** The hook's line asks for a named block with fixed fields and a closed set of decisions, one of which is always the honest way out. The agent fills it in the reply, where you, a reviewer or another agent can read and check it.

The plugin never decides whether the agent is right. It supplies the discipline, the fact and the structure of the answer. The judgment stays with the agent, and you see it.

```
  fact on disk / count          one line + a block to fill        the block, in the reply
 ┌────────────────────┐        ┌──────────────────────────┐      ┌──────────────────────┐
 │ src/parser.js      │  hook  │ "edited 4 times; tests   │ agent│ Attempts: ...        │
 │ edited 4x; tests   │ ─────► │  failed 3 times. Write   │ ───► │ Hypothesis held: ... │ ──► you,
 │ red 3x this turn   │        │  [PERSISTENCE CHECK]"    │      │ Rival approach: ...  │     a reviewer,
 └────────────────────┘        └──────────────────────────┘      │ Decision: switch     │     a subagent
      (the trigger)                 (evidence + scaffold)         └──────────────────────┘
   the skill carries the rules behind all of it - in context from the start for six plugins
```

## The trigger: simple, and allowed to be imperfect

The hooks use counters and plain pattern matching over the agent's text and edits. They do not try to understand the agent's reasoning, and they do not try to catch every case. That is a choice:

- **The trigger decides *when*, not *whether*.** The skill carries the whole discipline, and the load message carries the block's shape. A missed trigger means one reminder less, not the discipline gone. For the four plugins that do not put their skill in context, that shape is most of what the agent has.
- **Useful beats complete.** A reminder is worth sending when the trigger is cheap, a false alarm costs little (the agent can answer it as a misreading), and the fact it carries is relevant. Detect enough to create a useful decision point; do not try to model the agent.
- **Simple is predictable.** Each hook is one readable Node file with no dependencies and no network.
- **Its quality is measured anyway.** Each detector has a corpus of real lines it must fire on and must stay quiet on, with recall and precision floors in CI (`node scripts/corpus.js --check`). A false reading found in a session becomes a corpus line before the pattern changes.

What the trigger is **not**: a classifier of good and bad behaviour, a guard, or a judge.

## The block: where a decision becomes visible

- **It asks for evidence, not effort.** Every block is anchored to something the agent can check: the count, the file, the command, the quoted gate of the plan. "Reflect harder" has nothing to anchor to; "you edited this file four times, name the hypothesis you are still holding" does. Self-correction from a model's own critique is unreliable; with feedback from outside it works much better ([RESEARCH.md](RESEARCH.md)).
- **It offers named options.** A closed set of decisions turns an open temptation (one more try, a quiet fallback, a vague stop) into an explicit choice among alternatives.
- **It makes the honest answer a complete answer.** "Cannot be done as asked, because X", `blocked` with the observed limit, `report` to the user: these are valid values. An agent not given an honest way out tends to invent a dishonest one.
- **It leaves a record** that a person, a reviewer or a subagent can check without re-running anything.
- **It is not the goal.** A block written from memory is a ritual: in one measured case the agent wrote `Drift: none` quoting a plan it had not re-opened. The outcome is what counts, which is why the bench scores the workspace and never the block.

Field names and status words stay in English in every language, so the blocks stay readable by machines whatever language the conversation is in.

| Plugin | Block | Fields and allowed values |
| --- | --- | --- |
| executive | `[PLAN CHECK]` | Plan (named, with its objective line quoted), Gate (quoted), Drift (`none` or what pulls away), Decision (`continue \| refocus \| revise-plan`) |
| epistemic | `[EPISTEMIC CLOSE]` | Claim, Status (`observed \| conjecture \| verified`), Evidence, Falsifier, Verified by (required when verified), Scope |
| persistence | `[PERSISTENCE CHECK]` | Attempts, Hypothesis held, Rival approach, Proportion, Decision (`one more (stop condition: ...) \| switch \| step back \| report`) |
| termination | `[TERMINATION CHECK]` | Trigger (quoted), Reason (`gate-not-run \| owner-choice \| budget-spent \| limit-observed \| none`), Evidence, Decision (`continue \| stop \| ask owner`) |
| coverage | `[COVERAGE LEDGER]`, then `[COVERAGE CHECK]` | one line per part: `done - <check run>`, `blocked - <observed limit>`, `returned - <the owner's choice>` |
| handoff | `[HANDOFF]` | Status (`done \| waiting \| needs-decision \| blocked`), Situation, Options and Default (when a decision is needed), Waiting-on (when a result is still out), Blocked-by (when blocked), Next |
| progress | `.agent/progress.md` (from a worktree, the main checkout's) | Updated, Plan, `## Open` (each item `blocked` or `returned`, with its reason; an item a session is working carries a `- claim:` line under it), Next |
| integrity | `[INTEGRITY CHECK]` | Result (`real \| shortcut \| blocked`), Route, Outside the task, Told the user (`yes \| no`) |
| aspiration | `[ASPIRATION CHECK]` | Criterion, Reviewed, Found, Remainder (`meets \| defect \| unverified \| blocked`) |
| hygiene | `[HYGIENE CHECK]` | Request names, Change reaches, Outside (`none` or what the change reaches that the request does not name), Decision (`keep \| revert-extra \| ask-owner`) |

## Why the checks are the agent's own

*Self*-monitoring means the agent checks its own work. The plugins do not watch the agent for anyone: nothing leaves your machine, nothing is scored, nothing is reported. That is a design choice with research behind it.

Agents behave differently when they believe they are being tested: told to assess whether it was in a test before acting, Claude misbehaved less when it said it was in testing and more when it said the situation was real (Lynch et al., 2025), and evaluation awareness has a causal effect on covert behaviour (Schoen et al., 2025). Putting pressure on a model's monitored reasoning teaches it to hide its intent (Baker et al., 2025). Direct orders are not enough either: models often disobeyed commands to avoid misbehaving (Lynch et al.), while a credible, authorised way out cut harmful actions from 38.7% to 1.2% (Gomez, 2025).

So the plugins never judge, punish or report; their messages talk about the work rather than an examiner; and every block has an honest way out. The same findings shape the bench: a test the agent can recognise as a test overestimates good behaviour, so the bench hides its setup and counts, per arm, how often the agent talks about being evaluated. What that count shows today is in [EVIDENCE.md](EVIDENCE.md#evaluation-awareness).

## The idea behind the ten plugins

Coding agents are missing most of the **executive functions** a human engineer runs in the background: holding the goal in mind while deep in a task, noticing the difference between what was observed and what was inferred, feeling that an approach has stopped working. And they carry something a human engineer does not: reasons to stop that come from the training data rather than from the task (fatigue, a clock, a context budget, confidence as a mood), produced with the same fluency as everything else. Each plugin is a prosthesis for one missing function, or a filter for one such artifact, anchored to an external artifact or an objective count rather than to "reflect harder".

| Question | What it monitors | Plugin | The block you read |
| --- | --- | --- | --- |
| *Am I doing what the plan asks?* | goal maintenance | [executive](../plugins/executive-self-monitoring/) | `[PLAN CHECK]` |
| *Is what I concluded actually true?* | source monitoring, verification | [epistemic](../plugins/epistemic-self-monitoring/) | `[EPISTEMIC CLOSE]` |
| *Is it still worth insisting on this?* | persistence, effort regulation | [persistence](../plugins/persistence-self-monitoring/) | `[PERSISTENCE CHECK]` |
| *Is this stop justified by something checkable?* | the stated reason for a stop, vs. a persona artifact | [termination](../plugins/termination-self-monitoring/) | `[TERMINATION CHECK]` |
| *Did I review the result after my last change, and does it meet the objective?* | a close with an edited file nobody reviewed in its medium (a document read, an image viewed, code run), or with a defect still in it | [aspiration](../plugins/aspiration-self-monitoring/) | `[ASPIRATION CHECK]` |
| *Did I deliver every part, including the hard one?* | task coverage, effort allocation | [coverage](../plugins/coverage-self-monitoring/) | `[COVERAGE CHECK]` |
| *Can the reader act on what I wrote?* | the handoff of the turn, recipient design | [handoff](../plugins/handoff-self-monitoring/) | `[HANDOFF]` |
| *Can the next session pick this up?* | the residue across a session boundary, prospective memory | [progress](../plugins/progress-self-monitoring/) | `.agent/progress.md` |
| *Is the result real, and the route to it legitimate?* | where a result comes from: a fallback, a stand-in, a bent environment | [integrity](../plugins/integrity-self-monitoring/) | `[INTEGRITY CHECK]` |
| *Did the change stay inside what the request names?* | public behaviour a change reaches that the request does not name: a sibling fixed for consistency, a fix in a helper other callers use | [hygiene](../plugins/hygiene-self-monitoring/) | `[HYGIENE CHECK]` |

They come in pairs, and one trio. Persistence, termination and aspiration are one axis: stopping too late on no signal, stopping too early on a signal the agent does not have, and stopping on a result nobody reviewed against its objective after the last change, or while a defect someone could point at is still in it. Executive and coverage are work *outside* the plan and work *below* it; hygiene is work *inside* the plan that reaches past the request - a change that keeps the request's check green, so executive's gate cannot see it. Epistemic and handoff are the knowing side and the transmitting side of one claim: is it true, and did it reach the reader in a form they can use. Progress looks past the turn and keeps what the others leave open on disk, because the message is what a session boundary drops. Integrity reads the route rather than the claim: a green run reached through a fallback, a stand-in or a changed machine is not a result.

Keeping them separate means you install only the questions you need, each is measured on its own, and one plugin's noise does not hide another's signal. Names say what is monitored, never an internal state: what looks like fatigue or avoidance from outside is a training-data artifact, and the plugin's job is to name it, not to adopt it.

## What the agent sees versus what you see

- **The agent** sees one line in its context when a trigger fires. For handoff, progress, coverage, executive, hygiene and aspiration it also has the skill's text from the start of the session (and after a compaction); for the other four it has the skill when it loads it (see *The skill* above).
- **You** see the block in the agent's reply. On Claude Code and Codex, when a hook finds something (a close without its block, a counter over its threshold, open items in the ledger) you also see one short notice line in the transcript. Each plugin can turn it off with `*_NOTICE=0`.

The exact lines each plugin sends are in the [README](../README.md#what-your-agent-sees--and-what-you-see) and in each plugin's own README.

## Where it runs, and where it is weaker

Each plugin is one folder with a host-neutral skill and thin per-host hook adapters:

| Host | How it loads the plugin |
| --- | --- |
| **Claude Code** | `.claude-plugin/plugin.json` + `hooks/hooks.json`, installed from this repository as a marketplace |
| **Codex** (CLI, ChatGPT desktop) | `.codex-plugin/plugin.json` + the same `hooks/hooks.json`; trust the hooks once with `/hooks` |
| **Cursor** | `.cursor-plugin/plugin.json` + `cursor/hooks.json` |
| **Factory Droid** | `.factory-plugin/marketplace.json` + the Claude Code layout and `hooks/hooks.json`, which Droid translates on install. Built from Factory's plugin and hooks references; not run on Droid yet |
| **Any [Agent Plugins](https://agent-plugins.org) client** | `.plugin/plugin.json`: the portable core, skill only, no hooks. Kept out of the plugin root on purpose: Codex reads a root `plugin.json` through a loader that has no hooks slot and then ignores its own manifest ([openai/codex#39895](https://github.com/openai/codex/issues/39895)) |

The skill is the same everywhere; the *when* depends on the events a host exposes. Codex exposes the same events as Claude Code, with the same payload and output envelope, so it runs the Claude Code adapter unchanged. Cursor has no non-blocking per-prompt event and cannot add context after the final message, so some reminders are logged there but not shown to the agent. Droid runs the Claude Code adapter too, but its `Stop` event does not send the final message, so no close check reaches it (the Droid column follows its hooks reference, not a run):

| Layer | Claude Code · Codex | Cursor | Factory Droid |
| --- | --- | --- | --- |
| The skill's text in context (handoff, progress, coverage, executive, hygiene, aspiration) | `SessionStart`: startup, `/clear`, compaction, and a resume that never had it; `SubagentStart` for every subagent | `sessionStart`; subagents do not get it (`subagentStart` takes no context) | `SessionStart`: startup, `/clear`, compaction; subagents do not get it (no subagent-start event) |
| Ask for the skill (the other four), for an agent that does not know the marker | first prompt (+ periodic reminder, and after a compaction); a subagent at its start (persistence, epistemic, termination) | session start | first prompt (+ periodic reminder, and after a compaction); not a subagent at its start |
| A subagent's own record (`agent_id`): its counts and nudges are its own; its changes reach the main agent, its reviews do not | ✓ | **—**: no subagent id read yet (not probed), one record per conversation | **—**: no subagent id in the documented payload |
| Executive checkpoint cadence | every 5th prompt | once per session | every 5th prompt |
| Executive changed-document line | ✓ (Claude Code), at the next prompt | ✓ with the next tool call's result (`postToolUse`) | ? (`Read`'s input is not documented) |
| Executive plan write-back (the third decision since the plan last changed; an answered `revise-plan` with the plan unchanged) | ✓ | — | **—**: `Stop` sends no final message |
| Persistence counters + nudges | ✓ | ✓ | ✓ |
| Epistemic observe nudge | ✓ | ✓ | ✓ (`Execute`) |
| Epistemic / termination close scan | ✓ + retrospective on the next prompt, strict gate | scan + strict gate (`followup_message`); **no retrospective** | **—**: `Stop` sends no final message |
| Coverage stub counter | ✓ | ✓ | ? `Edit` only, if it sends the old and new text (not documented) |
| Coverage ledger prompt (3+ enumerated parts) | ✓ | **—** | ✓ |
| Coverage close scan (deferred work vs. `[COVERAGE CHECK]`) | ✓ + retrospective | **log only**: the agent is not told | **—** |
| Handoff pre-close nudge (first green gate or commit) | ✓ | ✓ | ✓ |
| Handoff close scan (decision named vs. `[HANDOFF]`) | ✓ + retrospective, strict gate | scan + strict gate (`followup_message`); **no retrospective** | **—** |
| Progress ledger status (open items at session start / after compaction) | ✓ (`SessionStart`, first prompt as fallback) | ✓ (`sessionStart`) | ✓ (`SessionStart`) |
| Progress stale-ledger finding (edits, ledger untouched) | ✓ retrospective, once per ledger version | **log only**: the agent is not told | ✓ retrospective |
| Progress claim watch (the session's own claim runs out, ran out, is gone, or shares its item) | ✓ (`PostToolUse` while it holds one, and the next prompt) | **—**: claims are counted in the session-start status; no token, the agent picks its own | ✓ |
| Integrity reader (each edit and shell command) | ✓ | ✓ | ✓ |
| Integrity close (the block, a dispute shown to you) | ✓ | **log only**; not at all on a headless run | **—** |
| Hygiene edit record + nudge (public functions the edits changed, path and lines) | ✓ | ✓ | ✓ |
| Hygiene close (the block against the record) | ✓ + retrospective, strict gate | scan + strict gate (`followup_message`); not at all on a headless run | **—** |

So on Cursor, coverage is the skill plus the stub counter; the closing discipline reaches the agent only through the skill text, and on Droid the same holds for every close check. OpenCode runs the Claude Code hooks (`opencode/bridge.js`) and injects their context on each model call: the skill text and the next-prompt retrospective match, and a strict stop gate does not, because OpenCode cannot refuse the end of a turn. Any other Agent Skills client gets the skills and no hooks. Each plugin's README has its design notes, host differences and debugging tips.
