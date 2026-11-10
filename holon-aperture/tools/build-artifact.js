#!/usr/bin/env node
/*
 * Bundles index.html + style.css + sim.js + app.js into one self-contained
 * page fragment (no <html>/<head>/<body>), for hosts that wrap the page in
 * their own document skeleton.
 *   node tools/build-artifact.js [out=dist/holon-aperture.html]
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src="chain.js">'));
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const out = [
  '<title>Holon Aperture</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  fonts,
  '<style>\n' + read('style.css') + '</style>',
  body.trim(),
  '<script>\n' + read('chain.js') + '</script>',
  '<script>\n' + read('sim.js') + '</script>',
  '<script>\n' + read('app.js') + '</script>',
  ''
].join('\n');
const dest = path.resolve(process.argv[2] || path.join(root, 'dist/holon-aperture.html'));
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('wrote ' + dest + ' (' + (out.length / 1024).toFixed(1) + ' kB)');
