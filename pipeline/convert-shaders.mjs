// Turns shader-dump's output (the game's compositing shaders as Vulkan GLSL, with their parameter tables) into what
// the viewer loads: WebGL2 (GLSL ES 3.00) fragment shaders, one per static combo, and one table per shader.
//
//   node convert-shaders.mjs [--raw <dir>] [--out <dir>]
//
// Reads  <raw>/<shader>/{table.json, combos.json, ps_<id>.glsl}          (default C:/cs2-data/extracted/shaders-raw)
// Writes <out>/<name>.json and <out>/<prefix>_<id>.frag.glsl                (default C:/cs2-data/extracted/web/extracted/viewer/shaders)
//
// The output is derived from the game's shaders: it stays in the local asset folder and is never committed.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { insideRoot, EXTRACTED, parseArgs } from './lib/paths.mjs'

/** Each shader the viewer composites with: the table's name, the frag prefix, and the vertex shader layout it provides. */
const SHADERS = [
  {
    shader: 'csgo_customweapon', name: 'customweapon', prefix: 'cw',
    // composite.ts vertexShader(): location → type
    inputs: { 0: 'vec4', 1: 'vec4', 2: 'vec4', 3: 'vec2' },
  },
  {
    shader: 'csgo_customglove', name: 'customglove', prefix: 'cg',
    // glove2.ts vertexShader(): location → type
    inputs: { 0: 'vec4', 1: 'vec4', 2: 'vec4', 3: 'vec4', 4: 'vec4', 5: 'vec3', 6: 'vec4' },
  },
]

/** WebGL2 allows 16 textures in a fragment shader. */
const MAX_TEXTURES = 16

const args = parseArgs(process.argv.slice(2))
const raw = insideRoot(EXTRACTED, args.raw ?? path.join(EXTRACTED, 'shaders-raw'))
const out = insideRoot(EXTRACTED, args.out ?? path.join(EXTRACTED, 'web/extracted/viewer/shaders'))
mkdirSync(out, { recursive: true })

for (const def of SHADERS) {
  const dir = path.join(raw, def.shader)
  const table = JSON.parse(readFileSync(path.join(dir, 'table.json'), 'utf8'))
  const combos = JSON.parse(readFileSync(path.join(dir, 'combos.json'), 'utf8'))
  const viewerTable = {
    shader: def.shader,
    features: table.features.map((f) => f.name),
    static: table.static.map((s) => s.name),
    ps: shaderVars(table.ps),
    vs: shaderVars(table.vs),
    combos: {},
  }
  const allSets = new Set()
  const skipped = []
  let converted = 0
  for (const [id, values] of Object.entries(combos)) {
    const source = readFileSync(path.join(dir, `ps_${id}.glsl`), 'utf8')
    let result
    try {
      result = convert(source, def, `${def.shader} combo ${id}`)
    } catch (e) {
      skipped.push(e.message)
      continue
    }
    result.sets.forEach((s) => allSets.add(s))
    viewerTable.combos[id] = { values, uniforms: result.uniforms, textures: result.textures, inputs: result.inputs, sets: result.sets }
    writeFileSync(path.join(out, `${def.prefix}_${id}.frag.glsl`), result.glsl)
    converted++
  }
  if (allSets.size) viewerTable.sets = [...allSets]
  writeFileSync(path.join(out, `${def.name}.json`), JSON.stringify(viewerTable))
  console.log(`${def.shader}: ${converted} combos -> ${out}`)
  if (skipped.length) {
    // Left out of the table: the viewer reports "combo N not exported" if a kit needs one of them.
    console.log(`  ${skipped.length} combos skipped:`)
    const reasons = new Map()
    for (const msg of skipped) { const r = msg.replace(/^.*?combo \d+: /, ''); reasons.set(r, (reasons.get(r) ?? 0) + 1) }
    for (const [r, n] of reasons) console.log(`    ${n} × ${r}`)
    writeFileSync(path.join(out, `${def.name}.skipped.txt`), skipped.join('\n') + '\n')
  }
}

