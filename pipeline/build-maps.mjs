// Builds the viewer's inspect maps for the maps in items.json: a still background (a screenshot taken in game), the
// vanity scene's baked cubemap as the environment, and the map's sun and sky light, from the map's vanity VPK.
//
//   node build-maps.mjs [--items items.json]
//
// Writes maps.json, scenes.json, maps/<id>.exr and backgrounds/<id>.jpg under the viewer's data. The background is the
// user's own screenshot, read from C:\cs2-data\reference; like everything under extracted\, it never goes into git.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract } from './lib/extract.mjs'
import { EXTRACTED, REFERENCE, SOURCE, VIEWER_DATA, insideRoot, parseArgs } from './lib/paths.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = parseArgs(process.argv.slice(2))
const config = JSON.parse(readFileSync(args.items ?? path.join(here, 'items.json'), 'utf8'))
const WORK = path.join(EXTRACTED, 'work', 'maps')

const out = (rel) => {
  const f = insideRoot(EXTRACTED, path.join(VIEWER_DATA, rel))
  mkdirSync(path.dirname(f), { recursive: true })
  return f
}
const writeJson = (rel, data) => writeFileSync(out(rel), JSON.stringify(data))

/** VRF's entity dump: blocks headed "====n====", one "key value" per line. */
function parseEntities(text) {
  return text.split(/^====\d+====$/m).map((block) => {
    const e = {}
    for (const line of block.split(/\r?\n/)) {
      const m = /^(\S+)\s+(.*)$/.exec(line)
      if (m) e[m[1]] = m[2].trim()
    }
    return e
  }).filter((e) => e.classname)
}

