import { cpSync, createReadStream, existsSync, readdirSync, readFileSync, stat } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'

/**
 * The build copies public/ without public/assets: the game assets are served from elsewhere (VITE_ASSET_BASE).
 * In development they come from the local asset folder (localAssets below).
 */
function publicWithoutAssets(): Plugin {
  let outDir = 'dist'
  return {
    name: 'public-without-assets',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir },
    closeBundle() {
      for (const entry of readdirSync('public')) {
        if (entry !== 'assets') cpSync(path.join('public', entry), path.join(outDir, entry), { recursive: true })
      }
    },
  }
}

/** Where the extracted assets live on this machine (outside the repo); the dev server serves them at /assets/. */
const DEFAULT_ASSET_DIR = 'C:/cs2-data/extracted/web'

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png',
  '.exr': 'image/x-exr', '.hdr': 'image/vnd.radiance', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream',
}

/** Serves /assets/* from the local asset folder in development and preview; a file that isn't there is a 404. */
function localAssets(dir: string): Plugin {
  const root = path.resolve(dir)
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = path.resolve(root, '.' + rel)
    if (!file.startsWith(root + path.sep)) { res.statusCode = 403; res.end(); return }
    stat(file, (err, st) => {
      if (err || !st.isFile()) { if (rel.endsWith('/')) next(); else { res.statusCode = 404; res.end() } return }
      res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
      res.setHeader('Content-Length', st.size)
      res.setHeader('Cache-Control', 'no-cache')
      createReadStream(file).pipe(res)
    })
  }
  return {
    name: 'local-assets',
    configureServer(server) { server.middlewares.use('/assets', handler) },
    // The build's own scripts are under /assets/ too: preview only takes the asset folder's paths.
    configurePreviewServer(server) {
      server.middlewares.use('/assets', (req, res, next) => (req.url?.startsWith('/extracted/') ? handler(req, res, next) : next()))
    },
  }
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss(), localAssets(loadEnv(mode, process.cwd(), '').CS2_ASSET_DIR || DEFAULT_ASSET_DIR), publicWithoutAssets()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5320, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5321, strictPort: true, host: '127.0.0.1' },
  build: {
    copyPublicDir: false,
    rollupOptions: {
      output: {
        // Libraries apart from the app's code: they change rarely (cached across deploys) and three.js
        // (the heaviest) is only fetched by the routes that draw 3D.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](three)[\\/]/.test(id)) return 'three'
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/](@base-ui)[\\/]/.test(id)) return 'base-ui'
          return 'vendor'
        },
      },
    },
  },
}))
