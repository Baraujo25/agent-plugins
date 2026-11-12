/*
 * OpenCode plugin. One package drives every plugin's Claude Code hooks.
 *
 * What matches Claude Code: the skill text is in context from the first
 * step, a turn reminder and a retrospective arrive on the next prompt, and
 * tool observations use the same scanners.
 *
 * What does not: OpenCode has no stop hook that can refuse the end of a
 * turn. A strict gate (exit 2, Cursor's followup_message) is reported by
 * the bridge and not turned into another turn. The stop payload sets
 * stop_hook_active so the hook parks the finding for the next prompt
 * instead of exiting 2 into a void. A one-line systemMessage for the
 * person is not shown; OpenCode has no field for it.
 */
import { Plugin, Skill } from "@opencode/plugin"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const bridge = require("./bridge.js")

const sessions = new Map()

function bag(id) {
  let current = sessions.get(id)
  if (!current) {
    current = { started: false, seen: "", skill: new Map(), turn: new Map(), tool: [] }
    sessions.set(id, current)
  }
  return current
}

function remember(map, parts) {
  const seen = new Set()
  for (const part of parts) {
    seen.add(part.plugin)
    map.set(part.plugin, part.text)
  }
  return seen
}

function visible(current) {
  return [...current.skill.values(), ...current.turn.values(), ...current.tool]
}

function projectDir(ctx, event) {
  return (event && (event.directory || event.cwd))
    || (ctx.location && (ctx.location.directory || (ctx.location.project && ctx.location.project.directory)))
    || process.cwd()
}

function payload(sessionID, cwd, extra) {
  return Object.assign({ session_id: sessionID, cwd, hook_event_name: extra.hook_event_name }, extra)
}

function toolPayload(sessionID, cwd, event, output) {
  const name = bridge.claudeTool(event.tool || event.name || "")
  const input = event.input || event.args || event.toolInput || {}
  return payload(sessionID, cwd, {
    hook_event_name: output === undefined ? "PreToolUse" : "PostToolUse",
    tool_name: name,
    tool_input: input,
    tool_output: output,
  })
}

function outputOf(event) {
  if (event.output !== undefined) return event.output
  if (event.result !== undefined) return event.result
  if (event.error) return String(event.error.message || event.error)
  return ""
}

function sessionOf(event, fallback) {
  return event.sessionID || event.sessionId || (event.session && event.session.id) || fallback || ""
}

async function registerSkills(ctx) {
  if (!ctx.skill || typeof ctx.skill.transform !== "function" || !Skill || !Skill.ID || !Skill.Name) return
  const listed = bridge.skills()
  await ctx.skill.transform((editor) => {
    for (const skill of listed) {
      try {
        const fields = Skill.Info && Skill.Info.fields
        const path = fields && fields.path ? fields.path.make(skill.path) : skill.path
        const description = fields && fields.description
          ? fields.description.make(skill.description)
          : skill.description
        editor.add({
          id: Skill.ID.make(skill.id),
          name: Skill.Name.make(skill.name),
          description,
          path,
          content: skill.content,
        })
      } catch (_) { /* one skill failing leaves the others */ }
    }
  })
}

let latestSession = ""

export default Plugin.define({
  id: "agent-plugins",
  async setup(ctx) {
    try { await registerSkills(ctx) } catch (_) { /* the injected skill text still runs */ }

    await ctx.session.hook("prompt", async (event) => {
      try {
        const sessionID = sessionOf(event, "")
        if (!sessionID) return
        latestSession = sessionID
        const cwd = projectDir(ctx, event)
        const current = bag(sessionID)
        current.tool = []
        if (!current.started) {
          const started = bridge.run("SessionStart", payload(sessionID, cwd, {
            hook_event_name: "SessionStart",
            source: "startup",
          }))
          remember(current.skill, started.parts)
          current.started = true
        }
        let last = ""
        try {
          const page = await ctx.session.context({ sessionID })
          last = bridge.assistantText(page)
        } catch (_) { /* no transcript yet */ }
        const stamp = last ? `${last.length}:${last.slice(0, 180)}:${last.slice(-180)}` : ""
        if (stamp && stamp !== current.seen) {
          current.seen = stamp
          // stop_hook_active: there is no OpenCode stop gate, so park the
          // finding for the prompt hook below instead of exiting 2.
          bridge.run("Stop", payload(sessionID, cwd, {
            hook_event_name: "Stop",
            last_assistant_message: last,
            stop_hook_active: true,
          }))
        }
        const prompt = bridge.run("UserPromptSubmit", payload(sessionID, cwd, {
          hook_event_name: "UserPromptSubmit",
          prompt: (event.prompt && event.prompt.text) || "",
        }))
        const said = remember(current.turn, prompt.parts)
        for (const plugin of [...current.turn.keys()]) {
          if (!said.has(plugin)) current.turn.delete(plugin)
        }
      } catch (_) { /* a host error must not block the prompt */ }
    })

    await ctx.session.hook("context", (event) => {
      try {
        const current = sessions.get(sessionOf(event, latestSession))
        if (!current || !Array.isArray(event.system)) return
        for (const text of visible(current)) event.system.push({ type: "text", text })
      } catch (_) {}
    })

    await ctx.session.hook("compaction", (event) => {
      try {
        const sessionID = sessionOf(event, latestSession)
        if (!sessionID) return
        const current = bag(sessionID)
        const again = bridge.run("SessionStart", payload(sessionID, projectDir(ctx, event), {
          hook_event_name: "SessionStart",
          source: "compact",
        }))
        remember(current.skill, again.parts)
        current.started = true
      } catch (_) {}
    })

    await ctx.session.hook("fork", (event) => {
      try {
        const sessionID = sessionOf(event, "")
        if (!sessionID) return
        const current = bag(sessionID)
        const started = bridge.run("SubagentStart", payload(sessionID, projectDir(ctx, event), {
          hook_event_name: "SubagentStart",
        }))
        remember(current.skill, started.parts)
        current.started = true
      } catch (_) {}
    })

    const observe = (phase) => async (event) => {
      try {
        if (phase === "PostToolUse" && event.status && event.status !== "completed") return
        const sessionID = sessionOf(event, latestSession)
        if (!sessionID) return
        const cwd = projectDir(ctx, event)
        const body = toolPayload(sessionID, cwd, event, phase === "PreToolUse" ? undefined : outputOf(event))
        body.hook_event_name = phase
        const result = bridge.run(phase, body)
        const current = bag(sessionID)
        for (const part of result.parts) current.tool.push(part.text)
      } catch (_) {}
    }

    await ctx.tool.hook("execute.before", observe("PreToolUse"))
    await ctx.tool.hook("execute.after", observe("PostToolUse"))

    return () => { sessions.clear() }
  },
})
