// cwebp (libwebp's encoder, from Google's release: see pipeline/README.md), run on files under C:\cs2-data.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const CWEBP = process.env.CWEBP ?? 'C:/dev/tools/libwebp-1.6.0-windows-x64/bin/cwebp.exe'

/**
 * How each kind of texture is encoded. Every mode keeps the RGB under transparent pixels (-exact): textures pack data in
 * all four channels.
 * - colour: an albedo (its RGB is a colour): lossy, sharp RGB→YUV, alpha lossless.
 * - data: everything else (normals, masks, AO, packed channels, compositor inputs): lossless with near-lossless
 *   preprocessing, which rounds each channel on its own in smooth areas (no chroma subsampling, no channel mixing).
 * - photo: the background screenshot.
 */
export const MODES = {
  colour: ['-q', '90', '-m', '6', '-sharp_yuv', '-alpha_q', '100', '-exact'],
  data: ['-lossless', '-near_lossless', '60', '-q', '80', '-m', '5', '-exact'],
  photo: ['-q', '82', '-m', '6', '-sharp_yuv'],
}

const run = promisify(execFile)

/** Encodes `input` (PNG or JPEG) to `output`; `extra` goes before the input (for example -resize). */
export async function cwebp(input, output, mode, extra = []) {
  await run(CWEBP, ['-quiet', '-mt', ...MODES[mode], ...extra, input, '-o', output], { windowsHide: true })
}
