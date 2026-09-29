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
}

interface Chunk { sessionId: string; index: number; blob: Blob }
interface Recording { sessionId: string; blob: Blob }

const DB_NAME = 'conversation-coach-sessions';
const DB_VERSION = 1;
export const RECOVERY_AGE_MS = 30_000;
let databasePromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('recordings', { keyPath: 'sessionId' });
        db.createObjectStore('chunks', { keyPath: ['sessionId', 'index'] });
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

export async function createSession(mode: CaptureMode): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(), mode, status: 'preparing', createdAt: now,
    startedAt: null, endedAt: null, durationMs: 0, updatedAt: now,
    mimeType: null, sizeBytes: 0, notes: '', error: null,
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

async function getChunks(sessionId: string): Promise<Chunk[]> {
  const tx = (await database()).transaction('chunks', 'readonly');
  const done = complete(tx);
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
  const chunks = await result(tx.objectStore('chunks').getAll(range) as IDBRequest<Chunk[]>);
  await done;
  return chunks.sort((a, b) => a.index - b.index);
}

export async function finishSession(
  sessionId: string,
  status: 'completed' | 'interrupted',
  durationMs: number,
  mimeType: string,
  error: string | null = null,
): Promise<Session> {
  const chunks = await getChunks(sessionId);
  const blob = new Blob(chunks.map((chunk) => chunk.blob), { type: mimeType });
  const tx = (await database()).transaction(['sessions', 'recordings', 'chunks'], 'readwrite');
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
    };
    sessions.put(finished);
    if (blob.size) tx.objectStore('recordings').put({ sessionId, blob } satisfies Recording);
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
    const cursorRequest = tx.objectStore('chunks').openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
  };
  await done;
  if (!finished) throw new Error('Session was not found.');
  return finished;
}

export async function recoverInterruptedSessions(): Promise<Session[]> {
  const pending = (await listSessions()).filter((session) =>
    ['preparing', 'recording', 'processing'].includes(session.status)
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
  const tx = (await database()).transaction(['sessions', 'recordings', 'chunks'], 'readwrite');
  const done = complete(tx);
  tx.objectStore('sessions').delete(sessionId);
  tx.objectStore('recordings').delete(sessionId);
  const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
  const cursorRequest = tx.objectStore('chunks').openCursor(range);
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) { cursor.delete(); cursor.continue(); }
  };
  await done;
}
