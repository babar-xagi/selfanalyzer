import { useEffect, useRef, useState } from 'react';
import { getGrammar, startGrammar, type RemoteGrammar } from '../../lib/backend';
import { ensureLocalCompanion } from '../../lib/localCompanion';

function timestamp(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function categoryLabel(category: string): string {
  return category.replaceAll('_', ' ');
}

export function GrammarPanel({ sessionId, onReplayAt }: { sessionId: string; onReplayAt: (milliseconds: number) => void }) {
  const [review, setReview] = useState<RemoteGrammar | null>(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const retrySessionRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;
    let retryFailed = retrySessionRef.current === sessionId;
    retrySessionRef.current = null;
    setReview(null);
    setError('');

    async function refresh() {
      try {
        await ensureLocalCompanion();
        let current = await getGrammar(sessionId, { signal: controller.signal });
        if (current.status === 'not_started' || (retryFailed && current.status === 'failed')) {
          retryFailed = false;
          current = await startGrammar(sessionId, { signal: controller.signal });
        }
        if (!active) return;
        setReview(current);
        if (current.status === 'queued' || current.status === 'running') {
          timer = window.setTimeout(() => { void refresh(); }, 3000);
        }
      } catch (cause) {
        if (active && !controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Grammar feedback could not be loaded.');
      }
    }

    void refresh();
    return () => {
      active = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [sessionId, retryCount]);

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6" aria-label="Grammar coach">
      <h2 className="text-lg font-semibold">Grammar coach</h2>
      <p className="mt-2 text-xs leading-5 text-slate-400">Suggestions come from a local AI model. Check them against your recording, because transcripts can mishear speech.</p>
      {!review && !error && <p className="mt-4 text-sm text-slate-300">Checking grammar feedback…</p>}
      {(review?.status === 'queued' || review?.status === 'running') &&
        <p className="mt-4 text-sm text-slate-300" role="status">Reviewing your transcript on this computer. This may take a few minutes.</p>}
      {review?.status === 'completed' && (
        review.corrections.length ? <ol className="mt-5 space-y-4">
          {review.corrections.map((correction, index) => (
            <li key={`${correction.timestamp_ms}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300"><button className="underline" type="button" onClick={() => onReplayAt(correction.timestamp_ms)} aria-label={`Replay correction from ${timestamp(correction.timestamp_ms)}`}>{timestamp(correction.timestamp_ms)}</button> · {categoryLabel(correction.category)}</p>
              <p className="mt-3 text-sm text-red-200"><span className="font-semibold">You said:</span> {correction.original}</p>
              <p className="mt-2 text-sm text-emerald-200"><span className="font-semibold">Correction:</span> {correction.corrected}</p>
              <p className="mt-2 text-sm text-sky-200"><span className="font-semibold">Natural alternative:</span> {correction.natural_alternative}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{correction.explanation}</p>
            </li>
          ))}
        </ol> : <p className="mt-4 text-sm text-slate-300">No clear grammar corrections were found in this transcript.</p>
      )}
      {(error || review?.status === 'failed') && <>
        <p className="mt-4 text-sm text-red-300" role="alert">{error || review?.error || 'Grammar analysis failed.'}</p>
        <button className="mt-4 rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-300" type="button" onClick={() => {
          retrySessionRef.current = sessionId;
          setRetryCount((count) => count + 1);
        }}>Retry grammar review</button>
      </>}
    </section>
  );
}
