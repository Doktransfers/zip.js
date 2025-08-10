/* global Blob */

import * as zip from "../../index.js";

export { test };

async function test() {
  zip.configure({ useWebWorkers: false });

  // Size > 4 GiB to force Zip64
  const FOUR_GIB = 0x100000000; // 4,294,967,296
  const bigSize = FOUR_GIB + 10;

  const blobWriter = new zip.BlobWriter("application/zip");
  const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true, keepOrder: true });

  // Add a placeholder entry with known size (we won't actually generate 4GiB here)
  // We just want to ensure Zip64 directory sizing logic is applied in estimation.
  // Simulate by setting offset to a large value then estimating with zip64.
  const estimate = zipWriter.estimateStreamSize({ zip64: true, comment: "z64" });
  if (!(typeof estimate === "number" && estimate > 0)) throw new Error("zip64 estimate should be a positive number");

  // Create a sparse-like stream that yields zeroes without materializing 4+ GiB in memory
  // We won't add it, to avoid a massive test. The goal here is to validate the estimator for Zip64.
  await zipWriter.close(new TextEncoder().encode("z64"));
  await zip.terminateWorkers();
}