/** The table's variables as the viewer reads them (ShaderVar in composite.ts). */
function shaderVars(vars) {
  const o = {}
  for (const [name, v] of Object.entries(vars ?? {})) {
    const entry = { default: v.default, elements: v.elements }
    if (/^(int|bool)/.test(v.type)) entry.int = true
    if (v.expr) entry.expr = v.expr
    if ('srgb' in v) entry.srgb = v.srgb
    if (v.defaultTexture) entry.defaultTexture = v.defaultTexture
    o[name] = entry
  }
  return o
}

/** One Vulkan GLSL pixel shader → GLSL ES 3.00 for a three.js RawShaderMaterial (glslVersion GLSL3, no #version). */
function convert(src, def, label) {
  let s = src.replace(/\r\n/g, '\n')
  // The header comments, #version, extensions and the control-flow attribute macros.
  s = s.replace(/^\/\/.*\n/gm, '')
  s = s.replace(/^#version.*\n/m, '')
  s = s.replace(/^#extension.*\n/gm, '')
  s = s.replace(/#if defined\(GL_EXT_control_flow_attributes\)\n[\s\S]*?#endif\n/g, '')
  s = s.replace(/\bSPIRV_CROSS_(BRANCH|FLATTEN|LOOP|UNROLL)\b\s*/g, '')
  s = s.replace(/\bdFdxFine\b/g, 'dFdx').replace(/\bdFdyFine\b/g, 'dFdy').replace(/\bfwidthFine\b/g, 'fwidth')
  s = s.replace(/\bdFdxCoarse\b/g, 'dFdx').replace(/\bdFdyCoarse\b/g, 'dFdy')

  // The uniform block → plain uniforms.
  const uniforms = []
  const block = /^layout\([^)]*\) uniform (_\d+) (\w+);\n/m.exec(s)
  if (block) {
    const [whole, structName, instance] = block
    const struct = new RegExp(`^struct ${structName}\\n\\{\\n([\\s\\S]*?)\\n\\};\\n`, 'm').exec(s)
    if (!struct) throw new Error(`${label}: uniform block struct ${structName} not found`)
    for (const line of struct[1].split('\n')) {
      const m = /^\s+(?:layout\([^)]*\)\s+)?(\w+) (\w+)(\[\d+\])?;$/.exec(line)
      if (!m) throw new Error(`${label}: can't read uniform block member: ${line.trim()}`)
      if (m[3]) throw new Error(`${label}: array uniform ${m[2]} is not supported`)
      uniforms.push([m[2], m[1]])
    }
    s = s.replace(struct[0], '').replace(whole, '')
    s = s.replace(new RegExp(`\\b${instance}\\.`, 'g'), '')
  }
  if (/^\s*layout\([^)]*\) uniform _\d+ /m.test(s) || /\bbuffer\b/.test(s)) throw new Error(`${label}: a second uniform or storage block`)

  // Separate textures and samplers → combined samplers; complete 1–4 layer families into arrays when there are too many.
  const textures = [...s.matchAll(/^layout\([^)]*\) uniform texture2D (\w+);\n/gm)].map((m) => m[1])
  if (/uniform texture(?!2D\b)\w+ /.test(s)) throw new Error(`${label}: a texture type other than texture2D`)
  const sets = textures.length > MAX_TEXTURES ? layerFamilies(textures) : []
  const packed = new Set(sets.flatMap((f) => [1, 2, 3, 4].map((i) => f + i)))
  s = s.replace(/^layout\([^)]*\) uniform sampler \w+;\n/gm, '')
  s = s.replace(/^layout\([^)]*\) uniform texture2D (\w+);\n/gm, (_, name) => (packed.has(name) ? '' : `uniform highp sampler2D ${name};\n`))
  s = rewriteSamplers(s, packed, label)
  const remaining = textures.filter((t) => !packed.has(t))
  if (remaining.length + sets.length > MAX_TEXTURES) throw new Error(`${label}: ${remaining.length + sets.length} textures after packing`)

  // Inputs → the viewer's vertex shader outputs, by location.
  const inputs = {}
  s = s.replace(/^layout\(location = (\d+)\) in (\w+) (\w+);\n/gm, (_, loc, type, name) => {
    const want = def.inputs[loc]
    if (!want) throw new Error(`${label}: the viewer's vertex shader has no output at location ${loc}`)
    if (want !== type) throw new Error(`${label}: input ${loc} is ${type}, the viewer's vertex shader writes ${want}`)
    const renamed = `vIn${loc}`
    inputs[loc] = renamed
    return `in ${type} ${renamed};\n`
  })
  for (const [loc, name] of Object.entries(inputs)) s = s.replace(new RegExp(`\\binput_${loc}\\b`, 'g'), name)
  if (/^layout\(location = [1-9]\d*\) out /m.test(s)) throw new Error(`${label}: more than one output`)

  const head = [
    'precision highp float;',
    'precision highp int;',
    'precision highp sampler2D;',
    ...(sets.length ? ['precision highp sampler2DArray;'] : []),
    ...uniforms.map(([name, type]) => `uniform ${type} ${name};`),
    ...sets.map((f) => `uniform highp sampler2DArray ${f};`),
    // HLSL's saturate, which the decompiled code calls.
    ...['float', 'vec2', 'vec3', 'vec4'].map((t) => `${t} saturate(${t} x) { return clamp(x, 0.0, 1.0); }`),
  ].join('\n')
  const glsl = `${head}\n${s.replace(/^\n+/, '')}`.replace(/\n{3,}/g, '\n\n')
  for (const bad of ['texture2D ', 'sampler2D(', '_Globals_', '#extension', 'Fine(']) {
    if (glsl.includes(bad)) throw new Error(`${label}: "${bad}" left after conversion`)
  }
  return { glsl, uniforms, textures: [...remaining, ...sets], inputs, sets }
}

