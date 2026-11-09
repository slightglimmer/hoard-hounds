// Runs every *.test.mjs file here. Server functions are tested with simulated
// Stripe and Supabase responses: nothing is sent to the real services.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
  let out = '';
  try {
    out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(dir, file)], { encoding: 'utf8' });
  } catch (err) {
    out = `${err.stdout || ''}\nFAIL crashed: ${String(err.stderr || err.message).split('\n')[0]}`;
  }
  const p = out.split('\n').filter((l) => l.startsWith('PASS')).length;
  const failed = out.split('\n').filter((l) => l.startsWith('FAIL'));
  console.log(`${file.padEnd(28)} PASS ${String(p).padStart(3)}  FAIL ${failed.length}`);
  failed.forEach((l) => console.log(`    ${l}`));
  pass += p;
  fail += failed.length;
}
console.log(`TOTAL                        PASS ${pass}  FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
