// Run with the local API listening on 127.0.0.1:8000.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/backend.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { uploadSession, getTranscript } = await import(url);

const now = Date.now();
const session = {
  id: randomUUID(),
  mode: 'audio',
  status: 'completed',
  createdAt: now - 5000,
  startedAt: now - 4000,
  endedAt: now,
  durationMs: 4000,
  notes: 'Synthetic integration test.',
};
const recording = new Blob([new TextEncoder().encode('synthetic recording for API integration')], {
  type: 'audio/webm',
});

function browserStyleFetch(...args) {
  assert.equal(this, globalThis, 'fetch must be called with its browser context');
  return fetch(...args);
}

const remote = await uploadSession(session, recording, { fetchImpl: browserStyleFetch });
assert.equal(remote.session_id, session.id);
assert.equal(remote.status, 'completed');
assert.equal(remote.size_bytes, recording.size);
assert.equal(remote.has_recording, true);
assert.match(remote.sha256, /^[0-9a-f]{64}$/);
const transcript = await getTranscript(session.id, { fetchImpl: browserStyleFetch });
assert.equal(transcript.session_id, session.id);
assert.equal(transcript.status, 'not_started');
console.log(`TypeScript client uploaded session ${session.id} (${remote.size_bytes} bytes).`);
