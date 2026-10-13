// Minimal zip extraction for live-update bundles (the packaged app ships no
// node_modules). Handles what CI's `zip -r` produces: stored or deflated
// entries, no zip64, no encryption.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const END_OF_CENTRAL_DIR = 0x06054b50;
const CENTRAL_DIR_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

/** Extracts the zip in `buffer` into the existing directory `dest`. */
export function extractZip(buffer, dest) {
  const root = path.resolve(dest);

  // The end-of-central-directory record sits in the last 22 bytes + comment (<= 64 KiB).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIR) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file.");

  const entries = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (buffer.readUInt32LE(p) !== CENTRAL_DIR_ENTRY) throw new Error("Corrupt zip (central directory).");
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;

    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Unsafe path in zip: ${name}`);
    if (name.endsWith("/")) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }

    // Sizes come from the central directory (local headers may defer them to a data descriptor).
    if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) throw new Error("Corrupt zip (local header).");
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const data = buffer.subarray(start, start + compressedSize);
    let contents;
    if (method === 0) contents = data;
    else if (method === 8) contents = zlib.inflateRawSync(data);
    else throw new Error(`Unsupported zip compression method ${method}.`);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}
