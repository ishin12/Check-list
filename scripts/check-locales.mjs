#!/usr/bin/env node
// Fails if any locale's key set or {{placeholder}} set differs from en.json.
// Arabic may carry extra CLDR plural forms (_zero/_two/_few/_many); every other
// locale must match English exactly (base key + _one/_other as in en).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

const placeholders = (s) =>
  [...String(s).matchAll(/\{\{\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g)].map((m) => m[1]).sort().join(',');
const ARABIC_EXTRA = /_(zero|two|few|many)$/;
const load = (f) => flatten(JSON.parse(readFileSync(join(dir, f), 'utf8')));

const en = load('en.json');
let problems = 0;
const fail = (msg) => {
  problems++;
  console.error(`  ${msg}`);
};

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
for (const file of files.filter((f) => f !== 'en.json').sort()) {
  const lang = file.replace('.json', '');
  console.error(`${lang}:`);
  const loc = load(file);
  for (const k of Object.keys(en)) {
    if (!(k in loc)) fail(`missing key ${k}`);
    else if (typeof loc[k] !== 'string' || loc[k].trim() === '') fail(`empty value ${k}`);
    else if (placeholders(en[k]) !== placeholders(loc[k])) {
      fail(`placeholder mismatch ${k}: en {${placeholders(en[k])}} vs ${lang} {${placeholders(loc[k])}}`);
    }
  }
  for (const k of Object.keys(loc)) {
    if (k in en) continue;
    if (lang === 'ar' && ARABIC_EXTRA.test(k) && (k.replace(ARABIC_EXTRA, '_other') in en || k.replace(ARABIC_EXTRA, '') in en)) continue;
    fail(`extra key ${k}`);
  }
}

if (problems) {
  console.error(`\ncheck-locales: ${problems} problem(s)`);
  process.exit(1);
}
console.log(`check-locales: OK (${Object.keys(en).length} keys in en, ${files.length} locales)`);
