# Neury app

Browser App for the Neury Logger: check its status, set channels, start a Recording, export and update firmware. Desktop Chrome or Edge only (Web Serial, WebUSB).

Live: https://rflmota.github.io/neury-app/

## Use

1. Plug the Logger in with its menu cable (PA2 held low at power-up puts it in Menu mode).
2. Open the App and press **Connect**.
3. Pick channels and press **Start Recording**, then unplug the menu cable.

Step-by-step guide with screenshots: https://rflmota.github.io/neury-app/guide/

## Firmware

The App needs Logger firmware with protocol version 1 (`v` replies `proto=1`). Loggers on older firmware need a one-time bench update over SWD; ask the maintainer.

In Menu mode the App offers **Update firmware** when a newer release exists, or a custom `.bin`. It reboots the Logger into its bootloader (dapboot, `1209:db42`) and flashes it over WebUSB; recorded Pages are kept. If an update is interrupted, the Logger stays in the bootloader: use **Connect bootloader** to retry.

Releases are tags `fw-v<semver>` with asset `neury-fw-<semver>.bin` on this repo. Browsers can't download release assets (no CORS), so CI bundles the newest `fw-v1.*` into the App (`scripts/fetch-firmware.ts`). Publishing a release must re-run the `ci` workflow on `main` (`workflow_dispatch`).

## Develop

    npm ci
    npm run dev      # http://localhost:5173, a secure context for Web Serial
    npm run check    # typecheck
    npm test         # Vitest on transcripts recorded from the Targets

CI runs the same checks and deploys `main` to GitHub Pages.

The guide in `public/guide/` is captured on Target B by `e2e/guide.e2e.ts` (`NEURY_GUIDE=1`); copy its `test-results/.../guide/` output there after UI changes.
