export type CaptureMode = 'audio' | 'video';
export type SessionStatus = 'preparing' | 'recording' | 'processing' | 'completed' | 'interrupted' | 'failed';

export interface Session {
  id: string;
  mode: CaptureMode;
  status: SessionStatus;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number;
  updatedAt: number;
  mimeType: string | null;
  sizeBytes: number;
  notes: string;
  error: string | null;
  uploadedAt?: number | null;
  captureKind?: 'microphone' | 'episoden-tab' | 'screen-share' | 'chatgpt-tab' | 'webcam';
  transcriptEdits?: { start_ms: number; end_ms: number; text: string }[];
  transcriptUpdatedAt?: string | null;
  transcriptConfirmedAt?: number | null;
  sharedAudio?: boolean;
  analysisMimeType?: string | null;
  analysisSizeBytes?: number;
}

export function hasSeparateVoiceTrack(session: Session): boolean {
  return session.captureKind === 'episoden-tab' || session.captureKind === 'screen-share' || session.captureKind === 'chatgpt-tab' || session.captureKind === 'webcam';
}

interface Chunk { sessionId: string; index: number; blob: Blob }
interface Recording { sessionId: string; blob: Blob }

const DB_NAME = 'conversation-coach-sessions';
const DB_VERSION = 2;
export const RECOVERY_AGE_MS = 30_000;
let databasePromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'sessionId' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['sessionId', 'index'] });
        if (!db.objectStoreNames.contains('analysisRecordings')) db.createObjectStore('analysisRecordings', { keyPath: 'sessionId' });
        if (!db.objectStoreNames.contains('analysisChunks')) db.createObjectStore('analysisChunks', { keyPath: ['sessionId', 'index'] });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error: unknown) => { databasePromise = null; throw error; });
  }
  return databasePromise;
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Local session storage failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Local session storage was interrupted.'));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createSession(mode: CaptureMode, captureKind: Session['captureKind'] = 'microphone'): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(), mode, status: 'preparing', createdAt: now,
    startedAt: null, endedAt: null, durationMs: 0, updatedAt: now,
    mimeType: null, sizeBytes: 0, notes: '', error: null, captureKind,
  };
  const tx = (await database()).transaction('sessions', 'readwrite');
  const done = complete(tx);
  tx.objectStore('sessions').put(session);
  await done;
  return session;
}

export async function updateSession(id: string, changes: Partial<Session>): Promise<Session> {
  const tx = (await database()).transaction('sessions', 'readwrite');
  const done = complete(tx);
  const store = tx.objectStore('sessions');
  let updated: Session | null = null;
  const request = store.get(id) as IDBRequest<Session | undefined>;
  request.onsuccess = () => {
    if (!request.result) { tx.abort(); return; }
    updated = { ...request.result, ...changes, id, updatedAt: Date.now() };
    store.put(updated);
  };
  await done;
  if (!updated) throw new Error('Session was not found.');
  return updated;
}

export async function appendChunk(sessionId: string, index: number, blob: Blob): Promise<void> {
  const tx = (await database()).transaction(['sessions', 'chunks'], 'readwrite');
  const done = complete(tx);
  tx.objectStore('chunks').put({ sessionId, index, blob } satisfies Chunk);
  const sessions = tx.objectStore('sessions');
  const request = sessions.get(sessionId) as IDBRequest<Session | undefined>;
  request.onsuccess = () => {
    if (request.result) sessions.put({ ...request.result, updatedAt: Date.now() });
  };
  await done;
}

export async function appendAnalysisChunk(sessionId: string, index: number, blob: Blob): Promise<void> {
  const tx = (await database()).transaction('analysisChunks', 'readwrite');
  const done = complete(tx);
  tx.objectStore('analysisChunks').put({ sessionId, index, blob } satisfies Chunk);
  await done;
}

