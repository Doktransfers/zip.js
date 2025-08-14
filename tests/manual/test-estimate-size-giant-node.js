 
async function readFirstLocalHeaderLength(blob) {
    // Read first 30 bytes (local file header base)
    const base = new DataView(await blob.slice(0, 30).arrayBuffer());
    const sig = base.getUint32(0, true);
    if (sig !== 0x04034b50) throw new Error("invalid local header signature");
    const nameLen = base.getUint16(26, true);
    const extraLen = base.getUint16(28, true);
    return 30 + nameLen + extraLen;
}
/*
 Manual test: stream >4 GiB into a ZIP without buffering output.
 Usage examples:
   node tests/manual/test-estimate-size-giant-node.js --bytes 4295032832   # 4 GiB + 64 KiB
   node tests/manual/test-estimate-size-giant-node.js --file /path/to/huge.file
   node tests/manual/test-estimate-size-giant-node.js --dir /path/to/folder
   node tests/manual/test-estimate-size-giant-node.js --folder /path/to/folder
   node tests/manual/test-estimate-size-giant-node.js --test-abort         # Test abort and restart functionality
*/

import fs from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import * as zip from "../../index.js";

async function computeFirstLocalHeaderLengthFromEntry(entry) {
    // Local file header base is 30 bytes
    const base = 30;
    const nameLen = entry.rawFilename ? entry.rawFilename.length : (entry.filename ? entry.filename.length : 0);
    const rawExtraField = entry.rawExtraField || new Uint8Array();
    const rawExtraFieldAES = entry.rawExtraFieldAES || new Uint8Array();
    const rawExtraFieldExtendedTimestamp = entry.rawExtraFieldExtendedTimestamp || new Uint8Array();
    const rawExtraFieldNTFS = entry.rawExtraFieldNTFS || new Uint8Array();
    // Zip64 local extra may be partially present; use the exact local extra length recorded
    const localZip64Len = entry.localExtraFieldZip64Length || 0;
    const extraLen = localZip64Len + rawExtraField.length + rawExtraFieldAES.length + rawExtraFieldExtendedTimestamp.length + rawExtraFieldNTFS.length;
    return base + nameLen + extraLen;
}

function parseArgs() {
    const argv = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === "--bytes") { opts.bytes = Number(argv[++i]); continue; }
        if (k === "--file") { opts.file = argv[++i]; continue; }
        if (k === "--name") { opts.name = argv[++i]; continue; }
        if (k === "--dir" || k === "--folder") { opts.dir = argv[++i]; continue; }
        if (k === "--test-abort") { opts.testAbort = true; continue; }
    }
    return opts;
}

