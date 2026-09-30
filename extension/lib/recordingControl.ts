export type CapturePhase = 'idle' | 'choosing' | 'preparing' | 'recording' | 'processing' | 'completed' | 'interrupted' | 'failed';

export interface CaptureState {
  phase: CapturePhase;
  recorderTabId: number | null;
  returnTabId: number | null;
  sessionId: string | null;
  error: string | null;
  updatedAt: number;
}

export type ControlMessage =
  | { type: 'CAPTURE_STATUS' }
  | { type: 'CAPTURE_START' }
  | { type: 'CAPTURE_STOP' }
  | { type: 'CAPTURE_OPEN' }
  | { type: 'RECORDER_STARTED'; sessionId: string }
  | { type: 'RECORDER_FINISHED'; sessionId: string; phase: 'completed' | 'interrupted' | 'failed'; error: string | null }
  | { type: 'RECORDER_FAILED'; error: string }
  | { type: 'RECORDER_STOP'; sessionId: string };

export interface ControlReply {
  ok: boolean;
  state: CaptureState;
  error?: string;
}

export interface CaptureLaunch {
  streamId: string;
  includeAudio: boolean;
}

export function takeCaptureLaunch(): CaptureLaunch | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const streamId = params.get('capture');
  if (!streamId) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { streamId, includeAudio: params.get('audio') === '1' };
}