export async function listSessions(): Promise<Session[]> {
  const tx = (await database()).transaction('sessions', 'readonly');
  const done = complete(tx);
  const sessions = await result(tx.objectStore('sessions').getAll() as IDBRequest<Session[]>);
  await done;
  return sessions.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecording(sessionId: string): Promise<Blob | null> {
  const tx = (await database()).transaction('recordings', 'readonly');
  const done = complete(tx);
  const recording = await result(tx.objectStore('recordings').get(sessionId) as IDBRequest<Recording | undefined>);
  await done;
  return recording?.blob ?? null;
}

export async function getAnalysisRecording(sessionId: string): Promise<Blob | null> {
  const tx = (await database()).transaction('analysisRecordings', 'readonly');
  const done = complete(tx);
  const recording = await result(tx.objectStore('analysisRecordings').get(sessionId) as IDBRequest<Recording | undefined>);
  await done;
  return recording?.blob ?? null;
}

async function getChunks(sessionId: string, storeName: 'chunks' | 'analysisChunks' = 'chunks'): Promise<Chunk[]> {
  const tx = (await database()).transaction(storeName, 'readonly');
  const done = complete(tx);
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
  const chunks = await result(tx.objectStore(storeName).getAll(range) as IDBRequest<Chunk[]>);
  await done;
  return chunks.sort((a, b) => a.index - b.index);
}

export async function finishSession(
  sessionId: string,
  status: 'completed' | 'interrupted',
  durationMs: number,
  mimeType: string,
  error: string | null = null,
  analysisMimeType: string | null = null,
): Promise<Session> {
  const chunks = await getChunks(sessionId);
  const blob = new Blob(chunks.map((chunk) => chunk.blob), { type: mimeType });
  const analysisChunks = await getChunks(sessionId, 'analysisChunks');
  const analysisBlob = new Blob(analysisChunks.map((chunk) => chunk.blob), { type: analysisMimeType ?? 'audio/webm' });
  const tx = (await database()).transaction(['sessions', 'recordings', 'chunks', 'analysisRecordings', 'analysisChunks'], 'readwrite');
  const done = complete(tx);
  const sessions = tx.objectStore('sessions');
  let finished: Session | null = null;
  const request = sessions.get(sessionId) as IDBRequest<Session | undefined>;
  request.onsuccess = () => {
    if (!request.result) { tx.abort(); return; }
    if (['completed', 'interrupted', 'failed'].includes(request.result.status)) {
      finished = request.result;
      return;
    }
    finished = {
      ...request.result,
      status: blob.size ? status : 'failed',
      endedAt: Date.now(), durationMs,
      mimeType, sizeBytes: blob.size, updatedAt: Date.now(),
      error: blob.size ? error : error ?? 'No media was captured.',
      analysisMimeType: analysisBlob.size ? (analysisMimeType ?? 'audio/webm') : null,
      analysisSizeBytes: analysisBlob.size,
    };
    sessions.put(finished);
    if (blob.size) tx.objectStore('recordings').put({ sessionId, blob } satisfies Recording);
    if (analysisBlob.size) tx.objectStore('analysisRecordings').put({ sessionId, blob: analysisBlob } satisfies Recording);
    for (const storeName of ['chunks', 'analysisChunks'] as const) {
      const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
      const cursorRequest = tx.objectStore(storeName).openCursor(range);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
    }
  };
  await done;
  if (!finished) throw new Error('Session was not found.');
  return finished;
}

export async function recoverInterruptedSessions(activeSessionId: string | null = null): Promise<Session[]> {
  const pending = (await listSessions()).filter((session) =>
    session.id !== activeSessionId && ['preparing', 'recording', 'processing'].includes(session.status)
    && Date.now() - session.updatedAt >= RECOVERY_AGE_MS,
  );
  const recovered: Session[] = [];
  for (const session of pending) {
    recovered.push(await finishSession(
      session.id, 'interrupted',
      session.startedAt ? Math.max(0, session.updatedAt - session.startedAt) : 0,
      session.mimeType ?? (session.mode === 'video' ? 'video/webm' : 'audio/webm'),
      'Recording stopped unexpectedly. Only saved chunks could be recovered.',
    ));
  }
  return recovered;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const tx = (await database()).transaction(['sessions', 'recordings', 'chunks', 'analysisRecordings', 'analysisChunks'], 'readwrite');
  const done = complete(tx);
  tx.objectStore('sessions').delete(sessionId);
  tx.objectStore('recordings').delete(sessionId);
  tx.objectStore('analysisRecordings').delete(sessionId);
  for (const storeName of ['chunks', 'analysisChunks'] as const) {
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
    const cursorRequest = tx.objectStore(storeName).openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
  }
  await done;
}
