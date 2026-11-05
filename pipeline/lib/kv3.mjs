// KV3 text (the format of a model's key values, `<!-- kv3 … -->` then one value) and Source 2's bone name hash.

/** Parses KV3 text into plain JSON values: objects, arrays, strings, numbers, booleans, null. */
export function parseKv3(text) {
  let i = text.indexOf('-->') >= 0 ? text.indexOf('-->') + 3 : 0
  const skip = () => {
    for (;;) {
      while (i < text.length && /[\s,]/.test(text[i])) i++
      if (text.startsWith('//', i)) i = text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i)
      else if (text.startsWith('/*', i)) i = text.indexOf('*/', i) + 2
      else return
    }
  }
  const word = () => {
    const m = /^[^\s=,[\]{}"]+/.exec(text.slice(i, i + 256))
    if (!m) throw new Error(`kv3: unexpected ${JSON.stringify(text.slice(i, i + 20))} at ${i}`)
    i += m[0].length
    return m[0]
  }
  const value = () => {
    skip()
    const c = text[i]
    if (c === '{') {
      i++
      const o = {}
      for (skip(); text[i] !== '}'; skip()) {
        const key = text[i] === '"' ? string() : word()
        skip()
        if (text[i++] !== '=') throw new Error(`kv3: expected = after ${key}`)
        o[key] = value()
      }
      i++
      return o
    }
    if (c === '[') {
      i++
      const a = []
      for (skip(); text[i] !== ']'; skip()) a.push(value())
      i++
      return a
    }
    if (c === '"') return string()
    const w = word()
    if (w === 'true' || w === 'false') return w === 'true'
    if (w === 'null') return null
    const n = Number(w)
    if (Number.isNaN(n)) {
      // A typed value (resource:"…", soundevent:"…"): its string.
      if (text[i] === '"' || text[i] === ':') { if (text[i] === ':') i++; return string() }
      return w
    }
    return n
  }
  const string = () => {
    if (text.startsWith('"""', i)) {
      const end = text.indexOf('"""', i + 3)
      const s = text.slice(i + 3, end)
      i = end + 3
      return s
    }
    let s = ''
    for (i++; text[i] !== '"'; i++) s += text[i] === '\\' ? text[++i] : text[i]
    i++
    return s
  }
  return value()
}

/** Source 2's hash of a bone name (MurmurHash2 of the lower-case name, seed 0x31415926), as constraints name bones. */
export function boneHash(name) {
  const data = Buffer.from(name.toLowerCase(), 'utf8')
  const m = 0x5bd1e995
  let len = data.length, h = (0x31415926 ^ len) >>> 0, i = 0
  while (len >= 4) {
    let k = data.readUInt32LE(i)
    k = Math.imul(k, m); k ^= k >>> 24; k = Math.imul(k, m)
    h = Math.imul(h, m) ^ k
    i += 4; len -= 4
  }
  if (len === 3) h ^= data[i + 2] << 16
  if (len >= 2) h ^= data[i + 1] << 8
  if (len >= 1) { h ^= data[i]; h = Math.imul(h, m) }
  h ^= h >>> 13; h = Math.imul(h, m); h ^= h >>> 15
  return h >>> 0
}
