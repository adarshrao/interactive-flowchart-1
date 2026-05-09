#!/usr/bin/env node
// Merge `public/extra nodes.svg` into `public/flowchart-6-renamed.svg`.
//
// Steps:
//   1. Restore the main SVG from `public/flowchart-6-renamed.svg.bak` (idempotent rerun).
//   2. Walk the extra SVG line-by-line; for each id inside a frame named
//      "<state> new nodes", rewrite it with the proper state suffix and parallel
//      duplicate index — same algorithm as `scripts/rename-state-ids.mjs`.
//   3. Extract each renamed frame's content (sans canvas-sized background rect).
//   4. Detect new node ids (≥ 200) and any old edges that got split (e-A-B replaced
//      by e-A-N + e-N-B for a new node N), then strip those old edges + alternates
//      from the main SVG.
//   5. Synthesise an n-206 stand-in in all four states (Figma export forgot it).
//   6. Insert each frame's renamed content (plus the n-206 stand-in for that state)
//      just before the closing </g> of the matching <g id="<state>"> in the main SVG.
//
// Usage: node scripts/merge-extra-nodes.mjs
import fs from 'node:fs';

const MAIN = 'public/flowchart-6-renamed.svg';
const MAIN_BAK = MAIN + '.bak';
const EXTRA = 'public/extra nodes.svg';

// 1. Idempotent: restore main from backup if available, else snapshot it.
if (fs.existsSync(MAIN_BAK)) {
  fs.copyFileSync(MAIN_BAK, MAIN);
} else {
  fs.copyFileSync(MAIN, MAIN_BAK);
}

const main = fs.readFileSync(MAIN, 'utf-8');
const extraRaw = fs.readFileSync(EXTRA, 'utf-8');

// 2. Walk the extra SVG line-by-line, tracking which "<state> new nodes" frame
//    we're inside via depth counting. Within a frame, rename ids the same way
//    `scripts/rename-state-ids.mjs` does.
const stateSuffix = {
  'default new nodes': '',
  'teased new nodes': '_teased',
  'current new nodes': '_current',
  'next new nodes': '_next'
};
const counters = {};
let inFrame = null;
let depth = 0;
let renamed = extraRaw.split('\n').map(line => {
  if (inFrame === null) {
    const m = line.match(/<g id="((?:default|teased|current|next) new nodes)">/);
    if (m) {
      inFrame = m[1];
      depth = 1;
      return line;
    }
    return line;
  }
  // already inside a frame: rewrite ids in this line
  const result = line.replace(/id="(n-\d+|e-\d+-\d+)(_\d+)?"/g, (_, base) => {
    const key = `${inFrame}:${base}`;
    const idx = counters[key] || 0;
    counters[key] = idx + 1;
    const parallel = idx === 0 ? '' : `_${idx + 1}`;
    return `id="${base}${parallel}${stateSuffix[inFrame]}"`;
  });
  // adjust depth — if it falls to 0, we just exited the frame
  const opens = (line.match(/<g[\s>]/g) || []).length;
  const closes = (line.match(/<\/g>/g) || []).length;
  depth += opens - closes;
  if (depth <= 0) inFrame = null;
  return result;
}).join('\n');

// 2b. Fix misnamed duplicate: the user's Figma file labelled the lower-position
//     label box as "n-205" instead of "n-206", so the renamer produced n-205_2
//     (and its state alternates) for what should be n-206. Rewrite those ids.
renamed = renamed.replace(/id="n-205_2(_[a-z]+)?"/g, (_, suffix) => `id="n-206${suffix || ''}"`);

// 3. Extract each frame's content (between its opening tag and matching </g>).
const findFrameContent = (text, frameName) => {
  const opener = `<g id="${frameName}">`;
  const start = text.indexOf(opener);
  if (start < 0) return null;
  let d = 1, i = start + opener.length;
  while (i < text.length && d > 0) {
    const openIdx = text.indexOf('<g', i);
    const closeIdx = text.indexOf('</g>', i);
    if (closeIdx < 0) return null;
    if (openIdx >= 0 && openIdx < closeIdx) { d++; i = openIdx + 2; }
    else {
      d--;
      i = closeIdx + 4;
      if (d === 0) {
        const content = text.slice(start + opener.length, closeIdx);
        // strip the canvas-sized background rect Figma always exports
        return content.replace(/^\s*<rect width="75200" height="53771" fill="#D7D8CD"\/>\s*\n?/, '');
      }
    }
  }
  return null;
};

