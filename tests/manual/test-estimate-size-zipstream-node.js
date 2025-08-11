/*
 Manual test: stream a ZIP via ZipWriterStream, consume its readable output,
 count bytes, and compare against estimateStreamSize.

 Usage examples:
   node tests/manual/test-estimate-size-zipstream-node.js --fixtures tests/manual/fixtures.json
   node tests/manual/test-estimate-size-zipstream-node.js
*/

import fs from "node:fs";
import * as zip from "../../index.js";

function parseArgs() {
  const argv = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--fixtures") { opts.fixtures = argv[++i]; continue; }
  }
  return opts;
}

function makeGeneratedReadable(totalBytes) {
  const chunkSize = 1024 * 64; // 64 KiB
  const chunk = new Uint8Array(chunkSize);
  for (let i = 0; i < chunkSize; i++) chunk[i] = i & 0xff;
  let remaining = totalBytes;
  return new ReadableStream({
    pull(controller) {
      if (remaining <= 0) { controller.close(); return; }
      const size = remaining >= chunkSize ? chunkSize : remaining;
      controller.enqueue(size === chunkSize ? chunk : chunk.subarray(0, size));
      remaining -= size;
    }
  });
}

async function ZipStreamWithMetadata(sortedFiles) {
  const zipWriterStream = new zip.ZipWriterStream({ keepOrder: true, level: 0 });

  // Pre-estimate final archive size
  const estimate = zipWriterStream.zipWriter.estimateStreamSize({
    files: sortedFiles.map(f => ({ name: f.name, uncompressedSize: f.size, level: 0 }))
  });

  // Start consuming the ZIP readable while we add entries
  const reader = zipWriterStream.readable.getReader();
  const countPromise = (async () => {
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
    }
    return total;
  })();

  // Stream each file into the zip (store, pass-through, known size)
  for (const f of sortedFiles) {
    const readable = makeGeneratedReadable(f.size);
    await zipWriterStream.zipWriter.add(f.name, readable, { level: 0, passThrough: true, uncompressedSize: f.size });
  }

  // Finalize
  await zipWriterStream.close();
  const totalBytes = await countPromise;
  return { totalBytes, estimate };
}

export async function test() {
  zip.configure({ useWebWorkers: false });

  const { fixtures } = parseArgs();
  let files;
  if (fixtures) {
    const json = JSON.parse(fs.readFileSync(fixtures, "utf8"));
    files = json.map(item => ({ name: String(item.filename), size: Number(item.uncompressedSize || 0) }));
  } else {
    files = [
      { name: "a.bin", size: 1024 },
      { name: "b.bin", size: 65536 },
      { name: "c.bin", size: 250000 }
    ];
  }

  const { totalBytes, estimate } = await ZipStreamWithMetadata(files);
  if (totalBytes !== estimate) {
    throw new Error(`mismatch: estimate=${estimate} totalBytes=${totalBytes}`);
  }
  console.log("OK", { estimate, totalBytes });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  test().catch(e => { console.error(e); process.exit(1); });
}



