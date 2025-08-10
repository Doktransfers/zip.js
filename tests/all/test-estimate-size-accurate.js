/* global Blob, TextEncoder */

import * as zip from "../../index.js";

export { test };

async function test() {
    zip.configure({ useWebWorkers: false });

    const sizes = [0, 1, 321, 65536, 250000];
    for (const size of sizes) {
        const name = `file-${size}.bin`;
        const bytes = new Uint8Array(size);
        for (let i = 0; i < size; i++) bytes[i] = i % 251; // deterministic content
        const blob = new Blob([bytes], { type: "application/octet-stream" });

        const blobWriter = new zip.BlobWriter("application/zip");
        const zipWriter = new zip.ZipWriter(blobWriter, { keepOrder: true, level: 0 });
        const comment = `comment-${size}`;
        const options = { level: 0, keepOrder: true, extendedTimestamp: false, comment: comment.toString() };

        // Estimate using provided files before adding
        const estimate = zipWriter.estimateStreamSize({ files: [{ name, uncompressedSize: bytes.length, level: 0, comment: options.comment, extendedTimestamp: false }] });
        if (typeof estimate !== "number" || !(estimate > 0)) {
            throw new Error("estimateStreamSize should return a positive number");
        }
        // Add and close
        await zipWriter.add(name, new zip.BlobReader(blob), { ...options, passThrough: true, uncompressedSize: bytes.length });
        const archiveBlob = await zipWriter.close();
        const actualSize = archiveBlob.size;

        if (actualSize !== estimate) {
            throw new Error(`estimated size (${estimate}) !== actual archive size (${actualSize}) for size=${size}`);
        }
    }

    // Explicit Zip64 via known uncompressed size stream 
    {
        const blobWriter = new zip.BlobWriter("application/zip");
        const zipWriter = new zip.ZipWriter(blobWriter, { keepOrder: true, level: 0 , zip64: true});

        const chunkSize = 64 * 1024; // 64 KiB per chunk
        const numChunks = 1024; // total ~64 MiB
        const expected = chunkSize * numChunks;
        const big = new Uint8Array(expected);
        for (let i = 0; i < expected; i++) big[i] = i % 251;
        const readable = new Blob([big]).stream();
        const estimate = zipWriter.estimateStreamSize({ files: [{ name: "big-stream.bin", uncompressedSize: expected, level: 0, zip64: true }] });
        if (typeof estimate !== "number" || !(estimate > 0)) {
            throw new Error("estimateStreamSize (zip64 implicit) should return a positive number");
        }

        await zipWriter.add("big-stream.bin", readable, { level: 0, zip64: true, passThrough: true, uncompressedSize: expected });
        const archiveBlob = await zipWriter.close();
        const actualSize = archiveBlob.size;
        if (actualSize !== estimate) {
            throw new Error(`zip64 implicit: estimated size (${estimate}) !== actual archive size (${actualSize})`);
        }
    }

  // Implicit Zip64 via very large declared uncompressed size (MAX_32_BITS + 1)
  {
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { keepOrder: true, level: 0 });

    const BIG = 0x100000000 + 1; // MAX_32_BITS + 1

    // Minimal readable to avoid huge memory/time while header declares BIG uncompressed size
    const tiny = new Uint8Array(1);
    const readable2 = new ReadableStream({
      start(controller) {
        controller.enqueue(tiny);
        controller.close();
      }
    });


    await zipWriter.add("huge.bin", readable2, { level: 0, passThrough: true, uncompressedSize: BIG, keepOrder: true });

    const archiveBlob = await zipWriter.close();
    // We don't assert equality here due to impracticality of streaming 4GiB; we only assert Zip64 is enabled.

    // Validate the entry metadata indicates Zip64 was enabled automatically
    const reader2 = new zip.ZipReader(new zip.BlobReader(archiveBlob));
    const entries2 = await reader2.getEntries();
    const huge = entries2.find(e => e.filename === "huge.bin");
    if (!huge || huge.zip64 !== true) {
      throw new Error("expected entry to be Zip64 due to uncompressed size > 4 GiB");
    }
    await reader2.close();
  }

    await zip.terminateWorkers();
}


