import { useState } from 'react';
import { getPracticeFocus, practiceFocuses, savePracticeFocus, type PracticeFocus } from '../../lib/focus';

export function App() {
  const [focus, setFocus] = useState<PracticeFocus>(getPracticeFocus);
  const [message, setMessage] = useState('');

  function changeFocus(next: PracticeFocus) {
    try {
      savePracticeFocus(next);
      setFocus(next);
      setMessage('Saved. The popup will show this focus when you reopen it.');
    } catch {
      setMessage('Could not save your focus. Please try again.');
    }
  }

  return (
    <main className="min-h-screen bg-[#10171d] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Conversation Coach</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-3 text-slate-300">Set an intention for your next conversation.</p>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          <label htmlFor="practice-focus" className="block text-base font-medium">Practice focus</label>
          <p className="mt-1 text-sm leading-6 text-slate-400">This focus appears in your recording tab. Afterward, you can replay the call and analyze your voice.</p>
          <select
            id="practice-focus"
            className="mt-5 w-full rounded-xl border border-white/15 bg-[#18232c] px-4 py-3 text-sm text-white"
            value={focus}
            onChange={(event) => changeFocus(event.target.value as PracticeFocus)}
          >
            {practiceFocuses.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <p role="status" className="mt-4 min-h-6 text-sm text-emerald-300">{message}</p>
        </section>

        <p className="mt-6 text-sm leading-6 text-slate-400">Your choice is stored only in this browser. No microphone or camera permission is requested here.</p>
      </div>
    </main>
  );
}
