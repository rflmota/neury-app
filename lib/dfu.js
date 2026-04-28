// WebUSB DFU upload to the maple bootloader (1eaf:0003).
// Implements the subset of USB DFU 1.1 the maple bootloader actually honours.
// The bootloader resets immediately after the manifest phase, so the final
// GETSTATUS round-trip is allowed to fail — that's the success signal, not
// an error.

const VENDOR = 0x1eaf;
const PRODUCT = 0x0003;
const ALT_USER_FLASH = 2;
const CHUNK_SIZE = 1024;

const REQ_DNLOAD = 0x01;
const REQ_GETSTATUS = 0x03;
const REQ_CLRSTATUS = 0x04;
const REQ_ABORT = 0x06;

const STATE_DFU_DNBUSY = 4;
const STATE_DFU_DNLOAD_IDLE = 5;
const STATE_DFU_MANIFEST_SYNC = 6;
const STATE_DFU_MANIFEST = 7;
const STATE_DFU_MANIFEST_WAIT_RESET = 8;
const STATE_DFU_ERROR = 10;

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function isSupported() {
  return 'usb' in navigator;
}

export async function requestBootloader() {
  return navigator.usb.requestDevice({
    filters: [{ vendorId: VENDOR, productId: PRODUCT }],
  });
}

export async function findExistingBootloader() {
  if (!('usb' in navigator)) return null;
  const granted = await navigator.usb.getDevices();
  return granted.find(d => d.vendorId === VENDOR && d.productId === PRODUCT) || null;
}

function findDfuInterface(device) {
  const cfg = device.configuration;
  if (!cfg) return 0;
  for (const iface of cfg.interfaces) {
    for (const alt of iface.alternates) {
      if (alt.interfaceClass === 0xFE && alt.interfaceSubclass === 0x01) {
        return iface.interfaceNumber;
      }
    }
  }
  return 0;
}

async function getStatus(device, ifaceNum) {
  const r = await device.controlTransferIn({
    requestType: 'class', recipient: 'interface',
    request: REQ_GETSTATUS, value: 0, index: ifaceNum,
  }, 6);
  if (!r.data || r.data.byteLength < 6) throw new Error('GETSTATUS short read');
  const v = r.data;
  return {
    status: v.getUint8(0),
    pollTimeout: v.getUint8(1) | (v.getUint8(2) << 8) | (v.getUint8(3) << 16),
    state: v.getUint8(4),
  };
}

async function clrStatus(device, ifaceNum) {
  await device.controlTransferOut({
    requestType: 'class', recipient: 'interface',
    request: REQ_CLRSTATUS, value: 0, index: ifaceNum,
  });
}

async function dnload(device, blockNum, ifaceNum, data) {
  await device.controlTransferOut({
    requestType: 'class', recipient: 'interface',
    request: REQ_DNLOAD, value: blockNum, index: ifaceNum,
  }, data);
}

export async function uploadFirmware(device, bin, {
  altSetting = ALT_USER_FLASH,
  chunkSize = CHUNK_SIZE,
  onProgress,
} = {}) {
  const buf = bin instanceof ArrayBuffer ? new Uint8Array(bin)
            : ArrayBuffer.isView(bin) ? new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
            : new Uint8Array(bin);

  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  const ifaceNum = findDfuInterface(device);
  await device.claimInterface(ifaceNum);
  await device.selectAlternateInterface(ifaceNum, altSetting);

  let st = await getStatus(device, ifaceNum);
  if (st.state === STATE_DFU_ERROR) {
    await clrStatus(device, ifaceNum);
    st = await getStatus(device, ifaceNum);
  }

  const total = buf.byteLength;
  let offset = 0;
  let block = 0;

  while (offset < total) {
    const chunk = buf.subarray(offset, Math.min(offset + chunkSize, total));
    await dnload(device, block, ifaceNum, chunk);
    let s = await getStatus(device, ifaceNum);
    while (s.state === STATE_DFU_DNBUSY) {
      await sleep(s.pollTimeout || 5);
      s = await getStatus(device, ifaceNum);
    }
    if (s.state !== STATE_DFU_DNLOAD_IDLE) {
      throw new Error(`DFU error after block ${block}: state=${s.state} status=${s.status}`);
    }
    offset += chunk.length;
    block++;
    if (onProgress) onProgress({ written: offset, total });
  }

  // Zero-length DNLOAD = end of data → manifest phase.
  // Maple bootloader resets the chip during/after manifest, so any error from
  // here on means the device went away — which is what we want.
  try {
    await dnload(device, block, ifaceNum, new Uint8Array(0));
    let s = await getStatus(device, ifaceNum);
    const manifestStates = new Set([
      STATE_DFU_MANIFEST_SYNC,
      STATE_DFU_MANIFEST,
      STATE_DFU_MANIFEST_WAIT_RESET,
    ]);
    while (manifestStates.has(s.state)) {
      await sleep(s.pollTimeout || 50);
      s = await getStatus(device, ifaceNum);
    }
  } catch {}

  try { await device.releaseInterface(ifaceNum); } catch {}
  try { await device.close(); } catch {}
  return { written: total };
}
