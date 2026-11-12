'use strict';
/*
 * OpenCode host bridge. OpenCode loads one npm package, not a marketplace of
 * stdin hooks, so this process drives the Claude Code adapters already in
 * plugins/<name>/hooks/ with the JSON those scripts already accept.
 *
 * The scripts stay the source of the discipline. This file only selects them
 * (hooks.json matcher), runs them, and returns the additionalContext they
 * wrote. It does not reimplement a scanner.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLUGINS = path.join(ROOT, 'plugins');

// OpenCode's tool ids, spelled as the Claude Code matchers and scanners expect.
const TOOLS = {
  bash: 'Bash',
  shell: 'Bash',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  multiedit: 'MultiEdit',
  skill: 'Skill',
  applypatch: 'ApplyPatch',
  apply_patch: 'ApplyPatch',
  create: 'Create',
  execute: 'Execute',
};

function plugins() {
  return fs.readdirSync(PLUGINS)
    .filter((name) => fs.existsSync(path.join(PLUGINS, name, 'hooks/hooks.json')))
    .sort();
}

function hookFile(command) {
  const m = String(command || '').match(/hooks\/([\w.-]+\.js)/);
  return m ? m[1] : null;
}

function matches(matcher, value) {
  if (!matcher) return true;
  try { return new RegExp(matcher).test(String(value || '')); }
  catch (_) { return false; }
}

function matchField(event, payload) {
  if (event === 'SessionStart') return payload.source || '';
  if (event === 'PreToolUse' || event === 'PostToolUse') return payload.tool_name || '';
  return '';
}

function scripts(plugin, event, matchValue) {
  const raw = JSON.parse(fs.readFileSync(path.join(PLUGINS, plugin, 'hooks/hooks.json'), 'utf8'));
  const out = [];
  for (const entry of (raw.hooks && raw.hooks[event]) || []) {
    if (!matches(entry.matcher, matchValue)) continue;
    for (const hook of entry.hooks || []) {
      const name = hookFile(hook.command);
      if (name) out.push(path.join(PLUGINS, plugin, 'hooks', name));
    }
  }
  return out;
}

function claudeTool(name) {
  const raw = String(name || '');
  return TOOLS[raw.toLowerCase()] || raw;
}

function runScript(script, payload) {
  const env = Object.assign({}, process.env, { CLAUDECODE: '1' });
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env,
    cwd: path.dirname(path.dirname(script)),
    timeout: 15000,
  });
  let additionalContext = '';
  let systemMessage = '';
  try {
    const parsed = JSON.parse(result.stdout || '');
    additionalContext = (parsed && parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext) || '';
    systemMessage = (parsed && parsed.systemMessage) || '';
  } catch (_) { /* a hook that prints nothing is a hook with nothing to say */ }
  return {
    additionalContext,
    systemMessage,
    code: result.status,
    stderr: result.stderr || '',
  };
}

/*
 * Run every plugin's hooks for one Claude-shaped event.
 * Returns the model-facing texts. systemMessage is for the person; OpenCode
 * has no transcript notice, so it is counted and not returned as context.
 */
function run(event, payload, matchValue) {
  const value = matchValue !== undefined ? matchValue : matchField(event, payload);
  const parts = [];
  let blocked = false;
  let notices = 0;
  for (const plugin of plugins()) {
    const texts = [];
    for (const script of scripts(plugin, event, value)) {
      const result = runScript(script, payload);
      if (result.code === 2) blocked = true;
      if (result.systemMessage) notices += 1;
      if (result.additionalContext) texts.push(result.additionalContext);
    }
    if (texts.length) parts.push({ plugin, text: texts.join('\n\n') });
  }
  return { parts, blocked, notices };
}

function frontmatter(block, key) {
  const line = block.split(/\r?\n/).find((item) => item.startsWith(key + ':'));
  if (!line) return '';
  let value = line.slice(key.length + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return value.trim();
}

function skills() {
  const out = [];
  for (const plugin of plugins()) {
    const file = path.join(PLUGINS, plugin, 'skills', plugin, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const markdown = fs.readFileSync(file, 'utf8');
    const wrapped = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    const body = (wrapped ? markdown.slice(wrapped[0].length) : markdown).trim();
    const head = wrapped ? wrapped[1] : '';
    out.push({
      id: frontmatter(head, 'name') || plugin,
      name: frontmatter(head, 'name') || plugin,
      description: frontmatter(head, 'description'),
      path: file,
      content: body,
    });
  }
  return out;
}

function textOf(part) {
  if (!part) return '';
  if (typeof part === 'string') return part;
  if (typeof part.text === 'string') return part.text;
  return '';
}

function assistantText(page) {
  const list = Array.isArray(page) ? page
    : (page && (page.data || page.messages || page.items)) || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const message = list[i];
    const role = (message && message.info && message.info.role) || (message && message.role);
    if (role !== 'assistant') continue;
    if (typeof message.content === 'string' && message.content.trim()) return message.content;
    const parts = message.parts || (Array.isArray(message.content) ? message.content : null);
    if (typeof parts === 'string' && parts.trim()) return parts;
    if (Array.isArray(parts)) {
      const text = parts.map(textOf).filter(Boolean).join('\n').trim();
      if (text) return text;
    }
  }
  return '';
}

module.exports = {
  plugins, scripts, claudeTool, run, runScript, skills, assistantText, PLUGINS,
};
