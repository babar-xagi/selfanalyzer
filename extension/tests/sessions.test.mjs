import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendAnalysisChunk, appendChunk, createSession, deleteSession,
  finishSession, getAnalysisRecording, getRecording, hasSeparateVoiceTrack,
  listSessions, recoverInterruptedSessions, updateSession,
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

test('screen sharing saves video and microphone audio after the share ends', async () => {
  const session = await createSession('video', 'screen-share');
  await updateSession(session.id, { sharedAudio: false });
  await appendChunk(session.id, 0, new Blob(['screen and microphone'], { type: 'video/webm' }));
  await appendAnalysisChunk(session.id, 0, new Blob(['my voice'], { type: 'audio/webm' }));
  const finished = await finishSession(session.id, 'interrupted', 3000, 'video/webm', 'The screen share stopped.', 'audio/webm');
  assert.equal(hasSeparateVoiceTrack(finished), true);
  assert.equal(finished.status, 'interrupted');
  assert.equal(finished.sharedAudio, false);
  assert.equal(await (await getRecording(session.id)).text(), 'screen and microphone');
  assert.equal(await (await getAnalysisRecording(session.id)).text(), 'my voice');
  await deleteSession(session.id);
});

test('meeting screen and camera recording keeps mixed call audio for transcription', async () => {
  const session = await createSession('video', 'screen-share');
  await updateSession(session.id, { sharedAudio: true });
  await appendChunk(session.id, 0, new Blob(['screen, face, partner and microphone'], { type: 'video/webm' }));
  await appendAnalysisChunk(session.id, 0, new Blob(['partner and microphone'], { type: 'audio/webm' }));
  const finished = await finishSession(session.id, 'completed', 4000, 'video/webm', null, 'audio/webm');
  assert.equal(finished.status, 'completed');
  assert.equal(finished.sharedAudio, true);
  assert.equal(await (await getRecording(session.id)).text(), 'screen, face, partner and microphone');
  assert.equal(await (await getAnalysisRecording(session.id)).text(), 'partner and microphone');
  await deleteSession(session.id);
});

test('recovery never takes over the screen session still owned by the recorder', async () => {
  const realNow = Date.now;
  let session;
  try {
    Date.now = () => realNow() - 60_000;
    session = await createSession('video', 'screen-share');
    await updateSession(session.id, { status: 'recording' });
    await appendChunk(session.id, 0, new Blob(['captured screen'], { type: 'video/webm' }));
  } finally { Date.now = realNow; }
  assert.deepEqual(await recoverInterruptedSessions(session.id), []);
  assert.equal((await listSessions()).find((item) => item.id === session.id).status, 'recording');
  const recovered = await recoverInterruptedSessions();
  assert.equal(recovered[0].status, 'interrupted');
  assert.equal(await (await getRecording(session.id)).text(), 'captured screen');
  await deleteSession(session.id);
});

test('ChatGPT tab keeps shared audio in video and mixed audio for transcript', async () => {
  const session = await createSession('video', 'chatgpt-tab');
  await updateSession(session.id, { sharedAudio: true });
  await appendChunk(session.id, 0, new Blob(['tab audio plus microphone'], { type: 'video/webm' }));
  await appendAnalysisChunk(session.id, 0, new Blob(['ChatGPT voice and microphone'], { type: 'audio/webm' }));
  const finished = await finishSession(session.id, 'completed', 3000, 'video/webm', null, 'audio/webm');
  assert.equal(hasSeparateVoiceTrack(finished), true);
  assert.equal(finished.sharedAudio, true);
  assert.equal(await (await getRecording(session.id)).text(), 'tab audio plus microphone');
  assert.equal(await (await getAnalysisRecording(session.id)).text(), 'ChatGPT voice and microphone');
  await deleteSession(session.id);
});

test('webcam video keeps its microphone track and corrected transcript metadata', async () => {
  const session = await createSession('video', 'webcam');
  await appendChunk(session.id, 0, new Blob(['camera and voice'], { type: 'video/webm' }));
  await appendAnalysisChunk(session.id, 0, new Blob(['voice'], { type: 'audio/webm' }));
  await finishSession(session.id, 'completed', 2000, 'video/webm', null, 'audio/webm');
  const corrected = await updateSession(session.id, {
    transcriptEdits: [{ start_ms: 0, end_ms: 2000, text: 'I went yesterday.' }],
    transcriptUpdatedAt: '2026-10-05T12:00:00Z',
  });
  assert.equal(corrected.captureKind, 'webcam');
  assert.equal(hasSeparateVoiceTrack(corrected), true);
  assert.equal(corrected.transcriptEdits[0].text, 'I went yesterday.');
  assert.equal(await (await getRecording(session.id)).text(), 'camera and voice');
  assert.equal(await (await getAnalysisRecording(session.id)).text(), 'voice');
  await deleteSession(session.id);
});
