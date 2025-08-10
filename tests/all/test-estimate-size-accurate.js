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

        // Add the entry first
        await zipWriter.add(name, new zip.BlobReader(blob), options);

        // Estimate the full stream size with the same options and global comment
        const estimate = zipWriter.estimateStreamSize(options);
        if (typeof estimate !== "number" || !(estimate > 0)) {
            throw new Error("estimateStreamSize should return a positive number");
        }
        //new TextEncoder().encode(comment)
        // Close with the same comment used for estimation
        const archiveBlob = await zipWriter.close();
        const actualSize = archiveBlob.size;

        if (actualSize !== estimate) {
            throw new Error(`estimated size (${estimate}) !== actual archive size (${actualSize}) for size=${size}`);
        }
    }

    // Explicit Zip64 via unknown-sized stream 
    {
        const blobWriter = new zip.BlobWriter("application/zip");
        const zipWriter = new zip.ZipWriter(blobWriter, { keepOrder: true, level: 0 , zip64: true});

        const chunkSize = 64 * 1024; // 64 KiB per chunk
        const numChunks = 1024; // total ~64 MiB written, but size is unknown to the writer
        let remaining = numChunks;
        const chunk = new Uint8Array(chunkSize);
        for (let i = 0; i < chunkSize; i++) chunk[i] = i % 251;
        const readable = new ReadableStream({
            pull(controller) {
                if (remaining-- > 0) {
                    controller.enqueue(chunk);
                } else {
                    controller.close();
                }
            }
        });

        await zipWriter.add("big-stream.bin", readable, { level: 0 });

        const estimate = zipWriter.estimateStreamSize();
        if (typeof estimate !== "number" || !(estimate > 0)) {
            throw new Error("estimateStreamSize (zip64 implicit) should return a positive number");
        }

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

    const estimate2 = zipWriter.estimateStreamSize();
    if (typeof estimate2 !== "number" || !(estimate2 > 0)) {
      throw new Error("estimateStreamSize (zip64 by size) should return a positive number");
    }

    const archiveBlob = await zipWriter.close();
    const actualSize2 = archiveBlob.size;
    if (actualSize2 !== estimate2) {
      throw new Error(`zip64 by size: estimated size (${estimate2}) !== actual archive size (${actualSize2})`);
    }

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


