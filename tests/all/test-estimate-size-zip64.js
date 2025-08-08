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

  // Estimate should succeed and be > bigSize
  const estimate = zipWriter.estimateStreamSize("big.bin", bigSize, { level: 0, zip64: true });
  if (!(typeof estimate === "number" && estimate > bigSize)) throw new Error("estimate should exceed uncompressed size for Zip64");

  // Create a sparse-like stream that yields zeroes without materializing 4+ GiB in memory
  // We won't add it, to avoid a massive test. The goal here is to validate the estimator for Zip64.
  await zipWriter.close();
  await zip.terminateWorkers();
}


