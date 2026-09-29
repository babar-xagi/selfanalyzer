import { useEffect, useRef, useState } from 'react';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getPracticeFocus, getPracticeFocusLabel } from '../../lib/focus';
import { uploadSession } from '../../lib/backend';
import {
  appendChunk, createSession, deleteSession, finishSession, getRecording,
  listSessions, recoverInterruptedSessions, updateSession,
  type CaptureMode, type Session, type SessionStatus,
} from '../../lib/sessions';

type ViewStatus = 'idle' | SessionStatus;
type CameraStatus = 'off' | 'requesting' | 'ready';
type DeviceName = 'camera' | 'microphone';

function duration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  return hours ? `${String(hours).padStart(2, '0')}:${mmss}` : mmss;
}

function deviceError(error: unknown, device: DeviceName): string {
  if (error instanceof DOMException) {
    if (['NotAllowedError', 'PermissionDeniedError'].includes(error.name))
      return `${device === 'camera' ? 'Camera' : 'Microphone'} access was denied. Allow it in browser settings and try again.`;
    if (['NotFoundError', 'DevicesNotFoundError'].includes(error.name))
      return `No ${device} was found. Connect one and try again.`;
    if (['NotReadableError', 'TrackStartError'].includes(error.name))
      return `The ${device} is busy or unavailable. Close other apps using it and try again.`;
  }
  return `The ${device} could not be started. Check browser permissions and try again.`;
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function recorderOptions(mode: CaptureMode): MediaRecorderOptions | undefined {
  const candidates = mode === 'video'
    ? ['video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

function extension(mimeType: string, mode: CaptureMode): string {
  if (mimeType.includes('mp4')) return mode === 'video' ? 'mp4' : 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

const activeStatuses: ViewStatus[] = ['preparing', 'recording', 'processing'];

export function App() {
  const [mode, setMode] = useState<CaptureMode>('audio');
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('off');
  const [status, setStatus] = useState<ViewStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [notes, setNotes] = useState('');
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const selectionTokenRef = useRef(0);
  const startedRef = useRef(0);
  const mountedRef = useRef(false);
  const focus = getPracticeFocus();

  function releaseCamera() {
    stopStream(cameraRef.current);
    cameraRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    if (mountedRef.current) setCameraStatus('off');
  }

  function releaseStreams() {
    stopStream(microphoneRef.current);
    microphoneRef.current = null;
    releaseCamera();
  }

  function clearPlayback() {
    selectionTokenRef.current += 1;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setRecordingUrl(null);
  }

  async function refreshSessions() {
    try { if (mountedRef.current) setSessions(await listSessions()); }
    catch { if (mountedRef.current) setError('Local session history could not be opened. Check available browser storage.'); }
  }

  async function recover() {
    try {
      const recovered = await recoverInterruptedSessions();
      if (mountedRef.current) {
        await refreshSessions();
        if (recovered.length) setNotice(`${recovered.length} interrupted session${recovered.length === 1 ? '' : 's'} recovered from saved chunks.`);
      }
    } catch {
      if (mountedRef.current) setError('An interrupted session could not be recovered from local storage.');
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void recover();
    const recoveryTimer = window.setInterval(() => { void recover(); }, 10_000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(recoveryTimer);
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      stopStream(microphoneRef.current);
      stopStream(cameraRef.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedRef.current), 250);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!activeStatuses.includes(status)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  useEffect(() => {
    const preview = previewRef.current;
    if (preview && cameraStatus === 'ready') {
      preview.srcObject = cameraRef.current;
      void preview.play().catch(() => setError('Camera preview could not play. Check browser media settings.'));
    }
    return () => { if (preview) preview.srcObject = null; };
  }, [cameraStatus]);

  async function enableCamera() {
    setError(''); setNotice(''); setCameraStatus('requesting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('off'); setError('This browser does not support camera preview.'); return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mountedRef.current) { stopStream(camera); return; }
      cameraRef.current = camera;
      for (const track of camera.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (recorderRef.current?.state === 'recording') return;
          releaseCamera();
          setError('The camera disconnected. Reconnect it and enable the preview again.');
        }, { once: true });
      }
      setCameraStatus('ready');
    } catch (cause) {
      if (mountedRef.current) { setCameraStatus('off'); setError(deviceError(cause, 'camera')); }
    }
  }

  async function startRecording() {
    setError(''); setNotice(''); setElapsedMs(0);
    clearPlayback(); setSelected(null); setNotes('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support recording. Try a recent version of Chrome.'); return;
    }
    if (mode === 'video' && cameraRef.current?.getVideoTracks()[0]?.readyState !== 'live') {
      releaseCamera(); setError('Enable the camera preview before recording video.'); return;
    }

    let session: Session;
    try { session = await createSession(mode); }
    catch { setError('Local storage is unavailable. Free space or enable browser storage, then try again.'); return; }
    activeIdRef.current = session.id;
    setStatus('preparing');
    await refreshSessions();

    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!mountedRef.current) { stopStream(microphone); return; }
      const videoTracks = mode === 'video' ? cameraRef.current?.getVideoTracks() ?? [] : [];
      if (mode === 'video' && videoTracks[0]?.readyState !== 'live') {
        stopStream(microphone);
        throw new Error('The camera disconnected. Enable the preview and try again.');
      }
      microphoneRef.current = microphone;
      const recorder = new MediaRecorder(new MediaStream([...videoTracks, ...microphone.getAudioTracks()]), recorderOptions(mode));
      recorderRef.current = recorder;
      const mimeType = recorder.mimeType || (mode === 'video' ? 'video/webm' : 'audio/webm');
      const captured: Blob[] = [];
      let nextChunk = 0;
      let pendingWrite: Promise<void> = Promise.resolve();
      let interruption: string | null = null;
      let storageError: string | null = null;

      const interrupt = (reason: string) => {
        interruption = reason;
        if (recorder.state === 'recording') recorder.stop();
      };
      for (const track of microphone.getAudioTracks()) {
        track.addEventListener('ended', () => interrupt('The microphone disconnected.'), { once: true });
      }
      for (const track of videoTracks) {
        track.addEventListener('ended', () => interrupt('The camera disconnected.'), { once: true });
      }
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        captured.push(event.data);
        const index = nextChunk++;
        if (!storageError) {
          pendingWrite = pendingWrite.then(() => appendChunk(session.id, index, event.data)).catch(() => {
            storageError = 'Browser storage could not save the recording. Download this session before closing the tab.';
            if (recorder.state === 'recording') recorder.stop();
          });
        }
      };
      recorder.onerror = () => interrupt('The recorder failed.');
      recorder.onstop = () => {
        void (async () => {
          releaseStreams();
          recorderRef.current = null;
          activeIdRef.current = null;
          const measuredMs = Math.max(0, performance.now() - startedRef.current);
          if (mountedRef.current) { setElapsedMs(measuredMs); setStatus('processing'); }
          try {
            await updateSession(session.id, { status: 'processing' });
            await pendingWrite;
            const finished = await finishSession(
              session.id, interruption || storageError ? 'interrupted' : 'completed',
              measuredMs, mimeType, interruption ?? storageError,
            );
            if (!mountedRef.current) return;
            await refreshSessions();
            await selectSession(finished);
            setStatus(finished.status);
            if (finished.status === 'failed') setError(finished.error ?? 'No media was captured.');
            else if (interruption || storageError) setNotice(finished.error ?? 'The session was interrupted.');
          } catch {
            if (!mountedRef.current) return;
            const fallback = new Blob(captured, { type: mimeType });
            if (fallback.size) {
              clearPlayback();
              const url = URL.createObjectURL(fallback);
              urlRef.current = url;
              setRecordingUrl(url);
              setSelected({ ...session, status: 'interrupted', durationMs: measuredMs, mimeType, sizeBytes: fallback.size });
              setStatus('interrupted');
              setNotice('Local storage failed. Download this recording now; this playback may disappear when the tab closes.');
            } else {
              setStatus('failed');
              setError('The recording failed before any media could be saved.');
            }
          }
        })();
      };

      await updateSession(session.id, { status: 'recording', startedAt: Date.now(), mimeType });
      recorder.start(1000);
      startedRef.current = performance.now();
      setStatus('recording');
      await refreshSessions();
    } catch (cause) {
      releaseStreams();
      recorderRef.current = null;
      activeIdRef.current = null;
      const message = cause instanceof Error && !(cause instanceof DOMException) ? cause.message : deviceError(cause, 'microphone');
      try { await updateSession(session.id, { status: 'failed', endedAt: Date.now(), error: message }); }
      catch { /* The visible error still explains the failed start. */ }
      if (mountedRef.current) { setStatus('failed'); setError(message); await refreshSessions(); }
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') { setStatus('processing'); recorder.stop(); }
  }

  async function selectSession(session: Session) {
    clearPlayback();
    const token = selectionTokenRef.current;
    setError('');
    setSelected(session);
    setStatus(session.status);
    setNotes(session.notes);
    setElapsedMs(session.durationMs);
    try {
      const blob = await getRecording(session.id);
      if (blob && mountedRef.current && token === selectionTokenRef.current) {
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setRecordingUrl(url);
      }
    } catch { if (mountedRef.current) setError('The saved recording could not be opened.'); }
  }

  async function saveNotes() {
    if (!selected) return;
    try {
      const updated = await updateSession(selected.id, { notes });
      setSelected(updated);
      await refreshSessions();
      setNotice('Notes saved on this device.');
    } catch { setError('Notes could not be saved. Check browser storage.'); }
  }

  function download() {
    if (!recordingUrl || !selected) return;
    const link = document.createElement('a');
    link.href = recordingUrl;
    link.download = `conversation-coach-${selected.id}.${extension(selected.mimeType ?? '', selected.mode)}`;
    document.body.appendChild(link);
    link.click(); link.remove();
    setNotice('Download requested. Check browser downloads for the file.');
  }

  async function sendToLocalApi() {
    if (!selected || !recordingUrl || uploading) return;
    const session = { ...selected, notes };
    setError(''); setNotice(''); setUploading(true);
    try {
      let blob: Blob | null = null;
      try { blob = await getRecording(session.id); }
      catch { /* In-memory playback can still be sent when local storage failed. */ }
      let recording: Blob;
      if (blob) recording = blob;
      else recording = await fetch(recordingUrl).then((response) => response.blob());
      await uploadSession(session, recording);
      if (mountedRef.current) {
        setNotice('The local Python API received and saved this recording. Your browser copy is still available.');
        try {
          const updated = await updateSession(session.id, { notes, uploadedAt: Date.now() });
          setSelected(updated);
          await refreshSessions();
        } catch {
          setNotice('The Python API saved the recording, but this browser could not mark it as sent.');
        }
      }
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'The local upload failed.');
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }

  async function removeSession(session: Session) {
    if (!window.confirm('Delete this session, its notes, and its recording from this browser?')) return;
    try {
      await deleteSession(session.id);
      if (selected?.id === session.id) { clearPlayback(); setSelected(null); setStatus('idle'); setElapsedMs(0); }
      await refreshSessions();
      setNotice('Session and local recording deleted.');
    } catch { setError('The session could not be deleted from local storage.'); }
  }

  const busy = activeStatuses.includes(status) || cameraStatus === 'requesting' || uploading;
  const canStart = !busy && (mode === 'audio' || cameraStatus === 'ready');
  const activeId = activeIdRef.current;

  return (
    <main className="min-h-screen bg-[#10171d] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Conversation Coach</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Record your practice</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Sessions and recordings are saved in this browser. You can explicitly send a finished recording to the local Python API.</p>

        <fieldset className="mt-8" disabled={busy}>
          <legend className="text-sm font-medium text-slate-200">Recording mode</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(['audio', 'video'] as const).map((choice) => (
              <label key={choice} className={`cursor-pointer rounded-xl border p-4 text-sm ${mode === choice ? 'border-emerald-300 bg-emerald-300/10 text-white' : 'border-white/15 bg-white/5 text-slate-300'}`}>
                <input className="mr-2 accent-emerald-300" type="radio" name="mode" value={choice} checked={mode === choice} onChange={() => { releaseCamera(); setMode(choice); setError(''); }} />
                {choice === 'audio' ? 'Audio only' : 'Camera + microphone'}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'video' && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Camera preview</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Check your framing before recording. The microphone connects when you start.</p>
            {cameraStatus === 'ready' ? <>
              <video ref={previewRef} className="mt-5 aspect-video w-full rounded-xl bg-slate-900 object-cover" autoPlay muted playsInline aria-label="Live camera preview" />
              <p className="mt-4 text-sm text-emerald-300">Camera connected</p>
              {!busy && <button className="mt-3 text-sm underline" onClick={releaseCamera} type="button">Turn off camera</button>}
            </> : cameraStatus === 'requesting' ? <p className="mt-5 text-sm">Waiting for camera permission…</p> :
              <button className="mt-5 rounded-xl border border-emerald-300 px-4 py-3 text-sm font-semibold text-emerald-300" onClick={enableCamera} type="button">Enable Camera Preview</button>}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <p aria-live="polite" className="text-sm font-medium capitalize text-emerald-300">{status === 'idle' ? 'Ready to record' : status}</p>
          <p className="mt-5 font-mono text-5xl font-semibold tabular-nums" role="timer">{duration(elapsedMs)}</p>
          <p className="mt-5 text-sm text-slate-300">Focus: <strong className="font-medium text-white">{getPracticeFocusLabel(focus)}</strong></p>
          {activeId && <p className="mt-2 break-all font-mono text-xs text-slate-400">Session {activeId}</p>}
          {!busy && <div className="mt-6"><PrimaryButton onClick={startRecording} disabled={!canStart}>Start Recording</PrimaryButton></div>}
          {status === 'preparing' && <p className="mt-6 text-sm text-slate-300">Choose Allow in the microphone prompt.</p>}
          {status === 'recording' && <button className="mt-6 w-full rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-slate-950" onClick={stopRecording} type="button">Stop Recording</button>}
          {status === 'processing' && <p className="mt-6 text-sm text-slate-300">Saving the session…</p>}
          {error && <p className="mt-5 text-sm text-red-300" role="alert">{error}</p>}
        </section>

        {selected && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Session details</h2>
            <p className="mt-3 break-all font-mono text-xs text-slate-400">{selected.id}</p>
            <p className="mt-3 text-sm text-slate-300">{new Date(selected.createdAt).toLocaleString()} · {selected.mode} · {selected.status} · {duration(selected.durationMs)}</p>
            {selected.error && <p className="mt-3 text-sm text-amber-300">{selected.error}</p>}
            {selected.uploadedAt && <p className="mt-3 text-sm text-emerald-300">Sent to local API on {new Date(selected.uploadedAt).toLocaleString()}</p>}
            {recordingUrl && (selected.mode === 'video'
              ? <video className="mt-4 aspect-video w-full rounded-xl bg-black" controls playsInline src={recordingUrl} preload="metadata" />
              : <audio className="mt-4 w-full" controls src={recordingUrl} preload="metadata" />)}
            <label className="mt-5 block text-sm font-medium" htmlFor="session-notes">Notes</label>
            <textarea id="session-notes" className="mt-2 min-h-24 w-full rounded-xl border border-white/20 bg-slate-900 p-3 text-sm text-white" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What would you like to improve next time?" disabled={uploading} />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded-xl border border-emerald-300 px-4 py-2 text-sm text-emerald-300" onClick={saveNotes} type="button" disabled={uploading}>Save notes</button>
              {recordingUrl && <button className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950" onClick={download} type="button">Download recording</button>}
              {recordingUrl && <button className="rounded-xl border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-200 disabled:opacity-50" onClick={() => void sendToLocalApi()} type="button" disabled={uploading}>{uploading ? 'Sending to local API…' : 'Send to local API'}</button>}
              <button className="rounded-xl border border-red-300/50 px-4 py-2 text-sm text-red-200" onClick={() => void removeSession(selected)} type="button" disabled={uploading}>Delete session</button>
            </div>
            {recordingUrl && <p className="mt-4 text-xs leading-5 text-slate-400">Sending copies this recording and your notes to the Python server on this computer at 127.0.0.1:8000. Start the server first; your browser copy remains available.</p>}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recent sessions</h2><button className="text-sm text-emerald-300 underline" onClick={() => void recover()} type="button">Recover interrupted</button></div>
          {sessions.length === 0 ? <p className="mt-4 text-sm text-slate-400">No sessions saved yet.</p> :
            <ul className="mt-4 space-y-3">{sessions.map((session) => (
              <li key={session.id} className="rounded-xl border border-white/10 p-3">
                <button className="w-full text-left" onClick={() => void selectSession(session)} type="button" disabled={busy || activeStatuses.includes(session.status)}>
                  <span className="block text-sm font-medium">{new Date(session.createdAt).toLocaleString()} · {session.mode}</span>
                  <span className="mt-1 block text-xs text-slate-400">{session.status} · {duration(session.durationMs)} · {session.id.slice(0, 8)}</span>
                </button>
              </li>
            ))}</ul>}
          <p className="mt-4 text-xs leading-5 text-slate-400">Interrupted sessions are recovered from chunks already saved in this browser after 30 seconds. The final unsaved moments may be missing.</p>
        </section>
        {notice && <p className="mt-5 text-sm text-emerald-300" role="status">{notice}</p>}
      </div>
    </main>
  );
}
