// scripts/check-hooks.mjs
//
// The one thing neither tsc nor `next build` will tell you.
//
// A hook placed after an early return is a compile-clean, type-clean, build-clean
// crash. React matches hooks by POSITION, so a component that returns early on
// its first render registers fewer hooks than it does on its second -- and the
// second render throws "Rendered more hooks than during the previous render",
// which reaches the midwife as "Application error: a client-side exception has
// occurred" and takes the whole screen with it.
//
// It has happened twice here. Once it was the search screen, which is the app's
// home after login, so EVERY task died at the front door. The build was green
// both times.
//
// This is deliberately a structural check, not a linter. It reads one rule:
//   inside a component body, no hook call may appear after a top-level return.
// It is not clever about nesting, and it is not meant to be -- a hook belongs
// in the opening lines of a component, so anything further down is worth a look
// even when it turns out to be fine.

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HOOK = /\b(use[A-Z][A-Za-z]*)\s*[(<]/;
const COMPONENT = /^(export default function|export function|function)\s+([A-Z][A-Za-z0-9_]*)\s*\(/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

// Strip strings and comments so a `return` inside either is not mistaken for code.
function scrub(line) {
  return line
    .replace(/\\./g, '')
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``')
    .replace(/\/\/.*$/, '')
    .replace(/\/\*.*?\*\//g, '');
}

const problems = [];

for (const file of walk('app').concat(walk('components'))) {
  const lines = readFileSync(file, 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = COMPONENT.exec(lines[i].trim());
    if (!m) continue;

    const component = m[2];
    let depth = 0;
    let started = false;
    let returnedAt = null;

    for (let j = i; j < lines.length; j++) {
      const s = scrub(lines[j]);

      // Depth BEFORE this line's braces is what tells us whether the line's own
      // statement sits directly in the component body.
      const atBody = started && depth === 1;

      if (atBody && returnedAt === null && /^\s*(if\s*\(.*\)\s*)?return\b/.test(s)) {
        returnedAt = j + 1;
      } else if (atBody && returnedAt !== null) {
        const h = HOOK.exec(s);
        // useLang/useRouter and friends all count; a custom hook is still a hook.
        if (h) problems.push({ file, component, returnedAt, line: j + 1, hook: h[1] });
      }

      for (const ch of s) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
      }

      if (started && depth === 0) break; // end of the component
    }
  }
}

if (problems.length === 0) {
  console.log('check-hooks: every hook sits above its component\'s first return.');
  process.exit(0);
}

console.error('check-hooks: a hook runs only on SOME renders. React will throw.\n');
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}  ${p.hook} in <${p.component}>, after the return on line ${p.returnedAt}`);
}
console.error('\nMove the hook above that return. The build will not catch this.');
process.exit(1);
