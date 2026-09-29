import { useEffect, useRef, useState } from 'react';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getPracticeFocus, getPracticeFocusLabel } from '../../lib/focus';

type CaptureMode = 'audio' | 'video';
type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'error';
type CameraStatus = 'off' | 'requesting' | 'ready';
type DeviceName = 'camera' | 'microphone';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mmss}` : mmss;
}

function getDeviceError(error: unknown, device: DeviceName): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return `${device === 'camera' ? 'Camera' : 'Microphone'} access was denied. Allow it in your browser settings, then try again.`;
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return `No ${device} was found. Connect one and try again.`;
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return `The ${device} is busy or unavailable. Close other apps using it and try again.`;
    }
  }
  return `The ${device} could not be started. Check your browser permissions and try again.`;
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function recordingExtension(mimeType: string, mode: CaptureMode): string {
  if (mimeType.includes('mp4')) return mode === 'video' ? 'mp4' : 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function recorderOptions(mode: CaptureMode): MediaRecorderOptions | undefined {
  const supportedTypes = mode === 'video'
    ? ['video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

export function App() {
  const [mode, setMode] = useState<CaptureMode>('audio');
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('off');
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingType, setRecordingType] = useState('audio/webm');
  const [recordingMode, setRecordingMode] = useState<CaptureMode>('audio');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);
  const startedAtRef = useRef(0);
  const focus = getPracticeFocus();

  function releaseCamera() {
    stopStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setCameraStatus('off');
  }

  function releaseActiveStreams() {
    stopStream(microphoneStreamRef.current);
    stopStream(cameraStreamRef.current);
    microphoneStreamRef.current = null;
    cameraStreamRef.current = null;
    recordingStreamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    setCameraStatus('off');
  }

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((performance.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!['requesting', 'recording', 'stopping', 'ready'].includes(status)) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [status]);

  useEffect(() => {
    const preview = previewRef.current;
    if (preview && cameraStatus === 'ready') {
      preview.srcObject = cameraStreamRef.current;
      void preview.play().catch(() => {
        setError('Camera preview could not play. Check your browser media settings.');
      });
    }
    return () => {
      if (preview) preview.srcObject = null;
    };
  }, [cameraStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      stopStream(microphoneStreamRef.current);
      stopStream(cameraStreamRef.current);
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  function changeMode(nextMode: CaptureMode) {
    if (nextMode === mode) return;
    releaseCamera();
    setMode(nextMode);
    setError('');
    setNotice('');
    if (status === 'error') setStatus('idle');
  }

  async function enableCamera() {
    setError('');
    setNotice('');
    setCameraStatus('requesting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('off');
      setError('This browser does not support camera preview. Try a recent version of Chrome.');
      return;
    }
    let camera: MediaStream | null = null;
    try {
      camera = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!isMountedRef.current) {
        stopStream(camera);
        return;
      }
      cameraStreamRef.current = camera;
      camera.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (recorderRef.current?.state === 'recording') return;
          releaseCamera();
          setError('The camera disconnected. Reconnect it and enable the preview again.');
        }, { once: true });
      });
      setCameraStatus('ready');
    } catch (cause) {
      stopStream(camera);
      if (!isMountedRef.current) return;
      setCameraStatus('off');
      setError(getDeviceError(cause, 'camera'));
    }
  }

  async function startRecording() {
    setError('');
    setNotice('');
    setElapsedSeconds(0);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support recording. Try a recent version of Chrome.');
      setStatus('error');
      return;
    }
    if (mode === 'video' && cameraStreamRef.current?.getVideoTracks()[0]?.readyState !== 'live') {
      releaseCamera();
      setError('Enable the camera preview before recording video.');
      return;
    }

    setStatus('requesting');
    let microphone: MediaStream | null = null;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!isMountedRef.current) {
        stopStream(microphone);
        return;
      }
      const videoTracks = mode === 'video' ? cameraStreamRef.current?.getVideoTracks() ?? [] : [];
      if (mode === 'video' && videoTracks[0]?.readyState !== 'live') {
        stopStream(microphone);
        releaseCamera();
        setError('The camera disconnected. Enable the preview and try again.');
        setStatus('error');
        return;
      }

      microphoneStreamRef.current = microphone;
      const combined = new MediaStream([...videoTracks, ...microphone.getAudioTracks()]);
      recordingStreamRef.current = combined;
      const recorder = new MediaRecorder(combined, recorderOptions(mode));
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let failed = false;
      let interrupted: DeviceName | null = null;

      for (const track of microphone.getAudioTracks()) {
        track.addEventListener('ended', () => {
          interrupted = 'microphone';
          if (recorder.state === 'recording') recorder.stop();
        }, { once: true });
      }
      for (const track of videoTracks) {
        track.addEventListener('ended', () => {
          interrupted = 'camera';
          if (recorder.state === 'recording') recorder.stop();
        }, { once: true });
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        releaseActiveStreams();
        setError('Recording failed. Check your camera and microphone, then try again.');
        setStatus('error');
      };
      recorder.onstop = () => {
        releaseActiveStreams();
        recorderRef.current = null;
        setElapsedSeconds(Math.floor((performance.now() - startedAtRef.current) / 1000));
        if (failed) return;
        if (chunks.length === 0) {
          setError('No media was captured. Check your devices and try again.');
          setStatus('error');
          return;
        }
        const mimeType = recorder.mimeType || chunks[0]?.type || (mode === 'video' ? 'video/webm' : 'audio/webm');
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        setRecordingType(mimeType);
        setRecordingMode(mode);
        setRecordingUrl(url);
        setStatus('ready');
        if (interrupted) setNotice(`The ${interrupted} disconnected. You can still review the captured recording.`);
      };

      recorder.start(1000);
      startedAtRef.current = performance.now();
      setStatus('recording');
    } catch (cause) {
      stopStream(microphone);
      microphoneStreamRef.current = null;
      recordingStreamRef.current = null;
      recorderRef.current = null;
      if (!isMountedRef.current) return;
      setError(getDeviceError(cause, 'microphone'));
      setStatus('error');
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    setStatus('stopping');
    recorder.stop();
  }

  function saveRecording() {
    if (!recordingUrl) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = recordingUrl;
    link.download = `conversation-coach-${stamp}.${recordingExtension(recordingType, recordingMode)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice('Download requested. Check your browser downloads before closing this tab.');
  }

  function deleteRecording() {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecordingUrl(null);
    setElapsedSeconds(0);
    setNotice('Recording deleted from this tab.');
    setStatus('idle');
  }

  const busy = status === 'requesting' || status === 'recording' || status === 'stopping' || status === 'ready' || cameraStatus === 'requesting';
  const canStart = (status === 'idle' || status === 'error') && (mode === 'audio' || cameraStatus === 'ready');

  return (
    <main className="min-h-screen bg-[#10171d] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Conversation Coach</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Record your practice</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Record your microphone alone, or add your webcam. This tab keeps the recording local; nothing is uploaded.</p>

        <fieldset className="mt-8" disabled={busy}>
          <legend className="text-sm font-medium text-slate-200">Recording mode</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className={`cursor-pointer rounded-xl border p-4 text-sm ${mode === 'audio' ? 'border-emerald-300 bg-emerald-300/10 text-white' : 'border-white/15 bg-white/5 text-slate-300'}`}>
              <input className="mr-2 accent-emerald-300" type="radio" name="mode" value="audio" checked={mode === 'audio'} onChange={() => changeMode('audio')} />
              Audio only
            </label>
            <label className={`cursor-pointer rounded-xl border p-4 text-sm ${mode === 'video' ? 'border-emerald-300 bg-emerald-300/10 text-white' : 'border-white/15 bg-white/5 text-slate-300'}`}>
              <input className="mr-2 accent-emerald-300" type="radio" name="mode" value="video" checked={mode === 'video'} onChange={() => changeMode('video')} />
              Camera + microphone
            </label>
          </div>
        </fieldset>

        {mode === 'video' && status !== 'ready' && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Camera preview</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Enable a muted preview to check your framing. The microphone connects when you start recording.</p>
            {cameraStatus === 'ready' ? (
              <>
                <video ref={previewRef} className="mt-5 aspect-video w-full rounded-xl bg-slate-900 object-cover" autoPlay muted playsInline aria-label="Live camera preview" />
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-emerald-300"><span>📹 Camera connected</span><span>🎤 Microphone {status === 'recording' ? 'connected' : 'not connected'}</span></div>
                {(status === 'idle' || status === 'error') && <button className="mt-4 text-sm text-slate-300 underline hover:text-white" onClick={releaseCamera} type="button">Turn off camera</button>}
              </>
            ) : cameraStatus === 'requesting' ? (
              <p className="mt-5 text-sm text-slate-300">Waiting for camera permission…</p>
            ) : (
              <button className="mt-5 rounded-xl border border-emerald-300 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-300/10" onClick={enableCamera} type="button">Enable Camera Preview</button>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-emerald-300">
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'recording' ? 'animate-pulse bg-red-400' : 'bg-emerald-300'}`} />
            {status === 'recording' ? 'Recording' : status === 'requesting' ? 'Waiting for microphone permission' : status === 'stopping' ? 'Finishing recording' : status === 'ready' ? 'Recording ready' : 'Ready to record'}
          </div>
          <p className="mt-5 font-mono text-5xl font-semibold tabular-nums" role="timer">{formatDuration(elapsedSeconds)}</p>
          <p className="mt-5 text-sm text-slate-300">Focus: <strong className="font-medium text-white">{getPracticeFocusLabel(focus)}</strong></p>

          {(status === 'idle' || status === 'error') && (
            <div className="mt-6"><PrimaryButton onClick={startRecording} disabled={!canStart}>Start Recording</PrimaryButton></div>
          )}
          {status === 'requesting' && <p className="mt-6 text-sm text-slate-300">Choose Allow in your browser’s microphone prompt.</p>}
          {status === 'recording' && <button className="mt-6 w-full rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-red-300" onClick={stopRecording} type="button">Stop Recording</button>}
          {status === 'stopping' && <p className="mt-6 text-sm text-slate-300">Preparing playback…</p>}
          {error && <p className="mt-5 text-sm text-red-300" role="alert">{error}</p>}
        </section>

        {status === 'ready' && recordingUrl && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Review recording</h2>
            {recordingMode === 'video' ? (
              <video className="mt-4 aspect-video w-full rounded-xl bg-black" controls playsInline src={recordingUrl} preload="metadata">Your browser cannot play this recording.</video>
            ) : (
              <audio className="mt-4 w-full" controls src={recordingUrl} preload="metadata">Your browser cannot play this recording.</audio>
            )}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button className="flex-1 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-200" onClick={saveRecording} type="button">Save Recording</button>
              <button className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10" onClick={deleteRecording} type="button">Delete Recording</button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">This recording stays in this tab until you close it or delete it. Save a copy before leaving.</p>
          </section>
        )}

        {notice && <p className="mt-5 text-sm text-emerald-300" role="status">{notice}</p>}
      </div>
    </main>
  );
}
