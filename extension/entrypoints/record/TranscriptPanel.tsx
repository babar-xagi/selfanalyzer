import { useEffect, useRef, useState } from 'react';
import { getTranscript, saveTranscriptEdits, startTranscript, type RemoteTranscript } from '../../lib/backend';
import { downloadBlob, activeLineIndex, transcriptText, transcriptVtt, type TimedLine } from '../../lib/transcript';
import { updateSession, type Session } from '../../lib/sessions';
import { GrammarPanel } from './GrammarPanel';

function timestamp(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

interface Props {
  session: Session;
  playbackMs: number;
  onReplayAt: (milliseconds: number) => void;
  onSegmentsChange: (segments: TimedLine[]) => void;
  onSessionUpdated: (session: Session) => void;
  onPrepareTranscript: () => void;
  preparing: boolean;
}

export function TranscriptPanel({ session, playbackMs, onReplayAt, onSegmentsChange, onSessionUpdated, onPrepareTranscript, preparing }: Props) {
  const [transcript, setTranscript] = useState<RemoteTranscript | null>(null);
  const [lines, setLines] = useState<TimedLine[]>([]);
  const [draft, setDraft] = useState<TimedLine[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const retrySessionRef = useRef<string | null>(null);
  const activeIndex = activeLineIndex(lines, playbackMs);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;
    let retryFailed = retrySessionRef.current === session.id;
    retrySessionRef.current = null;
    setTranscript(null);
    setLines([]);
    onSegmentsChange([]);
    setError('');
    if (!session.uploadedAt) return () => { active = false; controller.abort(); };

    async function refresh() {
      try {
        let current = await getTranscript(session.id, { signal: controller.signal });
        if (current.status === 'not_started' || (retryFailed && current.status === 'failed')) {
          retryFailed = false;
          current = await startTranscript(session.id, { signal: controller.signal });
        }
        if (!active) return;
        setTranscript(current);
        if (current.status === 'completed') {
          const saved = session.transcriptUpdatedAt === current.updated_at && session.transcriptEdits?.length === current.segments.length
            ? session.transcriptEdits : current.segments;
          setLines(saved);
          onSegmentsChange(saved);
        } else if (current.status === 'queued' || current.status === 'running') {
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
  }, [session.id, session.uploadedAt, retryCount, onSegmentsChange]);

  async function saveEdits() {
    if (transcript?.status !== 'completed') return;
    setSaving(true); setError('');
    try {
      if (!transcript.updated_at) throw new Error('The transcript timestamp is missing. Reload and try again.');
      const corrected = await saveTranscriptEdits(session.id, transcript.updated_at, draft.map((line) => line.text));
      const updated = await updateSession(session.id, { transcriptEdits: corrected.segments, transcriptUpdatedAt: corrected.updated_at, transcriptConfirmedAt: null });
      setTranscript(corrected);
      setLines(corrected.segments);
      onSegmentsChange(corrected.segments);
      onSessionUpdated(updated);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transcript edits could not be saved.');
    } finally { setSaving(false); }
  }

  async function confirmWords() {
    if (transcript?.status !== 'completed' || editing) return;
    setSaving(true); setError('');
    try {
      const updated = await updateSession(session.id, { transcriptEdits: lines, transcriptUpdatedAt: transcript.updated_at, transcriptConfirmedAt: Date.now() });
      onSessionUpdated(updated);
    } catch { setError('Could not mark the transcript as reviewed.'); }
    finally { setSaving(false); }
  }

  function downloadTranscript(format: 'txt' | 'vtt') {
    const content = format === 'txt' ? transcriptText(lines) : transcriptVtt(lines);
    downloadBlob(new Blob([content], { type: format === 'txt' ? 'text/plain;charset=utf-8' : 'text/vtt;charset=utf-8' }), `conversation-coach-${session.id}.${format}`);
  }

  return <>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6" aria-label="Transcript">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Transcript synced to replay</h2>
        {transcript?.status === 'completed' && <div className="flex flex-wrap gap-2">
          <button className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-300" type="button" onClick={() => downloadTranscript('txt')}>Download text</button>
          <button className="rounded-lg border border-sky-300 px-3 py-2 text-xs font-semibold text-sky-200" type="button" onClick={() => downloadTranscript('vtt')}>Download subtitles</button>
        </div>}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">This is an automatic draft of your microphone audio. Listen and correct words that were misheard, then confirm the text before downloading it with the video. Timestamps are approximate.</p>
      {!session.uploadedAt && <div className="mt-4">
        <p className="text-sm text-slate-300">Create a transcript to see your words during replay and include them in the download. The local Python server must be running at 127.0.0.1:8000.</p>
        <button className="mt-3 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-50" type="button" onClick={onPrepareTranscript} disabled={preparing}>{preparing ? 'Connecting…' : 'Create transcript'}</button>
      </div>}
      {session.uploadedAt && !transcript && !error && <p className="mt-3 text-sm text-slate-300">Checking transcription…</p>}
      {(transcript?.status === 'queued' || transcript?.status === 'running') &&
        <p className="mt-3 text-sm text-slate-300" role="status">Transcribing on this computer. The first run downloads the speech model and may take a few minutes.</p>}
      {transcript?.status === 'completed' && (lines.length ? <>
        {!editing && <div className="mt-4 flex flex-wrap items-center gap-4">
          <button className="text-sm text-emerald-300 underline" type="button" onClick={() => { setDraft(lines.map((line) => ({ ...line }))); setEditing(true); }}>Correct transcript words</button>
          {session.transcriptConfirmedAt && session.transcriptUpdatedAt === transcript.updated_at
            ? <span className="text-sm text-emerald-300">Words reviewed ✓</span>
            : <button className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-300" type="button" onClick={() => void confirmWords()} disabled={saving}>I checked these words</button>}
        </div>}
        <ol className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-2" aria-label="Timed transcript">
          {(editing ? draft : lines).map((line, index) => (
            <li key={`${line.start_ms}-${index}`} aria-current={activeIndex === index ? 'true' : undefined} className={`flex gap-4 rounded-lg border p-3 text-sm ${activeIndex === index ? 'border-emerald-300 bg-emerald-300/15' : 'border-transparent bg-slate-900/60'}`}>
              <button className="shrink-0 self-start font-mono text-emerald-300 underline" type="button" onClick={() => onReplayAt(line.start_ms)} aria-label={`Replay from ${timestamp(line.start_ms)}`}>{timestamp(line.start_ms)}</button>
              {editing
                ? <textarea className="min-h-16 w-full rounded-lg border border-white/20 bg-slate-950 p-2 text-slate-100" value={line.text} aria-label={`Transcript at ${timestamp(line.start_ms)}`} onChange={(event) => setDraft((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} />
                : <span className="text-slate-100">{line.text}</span>}
            </li>
          ))}
        </ol>
        {editing && <div className="mt-4 flex gap-3">
          <button className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950" type="button" onClick={() => void saveEdits()} disabled={saving}>{saving ? 'Saving…' : 'Save corrections'}</button>
          <button className="rounded-lg border border-white/20 px-4 py-2 text-sm" type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
        </div>}
      </> : <div className="mt-3">
        <p className="text-sm text-slate-300">{transcript.text || 'No clear speech was detected in this recording.'}</p>
        {(!session.transcriptConfirmedAt || session.transcriptUpdatedAt !== transcript.updated_at) && <button className="mt-3 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-300" type="button" onClick={() => void confirmWords()} disabled={saving}>Confirm no clear speech</button>}
      </div>)}
      {(error || transcript?.status === 'failed') && <>
        <p className="mt-3 text-sm text-red-300" role="alert">{error || transcript?.error || 'Transcription failed.'}</p>
        <button className="mt-4 rounded-xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-300" type="button" onClick={() => {
          retrySessionRef.current = session.id;
          setRetryCount((count) => count + 1);
        }}>Retry transcription</button>
      </>}
    </section>
    {transcript?.status === 'completed' && <GrammarPanel key={transcript.updated_at} sessionId={session.id} onReplayAt={onReplayAt} />}
  </>;
}
