// Pulls latest firmware release info from GitHub, caches the DFU asset
// in a separate Cache Storage bucket so it's available offline, and
// tracks the last tag we flashed via localStorage. The service worker
// owns the app shell; this module owns the firmware blob.

// Public-facing repo where firmware releases land for the webapp's
// auto-update flow. Separate from the private firmware repo so the
// API + asset downloads stay anonymous.
const REPO = 'rflmota/neury-app';
const ASSET_PATTERN = /neury-?dfu.*\.bin$/i;
const FIRMWARE_CACHE = 'neury-firmware-v1';
const LS_LAST_TAG = 'neury.lastFlashedTag';
const RELEASE_TTL_MS = 60 * 60 * 1000;
const SS_RELEASE_KEY = 'neury.cachedRelease';

export function getLastFlashedTag() {
  try { return localStorage.getItem(LS_LAST_TAG); } catch { return null; }
}

export function setLastFlashedTag(tag) {
  try { localStorage.setItem(LS_LAST_TAG, tag); } catch {}
}

export function findDfuAsset(release) {
  if (!release || !Array.isArray(release.assets)) return null;
  return release.assets.find(a => ASSET_PATTERN.test(a.name)) || null;
}

function readCachedReleaseInfo() {
  try {
    const raw = sessionStorage.getItem(SS_RELEASE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.fetchedAt > RELEASE_TTL_MS) return null;
    return obj.release;
  } catch { return null; }
}

function writeCachedReleaseInfo(release) {
  try {
    sessionStorage.setItem(SS_RELEASE_KEY, JSON.stringify({ fetchedAt: Date.now(), release }));
  } catch {}
}

export async function fetchLatestRelease({ signal, force = false } = {}) {
  if (!force) {
    const cached = readCachedReleaseInfo();
    if (cached !== null) return cached;
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  });
  if (r.status === 404) {
    writeCachedReleaseInfo(null);
    return null;
  }
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const data = await r.json();
  const asset = findDfuAsset(data);
  const release = {
    tag: data.tag_name,
    name: data.name || data.tag_name,
    publishedAt: data.published_at,
    htmlUrl: data.html_url,
    asset: asset ? {
      name: asset.name,
      size: asset.size,
      url: asset.browser_download_url,
    } : null,
  };
  writeCachedReleaseInfo(release);
  return release;
}

export async function isFirmwareCached(url) {
  if (!('caches' in self)) return false;
  try {
    const cache = await caches.open(FIRMWARE_CACHE);
    const r = await cache.match(url);
    return !!r;
  } catch { return false; }
}

async function getCachedFirmware(url) {
  if (!('caches' in self)) return null;
  try {
    const cache = await caches.open(FIRMWARE_CACHE);
    const r = await cache.match(url);
    if (!r) return null;
    return await r.arrayBuffer();
  } catch { return null; }
}

async function putFirmwareCache(url, ab) {
  if (!('caches' in self)) return;
  try {
    const cache = await caches.open(FIRMWARE_CACHE);
    await cache.put(url, new Response(ab.slice(0), {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(ab.byteLength),
      },
    }));
  } catch {}
}

export async function fetchAndCacheFirmware(url, { onProgress, signal } = {}) {
  const cached = await getCachedFirmware(url);
  if (cached) {
    if (onProgress) onProgress({ loaded: cached.byteLength, total: cached.byteLength, fromCache: true });
    return cached;
  }
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`firmware fetch ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  const reader = r.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (onProgress) onProgress({ loaded, total, fromCache: false });
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  await putFirmwareCache(url, out.buffer);
  return out.buffer;
}

export async function pruneOtherFirmwares(keepUrl) {
  if (!('caches' in self)) return;
  try {
    const cache = await caches.open(FIRMWARE_CACHE);
    const keys = await cache.keys();
    for (const req of keys) {
      if (req.url !== keepUrl) await cache.delete(req);
    }
  } catch {}
}
