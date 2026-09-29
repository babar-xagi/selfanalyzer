import type { Session } from './sessions';

export const LOCAL_API_URL = 'http://127.0.0.1:8000';

export interface RemoteSession {
  session_id: string;
  status: 'created' | 'uploaded' | 'completed';
  has_recording: boolean;
  size_bytes: number | null;
  sha256: string | null;
}

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface RemoteTranscript {
  session_id: string;
  status: 'not_started' | 'queued' | 'running' | 'completed' | 'failed';
  language: string | null;
  text: string;
  segments: TranscriptSegment[];
  error: string | null;
  updated_at: string | null;
}

export interface GrammarCorrection {
  timestamp_ms: number;
  original: string;
  corrected: string;
  natural_alternative: string;
  explanation: string;
  category: string;
}

export interface RemoteGrammar {
  session_id: string;
  status: 'not_started' | 'queued' | 'running' | 'completed' | 'failed';
  corrections: GrammarCorrection[];
  error: string | null;
  updated_at: string | null;
}

interface UploadOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  init: RequestInit,
  options: Required<Pick<UploadOptions, 'baseUrl' | 'fetchImpl'>> & Pick<UploadOptions, 'signal'>,
): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set('X-Conversation-Coach-Client', 'extension');
    response = await options.fetchImpl.call(globalThis, `${options.baseUrl}${path}`, {
      ...init,
      signal: options.signal,
      headers,
    });
  } catch (cause) {
    const reason = cause instanceof Error ? ` (${cause.message})` : '';
    throw new Error(`The local Python API is unavailable. Start it on 127.0.0.1:8000 and try again.${reason}`);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload
      ? String(payload.detail)
      : `HTTP ${response.status}`;
    throw new Error(`The local Python API rejected the session: ${detail}`);
  }
  return payload as T;
}

export async function getTranscript(sessionId: string, options: UploadOptions = {}): Promise<RemoteTranscript> {
  return request<RemoteTranscript>(`/sessions/${encodeURIComponent(sessionId)}/transcript`, { method: 'GET' }, {
    baseUrl: options.baseUrl ?? LOCAL_API_URL,
    fetchImpl: options.fetchImpl ?? fetch,
    signal: options.signal,
  });
}

export async function startTranscript(sessionId: string, options: UploadOptions = {}): Promise<RemoteTranscript> {
  return request<RemoteTranscript>(`/sessions/${encodeURIComponent(sessionId)}/transcript`, { method: 'POST' }, {
    baseUrl: options.baseUrl ?? LOCAL_API_URL,
    fetchImpl: options.fetchImpl ?? fetch,
    signal: options.signal,
  });
}

export async function getGrammar(sessionId: string, options: UploadOptions = {}): Promise<RemoteGrammar> {
  return request<RemoteGrammar>(`/sessions/${encodeURIComponent(sessionId)}/grammar`, { method: 'GET' }, {
    baseUrl: options.baseUrl ?? LOCAL_API_URL,
    fetchImpl: options.fetchImpl ?? fetch,
    signal: options.signal,
  });
}

export async function startGrammar(sessionId: string, options: UploadOptions = {}): Promise<RemoteGrammar> {
  return request<RemoteGrammar>(`/sessions/${encodeURIComponent(sessionId)}/grammar`, { method: 'POST' }, {
    baseUrl: options.baseUrl ?? LOCAL_API_URL,
    fetchImpl: options.fetchImpl ?? fetch,
    signal: options.signal,
  });
}

export async function uploadSession(
  session: Session,
  recording: Blob,
  options: UploadOptions = {},
): Promise<RemoteSession> {
  if (!recording.size) throw new Error('There is no recording to send.');
  const settings = {
    baseUrl: options.baseUrl ?? LOCAL_API_URL,
    fetchImpl: options.fetchImpl ?? fetch,
    signal: options.signal,
  };
  const path = `/sessions/${encodeURIComponent(session.id)}`;
  const created = await request<RemoteSession>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: session.id,
      mode: session.mode,
      created_at: new Date(session.createdAt).toISOString(),
      started_at: session.startedAt ? new Date(session.startedAt).toISOString() : null,
    }),
  }, settings);
  if (created.session_id !== session.id) throw new Error('The local Python API returned a different session ID.');

  const mimeType = recording.type || (session.mode === 'video' ? 'video/webm' : 'audio/webm');
  const typedRecording = recording.type ? recording : new Blob([recording], { type: mimeType });
  const form = new FormData();
  form.append('file', typedRecording, `recording.${mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'}`);
  const uploaded = await request<RemoteSession>(`${path}/recording`, {
    method: 'POST', body: form,
  }, settings);
  if (uploaded.session_id !== session.id || !uploaded.has_recording || uploaded.size_bytes !== recording.size)
    throw new Error('The local Python API did not confirm the uploaded recording.');

  const finished = await request<RemoteSession>(`${path}/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ended_at: new Date(session.endedAt ?? Date.now()).toISOString(),
      duration_ms: Math.round(session.durationMs),
      notes: session.notes,
      source_status: session.status === 'interrupted' ? 'interrupted' : 'completed',
    }),
  }, settings);
  if (finished.session_id !== session.id || finished.status !== 'completed')
    throw new Error('The local Python API did not finish the session.');

  const verified = await request<RemoteSession>(path, { method: 'GET' }, settings);
  if (verified.session_id !== session.id || verified.status !== 'completed' || !verified.has_recording)
    throw new Error('The local Python API did not retain the session.');
  return verified;
}