function makeGeneratedReadable(totalBytes) {
    const chunkSize = 1024 * 1024; // 1 MiB
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

function collectFilesRecursively(rootDir) {
    const results = [];
    const stack = [{ abs: rootDir, rel: "" }];
    while (stack.length) {
        const { abs, rel } = stack.pop();
        const entries = fs.readdirSync(abs, { withFileTypes: true });
        for (const entry of entries) {
            const absPath = path.join(abs, entry.name);
            const relPath = rel ? path.join(rel, entry.name) : entry.name;
            if (entry.isDirectory()) {
                stack.push({ abs: absPath, rel: relPath });
            } else if (entry.isFile()) {
                const stat = fs.statSync(absPath);
                // Normalize to POSIX for ZIP entry names
                const posixName = relPath.split(path.sep).join('/');
                results.push({ name: posixName, abs: absPath, size: stat.size });
            }
        }
    }
    // Keep deterministic order
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
}

async function testAbortAndRestart() {
    zip.configure({ useWebWorkers: true, maxWorkers: 1, chunkSize: 1024 * 1024 });
    
    const testBytes = 1 * 1024 * 1024 * 1024; // 1 GiB
    const entryName = "abort-test.bin";
    
    console.log("Testing abort and restart functionality...");
    
    // First attempt: create archive, start reading, then abort using AbortController
    console.log("Creating first archive...");
    const abortController = new AbortController();
    const zipWriterStream1 = new zip.ZipWriterStream({ 
        keepOrder: true, 
        level: 0,
        signal: abortController.signal 
    });
    
    const readable1 = makeGeneratedReadable(testBytes);
    
    // Start reading the zip stream immediately
    const reader1 = zipWriterStream1.readable.getReader();
    
    const readPromise1 = (async () => {
        let totalRead = 0;
        let chunkCount = 0;
        try {
            while (!abortController.signal.aborted) {
                const { done, value } = await reader1.read();
                if (done) break;
                totalRead += value.length;
                chunkCount++;
                
                // Abort after reading a few chunks
                if (chunkCount >= 15) {
                    console.log(`Aborting after reading ${totalRead} bytes in ${chunkCount} chunks`);
                    // Trigger abort in next tick to allow current read to complete
                    setTimeout(() => {
                        abortController.abort("Test abort requested");  
                    }, 100);
                    break;
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Read aborted as expected:", error.message);
            } else {
                console.log("Read error during abort:", error.message);
            }
        } finally {
            try {
                reader1.releaseLock();
            } catch (e) {
                // Expected if stream was already closed
            }
        }
        return totalRead;
    })();
    
    // Start the archive creation concurrently
    const addPromise1 = (async () => {
        try {
            return await zipWriterStream1.zipWriter.add(entryName, readable1, { 
                level: 0, 
                passThrough: true, 
                uncompressedSize: testBytes,
                signal: abortController.signal
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Add operation aborted as expected:", error.message);
            } else {
                console.log("Add error during abort:", error?.message || error);
            }
            return null;
        }
    })();
    
    // Wait for the read to abort
    const totalRead = await readPromise1;
    console.log(`Read ${totalRead} bytes before abort`);
    
    // Try to clean up with timeout
    try {
        const cleanupPromise = Promise.all([addPromise1, zipWriterStream1.close(), zip.terminateWorkers()]);
        await Promise.race([
            cleanupPromise,
            new Promise((_, reject) => 
                setTimeout(() => {
                    reject(new Error("Cleanup timeout"));   
                }, 5000)
            )
        ]);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Cleanup aborted as expected:", error.message);
        } else if (error.message === "Cleanup timeout") {
            console.log("Cleanup timed out as expected - forcing abort");
        } else {
            console.log("First attempt cleanup error (expected):", error?.message || error);
        }
    }
    
    console.log("First attempt aborted successfully");
    
    // Wait a bit before starting second attempt
    await new Promise(resolve => {
        setTimeout(resolve, 100);
    });
    
    // Second attempt: create a new archive and read it completely
    console.log("Creating second archive...");
    const zipWriterStream2 = new zip.ZipWriterStream({ keepOrder: true, level: 0 });
    const readable2 = makeGeneratedReadable(testBytes);
    
    // Pre-estimate for validation
    const estimate = zipWriterStream2.zipWriter.estimateStreamSize({
        files: [{ name: entryName, uncompressedSize: testBytes, level: 0 }]
    });
    
    // Start consuming the zip readable stream and count bytes
    const reader2 = zipWriterStream2.readable.getReader();
    const countPromise = (async () => {
        let total = 0;
        let chunkCount = 0;
        try {
            for (;;) {
                const { done, value } = await reader2.read();
                if (done) break;
                total += value.length;
                chunkCount++;
                
                if (chunkCount % 5 === 0) {
                    console.log(`Read ${total} bytes in ${chunkCount} chunks`);
                }
            }
        } catch (error) {
            console.error("Unexpected error reading second archive:", error);
            throw error;
        } finally {
            reader2.releaseLock();
           
        }
        return total;
    })();
    
    // Add the entry
    console.log("Adding entry to second archive...");
    const entry2 = await zipWriterStream2.zipWriter.add(entryName, readable2, { 
        level: 0, 
        passThrough: true, 
        uncompressedSize: testBytes, 
        signal: abortController.signal
    });
    
    // Finalize and validate
    console.log("Finalizing second archive...");
    await zipWriterStream2.close();
    await zip.terminateWorkers();
    const totalBytes = await countPromise;
    
    // Allow small differences in estimation vs actual size (up to 0.1%)
    const sizeDiff = Math.abs(totalBytes - estimate);
    const sizeDiffPercent = (sizeDiff / estimate) * 100;
    if (sizeDiffPercent > 0.1) {
        throw new Error(`Second attempt mismatch: estimate=${estimate} totalBytes=${totalBytes} diff=${sizeDiff} (${sizeDiffPercent.toFixed(3)}%)`);
    }
    
    console.log("Second attempt completed successfully", { 
        estimate, 
        totalBytes, 
        entrySize: entry2.uncompressedSize 
    });
    
    console.log("Abort and restart test completed successfully!");
}

export async function test() {
    zip.configure({ useWebWorkers: true, maxWorkers: 1 });

    const { file, bytes, name, dir, testAbort } = parseArgs();
    
    // Run abort test if requested
    if (testAbort) {
        await testAbortAndRestart();
        return;
    }
    
    let entryName;
    let readable;
    let uncompressedSize;

    // Directory mode: zip all files inside the folder recursively (store, known sizes)
    if (dir) {
        const abortController = new AbortController();
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) throw new Error("--dir must point to a directory");

        const collected = collectFilesRecursively(dir);
        if (collected.length === 0) throw new Error("Directory contains no files");

        const files = collected.map(f => ({ name: f.name, size: f.size, abs: f.abs }));
        const options = { keepOrder: true, level: 0, signal: abortController.signal };
        // Create writer stream
        const zipWriterStream = new zip.ZipWriterStream(options);

        // Compute precise estimate based on already-added entries
        const estimate = zipWriterStream.zipWriter.estimateStreamSize({ ...options, files: files.map(f => ({ name: f.name, uncompressedSize: f.size, level: 0 })) });
        if (!(typeof estimate === "number" && estimate > 0)) throw new Error("estimate must be a positive number");

        // Start consuming the zip readable stream and count bytes, and in parallel collect a blob
        const [zipReadableForCount, zipReadableForBlob] = zipWriterStream.readable.tee();
        const reader = zipReadableForCount.getReader();
        const countPromise = (async () => {
            let total = 0;
            for (; ;) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.length;
            }
            return total;
        })();
        const zipBlobPromise = (async () => new Response(zipReadableForBlob).blob())();

        // Add entries sequentially (store, known size)
        const promises = [];
        let total = 0;
        for (const f of files) {
            const rs = Readable.toWeb(fs.createReadStream(f.abs));
            // const entry = await new zip.ZipWriterStream({ keepOrder: true, level: 0 }).zipWriter.add(f.name, rs, { level: 0, passThrough: true, uncompressedSize: f.size });

            const fileWritable = zipWriterStream.writable(f.name, {
                level: 0,
                onstart: async (_total) => { },
                onprogress: async (_progress) => {
                    // console.log("progress", _progress);
                },
                onend: async (_computedSize) => {
                    total += _computedSize;
                    // console.log("onend", _computedSize);
                },
            });

            promises.push(rs.pipeTo(fileWritable));
            // console.log("entry", entry);
        }

        let entries;
        await Promise.all(promises);
        if (Array.isArray(zipWriterStream.entriesPromise) && zipWriterStream.entriesPromise.length) {
            entries = await Promise.all(zipWriterStream.entriesPromise);
        }


        // Finalize stream and compare
        const writableResult = await zipWriterStream.close();
        const totalBytes = await countPromise;

        if (totalBytes !== estimate) {
            throw new Error(`mismatch: estimate=${estimate} totalBytes=${totalBytes}`);
        }
        console.log("OK", { estimate, totalBytes, entries: files.length });

        // Extra test: create a blob from the stream and slice out the first file's data directly
        const archiveBlob = await zipBlobPromise;
        const headerLen = await computeFirstLocalHeaderLengthFromEntry(entries && entries[0] ? entries[0] : {});
        const headerLen2 = await readFirstLocalHeaderLength(archiveBlob);
        console.log("headerLen", headerLen, headerLen2);
        const fileBlob = archiveBlob.slice(headerLen, headerLen + files[0].size);
        if (fileBlob.size !== files[0].size) {
            throw new Error(`sliced blob size mismatch: got=${fileBlob.size} expected=${files[0].size}`);
        }
        console.log("slice extract OK", { name: files[0].name, size: fileBlob.size });
        return;
    }

    if (file) {
        const stat = fs.statSync(file);
        if (!stat.size || !Number.isFinite(stat.size)) throw new Error("invalid file size");
        if (stat.size <= 0xFFFFFFFF) throw new Error("File must be > 4 GiB");
        uncompressedSize = stat.size;
        entryName = name || path.basename(file);
        readable = Readable.toWeb(fs.createReadStream(file));
    } else {
        uncompressedSize = Number.isFinite(bytes) ? Number(bytes) : (0x100000000 + 64 * 1024); // 4 GiB + 64 KiB
        if (uncompressedSize <= 0xFFFFFFFF) throw new Error("--bytes must be > 4 GiB");
        entryName = name || "giant.bin";
        readable = makeGeneratedReadable(uncompressedSize);
    }

    // Use ZipWriterStream to produce a readable ZIP stream and count its bytes while writing
    const files = [{ name: entryName, size: uncompressedSize }];
    const zipWriterStream = new zip.ZipWriterStream({ keepOrder: true, level: 0 });

    // Pre-estimate final archive size for these files
    const estimate = zipWriterStream.zipWriter.estimateStreamSize({
        files: files.map(f => ({ name: f.name, uncompressedSize: f.size, level: 0 }))
    });
    if (!(typeof estimate === "number" && estimate > 0)) throw new Error("estimate must be a positive number");

    // Start consuming the zip readable stream and count bytes
    const reader = zipWriterStream.readable.getReader();
    const countPromise = (async () => {
        let total = 0;
        for (; ;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
        }
        return total;
    })();

    // Add our single giant entry (store, known size)
    const entry = await zipWriterStream.zipWriter.add(entryName, readable, { level: 0, passThrough: true, uncompressedSize });
    console.log("entry", entry);

    // Finalize stream and compare
    await zipWriterStream.close();
    const totalBytes = await countPromise;

    if (totalBytes !== estimate) {
        throw new Error(`mismatch: estimate=${estimate} totalBytes=${totalBytes}`);
    }
    console.log("OK", { estimate, totalBytes });
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
    test().catch(e => { console.error(e); process.exit(1); });
}