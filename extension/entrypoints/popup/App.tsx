import { useState } from 'react';
import { browser } from 'wxt/browser';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getPracticeFocus, getPracticeFocusLabel } from '../../lib/focus';

export function App() {
  const focus = getPracticeFocus();
  const [launchError, setLaunchError] = useState('');

  async function openRecordingTab() {
    try {
      await browser.tabs.create({ url: browser.runtime.getURL('/record.html') });
    } catch {
      setLaunchError('Could not open the recording tab. Please try again.');
    }
  }

  return (
    <main className="min-h-[420px] w-[340px] bg-[#10171d] p-5 text-slate-100">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Conversation Coach</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Practice with purpose.</h1>
        </div>
        <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-300/15 text-xl text-emerald-300">✦</div>
      </header>

      <section aria-live="polite" className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          Ready for practice
        </div>
        <h2 className="mt-3 text-lg font-semibold">Your next conversation starts here</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Record your own voice, then listen back and choose what to practice next.
        </p>
        <div className="mt-5 rounded-lg bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
          Focus: <strong className="font-medium text-white">{getPracticeFocusLabel(focus)}</strong>
        </div>
      </section>

      <div className="mt-5">
        <PrimaryButton onClick={openRecordingTab}>
          Start Session
        </PrimaryButton>
        {launchError && <p className="mt-3 text-sm text-red-300" role="alert">{launchError}</p>}
      </div>

      <button
        className="mt-5 w-full rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
        onClick={() => window.open('/options.html', '_blank')}
        type="button"
      >
        Settings →
      </button>
    </main>
  );
}
