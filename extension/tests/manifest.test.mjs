import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('packed development extension retains its companion ID and direct tab capture permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../.output/chrome-mv3/manifest.json', import.meta.url), 'utf8'));
  const digest = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16);
  const id = [...digest].map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
  assert.equal(id, 'cdgiokmmcnaimhhcjdokjogehhephppp');
  for (const permission of ['activeTab', 'tabCapture', 'nativeMessaging'])
    assert.ok(manifest.permissions.includes(permission), `${permission} must be in the packed manifest`);
});
