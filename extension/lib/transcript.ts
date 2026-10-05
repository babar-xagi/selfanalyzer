export interface TimedLine {
  start_ms: number;
  end_ms: number;
  text: string;
}

export function activeLineIndex(lines: TimedLine[], timeMs: number): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && timeMs >= line.start_ms && timeMs < Math.max(line.end_ms, line.start_ms + 1)) return index;
  }
  return -1;
}

function vttTime(milliseconds: number): string {
  const ms = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function transcriptText(lines: TimedLine[]): string {
  return lines.map((line) => line.text.trim()).filter(Boolean).join('\n') + '\n';
}

export function transcriptVtt(lines: TimedLine[]): string {
  const cues = lines.filter((line) => line.text.trim()).map((line, index) =>
    `${index + 1}\n${vttTime(line.start_ms)} --> ${vttTime(Math.max(line.end_ms, line.start_ms + 1))}\n${line.text.trim()}\n`,
  );
  return `WEBVTT\n\n${cues.join('\n')}`;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const byte of value) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function recordingBundle(files: { name: string; data: Blob }[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    if (file.data.size > 0xffffffff || offset + 30 + name.length + file.data.size > 0xffffffff)
      throw new Error('The recording is too large for a single ZIP download. Download the video separately.');
    const checksum = await crc32(file.data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, file.data.size, true);
    localView.setUint32(22, file.data.size, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, file.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, file.data.size, true);
    centralView.setUint32(24, file.data.size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + file.data.size;
  }
  const centralSize = centralParts.reduce((size, part) => size + (part as Uint8Array).length, 0);
  if (offset + centralSize + 22 > 0xffffffff) throw new Error('The recording is too large for a single ZIP download. Download the video separately.');
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
