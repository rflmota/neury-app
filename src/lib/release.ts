// Firmware releases: tags `fw-v<semver>` with asset `neury-fw-<semver>.bin` on neury-app.
// The App build bundles the newest release for its protocol (scripts/fetch-firmware.ts),
// because browsers can't fetch GitHub release assets (no CORS).

export interface Firmware {
  version: string;
  file: string;
}

const parse = (v: string) => v.split('.').map(Number);

export function newer(a: string, b: string): boolean {
  const [x, y] = [parse(a), parse(b)];
  const i = x.findIndex((n, k) => n !== y[k]);
  return i >= 0 && x[i] > y[i];
}

export function pickRelease(tags: string[], major: number): Firmware | null {
  const versions = tags
    .map((t) => /^fw-v(\d+\.\d+\.\d+)$/.exec(t)?.[1])
    .filter((v): v is string => !!v && parse(v)[0] === major);
  if (!versions.length) return null;
  const version = versions.reduce((a, b) => (newer(b, a) ? b : a));
  return { version, file: `neury-fw-${version}.bin` };
}
