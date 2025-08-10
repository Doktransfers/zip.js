/* global Blob */

import * as zip from "../../index.js";

export { test };

async function test() {
  zip.configure({ useWebWorkers: false });

  const blobWriter = new zip.BlobWriter("application/zip");
  const zipWriter = new zip.ZipWriter(blobWriter, { keepOrder: true });

  // Add entries, then estimate whole-archive size with a comment
  const bytes = new Uint8Array(1024 * 64); // 64 KiB

  await zipWriter.add("folder/", undefined, { directory: true });
  await zipWriter.add("folder/a.txt", new zip.BlobReader(new Blob(["A"])) , { level: 0 });
  await zipWriter.add("b.bin", new zip.BlobReader(new Blob([bytes])), { level: 0 });

  const est = zipWriter.estimateStreamSize({ comment: "multi" });
  if (!(typeof est === "number" && est > 0)) throw new Error("estimate should be > 0");

  // Finalize archive with same comment
  await zipWriter.close(new TextEncoder().encode("multi"));
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


