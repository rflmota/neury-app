# Neury app

Browser dashboard for the [Neury](https://github.com/rflmota/neury-fw)
data logger — connect over USB, see live status, start/stop recording,
export captures as CSV, and OTA-flash new firmware. Vanilla ES modules,
no build step, no bundler.

Live: **https://rflmota.github.io/neury-app/**

## Features

- USB CDC connect with live status panel (state, channels, capacity bar,
  samples, uptime)
- Recording controls: start, channel select, erase, page-counter reset,
  MCU reset
- CSV export streamed straight to disk via the File System Access API
- WebUSB DFU upload to the maple bootloader (1200 bps DTR-drop trigger)
- Latest GitHub release auto-detected, offered for one-click flashing,
  cached for offline use
- PWA: installable, works offline once the shell + firmware are cached
- Demo mode (`?demo=1` or the link on the welcome card) for browsing the
  UI without a device

## Run locally

    python3 -m http.server 8000 --bind 127.0.0.1
    # browse to http://127.0.0.1:8000/

Localhost is treated as a secure context — WebSerial / WebUSB work
without HTTPS. `file://` does not.

## Browser requirements

- Chrome or Edge >= 89 (WebSerial) and >= 61 (WebUSB)
- Safari / Firefox: no WebSerial / WebUSB — no support

## Tests

`tests.html` runs pure-parser tests on page load; tab title shows
PASS/FAIL count.

## Publishing

`.github/workflows/pages.yml` deploys this repo to GitHub Pages on every
push to `main`. One-time setup: **Settings → Pages → Source: GitHub
Actions**. After that, every push to `main` redeploys.

Custom domain: drop a `CNAME` file with your domain in this repo's root
and configure DNS per GitHub's Pages docs.

## Firmware releases

The DFU section pulls the latest release from
`api.github.com/repos/rflmota/neury-app/releases/latest` on page load and
caches the first matching `*neury-dfu*.bin` asset for offline use. To
publish a new firmware build, build the DFU image from the firmware repo
(`cmake -DNEURY_DFU_BUILD=ON`), then attach it to a release here:

    gh release create v0.1.0 \
      --title "v0.1.0" \
      --generate-notes \
      neury-dfu-v0.1.0.bin neury-dfu-v0.1.0.elf

The webapp picks it up the next time someone opens the page (or clicks
the ↻ button — sessionStorage caches API responses for an hour).

## DFU flash flow

1. App sends the 1200 bps DTR-drop trick over the open CDC port
2. Waits ~1.5 s for re-enumeration as `1eaf:0003`
3. Browser opens a USB picker for the bootloader; you pick it
4. App writes the image in 1024-byte chunks via DFU `DNLOAD` +
   `GETSTATUS`, terminates with a zero-length DNLOAD
5. Bootloader resets the chip — click **Connect** again

DFU only works against firmware built with `NEURY_DFU_BUILD=ON` (linked
at the maple-bootloader offset). Bricked-firmware recovery still needs
ST-Link / J-Link.

## Known limitations

- STOP mode on the device kills CDC — physical reset required to wake
- Two browser tabs can't share the same device (OS-exclusive port)
- Release info is fetched once per session (1 h sessionStorage TTL,
  60 req/hr unauthenticated GitHub API limit). The ↻ button forces a
  re-fetch
- The firmware-cache bucket only keeps the most recently fetched asset
