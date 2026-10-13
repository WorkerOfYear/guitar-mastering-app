// Recordings are stored as bare bytes (IndexedDB); the type comes from the file's own header,
// so a player knows what it plays and a download gets the right extension instead of ".txt".

const TYPES: [test: (b: Uint8Array) => boolean, mime: string, ext: string][] = [
  [(b) => ascii(b, 4, 4) === "ftyp", "audio/mp4", "m4a"],
  [(b) => ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), "audio/mpeg", "mp3"],
  [(b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3, "audio/webm", "webm"],
  [(b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE", "audio/wav", "wav"],
  [(b) => ascii(b, 0, 4) === "OggS", "audio/ogg", "ogg"],
  [(b) => ascii(b, 0, 4) === "fLaC", "audio/flac", "flac"],
];

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

export function audioType(data: ArrayBuffer): { mime: string; ext: string } | null {
  const head = new Uint8Array(data, 0, Math.min(16, data.byteLength));
  const t = TYPES.find(([test]) => head.length >= 12 && test(head));
  return t ? { mime: t[1], ext: t[2] } : null;
}

export const audioBlob = (data: ArrayBuffer) => new Blob([data], { type: audioType(data)?.mime ?? "application/octet-stream" });

/** "Racer X - Technical Difficulties.audio" + m4a bytes → "Racer X - Technical Difficulties.m4a" */
export function audioFileName(name: string, data: ArrayBuffer) {
  const ext = audioType(data)?.ext;
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, "") || "запись";
  return ext ? `${base}.${ext}` : name;
}

/** Saves the recording as a file. */
export function downloadAudio(data: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(audioBlob(data));
  const a = Object.assign(document.createElement("a"), { href: url, download: audioFileName(name, data) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
