import fs from 'fs';
import path from 'path';

const iconsDir = path.join('node_modules/lucide-react/dist/esm/icons');
const names = [
  'search', 'house', 'star', 'folder-git-2', 'link-2', 'earth', 'file-text',
  'message-circle', 'tags', 'moon', 'clock', 'badge-check', 'sliders-horizontal',
  'plus', 'sun', 'mail', 'calendar-check', 'check', 'gift', 'panel-right',
  'user-plus', 'layout-dashboard',
  'code-2', 'coffee', 'help-circle', 'message-square', 'lightbulb', 'book-open',
  'gamepad-2', 'palette', 'music', 'camera', 'heart', 'zap', 'globe', 'users',
  'briefcase', 'graduation-cap', 'shopping-bag', 'map-pin', 'megaphone', 'flame',
  'folder', 'wrench', 'cpu',
];

function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeToInner(nodes) {
  return nodes.map(([tag, attrs]) => {
    let s = `<${tag}`;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'key') continue;
      s += ` ${k}="${esc(v)}"`;
    }
    return `${s}/>`;
  }).join('');
}

function resolveIconFile(name) {
  let f = path.join(iconsDir, `${name}.mjs`);
  let src = fs.readFileSync(f, 'utf8');
  const re = src.match(/export \{ default \} from '\.\/([^']+)';/);
  if (re) {
    f = path.join(iconsDir, re[1]);
    src = fs.readFileSync(f, 'utf8');
  }
  return { f, src };
}

const out = {};
for (const n of names) {
  try {
    const { src } = resolveIconFile(n);
    const m = src.match(/const __iconNode = (\[[\s\S]*?\]);/);
    if (!m) {
      console.error('no node', n);
      continue;
    }
    // eslint-disable-next-line no-eval
    const nodes = eval(m[1]);
    out[n] = nodeToInner(nodes);
  } catch (e) {
    console.error('fail', n, e.message);
  }
}

fs.writeFileSync('tmp-lucide-paths.json', JSON.stringify(out, null, 2));
console.log('wrote', Object.keys(out).length, 'icons');
