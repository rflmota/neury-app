# How to use the Neury App

Captured on the test build, whose memory fills in about 40 seconds.

## 1. Open the App

Plug the Logger into the computer with its menu cable: it powers up in Menu mode. Open the App in Chrome or Edge on a desktop computer.

![Open the App](01.png)

## 2. Connect

Press Connect. The first time, Chrome lists the serial ports: pick "Neury Logger" and press Connect. After that, the App connects straight away while it is the only Logger plugged in.

![Connect](02.png)

## 3. Check the status

The App shows the Logger's state, channels, memory used with the hours left, and its firmware. On a Logger with a clock it also shows the Logger time, and sets the clock by itself.

![Check the status](03.png)

## 4. Choose the channels

Before the first Recording, choose 1 or 2 channels. A Logger records for about 98 hours with 1 channel, or about 50 hours with 2.

![Choose the channels](04.png)

## 5. Start Recording

Press Start Recording.

![Start Recording](05.png)

## 6. Unplug the menu cable

Unplug the menu cable. The Logger keeps recording on its battery, at 200 samples per second, until its memory is Full.

![Unplug the menu cable](06.png)

## 7. Full

When its memory is Full, the Logger stops recording. Left on its own, it blinks yellow at 10, 20 and 30 seconds, then sleeps. To export, power it up with the menu cable plugged in: it starts in Menu mode, and you connect as before.

![Full](07.png)

## 8. Export CSV

Press Export CSV, then choose where Chrome saves the file. It has one row per sample: the time in seconds and µV for each channel.

![Export CSV](08.png)

## 9. Exported

A comment line in the file marks where each Segment starts. The Pages stay on the Logger until you erase them.

![Exported](09.png)

## 10. Update firmware

When a newer firmware is released, the App offers Update firmware. Press it and confirm. The App restarts the Logger into its bootloader and installs the firmware over USB; recorded Pages are kept. The first time, press Select bootloader if the App asks, then pick "DAPBoot DFU Bootloader" in Chrome's list and press Connect.

![Update firmware](10.png)

## 11. Wait for the update

Keep the Logger plugged in until the update finishes.

![Wait for the update](11.png)

## 12. Connect again

The Logger restarts by itself. Press Connect again.

![Connect again](12.png)

## 13. Custom firmware

To install a .bin file you were given instead, open Custom firmware, choose the file and confirm. The update then runs as above.

![Custom firmware](13.png)

## 14. Erase and start new

To reuse a Logger, press Erase and start new and confirm. This deletes all Pages, so export first. Erasing takes up to about 2 minutes.

![Erase and start new](14.png)

## 15. Diagnostics

Open Diagnostics to see the memory chip, the INTAN, the clock and the error counters. Include them when you report a problem.

![Diagnostics](15.png)

## 16. Run self-test

Run self-test erases the Logger and checks every Page of its memory. It takes about 25 minutes: keep the App open and the Logger plugged in.

![Run self-test](16.png)

## 17. Self-test result

Passed shows how many Pages were checked. If it fails, the App shows the first bad Page: report it with the Diagnostics.

![Self-test result](17.png)
