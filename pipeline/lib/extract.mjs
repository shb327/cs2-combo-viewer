// Runs the C# tool (shader-dump) on the copied VPKs. It refuses any path outside the copies and the output folder.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EXTRACTED, SOURCE, insideRoot } from './paths.mjs'

export const TOOL = process.env.SHADER_DUMP ?? 'C:/dev/tools/shader-dump/shader-dump.exe'
export const DOTNET_ROOT = process.env.DOTNET_ROOT ?? 'C:/dev/tools/dotnet-sdk-10'
export const PAK01 = path.join(SOURCE, 'game/csgo/pak01_dir.vpk')
export const SHADERS_VPK = path.join(SOURCE, 'game/csgo/shaders_vulkan_dir.vpk')

const env = () => ({ ...process.env, DOTNET_ROOT, DOTNET_CLI_TELEMETRY_OPTOUT: '1', CS2_SOURCE: SOURCE, CS2_EXTRACTED: EXTRACTED })

export function runTool(args) {
  return execFileSync(TOOL, args, { env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 })
}

/**
 * Extracts a list of jobs ({ kind, path, out }) from one of the copied VPKs (pak01 unless given) in one run.
 * @returns the report, by game path: { kind, path, out } or { kind, path, error }
 */
export function extract(jobs, workDir, vpk = PAK01) {
  if (!jobs.length) return new Map()
  const dir = insideRoot(EXTRACTED, workDir)
  mkdirSync(dir, { recursive: true })
  const jobsFile = path.join(dir, 'jobs.json')
  const reportFile = path.join(dir, 'report.json')
  for (const j of jobs) insideRoot(EXTRACTED, j.out)
  insideRoot(SOURCE, vpk)
  writeFileSync(jobsFile, JSON.stringify(jobs))
  process.stdout.write(runTool(['extract', '--vpk', vpk, '--jobs', jobsFile, '--report', reportFile]))
  const report = JSON.parse(readFileSync(reportFile, 'utf8'))
  return new Map(report.map((r) => [r.path, r]))
}
