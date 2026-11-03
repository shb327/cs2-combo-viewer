// A KeyValues (VDF) text parser for items_game.txt and the localization files. Keys are kept as written; a key that
// appears twice with block values is merged (items_game repeats some of its sections), otherwise the last one wins.

export function parseKv1(text) {
  let i = 0
  const n = text.length
  const skip = () => {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++
      if (text[i] === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue }
      break
    }
  }
  const token = () => {
    skip()
    if (i >= n) return null
    const c = text[i]
    if (c === '{' || c === '}') { i++; return c }
    if (c === '"') {
      i++
      let s = ''
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) { const e = text[i + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; i += 2 } else s += text[i++]
      }
      i++
      return { s }
    }
    let s = ''
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++]
    return { s }
  }
  const block = () => {
    const o = {}
    for (;;) {
      const k = token()
      if (k === null || k === '}') return o
      if (k === '{') throw new Error('unexpected { at ' + i)
      let v = token()
      // A conditional like [$WIN32] after the value
      skip()
      if (text[i] === '[') { while (i < n && text[i] !== ']') i++; i++ }
      if (v === '{') v = block()
      else if (v && typeof v === 'object') v = v.s
      else throw new Error(`no value for ${k.s} at ${i}`)
      const prev = o[k.s]
      o[k.s] = prev && typeof prev === 'object' && typeof v === 'object' ? { ...prev, ...v } : v
    }
  }
  return block()
}

/** Decodes a localization file (UTF-16 LE with BOM, or UTF-8) and returns its tokens, keys lower-cased. */
export function parseLocalization(buffer) {
  const text = buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString('utf16le').slice(1) : buffer.toString('utf8').replace(/^﻿/, '')
  const kv = parseKv1(text)
  const tokens = kv.lang?.Tokens ?? kv.lang?.tokens ?? {}
  return Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k.toLowerCase(), v]))
}
