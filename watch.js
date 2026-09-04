#!/usr/bin/env node
// Rebuilds dist/ whenever the source changes. Pair with `npm run run:firefox`,
// which reloads the add-on on its own when dist/extension-firefox changes.
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
let timer = null;

function build() {
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
    console.log('[' + new Date().toLocaleTimeString() + '] rebuilt');
  } catch (e) { console.error('build failed'); }
}

build();
['loknot.js', 'build.js', 'icons.js'].forEach((f) => {
  fs.watch(path.join(__dirname, f), () => {
    clearTimeout(timer);
    timer = setTimeout(build, 150);   // editors write in bursts
  });
});
console.log('watching loknot.js, build.js, icons.js — ctrl-c to stop');