const str = (v) => (v ?? '').replace(/^resource_name:/, '').replace(/^"|"$/g, '').replace(/^\[PR#\]/, '')
const nums = (v) => (v ?? '').replace(/[[\]"]/g, '').split(/[\s,]+/).filter(Boolean).map(Number)

/** A Source vector (x forward, y left, z up) in glTF axes (y up). */
const gltf = ([x, y, z]) => [y, z, x]

/** A Source entity's forward vector from its angles (pitch down, yaw left, roll). */
function forward([pitch, yaw]) {
  const p = (pitch * Math.PI) / 180, y = (yaw * Math.PI) / 180
  return [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)]
}

const round = (a) => a.map((v) => Math.round(v * 1e5) / 1e5)

const maps = []
const scenes = []
for (const [id, map] of Object.entries(config.maps ?? {})) {
  const vpk = path.join(SOURCE, 'game/csgo/maps', `${id}_vanity.vpk`)
  const dir = path.join(WORK, id)
  const ents = extract([{ kind: 'entities', path: `maps/${id}_vanity/entities/default_ents.vents`, out: path.join(dir, 'default_ents.txt') }], path.join(dir, 'jobs'), vpk)
  const entsFile = [...ents.values()][0]
  if (entsFile.error) throw new Error(`${id}: ${entsFile.error}`)
  const entities = parseEntities(readFileSync(entsFile.out, 'utf8'))
  const one = (cls) => entities.find((e) => str(e.classname) === cls)
  const sunEnt = one('light_environment'), sky = one('env_sky'), post = one('post_processing_volume')
  if (!sunEnt || !sky) throw new Error(`${id}: no light_environment or env_sky`)

  // The environment (reflections): the cubemap the game baked in the vanity scene (its light probe volume's), as an
  // equirectangular EXR; else the sky (env_sky's material's texture), whose lower half is only haze.
  const probe = one('env_combined_light_probe_volume')
  const cube = str(probe?.cubemaptexture)
  let panorama = cube ? [...extract([{ kind: 'texture', path: cube, out: out(`maps/${id}.exr`) }], path.join(dir, 'jobs'), vpk).values()][0] : null
  if (!panorama || panorama.error) {
    const matJob = extract([{ kind: 'material', path: str(sky.skyname), out: path.join(dir, 'sky.vmat.json') }], path.join(dir, 'jobs'))
    const skyTex = JSON.parse(readFileSync([...matJob.values()][0].out, 'utf8')).textures.g_tSkyTexture
    panorama = [...extract([{ kind: 'texture', path: skyTex, out: out(`maps/${id}.exr`) }], path.join(dir, 'jobs')).values()][0]
  }
  if (panorama.error || !panorama.out.endsWith('.exr')) throw new Error(`${id}: panorama ${panorama.path}: ${panorama.error ?? 'not a float texture'}`)

  // The background: the user's screenshot of the map, taken in game without hands, weapon or HUD.
  const background = insideRoot(REFERENCE, map.background)
  if (!existsSync(background)) throw new Error(`${id}: no background at ${background}`)
  copyFileSync(background, out(`backgrounds/${id}.jpg`))

  // The sun: light_environment's direction (where its light travels), colour (sRGB, 0–1) and brightness.
  const sun = {
    direction: round(gltf(forward(nums(sunEnt.angles)))),
    color: round(nums(sunEnt.color).slice(0, 3).map((c) => c / 255)),
    brightness: Number(sunEnt.brightness ?? 1) * Number(sunEnt.brightnessscale ?? 1),
  }
  // The ambient light: light_environment's sky colour (sRGB) × its intensity from above, its sky ambient bounce from
  // below, their mean from the sides (+X, −X, +Y, −Y, +Z, −Z: an ambient cube, radiance). The sky panorama itself is
  // only reflected: its lower half is the fog colour, where the real map has the city.
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const skyI = Number(sunEnt.skyintensity ?? 1)
  // Read as irradiance (÷ π for the cube's radiance), like the sun's brightness: as radiance it outshone the sun.
  const up = nums(sunEnt.skycolor).slice(0, 3).map((c) => (linear(c / 255) * skyI) / Math.PI)
  const down = nums(sunEnt.skyambientbounce).slice(0, 3).map((c) => (linear(c / 255) * skyI * Number(sunEnt.skybouncescale ?? 1)) / Math.PI)
  const side = up.map((v, i) => (v + down[i]) / 2)
  const ambientCube = [side, side, up, down, side, side].map(round)
  // The view: the screenshot's direction isn't known, so the eye looks `viewYaw` degrees left of where the sun's light
  // travels (0: the sun straight behind), level, from the origin.
  const sunYaw = nums(sunEnt.angles)[1]
  const look = gltf(forward([0, sunYaw + (map.viewYaw ?? 0)]))
  const camera = { position: [0, 0, 0], forward: round(look), roll: 0, fov: map.fov ?? 41.6 }
  // The post volume's exposure range: the game settles between them; the middle is used.
  const exposure = post ? (Number(post.minexposure ?? 1) + Number(post.maxexposure ?? 1)) / 2 : 1

  maps.push({ id, name: map.name ?? id, hdr: `maps/${id}.exr`, thumb: `backgrounds/${id}.jpg` })
  scenes.push({
    id, name: map.name ?? id, glb: null, lightmap: null, exposure,
    camera,
    anchor: { position: round(look.map((v) => v)), yaw: 0 },
    lights: [], sceneLights: [],
    weapon: {
      anchor: { position: round(look), yaw: 0 },
      cameras: { 3: { position: [0, 0, 0], forward: camera.forward, fov: camera.fov } },
      lights: [], sceneLights: [], sun, ambientCube,
    },
    sky: { brightness: Number(sky.brightnessscale ?? 1), tint: round(nums(sky.tint_color).map((c) => c / 255)) },
  })
  console.log(`${id}: sun ${JSON.stringify(sun)}, exposure ${exposure}, panorama ${panorama.path}`)
}

writeJson('maps.json', maps)
writeJson('scenes.json', scenes)
console.log(`build-maps: ${maps.length} map(s) in ${VIEWER_DATA}`)
