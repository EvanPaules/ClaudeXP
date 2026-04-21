import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseTranscript } from '../engine.js';

function writeTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudexp-engine-'));
  const file = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
  return file;
}

function assistantTool(name, input = {}, timestamp = '2026-04-18T10:00:00.000Z') {
  return {
    timestamp,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', name, input }],
    },
  };
}

test('returns empty defaults when transcript path is missing', () => {
  const s = parseTranscript('/nonexistent/path.jsonl');
  assert.equal(s.toolUses, 0);
  assert.equal(s.uniqueToolTypes, 0);
  assert.equal(s.usedBash, false);
  assert.equal(s.editedTestFile, false);
  assert.equal(s.crossedLocalMidnight, false);
});

test('tracks unique tool types across multiple tool uses', () => {
  const file = writeTranscript([
    assistantTool('Read', { file_path: '/a.js' }),
    assistantTool('Read', { file_path: '/b.js' }),
    assistantTool('Edit', { file_path: '/a.js' }),
    assistantTool('Bash', { command: 'ls' }),
  ]);
  const s = parseTranscript(file);
  assert.equal(s.toolUses, 4);
  assert.equal(s.uniqueToolTypes, 3);
});

test('detects Bash usage', () => {
  const file = writeTranscript([assistantTool('Bash', { command: 'echo hi' })]);
  const s = parseTranscript(file);
  assert.equal(s.usedBash, true);
});

test('does not mark usedBash when Bash is absent', () => {
  const file = writeTranscript([assistantTool('Read', { file_path: '/x.js' })]);
  const s = parseTranscript(file);
  assert.equal(s.usedBash, false);
});

test('detects test file edits by .test. suffix', () => {
  const file = writeTranscript([
    assistantTool('Edit', { file_path: '/src/foo.test.js' }),
  ]);
  const s = parseTranscript(file);
  assert.equal(s.editedTestFile, true);
});

test('detects test file edits by .spec. suffix', () => {
  const file = writeTranscript([
    assistantTool('Write', { file_path: '/src/bar.spec.ts' }),
  ]);
  const s = parseTranscript(file);
  assert.equal(s.editedTestFile, true);
});

test('detects test file edits by _test suffix', () => {
  const file = writeTranscript([
    assistantTool('Edit', { file_path: '/go/baz_test.go' }),
  ]);
  const s = parseTranscript(file);
  assert.equal(s.editedTestFile, true);
});

test('does not flag non-test file edits', () => {
  const file = writeTranscript([
    assistantTool('Edit', { file_path: '/src/index.js' }),
  ]);
  const s = parseTranscript(file);
  assert.equal(s.editedTestFile, false);
});

test('crossedLocalMidnight flips when timestamps span local days', () => {
  // Use timestamps far enough apart to guarantee different local days in any TZ.
  const file = writeTranscript([
    assistantTool('Read', { file_path: '/a.js' }, '2026-04-18T00:30:00.000Z'),
    assistantTool('Read', { file_path: '/b.js' }, '2026-04-20T00:30:00.000Z'),
  ]);
  const s = parseTranscript(file);
  assert.equal(s.crossedLocalMidnight, true);
});

test('crossedLocalMidnight stays false for tight time window', () => {
  const file = writeTranscript([
    assistantTool('Read', { file_path: '/a.js' }, '2026-04-18T10:00:00.000Z'),
    assistantTool('Read', { file_path: '/b.js' }, '2026-04-18T10:05:00.000Z'),
  ]);
  const s = parseTranscript(file);
  assert.equal(s.crossedLocalMidnight, false);
});

test('preserves existing signals (backward compat)', () => {
  const file = writeTranscript([
    assistantTool('Edit', { file_path: '/a.js' }),
    assistantTool('Edit', { file_path: '/b.js' }),
    {
      timestamp: '2026-04-18T10:00:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'I am fixing a bug here' }],
      },
    },
  ]);
  const s = parseTranscript(file);
  assert.equal(s.toolUses, 2);
  assert.equal(s.uniqueFiles, 2);
  assert.equal(s.isBugFix, true);
});
