#!/usr/bin/env node
// Writes the Tailwind v4 CSS for MudTail plugins' tokens, so utilities such as bg-countdown-digit exist.
//
//   npx mudtail-plugin-css ./plugins/countdown.plugin.js [--out src/styles/plugins.css] [--source ./plugins]
//
// Several plugins may be listed. Then, in the app's stylesheet, after "mudtail/tailwind.css":
//   @import "./plugins.css";
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pluginTailwindCss } from '../src/core/plugin-tokens.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const out = flag('--out');
const source = flag('--source');
if (!args.length) {
  console.error('usage: mudtail-plugin-css <plugin.js>… [--out file.css] [--source path-for-@source]');
  process.exit(1);
}

const parts = [];
for (const file of args) {
  const module = await import(pathToFileURL(resolve(file)).href);
  const plugin = module.default ?? module.plugin;
  parts.push(pluginTailwindCss(plugin, { source: source ?? null }));
}
const css = parts.join('\n');
if (out) {
  writeFileSync(out, css);
  console.log(`wrote ${out}`);
} else process.stdout.write(css);
