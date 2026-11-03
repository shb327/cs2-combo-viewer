/** One VFX instruction: [byte offset, op, …args] (see port_weapon_shader.py). */
export type Instr = [number, string, ...(number | string)[]]

/** A value on the VFX stack: scalar, vector, 4×4 matrix (16 numbers, row-major: out = M·(rgb, 1)) or a texture's name. */
export type Value = number | number[] | string

export const vec = (v: Value): number[] => (Array.isArray(v) ? v : typeof v === 'string' ? [0] : [v])
const map1 = (v: Value, f: (x: number) => number): Value => (Array.isArray(v) ? v.map(f) : f(typeof v === 'string' ? 0 : v))
function map2(a: Value, b: Value, f: (x: number, y: number) => number): Value {
  if (typeof a === 'number' && typeof b === 'number') return f(a, b)
  const A = vec(a), B = vec(b), n = Math.max(A.length, B.length)
  return Array.from({ length: n }, (_, i) => f(A[A.length === 1 ? 0 : i] ?? 0, B[B.length === 1 ? 0 : i] ?? 0))
}
function map3(a: Value, b: Value, c: Value, f: (x: number, y: number, z: number) => number): Value {
  if (![a, b, c].some(Array.isArray)) return f(a as number, b as number, c as number)
  const A = vec(a), B = vec(b), C = vec(c), n = Math.max(A.length, B.length, C.length)
  const at = (v: number[], i: number) => v[v.length === 1 ? 0 : i] ?? 0
  return Array.from({ length: n }, (_, i) => f(at(A, i), at(B, i), at(C, i)))
}
const srgbToLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))
const linearToSrgb = (x: number) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const dot = (a: Value, b: Value, n: number) => { const A = vec(a), B = vec(b); let s = 0; for (let i = 0; i < n; i++) s += (A[i] ?? 0) * (B[i] ?? 0); return s }

