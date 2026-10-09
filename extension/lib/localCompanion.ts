import { browser } from 'wxt/browser';

const hostName = 'com.conversationcoach.localapi';
type CompanionReply = { ok: boolean; status: string; error?: string | null };

let port: ReturnType<typeof browser.runtime.connectNative> | null = null;
let starting: Promise<void> | null = null;
let ready = false;

export function ensureLocalCompanion(): Promise<void> {
  if (ready && port) return Promise.resolve();
  if (starting) return starting;
  starting = new Promise<void>((resolve, reject) => {
    let settled = false;
    let current: ReturnType<typeof browser.runtime.connectNative>;
    try { current = browser.runtime.connectNative(hostName); }
    catch {
      reject(new Error('Local companion is not installed. Run backend/scripts/install_native_companion.ps1 once, then reload the extension.'));
      return;
    }
    port = current;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      current.disconnect();
      reject(new Error('The local transcript server did not respond. Check backend/data/native-host.log.'));
    }, 15_000);
    current.onMessage.addListener((reply: CompanionReply) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (reply.ok && reply.status === 'ready') {
        ready = true;
        resolve();
      } else {
        current.disconnect();
        reject(new Error(reply.error || 'The local transcript server could not start.'));
      }
    });
    current.onDisconnect.addListener(() => {
      if (port === current) { port = null; ready = false; }
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('Local companion disconnected. Install it for this extension ID and reload Chrome.'));
      }
    });
    try { current.postMessage({ type: 'start' }); }
    catch {
      current.disconnect();
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('Could not contact the local companion.'));
      }
    }
  }).finally(() => { starting = null; });
  return starting;
}

export function stopLocalCompanion(): void {
  const current = port;
  port = null;
  ready = false;
  if (!current) return;
  try { current.postMessage({ type: 'stop' }); }
  catch { /* Closing the port also stops the host-owned API. */ }
  current.disconnect();
}
