import { useEffect, useRef, useState } from 'react';
import { getTranscript, startTranscript, type RemoteTranscript } from '../../lib/backend';
import { GrammarPanel } from './GrammarPanel';

function timestamp(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function TranscriptPanel({ sessionId, onReplayAt }: { sessionId: string; onReplayAt: (milliseconds: number) => void }) {
  const [transcript, setTranscript] = useState<RemoteTranscript | null>(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const retrySessionRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;
    let retryFailed = retrySessionRef.current === sessionId;
    retrySessionRef.current = null;
    setTranscript(null);
    setError('');

    async function refresh() {
      try {
        let current = await getTranscript(sessionId, { signal: controller.signal });
        if (current.status === 'not_started' || (retryFailed && current.status === 'failed')) {
          retryFailed = false;
          current = await startTranscript(sessionId, { signal: controller.signal });
        }
        if (!active) return;
        setTranscript(current);
        if (current.status === 'queued' || current.status === 'running') {
          timer = window.setTimeout(() => { void refresh(); }, 2500);
        }
      } catch (cause) {
        if (active && !controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'The transcript could not be loaded.');
      }
    }

    void refresh();
    return () => {
      active = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [sessionId, retryCount]);

  return <>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6" aria-label="Transcript">
      <h2 className="text-lg font-semibold">Transcript</h2>
      {!transcript && !error && <p className="mt-3 text-sm text-slate-300">Checking transcription…</p>}
      {(transcript?.status === 'queued' || transcript?.status === 'running') &&
        <p className="mt-3 text-sm text-slate-300" role="status">Transcribing on this computer. The first run downloads the speech model and may take a few minutes.</p>}
      {transcript?.status === 'completed' && (
        transcript.segments.length ? <ol className="mt-4 space-y-3">
          {transcript.segments.map((segment, index) => (
            <li key={`${segment.start_ms}-${index}`} className="flex gap-4 rounded-lg bg-slate-900/60 p-3 text-sm">
              <button className="shrink-0 self-start font-mono text-emerald-300 underline" type="button" onClick={() => onReplayAt(segment.start_ms)} aria-label={`Replay from ${timestamp(segment.start_ms)}`}>{timestamp(segment.start_ms)}</button>
              <span className="text-slate-100">{segment.text}</span>
            </li>
          ))}
        </ol> : <p className="mt-3 text-sm text-slate-300">{transcript.text || 'No clear speech was detected in this recording.'}</p>
      )}
      {(error || transcript?.status === 'failed') && <>
        <p className="mt-3 text-sm text-red-300" role="alert">{error || transcript?.error || 'Transcription failed.'}</p>
        <button className="mt-4 rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-300" type="button" onClick={() => {
          retrySessionRef.current = sessionId;
          setRetryCount((count) => count + 1);
        }}>Retry transcription</button>
      </>}
    </section>
    {transcript?.status === 'completed' && <GrammarPanel sessionId={sessionId} onReplayAt={onReplayAt} />}
  </>;
}
