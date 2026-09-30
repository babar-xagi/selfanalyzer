import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendAnalysisChunk, appendChunk, createSession, deleteSession,
  finishSession, getAnalysisRecording, getRecording, hasSeparateVoiceTrack,
  listSessions, updateSession,
} from '../lib/sessions.ts';

test('upgrades existing sessions and keeps full call separate from analysis audio', async () => {
  const old = indexedDB.open('conversation-coach-sessions', 1);
  old.onupgradeneeded = () => {
    old.result.createObjectStore('sessions', { keyPath: 'id' });
    old.result.createObjectStore('recordings', { keyPath: 'sessionId' });
    old.result.createObjectStore('chunks', { keyPath: ['sessionId', 'index'] });
  };
  const oldDb = await new Promise((resolve, reject) => {
    old.onsuccess = () => resolve(old.result);
    old.onerror = () => reject(old.error);
  });
  const oldTx = oldDb.transaction('sessions', 'readwrite');
  oldTx.objectStore('sessions').put({ id: 'legacy-session', createdAt: 1, mode: 'audio' });
  await new Promise((resolve, reject) => {
    oldTx.oncomplete = resolve;
    oldTx.onerror = () => reject(oldTx.error);
  });
  oldDb.close();

  const session = await createSession('video', 'episoden-tab');
  assert.equal((await listSessions()).some((item) => item.id === 'legacy-session'), true);
  await appendChunk(session.id, 0, new Blob(['call screen and both voices'], { type: 'video/webm' }));
  await appendAnalysisChunk(session.id, 0, new Blob(['my voice only'], { type: 'audio/webm' }));
  const finished = await finishSession(session.id, 'completed', 7000, 'video/webm', null, 'audio/webm');
  assert.equal(finished.captureKind, 'episoden-tab');
  assert.equal(finished.analysisSizeBytes, 13);
  assert.equal(await (await getRecording(session.id)).text(), 'call screen and both voices');
  assert.equal(await (await getAnalysisRecording(session.id)).text(), 'my voice only');

  await deleteSession(session.id);
  await deleteSession('legacy-session');
  assert.equal(await getRecording(session.id), null);
  assert.equal(await getAnalysisRecording(session.id), null);
  assert.deepEqual(await listSessions(), []);
});

test('screen sharing retains the audio availability and isolates analysis audio', async () => {
  const session = await createSession('video', 'screen-share');
  await updateSession(session.id, { sharedAudio: false });
  await appendChunk(session.id, 0, new Blob(['screen and microphone'], { type: 'video/webm' }));
  await appendAnalysisChunk(session.id, 0, new Blob(['my voice'], { type: 'audio/webm' }));
  const finished = await finishSession(session.id, 'completed', 3000, 'video/webm', null, 'audio/webm');
  assert.equal(hasSeparateVoiceTrack(finished), true);
  assert.equal(finished.sharedAudio, false);
  assert.equal(await (await getRecording(session.id)).text(), 'screen and microphone');
  assert.equal(await (await getAnalysisRecording(session.id)).text(), 'my voice');
  await deleteSession(session.id);
});
