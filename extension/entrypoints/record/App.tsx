import { useEffect, useRef, useState } from 'react';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getPracticeFocus, getPracticeFocusLabel } from '../../lib/focus';

type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'error';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mmss}` : mmss;
}

function getMicrophoneError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Microphone access was denied. Allow it in your browser settings, then try again.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No microphone was found. Connect a microphone and try again.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The microphone is busy or unavailable. Close other apps using it and try again.';
    }
  }
  return 'The microphone could not be started. Check your browser permissions and try again.';
}

function recordingExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export function App() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioType, setAudioType] = useState('audio/webm');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);
  const startedAtRef = useRef(0);
  const focus = getPracticeFocus();

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((performance.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status !== 'recording' && status !== 'requesting' && status !== 'stopping' && status !== 'ready') return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [status]);

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
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  async function startRecording() {
    setError('');
    setNotice('');
    setElapsedSeconds(0);
    setStatus('requesting');

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser does not support microphone recording. Try a recent version of Chrome.');
      setStatus('error');
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const preferredType = 'audio/webm;codecs=opus';
      const options = MediaRecorder.isTypeSupported(preferredType) ? { mimeType: preferredType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      const chunks: Blob[] = [];
      let failed = false;
      let interrupted = false;

      streamRef.current = stream;
      recorderRef.current = recorder;
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          interrupted = true;
        }, { once: true });
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        stream?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setError('Recording failed. Check your microphone and try again.');
        setStatus('error');
      };
      recorder.onstop = () => {
        stream?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setElapsedSeconds(Math.floor((performance.now() - startedAtRef.current) / 1000));
        if (failed) return;
        if (chunks.length === 0) {
          setError('No audio was captured. Check your microphone and try again.');
          setStatus('error');
          return;
        }
        const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioType(mimeType);
        setAudioUrl(url);
        setStatus('ready');
        if (interrupted) setNotice('The microphone disconnected. You can still review the captured audio.');
      };

      recorder.start(1000);
      startedAtRef.current = performance.now();
      setStatus('recording');
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      if (!isMountedRef.current) return;
      setError(getMicrophoneError(cause));
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
    if (!audioUrl) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `conversation-coach-${stamp}.${recordingExtension(audioType)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice('Download requested. Check your browser downloads before closing this tab.');
  }

  function deleteRecording() {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setElapsedSeconds(0);
    setNotice('Recording deleted from this tab.');
    setStatus('idle');
  }

  return (
    <main className="min-h-screen bg-[#10171d] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Conversation Coach</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Record your voice</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Only your microphone is recorded. Keep this tab open while recording; nothing is uploaded.</p>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-emerald-300">
            <span className={`h-2.5 w-2.5 rounded-full ${status === 'recording' ? 'animate-pulse bg-red-400' : 'bg-emerald-300'}`} />
            {status === 'recording' ? 'Recording' : status === 'requesting' ? 'Waiting for microphone permission' : status === 'stopping' ? 'Finishing recording' : status === 'ready' ? 'Recording ready' : 'Ready to record'}
          </div>
          <p className="mt-5 font-mono text-5xl font-semibold tabular-nums" role="timer">{formatDuration(elapsedSeconds)}</p>
          <p className="mt-5 text-sm text-slate-300">Focus: <strong className="font-medium text-white">{getPracticeFocusLabel(focus)}</strong></p>

          {(status === 'idle' || status === 'error') && (
            <div className="mt-6"><PrimaryButton onClick={startRecording}>Start Recording</PrimaryButton></div>
          )}
          {status === 'requesting' && <p className="mt-6 text-sm text-slate-300">Choose Allow in your browser’s microphone prompt.</p>}
          {status === 'recording' && (
            <button className="mt-6 w-full rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-red-300" onClick={stopRecording} type="button">Stop Recording</button>
          )}
          {status === 'stopping' && <p className="mt-6 text-sm text-slate-300">Preparing playback…</p>}
          {error && <p className="mt-5 text-sm text-red-300" role="alert">{error}</p>}
        </section>

        {status === 'ready' && audioUrl && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Listen back</h2>
            <audio className="mt-4 w-full" controls src={audioUrl} preload="metadata">Your browser cannot play this recording.</audio>
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
