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

  async function startCapture(tabAudioRequired = false): Promise<ControlReply> {
    const current = await getState();
    if (['choosing', 'preparing', 'recording', 'processing'].includes(current.phase)) {
      if (current.phase === 'choosing' || current.recorderTabId === null) return { ok: false, state: current, error: 'A recording is already starting.' };
      try { await browser.tabs.get(current.recorderTabId); return { ok: false, state: current, error: 'A recording is already in progress.' }; }
      catch { /* A closed tab can be replaced with a new capture. */ }
    }
    const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const choosing = await setState({ phase: 'choosing', recorderTabId: null, returnTabId: active?.id ?? null, sessionId: null, error: null, source: tabAudioRequired ? 'chatgpt-tab' : 'screen' });
    try {
      browser.desktopCapture.chooseDesktopMedia(tabAudioRequired ? ['tab', 'audio'] : ['tab', 'window', 'screen', 'audio'], (streamId, options) => {
        void (async () => {
          if (!streamId) { await setState({ phase: 'idle' }); return; }
          if (tabAudioRequired && !options.canRequestAudioTrack) {
            const error = 'ChatGPT tab audio was not shared. Select the ChatGPT tab with Share tab audio enabled and try again.';
            await setState({ phase: 'failed', error });
            notify('ChatGPT audio was not shared', error);
            return;
          }
          const url = new URL(browser.runtime.getURL('/record.html'));
          url.hash = new URLSearchParams({ capture: streamId, audio: options.canRequestAudioTrack ? '1' : '0', kind: tabAudioRequired ? 'chatgpt-tab' : 'screen' }).toString();
          const tab = await browser.tabs.create({ url: url.toString(), active: true });
          await setState({ phase: 'preparing', recorderTabId: tab.id ?? null });
        })().catch(async (cause: unknown) => {
          const error = cause instanceof Error ? cause.message : 'Could not start screen capture.';
          await setState({ phase: 'failed', error });
          notify('Recording could not start', error);
        });
      });
      return { ok: true, state: choosing };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Could not open the screen picker.';
      return { ok: false, state: await setState({ phase: 'failed', error }), error };
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
      case 'CAPTURE_START': return startCapture();
      case 'CAPTURE_START_TAB': return startCapture(true);
      case 'CAPTURE_START_WEBCAM': return startWebcam();
      case 'CAPTURE_OPEN':
        await openRecorder(state);
        return { ok: true, state };
      case 'CAPTURE_STOP':
        if (state.recorderTabId === null || state.phase !== 'recording' || !state.sessionId) return { ok: false, state, error: 'No recording is running.' };
        await browser.runtime.sendMessage({ type: 'RECORDER_STOP', sessionId: state.sessionId } satisfies ControlMessage);
        return { ok: true, state: await setState({ phase: 'processing' }) };
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
      if (['preparing', 'recording', 'processing'].includes(state.phase)) {
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
