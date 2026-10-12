// Bundles the newest firmware release for this App's protocol into public/ (run in CI before the build).
import { mkdir, writeFile } from 'node:fs/promises';
import { pickRelease } from '../src/lib/release.ts';
import { PROTO } from '../src/lib/gate.ts';

const REPO = 'rflmota/neury-app';
const headers: Record<string, string> = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

const releases: { tag_name: string }[] = await (
  await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers })
).json();
const fw = pickRelease(
  releases.map((r) => r.tag_name),
  PROTO,
);
if (!fw) {
  console.log('No firmware release');
  process.exit(0);
}

const bin = await fetch(`https://github.com/${REPO}/releases/download/fw-v${fw.version}/${fw.file}`);
if (!bin.ok) throw new Error(`${fw.file}: HTTP ${bin.status}`);
await mkdir('public/firmware', { recursive: true });
await writeFile(`public/firmware/${fw.file}`, new Uint8Array(await bin.arrayBuffer()));
await writeFile('public/firmware.json', JSON.stringify(fw));
console.log(`Bundled ${fw.file}`);
