import assert from 'node:assert/strict';

export function readGLB(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'glTF version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  const length = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  assert.equal(bytes.readUInt32LE(24 + length), 0x004e4942, 'BIN chunk');
  return { json: JSON.parse(bytes.subarray(20, 20 + length)), binary: bytes.subarray(28 + length) };
}

export function writeGLB(json, binary) {
  const text = Buffer.from(JSON.stringify(json));
  const jsonPadding = Buffer.alloc((4 - text.length % 4) % 4, 32);
  const binPadding = Buffer.alloc((4 - binary.length % 4) % 4);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write('glTF');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + text.length + jsonPadding.length + binary.length + binPadding.length, 8);
  header.writeUInt32LE(text.length + jsonPadding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length + binPadding.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, text, jsonPadding, binHeader, binary, binPadding]);
}
