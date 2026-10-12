// WebUSB DFU download to dapboot (docs/adr/0001-dapboot-bootloader.md in neury-fw).
// dapboot resets into the new firmware during manifest, so the device dropping
// off the bus at the end is the success signal, not an error.

export const DFU_FILTER = { vendorId: 0x1209, productId: 0xdb42 };

const IFACE = 0;
const ALT = 0;
const BLOCK = 1024;

const DNLOAD = 1;
const GETSTATUS = 3;
const CLRSTATUS = 4;

const DNBUSY = 4;
const DNLOAD_IDLE = 5;
const MANIFEST_SYNC = 6;
const MANIFEST = 7;
const MANIFEST_WAIT_RESET = 8;
const ERROR = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function grantedBootloader(): Promise<USBDevice | undefined> {
  const devices = await navigator.usb.getDevices();
  return devices.find((d) => d.vendorId === DFU_FILTER.vendorId && d.productId === DFU_FILTER.productId);
}

export function requestBootloader(): Promise<USBDevice> {
  return navigator.usb.requestDevice({ filters: [DFU_FILTER] });
}

const setup = (request: number, value = 0): USBControlTransferParameters => ({
  requestType: 'class',
  recipient: 'interface',
  request,
  value,
  index: IFACE,
});

async function getStatus(device: USBDevice) {
  const r = await device.controlTransferIn(setup(GETSTATUS), 6);
  const v = r.data!;
  return { status: v.getUint8(0), poll: v.getUint8(1) | (v.getUint8(2) << 8) | (v.getUint8(3) << 16), state: v.getUint8(4) };
}

function dnload(device: USBDevice, block: number, data: Uint8Array<ArrayBuffer>) {
  return device.controlTransferOut(setup(DNLOAD, block), data);
}

export async function download(device: USBDevice, image: Uint8Array<ArrayBuffer>, onProgress: (written: number) => void) {
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  await device.claimInterface(IFACE);
  await device.selectAlternateInterface(IFACE, ALT);

  if ((await getStatus(device)).state === ERROR) await device.controlTransferOut(setup(CLRSTATUS));

  for (let block = 0, offset = 0; offset < image.length; block++) {
    await dnload(device, block, image.subarray(offset, offset + BLOCK));
    let s = await getStatus(device);
    while (s.state === DNBUSY) {
      await sleep(s.poll);
      s = await getStatus(device);
    }
    if (s.state !== DNLOAD_IDLE) throw new Error(`DFU block ${block}: state ${s.state}, status ${s.status}`);
    offset = Math.min(offset + BLOCK, image.length);
    onProgress(offset);
  }

  try {
    await dnload(device, Math.ceil(image.length / BLOCK), new Uint8Array(0));
    let s = await getStatus(device);
    while ([MANIFEST_SYNC, MANIFEST, MANIFEST_WAIT_RESET].includes(s.state)) {
      await sleep(s.poll || 50);
      s = await getStatus(device);
    }
    await device.close();
  } catch {
    // dapboot reset into the new firmware.
  }
}
