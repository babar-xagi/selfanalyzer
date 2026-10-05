import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getPracticeFocus, getPracticeFocusLabel } from '../../lib/focus';
import { getTranscript, startTranscript, uploadSession, type RemoteTranscript, type TranscriptSegment } from '../../lib/backend';
import { takeCaptureLaunch, type CaptureLaunch, type ControlMessage } from '../../lib/recordingControl';
import { activeLineIndex, downloadBlob, recordingBundle, transcriptText, transcriptVtt } from '../../lib/transcript';
import { TranscriptPanel } from './TranscriptPanel';
import {
  appendAnalysisChunk, appendChunk, createSession, deleteSession, finishSession,
  getAnalysisRecording, getRecording,
  hasSeparateVoiceTrack, listSessions, recoverInterruptedSessions, updateSession,
  type CaptureMode, type Session, type SessionStatus,
} from '../../lib/sessions';

type ViewStatus = 'idle' | SessionStatus;
type DeviceName = 'microphone' | 'camera';
type RecordingChoice = 'screen' | 'webcam' | 'audio';

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
      return `${device === 'camera' ? 'Camera or microphone' : 'Microphone'} access was denied. Allow it in browser settings and try again.`;
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

function reportControl(message: ControlMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {
    // The saved session remains available even if the background worker reloads.
  });
}

