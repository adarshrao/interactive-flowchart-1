import fs from 'node:fs';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('usage: node rename-state-ids.mjs <input.svg> <output.svg>');
  process.exit(1);
}

const stateSuffixes = {
  teased: '_teased',
  current: '_current',
  next: '_next',
  default: ''
};

const content = fs.readFileSync(inputPath, 'utf-8');
const lines = content.split('\n');

let currentFrame = null;
const counters = {};

const out = lines.map(line => {
  const frameMatch = line.match(/^<g id="(teased|current|next|default)">/);
  if (frameMatch) {
    currentFrame = frameMatch[1];
    return line;
  }

  if (line.startsWith('<defs>')) {
    currentFrame = null;
  }

  if (!currentFrame) return line;

  return line.replace(/id="(n-\d+|e-\d+-\d+)(_\d+)?"/g, (match, base) => {
    const key = `${currentFrame}:${base}`;
    const idx = counters[key] || 0;
    counters[key] = idx + 1;
    const parallel = idx === 0 ? '' : `_${idx + 1}`;
    return `id="${base}${parallel}${stateSuffixes[currentFrame]}"`;
  });
});

fs.writeFileSync(outputPath, out.join('\n'));

const summary = {};
for (const k of Object.keys(counters)) {
  const f = k.split(':')[0];
  summary[f] = (summary[f] || 0) + counters[k];
}
console.log('renamed IDs per frame:', summary);
console.log('output:', outputPath);
