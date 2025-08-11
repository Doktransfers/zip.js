/*
 Manual test: stream >4 GiB into a ZIP without buffering output.
 Usage examples:
   node tests/manual/test-estimate-size-giant-node.js --bytes 4295032832   # 4 GiB + 64 KiB
   node tests/manual/test-estimate-size-giant-node.js --file /path/to/huge.file
    node tests/manual/test-estimate-size-giant-node.js --dir /path/to/folder
    node tests/manual/test-estimate-size-giant-node.js --folder /path/to/folder
*/

import fs from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import * as zip from "../../index.js";

function parseArgs() {
    const argv = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === "--bytes") { opts.bytes = Number(argv[++i]); continue; }
        if (k === "--file") { opts.file = argv[++i]; continue; }
        if (k === "--name") { opts.name = argv[++i]; continue; }
        if (k === "--dir" || k === "--folder") { opts.dir = argv[++i]; continue; }
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

export async function test() {
    zip.configure({ useWebWorkers: true, maxWorkers: 1 });

    const { file, bytes, name, dir } = parseArgs();
    let entryName;
    let readable;
    let uncompressedSize;

    // Directory mode: zip all files inside the folder recursively (store, known sizes)
    if (dir) {
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) throw new Error("--dir must point to a directory");

        const collected = collectFilesRecursively(dir);
        if (collected.length === 0) throw new Error("Directory contains no files");

        const files = collected.map(f => ({ name: f.name, size: f.size, abs: f.abs }));
        const options = { keepOrder: true, level: 0 };
        // Create writer stream
        const zipWriterStream = new zip.ZipWriterStream(options);

        // Compute precise estimate based on already-added entries
        const estimate = zipWriterStream.zipWriter.estimateStreamSize({ ...options, files: files.map(f => ({ name: f.name, uncompressedSize: f.size, level: 0 })) });
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

        await Promise.all(promises);
        if (Array.isArray(zipWriterStream.entriesPromise) && zipWriterStream.entriesPromise.length) {
            await Promise.all(zipWriterStream.entriesPromise);
        }


        // Finalize stream and compare
        await zipWriterStream.close();
        const totalBytes = await countPromise;

        if (totalBytes !== estimate) {
            throw new Error(`mismatch: estimate=${estimate} totalBytes=${totalBytes}`);
        }
        console.log("OK", { estimate, totalBytes, entries: files.length });
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