/* global Blob */

import * as zip from "../../index.js";

export { test };

async function test() {
  zip.configure({ useWebWorkers: false });

  const blobWriter = new zip.BlobWriter("application/zip");
  const zipWriter = new zip.ZipWriter(blobWriter, { keepOrder: true });

  // Estimate sizes before adding any entries (empty archive requirement)
  const estDir = zipWriter.estimateStreamSize("folder/", 0, { directory: true, level: 0 });
  if (!(typeof estDir === "number" && estDir > 0)) throw new Error("estimate for directory should be > 0");
  
  const estA = zipWriter.estimateStreamSize("folder/a.txt", 1, { level: 0 });
  if (estA < 1) throw new Error("estimate should be >= uncompressed size");
  
  const bytes = new Uint8Array(1024 * 64); // 64 KiB
  const estB = zipWriter.estimateStreamSize("b.bin", bytes.length, { level: 0 });
  if (estB < bytes.length) throw new Error("estimate should be >= uncompressed size");

  // Now add the entries
  await zipWriter.add("folder/", undefined, { directory: true });

  const contentA = new Blob(["A"], { type: "text/plain" });
  await zipWriter.add("folder/a.txt", new zip.BlobReader(contentA), { level: 0 });

  const contentB = new Blob([bytes], { type: "application/octet-stream" });
  await zipWriter.add("b.bin", new zip.BlobReader(contentB), { level: 0 });

  // Finalize archive
  await zipWriter.close();
  const archive = await blobWriter.getData();

  // Validate archive integrity by reading it back
  const reader = new zip.ZipReader(new zip.BlobReader(archive));
  const entries = await reader.getEntries();
  if (entries.length !== 3) throw new Error("expected 3 entries");
  const a = entries.find(e => e.filename === "folder/a.txt");
  if (!a || a.uncompressedSize !== 1 || a.compressionMethod !== 0x00) throw new Error("unexpected metadata for a.txt");
  const aData = await a.getData(new zip.BlobWriter("text/plain"));
  if ((await aData.text()) !== "A") throw new Error("content mismatch for a.txt");
  await reader.close();
  await zip.terminateWorkers();
}


