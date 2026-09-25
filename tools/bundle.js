#!/usr/bin/env node
// Inlines the stylesheet and scripts into dist/index.html, a single file
// that can be opened or hosted anywhere.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('index.html')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}</style>`)
  .replace(/<script src="(js\/[\w.]+)"><\/script>/g, (_, f) => `<script>\n${read(f)}</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('Wrote dist/index.html');
