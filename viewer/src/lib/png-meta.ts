const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}


function textChunk(keyword: string, text: string): Uint8Array {
  const latin1 = (s: string) => Uint8Array.from(s, (ch) => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 63))
  const key = latin1(keyword), value = latin1(text)
  const out = new Uint8Array(12 + key.length + 1 + value.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, key.length + 1 + value.length)
  out.set([0x74, 0x45, 0x58, 0x74], 4)
  out.set(key, 8)
  out.set(value, 9 + key.length)
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)))
  return out
}


export function addPngMetadata(dataUrl: string, fields: Record<string, string>): string {
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) return dataUrl
  try {
    const png = Uint8Array.from(atob(dataUrl.slice(prefix.length)), (ch) => ch.charCodeAt(0))
    const ihdrEnd = 8 + 12 + 13 // signature + IHDR chunk
    const chunks = Object.entries(fields).map(([k, v]) => textChunk(k, v))
    const out = new Uint8Array(png.length + chunks.reduce((n, c) => n + c.length, 0))
    out.set(png.subarray(0, ihdrEnd), 0)
    let at = ihdrEnd
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
    out.set(png.subarray(ihdrEnd), at)
    let bin = ''
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000))
    return prefix + btoa(bin)
  } catch {
    return dataUrl
  }
}
