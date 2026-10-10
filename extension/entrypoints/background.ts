import type { CaptureState, ControlMessage, ControlReply } from '../lib/recordingControl';
import { browser, type Browser } from 'wxt/browser';

export default defineBackground(() => {
  const key = 'captureState';
  const initial = (): CaptureState => ({
    phase: 'idle', recorderTabId: null, returnTabId: null,
    sessionId: null, error: null, source: null, updatedAt: Date.now(),
  });

  async function getState(): Promise<CaptureState> {
    const stored = await browser.storage.session.get(key);
    return (stored[key] as CaptureState | undefined) ?? initial();
  }

  async function setState(changes: Partial<CaptureState>): Promise<CaptureState> {
    const next = { ...await getState(), ...changes, updatedAt: Date.now() };
    await browser.storage.session.set({ [key]: next });
    await browser.action.setBadgeText({ text: next.phase === 'recording' ? 'REC' : next.phase === 'completed' ? 'OK' : next.phase === 'interrupted' || next.phase === 'failed' ? '!' : '' });
    if (next.phase === 'recording') await browser.action.setBadgeBackgroundColor({ color: '#dc2626' });
    else if (next.phase === 'completed') await browser.action.setBadgeBackgroundColor({ color: '#059669' });
    return next;
  }

  function notify(title: string, message: string): void {
    browser.notifications.create('conversation-coach-recording', {
      type: 'basic', iconUrl: browser.runtime.getURL('/notification.png'),
      title, message, priority: 1,
    }).catch(() => { /* The popup still shows the result when notifications are blocked. */ });
  }

  async function openRecorder(state: CaptureState): Promise<void> {
    if (state.recorderTabId !== null) {
      try {
        const tab = await browser.tabs.get(state.recorderTabId);
        await browser.tabs.update(tab.id!, { active: true });
        if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
        return;
      } catch { /* The recorder tab was closed; open the saved recordings view. */ }
    }
    const url = new URL(browser.runtime.getURL('/record.html'));
    if (state.sessionId) url.searchParams.set('session', state.sessionId);
    await browser.tabs.create({ url: url.toString() });
  }

  async function startCapture(includeCamera = true): Promise<ControlReply> {
    const current = await getState();
    if (['choosing', 'preparing', 'recording', 'processing'].includes(current.phase)) {
      if (current.phase === 'choosing' || current.recorderTabId === null) return { ok: false, state: current, error: 'A recording is already starting.' };
      try { await browser.tabs.get(current.recorderTabId); return { ok: false, state: current, error: 'A recording is already in progress.' }; }
      catch { /* A closed tab can be replaced with a new capture. */ }
    }
    const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const preparing = await setState({ phase: 'preparing', recorderTabId: null, returnTabId: active?.id ?? null, sessionId: null, error: null, source: 'screen' });
    let recorderTabId: number | null = null;
    try {
      const recorder = await browser.tabs.create({ url: 'about:blank', active: true });
      recorderTabId = recorder.id ?? null;
      if (recorderTabId === null) throw new Error('Chrome could not open the recorder tab.');
      await setState({ recorderTabId });
      await browser.tabs.update(recorderTabId, { url: browser.runtime.getURL(`/record.html?prepareScreen=1&camera=${includeCamera ? '1' : '0'}`) });
      return { ok: true, state: preparing };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Could not open the screen picker.';
      const failed = await setState({ phase: 'failed', recorderTabId: null, error });
      if (recorderTabId !== null) await browser.tabs.remove(recorderTabId).catch(() => {});
      return { ok: false, state: failed, error };
    }
  }

  async function pickScreen(sender: Browser.runtime.MessageSender): Promise<ControlReply> {
    const state = await getState();
    if (state.source !== 'screen' || sender.tab?.id !== state.recorderTabId || state.phase !== 'preparing')
      return { ok: false, state, error: 'The screen recorder is no longer preparing.' };
    await setState({ phase: 'choosing' });
    return new Promise<ControlReply>((resolve) => {
      try {
        browser.desktopCapture.chooseDesktopMedia(['tab', 'window', 'screen', 'audio'], (streamId, options) => {
          void (async () => {
            const latest = await getState();
            if (latest.recorderTabId !== sender.tab?.id || latest.phase !== 'choosing') {
              resolve({ ok: false, state: latest, error: 'The recorder tab closed before a screen was selected.' });
              return;
            }
            if (!streamId) {
              const error = 'Screen sharing was cancelled. Choose a tab, window, or screen and try again.';
              resolve({ ok: false, state: await setState({ phase: 'failed', error }), error });
              return;
            }
            // The ID expires in seconds; return it directly to the already loaded
            // recorder page so it can consume it without a tab navigation.
            resolve({ ok: true, state: await setState({ phase: 'preparing' }), streamId, includeAudio: options.canRequestAudioTrack });
          })().catch(async (cause: unknown) => {
            const error = cause instanceof Error ? cause.message : 'Could not choose a screen.';
            resolve({ ok: false, state: await setState({ phase: 'failed', error }), error });
          });
        });
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : 'Could not open the screen picker.';
        void setState({ phase: 'failed', error }).then((failed) => resolve({ ok: false, state: failed, error }));
      }
    });
  }

  async function startChatGptCapture(): Promise<ControlReply> {
    const current = await getState();
    if (['choosing', 'preparing', 'recording', 'processing'].includes(current.phase))
      return { ok: false, state: current, error: 'A recording is already starting or running.' };
    const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const host = active?.url ? new URL(active.url).hostname : '';
    if (!active?.id || !['chatgpt.com', 'chat.openai.com'].includes(host)) {
      const error = 'Open your ChatGPT voice tab, then click Record ChatGPT tab + both voices.';
      return { ok: false, state: await setState({ phase: 'failed', error }), error };
    }
    let recorderTabId: number | null = null;
    try {
      const tab = await browser.tabs.create({ url: browser.runtime.getURL('/record.html?pending=1'), active: false });
      recorderTabId = tab.id ?? null;
      if (recorderTabId === null) throw new Error('Chrome could not open the recorder.');
      const preparing = await setState({ phase: 'preparing', recorderTabId, returnTabId: active.id, sessionId: null, error: null, source: 'chatgpt-tab' });
      const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: active.id, consumerTabId: recorderTabId });
      const url = new URL(browser.runtime.getURL('/record.html'));
      url.hash = new URLSearchParams({ capture: streamId, audio: '1', kind: 'chatgpt-tab' }).toString();
      // Focus briefly so Chrome can show camera/microphone permission prompts.
      // RECORDER_STARTED returns the user to the ChatGPT tab automatically.
      await browser.tabs.update(recorderTabId, { url: url.toString(), active: true });
      return { ok: true, state: preparing };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Could not capture the ChatGPT tab.';
      if (recorderTabId !== null) await browser.tabs.remove(recorderTabId).catch(() => {});
      return { ok: false, state: await setState({ phase: 'failed', recorderTabId: null, error }), error };
    }
  }

  async function startWebcam(): Promise<ControlReply> {
    const current = await getState();
    if (['choosing', 'preparing', 'recording', 'processing'].includes(current.phase)) {
      if (current.recorderTabId === null) return { ok: false, state: current, error: 'A recording is already starting.' };
      try { await browser.tabs.get(current.recorderTabId); return { ok: false, state: current, error: 'A recording is already in progress.' }; }
      catch { /* The old recorder tab was closed. */ }
    }
    try {
      const tab = await browser.tabs.create({ url: 'about:blank', active: true });
      const preparing = await setState({ phase: 'preparing', recorderTabId: tab.id ?? null, returnTabId: null, sessionId: null, error: null, source: 'webcam' });
      await browser.tabs.update(tab.id!, { url: browser.runtime.getURL('/record.html?webcam=1') });
      return { ok: true, state: preparing };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Could not open the camera recorder.';
      return { ok: false, state: await setState({ phase: 'failed', error }), error };
    }
  }

  async function handle(message: ControlMessage, sender: Browser.runtime.MessageSender): Promise<ControlReply> {
    const state = await getState();
    switch (message.type) {
      case 'CAPTURE_STATUS': return { ok: true, state };
      case 'CAPTURE_START': return startCapture(message.includeCamera);
      case 'CAPTURE_START_TAB': return startChatGptCapture();
      case 'CAPTURE_START_WEBCAM': return startWebcam();
      case 'RECORDER_PICK_SCREEN': return pickScreen(sender);
      case 'CAPTURE_OPEN':
        await openRecorder(state);
        return { ok: true, state };
      case 'CAPTURE_STOP':
        if (state.recorderTabId === null || state.phase !== 'recording' || !state.sessionId) return { ok: false, state, error: 'No recording is running.' };
        await setState({ phase: 'processing' });
        try {
          await browser.runtime.sendMessage({ type: 'RECORDER_STOP', sessionId: state.sessionId } satisfies ControlMessage);
          return { ok: true, state: await getState() };
        } catch {
          const error = 'Could not reach the recorder tab. Open recordings to recover saved chunks.';
          return { ok: false, state: await setState({ phase: 'interrupted', error }), error };
        }
      case 'RECORDER_STARTED':
        if (sender.tab?.id !== state.recorderTabId) return { ok: false, state };
        await setState({ phase: 'recording', sessionId: message.sessionId, error: null });
        if (state.source !== 'webcam' && state.returnTabId !== null) {
          try { await browser.tabs.update(state.returnTabId, { active: true }); }
          catch { /* The meeting tab may have been closed. */ }
        }
        return { ok: true, state: await getState() };
      case 'RECORDER_FINISHED':
        if (sender.tab?.id !== state.recorderTabId) return { ok: false, state };
        await setState({ phase: message.phase, sessionId: message.sessionId, error: message.error });
        notify(message.phase === 'completed' ? 'Recorded successfully' : 'Recording ended',
          message.phase === 'completed' ? 'Open Conversation Coach to replay, download, or analyze your meeting.' : message.error ?? 'Open Conversation Coach to review the saved recording.');
        return { ok: true, state: await getState() };
      case 'RECORDER_FAILED':
        if (sender.tab?.id !== state.recorderTabId) return { ok: false, state };
        await setState({ phase: 'failed', error: message.error });
        notify('Recording could not start', message.error);
        return { ok: true, state: await getState() };
      default: return { ok: false, state };
    }
  }

  browser.runtime.onMessage.addListener((message: ControlMessage, sender, sendResponse: (reply: ControlReply) => void) => {
    if (!message || !('type' in message) || message.type === 'RECORDER_STOP') return false;
    void handle(message, sender).then(sendResponse).catch(async (cause: unknown) => {
      const error = cause instanceof Error ? cause.message : 'The recording control failed.';
      sendResponse({ ok: false, state: await getState(), error });
    });
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const state = await getState();
      if (state.recorderTabId !== tabId) return;
      if (['choosing', 'preparing', 'recording', 'processing'].includes(state.phase)) {
        await setState({ phase: 'interrupted', recorderTabId: null, error: 'The recorder tab was closed. Open recordings to recover saved chunks.' });
        notify('Recording interrupted', 'The recorder tab closed. Open Conversation Coach to recover saved chunks.');
      } else await setState({ recorderTabId: null });
    })();
  });

  browser.notifications.onClicked.addListener((id) => {
    if (id !== 'conversation-coach-recording') return;
    void getState().then(openRecorder);
  });
});
