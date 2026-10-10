import assert from 'node:assert/strict';
import test from 'node:test';
import { compositeScreenAndCamera } from '../lib/compositeVideo.ts';

test('face-first recording starts even while the shared tab has not produced a play event', async () => {
  const priorDocument = globalThis.document;
  const priorWindow = globalThis.window;
  const priorMediaElement = globalThis.HTMLMediaElement;
  const drawCalls = [];
  const fakeTrack = { stop() {} };
  const videos = [];
  globalThis.HTMLMediaElement = { HAVE_CURRENT_DATA: 2 };
  globalThis.window = {
    setTimeout: (callback) => setTimeout(callback, 5),
    setInterval: () => 1,
    clearInterval() {},
  };
  globalThis.document = {
    createElement(tag) {
      if (tag === 'video') {
        const isSharedTab = videos.length === 0;
        const video = {
          readyState: 2,
          videoWidth: videos.length ? 1280 : 1920,
          videoHeight: videos.length ? 720 : 1080,
          play: () => isSharedTab ? new Promise(() => {}) : Promise.resolve(),
          pause() {},
          requestVideoFrameCallback: () => 1,
          cancelVideoFrameCallback() {},
          srcObject: null,
        };
        videos.push(video);
        return video;
      }
      return {
        width: 0, height: 0,
        getContext: () => ({ fillStyle: '', fillRect() {}, drawImage: (...args) => drawCalls.push(args) }),
        captureStream: () => ({ getTracks: () => [fakeTrack] }),
      };
    },
  };
  try {
    const { stream, stop } = await compositeScreenAndCamera({}, {}, () => 'focus');
    assert.equal(stream.getTracks()[0], fakeTrack);
    assert.ok(drawCalls.some((args) => { const [x, y, width, height] = args.slice(-4); return x === 0 && y === 0 && width === 1600 && height === 900; }), 'camera must fill the saved frame');
    assert.ok(drawCalls.some((args) => { const [x, y, width, height] = args.slice(-4); return x >= 1200 && y >= 600 && width <= 360 && height <= 203; }), 'shared screen must appear in the corner');
    stop();
  } finally {
    globalThis.document = priorDocument;
    globalThis.window = priorWindow;
    globalThis.HTMLMediaElement = priorMediaElement;
  }
});
