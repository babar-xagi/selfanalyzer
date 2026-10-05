import assert from 'node:assert/strict';
import test from 'node:test';
import { activeLineIndex, recordingBundle, transcriptText, transcriptVtt } from '../lib/transcript.ts';

test('transcript text and subtitles preserve corrected words and timing', () => {
  const lines = [
    { start_ms: 900, end_ms: 2400, text: 'I really went yesterday.' },
    { start_ms: 2500, end_ms: 3900, text: 'What about you?' },
  ];
  assert.equal(activeLineIndex(lines, 899), -1);
  assert.equal(activeLineIndex(lines, 1000), 0);
  assert.equal(activeLineIndex(lines, 2450), -1);
  assert.equal(activeLineIndex(lines, 3000), 1);
  assert.equal(transcriptText(lines), 'I really went yesterday.\nWhat about you?\n');
  assert.match(transcriptVtt(lines), /00:00:00\.900 --> 00:00:02\.400\nI really went yesterday\./);
});

test('a single ZIP contains the video, transcript, and timed subtitles', async () => {
  const files = [
    { name: 'recording.webm', data: new Blob(['video bytes']) },
    { name: 'transcript.txt', data: new Blob(['What I said.\n']) },
    { name: 'subtitles.vtt', data: new Blob(['WEBVTT\n']) },
  ];
  const bundle = await recordingBundle(files);
  const bytes = new Uint8Array(await bundle.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const file of files) {
    assert.equal(view.getUint32(offset, true), 0x04034b50);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const content = new TextDecoder().decode(bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size));
    assert.equal(name, file.name);
    assert.equal(content, await file.data.text());
    offset += 30 + nameLength + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
});
