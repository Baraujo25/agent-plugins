'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const bridge = require('./bridge.js');

function base(session, extra) {
  return Object.assign({ session_id: session, cwd: os.tmpdir() }, extra);
}

test('opencode bridge: SessionStart startup injects the skill text and skips resume-only hooks', () => {
  const session = `oc-start-${Date.now()}`;
  assert.deepEqual(
    bridge.scripts('termination-self-monitoring', 'SessionStart', 'startup'),
    [],
    'termination reloads only on resume or compact',
  );
  const compact = bridge.scripts('termination-self-monitoring', 'SessionStart', 'compact');
  assert.ok(compact.some((file) => file.endsWith('term-session-start.js')));
  const started = bridge.run('SessionStart', base(session, { hook_event_name: 'SessionStart', source: 'startup' }));
  const coverage = started.parts.find((part) => part.plugin === 'coverage-self-monitoring');
  assert.ok(coverage, 'coverage injects on startup');
  assert.match(coverage.text, /coverage-self-monitoring skill is loaded/);
});

test('opencode bridge: the first prompt loads termination, and a state-shaped close is said on the next prompt', () => {
  const session = `oc-term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const first = bridge.run('UserPromptSubmit', base(session, {
    hook_event_name: 'UserPromptSubmit',
    prompt: 'do the thing',
  }));
  const load = first.parts.find((part) => part.plugin === 'termination-self-monitoring');
  assert.ok(load, 'turn 1 loads the discipline');
  assert.match(load.text, /\[TERMINATION CHECK\]/);

  bridge.run('Stop', base(session, {
    hook_event_name: 'Stop',
    last_assistant_message: 'I am not confident enough to continue, given the complexity of this.',
    stop_hook_active: true,
  }));
  const next = bridge.run('UserPromptSubmit', base(session, {
    hook_event_name: 'UserPromptSubmit',
    prompt: 'go on',
  }));
  const again = next.parts.find((part) => part.plugin === 'termination-self-monitoring');
  assert.ok(again, 'the next prompt still hears termination');
  assert.match(again.text, /previous turn ended on a state-shaped reason/);
});

test('opencode bridge: OpenCode shell and edit tool ids match the Claude matchers', () => {
  assert.equal(bridge.claudeTool('bash'), 'Bash');
  assert.equal(bridge.claudeTool('edit'), 'Edit');
  assert.equal(bridge.claudeTool('skill'), 'Skill');
  const observe = bridge.scripts('epistemic-self-monitoring', 'PostToolUse', bridge.claudeTool('bash'));
  assert.ok(observe.some((file) => file.endsWith('epi-observe.js')));
  assert.deepEqual(bridge.scripts('epistemic-self-monitoring', 'PostToolUse', 'read'), []);
});

test('opencode bridge: assistant text is the last assistant message, in either transcript shape', () => {
  const shaped = bridge.assistantText({
    messages: [
      { role: 'user', content: 'go' },
      { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'not confident enough' }, { type: 'tool', name: 'bash' }] },
    ],
  });
  assert.equal(shaped, 'not confident enough');
  assert.equal(bridge.assistantText([{ role: 'assistant', content: 'done' }]), 'done');
});
