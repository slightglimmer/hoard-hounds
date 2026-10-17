// Renders each page to static HTML after the build, so search engines and visitors
// see the full content immediately. React then "hydrates" it in the browser.
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const { render, structuredData } = await import(pathToFileURL(resolve(root, 'dist-ssr/entry-server.js')).href);

const jsonLd = structuredData()
  .map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`)
  .join('\n    ');

for (const [file, page] of [
  ['index.html', 'home'],
  ['privacy.html', 'privacy'],
]) {
  const path = resolve(root, 'dist', file);
  let html = await readFile(path, 'utf8');
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) throw new Error(`Couldn't find ${marker} in dist/${file}`);
  html = html.replace(marker, `<div id="root">${render(page)}</div>`);
  html = html.replace('<!--structured-data-->', page === 'home' ? jsonLd : '');
  await writeFile(path, html);
  console.log(`prerendered dist/${file}`);
}

await rm(resolve(root, 'dist-ssr'), { recursive: true, force: true });