const frameContent = {};
for (const name of Object.keys(stateSuffix)) {
  frameContent[name] = findFrameContent(renamed, name) ?? '';
}

// 4. Detect new node ids and old edges that got split.
const newNodeIds = new Set();
for (const m of renamed.matchAll(/id="(n-(\d+))(?:_[a-z0-9_]*)?"/g)) {
  if (parseInt(m[2], 10) >= 200) newNodeIds.add(m[1]);
}
for (const m of renamed.matchAll(/id="e-(\d+)-(\d+)/g)) {
  for (const part of [m[1], m[2]]) {
    if (parseInt(part, 10) >= 200) newNodeIds.add(`n-${part}`);
  }
}

const fromN = new Map(), toN = new Map();
// pair only primary edges (no state suffix) so we count each split once
for (const m of renamed.matchAll(/id="e-(\d+)-(\d+)"/g)) {
  const aId = `n-${m[1]}`, bId = `n-${m[2]}`;
  if (newNodeIds.has(bId) && !newNodeIds.has(aId)) {
    if (!toN.has(bId)) toN.set(bId, []);
    toN.get(bId).push(m[1]);
  } else if (newNodeIds.has(aId) && !newNodeIds.has(bId)) {
    if (!fromN.has(aId)) fromN.set(aId, []);
    fromN.get(aId).push(m[2]);
  }
}

const oldEdgesToRemove = [];
for (const [n, incoming] of toN) {
  const outgoing = fromN.get(n) ?? [];
  for (const a of incoming) for (const b of outgoing) oldEdgesToRemove.push(`e-${a}-${b}`);
}

console.log('new node ids:', [...newNodeIds].sort().join(', '));
console.log('old edges to remove:', oldEdgesToRemove.join(', '));

// 5. Synthesise n-206 in all four states (missing from Figma export).
const HAS_206 = /id="n-206(_[a-z0-9_]*)?"/.test(renamed);
const n206ByState = { '': '', '_teased': '', '_current': '', '_next': '' };
if (!HAS_206) {
  const x = 63585, y = 36388, w = 826, h = 672;
  for (const suffix of Object.keys(n206ByState)) {
    n206ByState[suffix] = `<g id="n-206${suffix}">
<rect width="${w}" height="${h}" transform="translate(${x} ${y})" fill="#D7D8CD"/>
<text x="${x + w / 2}" y="${y + h / 2 + 60}" text-anchor="middle" fill="#7F7F79" font-size="180" font-family="IBM Plex Sans, sans-serif" font-weight="500">Explore more examples</text>
</g>
`;
  }
  console.log('synthesised n-206 in all 4 states');
}

// 6. Remove old split edges (primary + every state alternate) from main.
let merged = main;
for (const eid of oldEdgesToRemove) {
  const re = new RegExp(`<path[^>]*\\sid="${eid}(_[a-z0-9_]+)?"[^/]*\\/>\\s*\\n?`, 'g');
  const before = merged.length;
  merged = merged.replace(re, '');
  console.log(`  removed ${eid}: ${before - merged.length} chars`);
}

// 7. For each state frame in main, insert the matching frame content + n-206 stand-in.
const frameInserts = {
  'default':  { content: frameContent['default new nodes'],  fallback: n206ByState[''] },
  'teased':   { content: frameContent['teased new nodes'],   fallback: n206ByState['_teased'] },
  'current':  { content: frameContent['current new nodes'],  fallback: n206ByState['_current'] },
  'next':     { content: frameContent['next new nodes'],     fallback: n206ByState['_next'] }
};

for (const [frameId, { content, fallback }] of Object.entries(frameInserts)) {
  const insert = (content || '') + (fallback || '');
  if (!insert.trim()) continue;
  const opener = `<g id="${frameId}">`;
  const openIdx = merged.indexOf(opener);
  if (openIdx < 0) { console.warn(`<g id="${frameId}"> not found in main`); continue; }
  let d = 1, i = openIdx + opener.length;
  while (i < merged.length && d > 0) {
    const oo = merged.indexOf('<g', i);
    const cc = merged.indexOf('</g>', i);
    if (cc < 0) break;
    if (oo >= 0 && oo < cc) { d++; i = oo + 2; }
    else {
      d--;
      i = cc + 4;
      if (d === 0) {
        merged = merged.slice(0, cc) + insert + merged.slice(cc);
        console.log(`inserted ${insert.length} chars into <g id="${frameId}">`);
        break;
      }
    }
  }
}

fs.writeFileSync(MAIN, merged);
console.log(`\nwrote ${MAIN}`);
