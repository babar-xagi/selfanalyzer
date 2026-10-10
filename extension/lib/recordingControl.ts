export type CapturePhase = 'idle' | 'choosing' | 'preparing' | 'recording' | 'processing' | 'completed' | 'interrupted' | 'failed';

export interface CaptureState {
  phase: CapturePhase;
  recorderTabId: number | null;
  returnTabId: number | null;
  sessionId: string | null;
  error: string | null;
  source?: 'screen' | 'chatgpt-tab' | 'webcam' | null;
  updatedAt: number;
}

export type ControlMessage =
  | { type: 'CAPTURE_STATUS' }
  | { type: 'CAPTURE_START'; includeCamera?: boolean }
  | { type: 'CAPTURE_START_TAB' }
  | { type: 'CAPTURE_START_WEBCAM' }
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

export type CaptureLaunch =
  | { kind: 'screen'; streamId: string; includeAudio: boolean; includeCamera: boolean }
  | { kind: 'chatgpt-tab'; streamId: string; includeAudio: true }
  | { kind: 'webcam' };

export function takeCaptureLaunch(): CaptureLaunch | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const streamId = params.get('capture');
  if (streamId) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return params.get('kind') === 'chatgpt-tab'
      ? { kind: 'chatgpt-tab', streamId, includeAudio: true }
      : { kind: 'screen', streamId, includeAudio: params.get('audio') === '1', includeCamera: params.get('camera') === '1' };
  }
  const query = new URLSearchParams(window.location.search);
  if (query.get('webcam') !== '1') return null;
  query.delete('webcam');
  const remaining = query.toString();
  window.history.replaceState(null, '', window.location.pathname + (remaining ? `?${remaining}` : ''));
  return { kind: 'webcam' };
}
