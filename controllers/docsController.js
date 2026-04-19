import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * GET /api/docs — Markdown API reference (authenticated).
 */
export async function docsController(_req, res) {
  const path = join(__dirname, '..', 'docs', 'API.md');
  const body = await readFile(path, 'utf8');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  return res.send(body);
}
