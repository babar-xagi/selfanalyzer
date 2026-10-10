import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getPracticeFocus, getPracticeFocusLabel } from '../../lib/focus';
import type { CaptureState, ControlReply } from '../../lib/recordingControl';

type PopupCommand = 'CAPTURE_STATUS' | 'CAPTURE_START' | 'CAPTURE_START_TAB' | 'CAPTURE_START_WEBCAM' | 'CAPTURE_STOP' | 'CAPTURE_OPEN';

const isBusy = (state: CaptureState | null) => state && ['choosing', 'preparing', 'recording', 'processing'].includes(state.phase);

export function App() {
  const focus = getPracticeFocus();
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [error, setError] = useState('');

  async function control(type: PopupCommand, includeCamera?: boolean) {
    try {
      const reply = await browser.runtime.sendMessage<{ type: PopupCommand; includeCamera?: boolean }, ControlReply>({ type, includeCamera });
      setCapture(reply.state);
      setError(reply.ok ? '' : reply.error ?? 'The recording command failed.');
    } catch {
      setError('Could not reach the recording service. Reload the extension and try again.');
    }
  }

  useEffect(() => {
    void control('CAPTURE_STATUS');
    const timer = window.setInterval(() => { void control('CAPTURE_STATUS'); }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const phase = capture?.phase ?? 'idle';
  const status = phase === 'recording' ? 'Recording in background'
    : phase === 'choosing' ? 'Choose a tab, window, or screen'
    : phase === 'preparing' ? 'Allow camera and microphone in the recorder…'
    : phase === 'processing' ? 'Saving your recording…'
    : phase === 'completed' ? 'Recorded successfully'
    : phase === 'interrupted' ? 'Recording interrupted'
    : phase === 'failed' ? 'Recording could not start'
    : 'Ready to record';

  return (
    <main className="min-h-[420px] w-[340px] bg-[#10171d] p-5 text-slate-100">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Conversation Coach</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Record your practice.</h1>
        </div>
        <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-300/15 text-xl text-emerald-300">✦</div>
      </header>

      <section aria-live="polite" className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className={`flex items-center gap-2 text-xs font-medium ${phase === 'recording' ? 'text-red-300' : 'text-emerald-300'}`}>
          <span className={`h-2 w-2 rounded-full ${phase === 'recording' ? 'bg-red-300' : 'bg-emerald-300'}`} />
          {status}
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">Record a ChatGPT voice tab, a meeting screen, or your own camera.</p>
        <p className="mt-3 text-xs leading-5 text-slate-400">Open the ChatGPT tab first. One click captures that tab, its voice, your camera, and microphone. For meetings, allow camera and microphone in the recorder tab, check the preview, then choose the screen and Share audio. The saved video shows your face with the screen in a corner. The local transcript server stops after review finishes.</p>
        <div className="mt-5 rounded-lg bg-slate-900/70 px-3 py-2 text-sm text-slate-200">Focus: <strong className="font-medium text-white">{getPracticeFocusLabel(focus)}</strong></div>
      </section>

      <div className="mt-5 space-y-3">
        {!isBusy(capture) && <>
          <PrimaryButton onClick={() => void control('CAPTURE_START_TAB')}>Record ChatGPT tab + both voices</PrimaryButton>
          <PrimaryButton onClick={() => void control('CAPTURE_START', true)}>Record screen + my camera</PrimaryButton>
          <button className="w-full rounded-xl border border-sky-300 px-4 py-3 text-sm font-semibold text-sky-200" onClick={() => void control('CAPTURE_START', false)} type="button">Record screen only</button>
          <button className="w-full rounded-xl border border-emerald-300 px-4 py-3 text-sm font-semibold text-emerald-300" onClick={() => void control('CAPTURE_START_WEBCAM')} type="button">Record my camera</button>
        </>}
        {phase === 'recording' && <button className="w-full rounded-xl bg-red-400 px-4 py-3 text-sm font-semibold text-slate-950" onClick={() => void control('CAPTURE_STOP')} type="button">Stop recording</button>}
        <button className="w-full rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white" onClick={() => void control('CAPTURE_OPEN')} type="button">{phase === 'completed' ? 'Replay, download, or analyze' : 'Open recordings'}</button>
        {(error || capture?.error) && <p className="text-sm text-red-300" role="alert">{error || capture?.error}</p>}
      </div>

      <button className="mt-5 w-full rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => window.open('/options.html', '_blank')} type="button">Settings →</button>
    </main>
  );
}
