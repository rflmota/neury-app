# Neury app

Browser App for the Neury Logger: check its status, set channels, start a Recording, export and update firmware. Desktop Chrome or Edge only (Web Serial, WebUSB).

Live: https://rflmota.github.io/neury-app/

## Use

1. Plug the Logger in with its menu cable (PA2 held low at power-up puts it in Menu mode).
2. Open the App and press **Connect**.
3. Pick channels and press **Start Recording**, then unplug the menu cable.

## Firmware

The App needs Logger firmware with protocol version 1 (`v` replies `proto=1`). Loggers on older firmware need a one-time bench update over SWD; ask the maintainer.

## Develop

    npm ci
    npm run dev      # http://localhost:5173, a secure context for Web Serial
    npm run check    # typecheck
    npm test         # Vitest on transcripts recorded from the Targets

CI runs the same checks and deploys `main` to GitHub Pages.
