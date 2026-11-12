// Browser-free checks for inline JavaScript and literal element-id lookups.
// Run: node test/syntax.mjs [path/to/index.html]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let failed = 0;
function fail(message) {
  failed++;
  console.log(`FAIL ${message}`);
}

try {
  const html = readFileSync(process.argv[2] || new URL('../index.html', import.meta.url), 'utf8');
  // Remove comments and script bodies before collecting ids, so JavaScript strings
  // (including generated HTML) cannot disguise a missing markup element.
  const source = html.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const scripts = [...source.matchAll(scriptPattern)];
  const markup = source.replace(scriptPattern, '');
  const ids = new Set();
  for (const tag of markup.matchAll(/<[a-z][^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\s+id\s*=\s*(["'])(.*?)\1/gi)) ids.add(attr[2]);
  }

  let inlineCount = 0;
  for (const script of scripts) {
    if (/\s+src\s*=/i.test(script[1])) continue;
    inlineCount++;
    const code = script[2];
    const start = script.index + script[0].indexOf('>') + 1;
    const lineOffset = source.slice(0, start).split('\n').length - 1;
    const label = `inline script ${inlineCount} (index.html:${lineOffset + 1})`;
    try {
      new vm.Script(code, { filename: 'index.html', lineOffset });
      console.log(`ok   ${label}: syntax`);
    } catch (error) {
      fail(`${label}: syntax\n${error.stack}`);
    }

    let missing = 0;
    const lookups = /(?<![\w$\.])(?:\$|document\s*\.\s*getElementById)\s*\(\s*(["'])([^"'\r\n]*)\1\s*\)/g;
    for (const lookup of code.matchAll(lookups)) {
      const id = lookup[2];
      if (ids.has(id)) continue;
      const line = lineOffset + code.slice(0, lookup.index).split('\n').length;
      fail(`index.html:${line}: missing element id ${JSON.stringify(id)}`);
      missing++;
    }
    if (!missing) console.log(`ok   ${label}: element ids`);
  }
  if (!inlineCount) fail('index.html: no inline scripts found');
} catch (error) {
  fail(error.message);
}

process.exitCode = failed ? 1 : 0;
