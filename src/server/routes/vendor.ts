// The vendored background-removal runtime (vendor/mediapipe: MediaPipe Tasks Vision and the
// selfie_multiclass model), served from our own origin for the buyer's browser.
// The .wasm is stored brotli-precompressed only (2.3MB instead of 11.8MB): sent with
// Content-Encoding: br, or inflated once in memory for a client that does not take brotli.
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'

const TYPES: Record<string, string> = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
}

export async function vendorRoutes(app: FastifyInstance, root: string) {
  const dir = path.join(root, 'vendor', 'mediapipe')
  const inflated = new Map<string, Buffer>()
  app.get('/vendor/mediapipe/:file', async (req, reply) => {
    const { file } = req.params as { file: string }
    // Plain names only: no traversal, no dotfiles, no nested paths.
    const type = TYPES[path.extname(file)]
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(file) || file.includes('..') || !type) {
      return reply.code(404).send({ error: 'not_found' })
    }
    const raw = path.join(dir, file)
    const br = `${raw}.br`
    reply
      .header('Content-Type', type)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Vary', 'Accept-Encoding')
    if (existsSync(br)) {
      if (/\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
        return reply.header('Content-Encoding', 'br').send(createReadStream(br))
      }
      if (!inflated.has(br)) inflated.set(br, brotliDecompressSync(readFileSync(br)))
      return reply.send(inflated.get(br))
    }
    if (!existsSync(raw)) return reply.code(404).send({ error: 'not_found' })
    return reply.send(createReadStream(raw))
  })
}