const FUNCS: Record<string, [number, (...a: Value[]) => Value]> = {
  sin: [1, (a) => map1(a, Math.sin)], cos: [1, (a) => map1(a, Math.cos)], tan: [1, (a) => map1(a, Math.tan)],
  frac: [1, (a) => map1(a, (x) => x - Math.floor(x))], floor: [1, (a) => map1(a, Math.floor)], ceil: [1, (a) => map1(a, Math.ceil)],
  saturate: [1, (a) => map1(a, (x) => Math.min(1, Math.max(0, x)))],
  clamp: [3, (x, lo, hi) => map3(x, lo, hi, (v, l, h) => Math.min(h, Math.max(l, v)))],
  lerp: [3, (a, b, t) => map3(a, b, t, (x, y, s) => x + (y - x) * s)],
  dot4: [2, (a, b) => dot(a, b, 4)], dot3: [2, (a, b) => dot(a, b, 3)], dot2: [2, (a, b) => dot(a, b, 2)],
  log: [1, (a) => map1(a, Math.log)], log2: [1, (a) => map1(a, Math.log2)], log10: [1, (a) => map1(a, Math.log10)],
  exp: [1, (a) => map1(a, Math.exp)], exp2: [1, (a) => map1(a, (x) => 2 ** x)], sqrt: [1, (a) => map1(a, Math.sqrt)],
  rsqrt: [1, (a) => map1(a, (x) => 1 / Math.sqrt(x))], sign: [1, (a) => map1(a, Math.sign)], abs: [1, (a) => map1(a, Math.abs)],
  pow: [2, (a, b) => map2(a, b, Math.pow)], step: [2, (a, b) => map2(a, b, (e, x) => (x >= e ? 1 : 0))],
  smoothstep: [3, (a, b, x) => map3(a, b, x, smooth)],
  float4: [4, (...a) => a.flatMap(vec).slice(0, 4)], float3: [3, (...a) => a.flatMap(vec).slice(0, 3)], float2: [2, (...a) => a.flatMap(vec).slice(0, 2)],
  time: [0, () => 0], min: [2, (a, b) => map2(a, b, Math.min)], max: [2, (a, b) => map2(a, b, Math.max)],
  SrgbLinearToGamma: [1, (a) => map1(a, linearToSrgb)], SrgbGammaToLinear: [1, (a) => map1(a, srgbToLinear)],
  random: [2, (a, b) => map2(a, b, (lo) => lo)],
  normalize: [1, (a) => { const v = vec(a), l = Math.hypot(...v) || 1; return v.map((x) => x / l) }],
  length: [1, (a) => Math.hypot(...vec(a))], sqr: [1, (a) => map1(a, (x) => x * x)],
}

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function matMul(a: number[], b: number[]): number[] {
  const o = new Array(16).fill(0)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c]
  return o
}
const LUM_AXIS = (() => { const g = [0.283422, 0.954162, 0.096163], l = Math.hypot(...g); return g.map((x) => x / l) })()
const tr = (m: number[]) => [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15].map((i) => m[i])
const translate = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]
const scale = (x: number, y: number, z: number) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]
function lumRotation(): number[] {
  const [x, y, z] = LUM_AXIS
  const c = [y * 1 - z * 0, z * 0 - x * 1, 0]
  const cl = Math.hypot(...c), ang = Math.atan2(cl, z)
  const [u, v, w] = c.map((k) => k / cl), co = Math.cos(ang), si = Math.sin(ang), o = 1 - co
  return [o * u * u + co, o * u * v + si * w, o * u * w - si * v, 0, o * u * v - si * w, o * v * v + co, o * v * w + si * u, 0,
    o * u * w + si * v, o * v * w - si * u, o * w * w + co, 0, 0, 0, 0, 1]
}
const xform = (p: number[], m: number[]) => [0, 1, 2].map((i) => p[0] * m[i] + p[1] * m[4 + i] + p[2] * m[8 + i] + m[12 + i])
function colorTint(tint: Value, amount: Value): number[] {
  const t = vec(tint).slice(0, 3), e = vec(amount)[0] ?? 1
  while (t.length < 3) t.push(1)
  const mx = Math.max(...t), mn = Math.min(...t), s = mx === 0 ? 0 : (mx - mn) / mx
  const R = lumRotation(), A = scale(LUM_AXIS[0], LUM_AXIS[1], LUM_AXIS[2]), AR = matMul(A, R)
  const o = xform(t, AR), l = 1 - s, c = 1 - s * s * e
  let h = AR
  h = matMul(h, translate(-o[0], -o[1], 0))
  h = matMul(h, scale(l, l, c))
  h = matMul(h, translate(o[0], o[1], (1 - c) * o[2]))
  h = matMul(h, tr(R))
  h = matMul(h, scale(1 / LUM_AXIS[0], 1 / LUM_AXIS[1], 1 / LUM_AXIS[2]))
  return tr(h)
}
function colorCorrect(csb: Value, avg: Value): number[] {
  const [contrast = 1, saturation = 1, brightness = 1] = vec(csb)
  const g = vec(avg)
  const R = lumRotation()
  let n = translate(-(g[0] ?? 0.5), -(g[1] ?? 0.5), -(g[2] ?? 0.5))
  n = matMul(n, scale(contrast, contrast, contrast))
  n = matMul(n, translate(g[0] ?? 0.5, g[1] ?? 0.5, g[2] ?? 0.5))
  n = matMul(n, scale(brightness, brightness, brightness))
  n = matMul(n, scale(LUM_AXIS[0], LUM_AXIS[1], LUM_AXIS[2]))
  n = matMul(n, R)
  n = matMul(n, scale(saturation, saturation, 1))
  n = matMul(n, tr(R))
  n = matMul(n, scale(1 / LUM_AXIS[0], 1 / LUM_AXIS[1], 1 / LUM_AXIS[2]))
  return tr(n)
}

export interface ExprContext {
  param(name: string): Value
  ext(name: string): Value
  feature(index: number): number
  /** TextureAverageColor(texture variable): the texture's average color (its vtex Reflectivity). */
  textureAverage?(name: string): number[]
}

