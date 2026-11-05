// Shrinks the flowchart SVG by storing each repeated <path> shape only once.
//
// Figma exports the chart as four stacked state frames (teased / current / next /
// default) and outlines all text into paths, so the same large glyph path appears
// 3–4 times with only its fill colour differing. This script moves the path data
// for every repeated shape into <defs> and replaces each copy with a <use> that
// keeps the copy's own attributes (id, fill, stroke, …), which inherit into the
// referenced path exactly as they did before.
//
// Left untouched (the app's code/CSS relies on them being real <path> elements):
//   - paths whose own id starts with "n-" or "e-" (nodes and edges)
//   - anything inside a flower node (n-042 … n-057, any state)
//   - anything inside defs / mask / clipPath / pattern / filter
//   - short paths (< 200 chars of path data), where the saving is negligible
//
// usage: node scripts/dedupe-svg-paths.mjs <input.svg> <output.svg>

import fs from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('usage: node scripts/dedupe-svg-paths.mjs <input.svg> <output.svg>');
  process.exit(1);
}

const MIN_PATH_LENGTH = 200;
const SKIP_CONTAINERS = new Set(['defs', 'mask', 'clipPath', 'pattern', 'filter']);
const FLOWER_ID = /^n-0(4[2-9]|5[0-7])(_|$)/;
const TAG = /<(\/?)([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;

const svg = fs.readFileSync(inputPath, 'utf-8');

const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

// walk every tag, tracking ancestors, and call visit() for each eligible <path>
function walk(visit) {
  const stack = [];
  for (const m of svg.matchAll(TAG)) {
    const [, closing, name, attrs, selfClosing] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    if (name === 'path') {
      const id = attr(attrs, 'id') || '';
      const d = attr(attrs, 'd');
      const eligible =
        d && d.length >= MIN_PATH_LENGTH &&
        !id.startsWith('n-') && !id.startsWith('e-') &&
        !stack.some(a => SKIP_CONTAINERS.has(a.name) || FLOWER_ID.test(a.id));
      if (eligible) visit(m, attrs, d);
    }
    if (!selfClosing) stack.push({ name, id: attr(attrs, 'id') || '' });
  }
  if (stack.length) throw new Error('unbalanced SVG tags; refusing to rewrite');
}

// pass 1: count how often each eligible path's data appears
const counts = new Map();
walk((m, attrs, d) => counts.set(d, (counts.get(d) || 0) + 1));

// pass 2: replace repeated paths with <use>, collecting one shared copy each
const defIds = new Map();
const replacements = [];
walk((m, attrs, d) => {
  if (counts.get(d) < 2) return;
  if (!defIds.has(d)) defIds.set(d, `dp${defIds.size}`);
  const otherAttrs = attrs.replace(/\sd="[^"]*"/, '');
  replacements.push({
    start: m.index,
    end: m.index + m[0].length,
    text: `<use href="#${defIds.get(d)}"${otherAttrs}/>`
  });
});

let out = '';
let cursor = 0;
for (const r of replacements) {
  out += svg.slice(cursor, r.start) + r.text;
  cursor = r.end;
}
out += svg.slice(cursor);

// shared shapes go in a <defs> right after the root <svg> tag
const defs = '<defs>' +
  [...defIds].map(([d, id]) => `<path id="${id}" d="${d}"/>`).join('') +
  '</defs>';
const rootEnd = out.indexOf('>', out.indexOf('<svg')) + 1;
out = out.slice(0, rootEnd) + defs + out.slice(rootEnd);

fs.writeFileSync(outputPath, out);

const mb = n => (n / 1e6).toFixed(1) + ' MB';
console.log(`${inputPath}: ${mb(svg.length)} → ${outputPath}: ${mb(out.length)}`);
console.log(`${replacements.length} repeated paths now share ${defIds.size} stored shapes`);
