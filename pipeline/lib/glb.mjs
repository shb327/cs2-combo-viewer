// A GLB with only some of its mesh nodes: for the agents' first-person model (their first-person groups, without the
// third-person body). Handles the GLBs the extractor writes: one buffer, mesh nodes under one scene, no sparse accessors.

import { readFileSync, writeFileSync } from 'node:fs'

/** Writes `out` with the mesh nodes of `src` whose name `keep` accepts (and only the data they use). */
export function filterGlb(src, out, keep) {
  const glb = readFileSync(src)
  const jsonLength = glb.readUInt32LE(12)
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength))
  const binStart = 20 + jsonLength + 8
  const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLength))
  if (json.buffers?.length !== 1 || json.accessors.some((a) => a.sparse)) throw new Error(`${src}: unexpected GLB layout`)

  const nodes = json.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.mesh !== undefined && keep(n.name ?? ''))
  if (!nodes.length) throw new Error(`${src}: no mesh node kept`)
  const accessors = [], views = [], meshes = [], chunks = []
  const accessorMap = new Map(), viewMap = new Map()
  let offset = 0
  const view = (v) => {
    if (!viewMap.has(v)) {
      const bv = json.bufferViews[v]
      const data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)
      viewMap.set(v, views.length)
      views.push({ ...bv, buffer: 0, byteOffset: offset })
      chunks.push(data)
      const pad = (4 - (data.length % 4)) % 4
      if (pad) chunks.push(Buffer.alloc(pad))
      offset += data.length + pad
    }
    return viewMap.get(v)
  }
  const accessor = (a) => {
    if (!accessorMap.has(a)) {
      const acc = json.accessors[a]
      accessorMap.set(a, accessors.length)
      accessors.push({ ...acc, ...(acc.bufferView !== undefined && { bufferView: view(acc.bufferView) }) })
    }
    return accessorMap.get(a)
  }
  const outNodes = nodes.map(({ n }) => {
    const mesh = json.meshes[n.mesh]
    meshes.push({
      ...mesh,
      primitives: mesh.primitives.map((p) => ({
        ...p,
        attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, a]) => [k, accessor(a)])),
        ...(p.indices !== undefined && { indices: accessor(p.indices) }),
        ...(p.targets && { targets: p.targets.map((t) => Object.fromEntries(Object.entries(t).map(([k, a]) => [k, accessor(a)]))) }),
      })),
    })
    return { ...n, mesh: meshes.length - 1 }
  })
  const body = Buffer.concat(chunks)
  const outJson = {
    ...json,
    nodes: outNodes,
    meshes,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: body.length }],
    scenes: [{ ...(json.scenes?.[0] ?? {}), nodes: outNodes.map((_, i) => i) }],
    scene: 0,
  }
  let text = Buffer.from(JSON.stringify(outJson), 'utf8')
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8)
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]) }
  writeFileSync(out, Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, body)]))
}
