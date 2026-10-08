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

// Ionicons is the only font the app uses; inline it so icons render offline.
// expo-font treats families declared in #expo-generated-fonts as already loaded.
const fontDir = path.join(
  exportDir,
  'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts',
);
const fontFile = fs.readdirSync(fontDir).find((f) => f.startsWith('Ionicons') && f.endsWith('.ttf'));
if (!fontFile) throw new Error('Ionicons font not found in export');
const font = fs.readFileSync(path.join(fontDir, fontFile)).toString('base64');

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
<meta name="theme-color" content="#170612">
${styles}
<style id="expo-generated-fonts">
@font-face { font-family: ionicons; src: url(data:font/ttf;base64,${font}) format('truetype'); }
</style>
<style>
html, body { height: 100%; background: #170612; }
body { margin: 0; overflow: hidden; }
#root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>${historyShim}</script>
<script>${js}</script>
`;

fs.writeFileSync(outFile, page);
console.log(`Wrote ${outFile} (${(page.length / 1024 / 1024).toFixed(1)} MB)`);