/** Runs a compiled VFX expression (stack machine, byte-offset branches). */
export function evalExpr(code: Instr[], ctx: ExprContext): Value {
  const at = new Map(code.map((ins, i) => [ins[0], i]))
  const stack: Value[] = []
  const locals: Value[] = []
  const pop = () => stack.pop() ?? 0
  for (let pc = 0, guard = 0; pc < code.length && guard < 10000; guard++) {
    const [, op, a, b] = code[pc]
    pc++
    switch (op) {
      case 'END': return stack.pop() ?? 0
      case 'PUSH': stack.push(a as number); break
      case 'PARAM': stack.push(ctx.param(a as string)); break
      case 'EXT': stack.push(ctx.ext(a as string)); break
      case 'FEATURE': stack.push(ctx.feature(a as number)); break
      case 'ASSIGN': locals[a as number] = pop(); break
      case 'LOAD': stack.push(locals[a as number] ?? 0); break
      case 'NEG': stack.push(map1(pop(), (x) => -x)); break
      case 'NOT': stack.push(map1(pop(), (x) => (x ? 0 : 1))); break
      case 'SWIZZLE': {
        const v = vec(pop()), idx = [0, 1, 2, 3].map((k) => ((a as number) >> (2 * k)) & 3)
        stack.push(idx.every((k) => k === idx[0]) ? v[idx[0]] ?? 0 : idx.map((k) => v[k] ?? 0))
        break
      }
      case 'BIN': {
        const y = pop(), x = pop()
        const f: Record<string, (p: number, q: number) => number> = {
          '+': (p, q) => p + q, '-': (p, q) => p - q, '*': (p, q) => p * q, '/': (p, q) => p / q, '%': (p, q) => p % q,
          '==': (p, q) => +(p === q), '!=': (p, q) => +(p !== q), '>': (p, q) => +(p > q), '>=': (p, q) => +(p >= q),
          '<': (p, q) => +(p < q), '<=': (p, q) => +(p <= q),
        }
        stack.push(map2(x, y, f[a as string]))
        break
      }
      case 'FUNC': {
        const name = a as string
        if (name === 'TextureAverageColor') {
          const t = stack.pop()
          stack.push(typeof t === 'string' && ctx.textureAverage ? ctx.textureAverage(t) : [0.5, 0.5, 0.5, 1])
          break
        }
        if (name === 'MatrixIdentity') { stack.push(identity()); break }
        if (name === 'MatrixMultiply') { const y = vec(pop()), x = vec(pop()); stack.push(matMul(x, y)); break }
        if (name === 'MatrixColorTint2' || name === 'MatrixColorTint') { const amt = pop(), t = pop(); stack.push(colorTint(t, amt)); break }
        if (name === 'MatrixColorCorrect2' || name === 'MatrixColorCorrect') { const g = pop(), csb = pop(); stack.push(colorCorrect(csb, g)); break }
        if (name === 'RemapValClamped' || name === 'RemapVal') {
          const [d1, c1, b1, a1, x] = [pop(), pop(), pop(), pop(), pop()].map((v) => vec(v)[0])
          const t = (x - a1) / (b1 - a1 || 1)
          stack.push(c1 + (d1 - c1) * (name === 'RemapValClamped' ? Math.min(1, Math.max(0, t)) : t))
          break
        }
        if (name === 'radians') { stack.push(map1(pop(), (x) => (x * Math.PI) / 180)); break }
        if (name === 'degrees') { stack.push(map1(pop(), (x) => (x * 180) / Math.PI)); break }
        if (name === 'normalize_safe') { const v = vec(pop()), l = Math.hypot(...v); stack.push(l > 1e-8 ? v.map((x) => x / l) : v); break }
        const fn = FUNCS[name]
        if (!fn) throw new Error('VFX function not supported: ' + a)
        const args = stack.splice(stack.length - fn[0], fn[0])
        stack.push(fn[1](...args))
        break
      }
      case 'BRANCH': pc = at.get(vec(pop())[0] ? (a as number) : (b as number)) ?? code.length; break
      case 'JUMP': pc = at.get(a as number) ?? code.length; break
      default: throw new Error('VFX op not supported: ' + op)
    }
  }
  return stack.pop() ?? 0
}
