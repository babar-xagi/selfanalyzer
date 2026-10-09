import { browser } from 'wxt/browser';
import { localApiAvailable } from './backend';

const hostName = 'com.conversationcoach.localapi';
type CompanionReply = { ok: boolean; status: string; error?: string | null };

let port: ReturnType<typeof browser.runtime.connectNative> | null = null;
let starting: Promise<void> | null = null;
let ready = false;
let grammarStarting: Promise<void> | null = null;
let grammarReady = false;
let grammarPending: { resolve: () => void; reject: (error: Error) => void; timer: number } | null = null;

async function grammarAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:8081/health', { cache: 'no-store' });
    return response.ok;
  } catch { return false; }
}

export function ensureLocalCompanion(): Promise<void> {
  if (ready && port) {
    const current = port;
    return localApiAvailable().then((online) => {
      if (online && port === current) return;
      if (port === current) stopLocalCompanion();
      return ensureLocalCompanion();
    });
  }
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
      if (settled) {
        const pending = grammarPending;
        if (!pending || !['grammar-ready', 'grammar-failed'].includes(reply.status)) return;
        grammarPending = null;
        window.clearTimeout(pending.timer);
        if (reply.ok && reply.status === 'grammar-ready') { grammarReady = true; pending.resolve(); }
        else pending.reject(new Error(reply.error || 'The local grammar model could not start.'));
        return;
      }
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
      if (port === current) { port = null; ready = false; grammarReady = false; }
      if (grammarPending) {
        const pending = grammarPending;
        grammarPending = null;
        window.clearTimeout(pending.timer);
        pending.reject(new Error('Local grammar companion disconnected. Check backend/data/native-host.log.'));
      }
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        const detail = browser.runtime.lastError?.message;
        reject(new Error(`Local companion disconnected for extension ${browser.runtime.id}. Check its native companion registration and reload Chrome.${detail ? ` Chrome says: ${detail}` : ''}`));
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

export async function ensureGrammarCompanion(): Promise<void> {
  await ensureLocalCompanion();
  if (grammarReady && await grammarAvailable()) return;
  if (grammarStarting) return grammarStarting;
  grammarReady = false;
  grammarStarting = new Promise<void>((resolve, reject) => {
    const current = port;
    if (!current) { reject(new Error('Local companion is unavailable.')); return; }
    const timer = window.setTimeout(() => {
      grammarPending = null;
      reject(new Error('The local grammar model did not respond. Check backend/data/native-host.log.'));
    }, 45_000);
    grammarPending = { resolve, reject, timer };
    try { current.postMessage({ type: 'grammar' }); }
    catch {
      grammarPending = null;
      window.clearTimeout(timer);
      reject(new Error('Could not start the local grammar model.'));
    }
  }).finally(() => { grammarStarting = null; });
  return grammarStarting;
}

export function stopLocalCompanion(): void {
  const current = port;
  port = null;
  ready = false;
  grammarReady = false;
  if (!current) return;
  try { current.postMessage({ type: 'stop' }); }
  catch { /* Closing the port also stops the host-owned API. */ }
  current.disconnect();
}
