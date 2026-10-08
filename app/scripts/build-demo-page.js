#!/usr/bin/env node
/**
 * Packs a web export of the demo build into one self-contained HTML fragment
 * (inline JS, inline icon font, no external requests) so it can be hosted as a
 * single page, e.g. a claude.ai Artifact.
 *
 *   EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir dist-demo
 *   node scripts/build-demo-page.js dist-demo demo.html
 */
const fs = require('fs');
const path = require('path');

const [exportDir, outFile] = process.argv.slice(2);
if (!exportDir || !outFile) {
  console.error('usage: build-demo-page.js <export-dir> <out.html>');
  process.exit(1);
}

const html = fs.readFileSync(path.join(exportDir, 'index.html'), 'utf8');
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scriptSrcs = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => m[1]);
if (scriptSrcs.length === 0) throw new Error('no bundle <script src> found in index.html');

const js = scriptSrcs
  .map((src) => fs.readFileSync(path.join(exportDir, src.replace(/^\//, '')), 'utf8'))
  .join('\n;\n')
  .replace(/<\/script/gi, '<\\/script');

// Inline the app's fonts so text and icons render without network access.
// expo-font treats families declared in #expo-generated-fonts as already
// loaded, so the family names must match the ones the app registers.
const FONT_FAMILIES = {
  Ionicons: 'ionicons',
  Anton_400Regular: 'Anton_400Regular',
  InstrumentSerif_400Regular: 'InstrumentSerif_400Regular',
};
function findFonts(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFonts(full, found);
    else if (entry.name.endsWith('.ttf')) found.push(full);
  }
  return found;
}
const fontFaces = Object.entries(FONT_FAMILIES).map(([fileStem, family]) => {
  const file = findFonts(path.join(exportDir, 'assets')).find((f) => path.basename(f).startsWith(`${fileStem}.`));
  if (!file) throw new Error(`${fileStem} font not found in export`);
  const data = fs.readFileSync(file).toString('base64');
  return `@font-face { font-family: ${family}; src: url(data:font/ttf;base64,${data}) format('truetype'); }`;
});

// Expo Router reads the page URL. Hosted pages live at arbitrary paths (or in
// sandboxed frames where history is off-limits), so start the app at "/" and
// keep navigation in memory if the frame refuses history changes.
const historyShim = `(function () {
  try { history.replaceState(null, '', '/'); }
  catch (e) {
    var noop = function () {};
    try { history.pushState = noop; history.replaceState = noop; } catch (_) {}
  }
})();`;

const page = `<title>LushDate Demo</title>
<meta name="theme-color" content="#0B0A0C">
${styles}
<style id="expo-generated-fonts">
${fontFaces.join('\n')}
</style>
<style>
html, body { height: 100%; background: #0B0A0C; }
body { margin: 0; overflow: hidden; }
#root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>${historyShim}</script>
<script>${js}</script>
`;

fs.writeFileSync(outFile, page);
console.log(`Wrote ${outFile} (${(page.length / 1024 / 1024).toFixed(1)} MB)`);