/** Texture names that come as a complete 1–4 family (g_tDetail1 … g_tDetail4 → g_tDetail). */
function layerFamilies(names) {
  const set = new Set(names)
  const families = new Set()
  for (const n of names) {
    const m = /^(\w+?)([1-4])$/.exec(n)
    if (m && [1, 2, 3, 4].every((i) => set.has(m[1] + i))) families.add(m[1])
  }
  return [...families]
}

/**
 * sampler2D(tex, sampler) → tex; for a packed layer, f(sampler2D(g_tDetail2, s), uv, …) → f(g_tDetail, vec3(uv, 1.0), …).
 */
function rewriteSamplers(s, packed, label) {
  let out = ''
  let i = 0
  const re = /sampler2D\((\w+), \w+\)/g
  let m
  while ((m = re.exec(s))) {
    const [whole, tex] = m
    if (!packed.has(tex)) {
      out += s.slice(i, m.index) + tex
      i = m.index + whole.length
      continue
    }
    // The call around it: name( sampler2D(...), coord, ... )
    const before = s.slice(i, m.index)
    const call = /(\w+)\(\s*$/.exec(before)
    if (!call || !/^(texture|textureLod|textureGrad|textureSize|texelFetch)$/.test(call[1])) {
      throw new Error(`${label}: packed texture ${tex} used outside a texture call (${call?.[1] ?? '?'})`)
    }
    const family = tex.slice(0, -1)
    const layer = Number(tex.slice(-1)) - 1
    let j = m.index + whole.length
    if (call[1] === 'textureSize') {
      out += before + family
      i = j
      continue
    }
    if (s[j] !== ',') throw new Error(`${label}: unexpected text after ${whole}`)
    j++
    const start = j
    let depth = 0
    for (; j < s.length; j++) {
      const c = s[j]
      if (c === '(') depth++
      else if (c === ')') { if (depth === 0) break; depth-- }
      else if (c === ',' && depth === 0) break
    }
    const coord = s.slice(start, j).trim()
    const layered = call[1] === 'texelFetch' ? `ivec3(${coord}, ${layer})` : `vec3(${coord}, ${layer}.0)`
    out += before + family + ', ' + layered
    i = j
    re.lastIndex = j
  }
  return out + s.slice(i)
}
