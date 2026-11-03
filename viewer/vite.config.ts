import { cpSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The build copies public/ without public/assets: the game assets (26 GB) are served from the R2 bucket
 * (VITE_ASSET_BASE, steam-tools/cs2-3d-pipeline/upload_r2.mjs); the dev server still serves them from public/.
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

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss(), publicWithoutAssets()],
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
})