export function App() {
  const [choice, setChoice] = useState<RecordingChoice>(() => new URLSearchParams(window.location.search).get('webcam') === '1' ? 'webcam' : 'screen');
  const [status, setStatus] = useState<ViewStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [notes, setNotes] = useState('');
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [bundlePreparing, setBundlePreparing] = useState(false);
  const [playbackMs, setPlaybackMs] = useState(0);
  const [reviewSegments, setReviewSegments] = useState<TranscriptSegment[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analysisRecorderRef = useRef<MediaRecorder | null>(null);
  const displayRef = useRef<MediaStream | null>(null);
  const webcamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const mixedRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const playbackRef = useRef<HTMLMediaElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const selectionTokenRef = useRef(0);
  const startedRef = useRef(0);
  const mountedRef = useRef(false);
  const launchRef = useRef<CaptureLaunch | null>(takeCaptureLaunch());
  const focus = getPracticeFocus();

  function releaseStreams() {
    stopStream(microphoneRef.current);
    microphoneRef.current = null;
    stopStream(displayRef.current);
    displayRef.current = null;
    stopStream(webcamRef.current);
    webcamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    stopStream(mixedRef.current);
    mixedRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
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
        const requestedId = new URLSearchParams(window.location.search).get('session');
        if (requestedId) {
          const requested = (await listSessions()).find((session) => session.id === requestedId);
          if (requested) await selectSession(requested);
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    } catch {
      if (mountedRef.current) setError('An interrupted session could not be recovered from local storage.');
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void recover();
    const launch = launchRef.current;
    launchRef.current = null;
    if (launch) void startRecording(launch);
    const listener = (message: ControlMessage, _sender: unknown, sendResponse: (reply: { ok: boolean }) => void) => {
      if (message?.type !== 'RECORDER_STOP' || message.sessionId !== activeIdRef.current) return false;
      stopRecording();
      sendResponse({ ok: true });
      return false;
    };
    browser.runtime.onMessage.addListener(listener);
    const recoveryTimer = window.setInterval(() => { void recover(); }, 10_000);
    return () => {
      mountedRef.current = false;
      browser.runtime.onMessage.removeListener(listener);
      window.clearInterval(recoveryTimer);
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      const analysisRecorder = analysisRecorderRef.current;
      if (analysisRecorder) {
        analysisRecorder.ondataavailable = null;
        analysisRecorder.onstop = null;
        analysisRecorder.onerror = null;
        if (analysisRecorder.state !== 'inactive') analysisRecorder.stop();
      }
      releaseStreams();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedRef.current), 250);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (choice === 'webcam' && status === 'recording' && previewRef.current && webcamRef.current)
      previewRef.current.srcObject = webcamRef.current;
  }, [choice, status]);

  useEffect(() => {
    if (!activeStatuses.includes(status)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  async function startRecording(launch?: CaptureLaunch) {
    const captureChoice: RecordingChoice = launch?.kind === 'webcam' ? 'webcam' : launch?.kind === 'screen' ? 'screen' : choice;
    const recordingMode: CaptureMode = captureChoice === 'audio' ? 'audio' : 'video';
    setError(''); setNotice(''); setElapsedMs(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      const message = 'This browser does not support recording. Try a recent version of Chrome.';
      setError(message);
      if (launch) reportControl({ type: 'RECORDER_FAILED', error: message } satisfies ControlMessage);
      return;
    }
    if (captureChoice === 'screen' && !launch && !navigator.mediaDevices.getDisplayMedia) {
      setError('This browser cannot capture a screen. Use a recent version of Chrome.'); return;
    }

    setStatus('preparing');
    if (captureChoice === 'screen') {
      try {
        audioContextRef.current = new AudioContext();
        // The popup picker gives this page a one-use desktop stream ID. The
        // manual button path uses getDisplayMedia while it has user activation.
        const display = launch?.kind === 'screen'
          ? await navigator.mediaDevices.getUserMedia({
              video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: launch.streamId, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } } as MediaTrackConstraints,
              audio: launch.includeAudio ? { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: launch.streamId } } as MediaTrackConstraints : false,
            })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const videoTrack = display.getVideoTracks()[0];
        if (!videoTrack) {
          stopStream(display);
          throw new Error('No screen video was shared. Choose a tab, window, or screen.');
        }
        if (!mountedRef.current) { stopStream(display); return; }
        displayRef.current = display;
      } catch (cause) {
        releaseStreams();
        if (mountedRef.current) {
          setStatus('idle');
          const message = cause instanceof Error && !(cause instanceof DOMException) ? cause.message : 'Screen sharing was cancelled or denied. Choose a tab, window, or screen.';
          setError(message);
          if (launch) reportControl({ type: 'RECORDER_FAILED', error: message } satisfies ControlMessage);
        }
        return;
      }
    }

    let session: Session;
    try { session = await createSession(recordingMode, captureChoice === 'screen' ? 'screen-share' : captureChoice === 'webcam' ? 'webcam' : 'microphone'); }
    catch {
      releaseStreams(); setStatus('idle');
      setError('Local storage is unavailable. Free space or enable browser storage, then try again.');
      if (launch) reportControl({ type: 'RECORDER_FAILED', error: 'Local storage is unavailable.' } satisfies ControlMessage);
      return;
    }
    activeIdRef.current = session.id;
    clearPlayback(); setSelected(null); setNotes('');
    await refreshSessions();

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
        video: captureChoice === 'webcam' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      if (!mountedRef.current) { stopStream(media); return; }
      const microphone = captureChoice === 'webcam' ? new MediaStream(media.getAudioTracks()) : media;
      microphoneRef.current = microphone;
      if (captureChoice === 'webcam') {
        webcamRef.current = media;
        if (previewRef.current) previewRef.current.srcObject = media;
      }
      let recordingStream: MediaStream = captureChoice === 'webcam' ? media : microphone;
      if (captureChoice === 'screen') {
        const display = displayRef.current;
        const videoTrack = display?.getVideoTracks()[0];
        const sharedAudioTrack = display?.getAudioTracks()[0];
        if (!display || !videoTrack || videoTrack.readyState !== 'live')
          throw new Error('The screen share stopped. Start again and choose a source.');
        if (sharedAudioTrack) {
          const context = audioContextRef.current;
          if (!context || context.state === 'closed') throw new Error('Audio mixing could not start. Try recording again.');
          const destination = context.createMediaStreamDestination();
          context.createMediaStreamSource(display).connect(destination);
          context.createMediaStreamSource(microphone).connect(destination);
          if (context.state !== 'running') await context.resume();
          if (context.state !== 'running') throw new Error('Audio mixing could not start. Try recording again.');
          recordingStream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
        } else recordingStream = new MediaStream([videoTrack, ...microphone.getAudioTracks()]);
        mixedRef.current = recordingStream;
      }
      const recorder = new MediaRecorder(recordingStream, recorderOptions(recordingMode));
      recorderRef.current = recorder;
      const analysisRecorder = recordingMode === 'video' ? new MediaRecorder(microphone, recorderOptions('audio')) : null;
      analysisRecorderRef.current = analysisRecorder;
      const mimeType = recorder.mimeType || (recordingMode === 'video' ? 'video/webm' : 'audio/webm');
      const analysisMimeType = analysisRecorder?.mimeType || null;
      const captured: Blob[] = [];
      let nextChunk = 0;
      let nextAnalysisChunk = 0;
      let pendingWrite: Promise<void> = Promise.resolve();
      let pendingAnalysisWrite: Promise<void> = Promise.resolve();
      let interruption: string | null = null;
      let storageError: string | null = null;
      let resolveAnalysisStopped = () => {};
      const analysisStopped = analysisRecorder ? new Promise<void>((resolve) => { resolveAnalysisStopped = resolve; }) : Promise.resolve();

      const interrupt = (reason: string) => {
        interruption = reason;
        if (recorder.state === 'recording') recorder.stop();
      };
      for (const track of microphone.getAudioTracks()) {
        track.addEventListener('ended', () => interrupt('The microphone disconnected.'), { once: true });
      }
      for (const track of displayRef.current?.getTracks() ?? []) {
        track.addEventListener('ended', () => interrupt('The screen share stopped.'), { once: true });
      }
      for (const track of webcamRef.current?.getVideoTracks() ?? []) {
        track.addEventListener('ended', () => interrupt('The camera disconnected.'), { once: true });
      }
      if (analysisRecorder) {
        analysisRecorder.ondataavailable = (event) => {
          if (!event.data.size) return;
          const index = nextAnalysisChunk++;
          if (!storageError) {
            pendingAnalysisWrite = pendingAnalysisWrite.then(() => appendAnalysisChunk(session.id, index, event.data)).catch(() => {
              storageError = 'Browser storage could not save your voice recording. Download the full session before closing this tab.';
              if (recorder.state === 'recording') recorder.stop();
            });
          }
        };
        analysisRecorder.onerror = () => interrupt('Your microphone recording stopped unexpectedly.');
        analysisRecorder.onstop = () => {
          analysisRecorderRef.current = null;
          resolveAnalysisStopped();
        };
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
          if (analysisRecorder?.state === 'recording') analysisRecorder.stop();
          await analysisStopped;
          releaseStreams();
          recorderRef.current = null;
          activeIdRef.current = null;
          const measuredMs = Math.max(0, performance.now() - startedRef.current);
          if (mountedRef.current) { setElapsedMs(measuredMs); setStatus('processing'); }
          try {
            await updateSession(session.id, { status: 'processing' });
            await pendingWrite;
            await pendingAnalysisWrite;
            const finished = await finishSession(
              session.id, interruption || storageError ? 'interrupted' : 'completed',
              measuredMs, mimeType, interruption ?? storageError, analysisMimeType,
            );
            if (!mountedRef.current) return;
            await refreshSessions();
            await selectSession(finished);
            setStatus(finished.status);
            if (finished.status === 'failed') setError(finished.error ?? 'No media was captured.');
            else if (interruption || storageError) setNotice(finished.error ?? 'The session was interrupted.');
            else setNotice('Recorded successfully. Replay, download, or analyze your session below.');
            if (launch) reportControl({ type: 'RECORDER_FINISHED', sessionId: session.id, phase: finished.status === 'completed' ? 'completed' : finished.status === 'failed' ? 'failed' : 'interrupted', error: finished.error } satisfies ControlMessage);
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
              if (launch) reportControl({ type: 'RECORDER_FINISHED', sessionId: session.id, phase: 'interrupted', error: 'Local storage failed. Download the recording from the recorder tab now.' } satisfies ControlMessage);
            } else {
              setStatus('failed');
              setError('The recording failed before any media could be saved.');
              if (launch) reportControl({ type: 'RECORDER_FINISHED', sessionId: session.id, phase: 'failed', error: 'No media was captured.' } satisfies ControlMessage);
            }
          }
        })();
      };

      await updateSession(session.id, { status: 'recording', startedAt: Date.now(), mimeType, sharedAudio: captureChoice === 'screen' ? Boolean(displayRef.current?.getAudioTracks().length) : undefined });
      analysisRecorder?.start(1000);
      recorder.start(1000);
      startedRef.current = performance.now();
      setStatus('recording');
      if (captureChoice === 'screen' && !displayRef.current?.getAudioTracks().length) setNotice('The selected source did not share meeting audio. This recording will include your microphone only.');
      if (launch) reportControl({ type: 'RECORDER_STARTED', sessionId: session.id } satisfies ControlMessage);
      await refreshSessions();
    } catch (cause) {
      const analysisRecorder = analysisRecorderRef.current;
      if (analysisRecorder?.state === 'recording') analysisRecorder.stop();
      analysisRecorderRef.current = null;
      releaseStreams();
      recorderRef.current = null;
      activeIdRef.current = null;
      const message = cause instanceof Error && !(cause instanceof DOMException) ? cause.message : deviceError(cause, captureChoice === 'webcam' ? 'camera' : 'microphone');
      try { await updateSession(session.id, { status: 'failed', endedAt: Date.now(), error: message }); }
      catch { /* The visible error still explains the failed start. */ }
      if (mountedRef.current) { setStatus('failed'); setError(message); await refreshSessions(); }
      if (launch) reportControl({ type: 'RECORDER_FAILED', error: message } satisfies ControlMessage);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') { setStatus('processing'); recorder.stop(); }
  }

  async function selectSession(session: Session) {
    clearPlayback();
    setPlaybackMs(0);
    setReviewSegments([]);
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

  function downloadVideoOnly() {
    if (!recordingUrl || !selected) return;
    const link = document.createElement('a');
    link.href = recordingUrl;
    link.download = `conversation-coach-${selected.id}.${extension(selected.mimeType ?? '', selected.mode)}`;
    document.body.appendChild(link);
    link.click(); link.remove();
    setNotice('Video download requested. Check browser downloads for the file.');
  }

  function replayAt(milliseconds: number) {
    const player = playbackRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, milliseconds / 1000);
    setPlaybackMs(Math.max(0, milliseconds));
    player.scrollIntoView({ behavior: 'smooth', block: 'center' });
    void player.play().catch(() => setNotice('Select Play in the recording to hear this moment.'));
  }

  async function ensureUploaded(session: Session): Promise<Session> {
    if (session.uploadedAt) return session;
    let recording: Blob;
    if (hasSeparateVoiceTrack(session)) {
      const ownVoice = await getAnalysisRecording(session.id);
      if (!ownVoice) throw new Error('Your separate microphone track was not saved. You can still download the video alone.');
      recording = ownVoice;
    } else {
      let blob: Blob | null = null;
      try { blob = await getRecording(session.id); }
      catch { /* In-memory playback can still be sent when local storage failed. */ }
      recording = blob ?? await fetch(recordingUrl!).then((response) => response.blob());
    }
    await uploadSession(session, recording);
    const updated = await updateSession(session.id, { notes: session.notes, uploadedAt: Date.now() });
    if (mountedRef.current) { setSelected(updated); await refreshSessions(); }
    return updated;
  }

  async function sendToLocalApi() {
    if (!selected || !recordingUrl || uploading) return;
    setError(''); setNotice(''); setUploading(true);
    try {
      const session = await ensureUploaded({ ...selected, notes });
      if (mountedRef.current) setNotice(hasSeparateVoiceTrack(session)
        ? 'Your microphone track was sent for analysis. The full video stays in this browser.'
        : 'The local Python API received this recording. Transcription is starting.');
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'The local upload failed.');
    } finally { if (mountedRef.current) setUploading(false); }
  }

  async function completedTranscript(sessionId: string): Promise<RemoteTranscript> {
    let transcript = await getTranscript(sessionId);
    if (transcript.status === 'not_started' || transcript.status === 'failed') transcript = await startTranscript(sessionId);
    const deadline = Date.now() + 20 * 60_000;
    while (transcript.status === 'queued' || transcript.status === 'running') {
      if (Date.now() >= deadline) throw new Error('Transcription is still running. Keep the recorder open and try the download again later.');
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      transcript = await getTranscript(sessionId);
    }
    if (transcript.status !== 'completed') throw new Error(transcript.error || 'Transcription failed. You can download the video alone.');
    return transcript;
  }

  async function downloadWithTranscript() {
    if (!selected || !recordingUrl || uploading) return;
    const original = { ...selected, notes };
    setError(''); setNotice('Preparing your video and transcript. Keep this tab open.');
    setUploading(true); setBundlePreparing(true);
    try {
      const uploaded = await ensureUploaded(original);
      const transcript = await completedTranscript(uploaded.id);
      const latest = (await listSessions()).find((session) => session.id === uploaded.id) ?? uploaded;
      if (!latest.transcriptConfirmedAt || latest.transcriptUpdatedAt !== transcript.updated_at)
        throw new Error('Transcript is ready. Listen, correct any misheard words, click “I checked these words,” then download the video and transcript together.');
      const lines = latest.transcriptEdits?.length === transcript.segments.length ? latest.transcriptEdits : transcript.segments;
      let video: Blob | null = null;
      try { video = await getRecording(uploaded.id); }
      catch { /* Use the in-memory recording when browser storage is unavailable. */ }
      video ??= await fetch(recordingUrl).then((response) => response.blob());
      if (!video || !video.size) throw new Error('The video is empty.');
      const mediaName = `recording.${extension(uploaded.mimeType ?? video.type, uploaded.mode)}`;
      const bundle = await recordingBundle([
        { name: mediaName, data: video },
        { name: 'transcript.txt', data: new Blob([transcriptText(lines)], { type: 'text/plain;charset=utf-8' }) },
        { name: 'subtitles.vtt', data: new Blob([transcriptVtt(lines)], { type: 'text/vtt;charset=utf-8' }) },
      ]);
      downloadBlob(bundle, `conversation-coach-${uploaded.id}.zip`);
      if (mountedRef.current) setNotice('Video, transcript, and timed subtitles downloaded together. Check your Downloads folder.');
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'The video and transcript could not be downloaded.');
    } finally {
      if (mountedRef.current) { setUploading(false); setBundlePreparing(false); }
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

  const busy = activeStatuses.includes(status) || uploading;
  const canStart = !busy;
  const activeId = activeIdRef.current;
  const activeCaption = reviewSegments[activeLineIndex(reviewSegments, playbackMs)];

  return (
    <main className="min-h-screen bg-[#10171d] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Conversation Coach</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Record your conversation or yourself</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">Capture a Google Meet or Episoden call, or record your own camera and voice. Replay, download, and review what you said.</p>

        <fieldset className="mt-8" disabled={busy}>
          <legend className="text-sm font-medium text-slate-200">Recording mode</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(['screen', 'webcam', 'audio'] as const).map((option) => (
              <label key={option} className={`cursor-pointer rounded-xl border p-4 text-sm ${choice === option ? 'border-emerald-300 bg-emerald-300/10 text-white' : 'border-white/15 bg-white/5 text-slate-300'}`}>
                <input className="mr-2 accent-emerald-300" type="radio" name="mode" value={option} checked={choice === option} onChange={() => { setChoice(option); setError(''); }} />
                {option === 'screen' ? 'Meeting screen' : option === 'webcam' ? 'My camera + voice' : 'My voice only'}
              </label>
            ))}
          </div>
        </fieldset>

        {choice === 'screen' && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Before you record</h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-300">
              <li>Open your meeting in Google Meet or Episoden and ask participants for permission to record.</li>
              <li>Click Start Recording and choose the meeting tab, a window, or the entire screen. Turn on <strong className="text-white">Share audio</strong> to include other voices.</li>
              <li>Allow microphone access so the recording includes your voice.</li>
              <li>Use headphones if possible to keep your partner's voice from echoing into your microphone.</li>
            </ol>
          </section>
        )}

        {choice === 'webcam' && <p className="mt-5 text-sm text-slate-300">Allow camera and microphone access. Only your own camera and voice are recorded.</p>}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <p aria-live="polite" className="text-sm font-medium capitalize text-emerald-300">{status === 'idle' ? 'Ready to record' : status}</p>
          <p className="mt-5 font-mono text-5xl font-semibold tabular-nums" role="timer">{duration(elapsedMs)}</p>
          <p className="mt-5 text-sm text-slate-300">Focus: <strong className="font-medium text-white">{getPracticeFocusLabel(focus)}</strong></p>
          {activeId && <p className="mt-2 break-all font-mono text-xs text-slate-400">Session {activeId}</p>}
          {!busy && <div className="mt-6"><PrimaryButton onClick={() => void startRecording()} disabled={!canStart}>Start Recording</PrimaryButton></div>}
          {status === 'preparing' && <p className="mt-6 text-sm text-slate-300">{choice === 'screen' ? 'Choose a tab, window, or screen; turn on Share audio; then allow the microphone.' : choice === 'webcam' ? 'Allow the camera and microphone in Chrome.' : 'Choose Allow in the microphone prompt.'}</p>}
          {choice === 'webcam' && status === 'recording' && <video ref={previewRef} className="mt-6 aspect-video w-full rounded-xl bg-black" autoPlay muted playsInline aria-label="Camera preview" />}
          {status === 'recording' && <button className="mt-6 w-full rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-slate-950" onClick={stopRecording} type="button">Stop Recording</button>}
          {status === 'processing' && <p className="mt-6 text-sm text-slate-300">Saving the session…</p>}
          {error && <p className="mt-5 text-sm text-red-300" role="alert">{error}</p>}
        </section>

        {selected && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Session details</h2>
            <p className="mt-3 break-all font-mono text-xs text-slate-400">{selected.id}</p>
            <p className="mt-3 text-sm text-slate-300">{new Date(selected.createdAt).toLocaleString()} · {selected.captureKind === 'webcam' ? 'My camera' : selected.captureKind === 'screen-share' || selected.captureKind === 'episoden-tab' ? 'Meeting screen' : 'My voice'} · {selected.status} · {duration(selected.durationMs)}</p>
            {selected.captureKind === 'screen-share' && selected.sharedAudio === false && <p className="mt-2 text-sm text-amber-300">Meeting audio was not shared. The video contains your microphone only.</p>}
            {selected.error && <p className="mt-3 text-sm text-amber-300">{selected.error}</p>}
            {selected.uploadedAt && <p className="mt-3 text-sm text-emerald-300">{hasSeparateVoiceTrack(selected) ? 'Your voice sent for analysis' : 'Sent to local API'} on {new Date(selected.uploadedAt).toLocaleString()}</p>}
            {recordingUrl && (selected.mode === 'video'
              ? <video ref={(node) => { playbackRef.current = node; }} className="mt-4 aspect-video w-full rounded-xl bg-black" controls playsInline src={recordingUrl} preload="metadata" onTimeUpdate={(event) => setPlaybackMs(event.currentTarget.currentTime * 1000)} onSeeked={(event) => setPlaybackMs(event.currentTarget.currentTime * 1000)} />
              : <audio ref={(node) => { playbackRef.current = node; }} className="mt-4 w-full" controls src={recordingUrl} preload="metadata" onTimeUpdate={(event) => setPlaybackMs(event.currentTarget.currentTime * 1000)} onSeeked={(event) => setPlaybackMs(event.currentTarget.currentTime * 1000)} />)}
            {reviewSegments.length > 0 && <div className="mt-3 min-h-16 rounded-xl bg-slate-950 p-4 text-center text-sm text-white" aria-label="Words at current playback time">{activeCaption?.text || 'Play or seek to hear your words here.'}</div>}
            <label className="mt-5 block text-sm font-medium" htmlFor="session-notes">Notes</label>
            <textarea id="session-notes" className="mt-2 min-h-24 w-full rounded-xl border border-white/20 bg-slate-900 p-3 text-sm text-white" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What would you like to improve next time?" disabled={uploading} />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded-xl border border-emerald-300 px-4 py-2 text-sm text-emerald-300" onClick={saveNotes} type="button" disabled={uploading}>Save notes</button>
              {recordingUrl && <button className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" onClick={() => void downloadWithTranscript()} type="button" disabled={uploading}>{bundlePreparing ? 'Preparing transcript…' : 'Download video + transcript'}</button>}
              {recordingUrl && <button className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-200" onClick={downloadVideoOnly} type="button">Video only</button>}
              {recordingUrl && <button className="rounded-xl border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-200 disabled:opacity-50" onClick={() => void sendToLocalApi()} type="button" disabled={uploading || (hasSeparateVoiceTrack(selected) && !selected.analysisSizeBytes)}>{uploading ? 'Sending for analysis…' : 'Analyze my voice'}</button>}
              <button className="rounded-xl border border-red-300/50 px-4 py-2 text-sm text-red-200" onClick={() => void removeSession(selected)} type="button" disabled={uploading}>Delete session</button>
            </div>
            {recordingUrl && <p className="mt-4 text-xs leading-5 text-slate-400">{hasSeparateVoiceTrack(selected) ? 'Analysis sends only your microphone track and notes' : 'Analysis sends this recording and your notes'} to the Python server on this computer at 127.0.0.1:8000. The full browser recording remains available.</p>}
            {hasSeparateVoiceTrack(selected) && !selected.analysisSizeBytes && <p className="mt-2 text-xs text-amber-300">Your separate microphone track is unavailable. You can still replay and download the full call.</p>}
          </section>
        )}

        {selected?.uploadedAt && <TranscriptPanel key={`${selected.id}-${selected.uploadedAt}`} session={selected} playbackMs={playbackMs} onReplayAt={replayAt} onSegmentsChange={setReviewSegments} onSessionUpdated={(updated) => { setSelected(updated); void refreshSessions(); }} />}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Recent sessions</h2><button className="text-sm text-emerald-300 underline" onClick={() => void recover()} type="button">Recover interrupted</button></div>
          {sessions.length === 0 ? <p className="mt-4 text-sm text-slate-400">No sessions saved yet.</p> :
            <ul className="mt-4 space-y-3">{sessions.map((session) => (
              <li key={session.id} className="rounded-xl border border-white/10 p-3">
                <button className="w-full text-left" onClick={() => void selectSession(session)} type="button" disabled={busy || activeStatuses.includes(session.status)}>
                  <span className="block text-sm font-medium">{new Date(session.createdAt).toLocaleString()} · {session.captureKind === 'webcam' ? 'My camera' : session.captureKind === 'screen-share' || session.captureKind === 'episoden-tab' ? 'Meeting screen' : 'My voice'}</span>
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
