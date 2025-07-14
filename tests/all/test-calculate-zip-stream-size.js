/* global Blob */

import * as zip from "../../index.js";
import { calculateZipStreamSize, createEntryMetadata } from "../../lib/core/zip-size-calculator.js";

const TEXT_CONTENT_SMALL = "Hello, World!";
const TEXT_CONTENT_LARGE = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(1000);
const FILENAME_FILE = "test-file.txt";
const FILENAME_DIR = "test-directory/";
const FILENAME_NESTED = "test-directory/nested-file.txt";

export { test };

async function test() {
    zip.configure({ chunkSize: 128, useWebWorkers: false });
    
    console.log("Testing calculateZipStreamSize function with Zip64 support...");
    
    // Test 1: Simple file without zip64
    await testSimpleFile();
    
    // Test 2: Directory without zip64  
    await testDirectory();
    
    // Test 3: Mixed content without zip64
    await testMixedContent();
    
    // Test 4: Force zip64 for small files
    await testForceZip64();
    
    // Test 5: Large file requiring zip64
    await testLargeFile();
    
    // Test 6: Multiple entries with zip64
    await testMultipleEntriesZip64();
    
    // Test 7: Practical EntryMetaData usage pattern
    await testEntryMetaDataPattern();
    
    console.log("All calculateZipStreamSize tests passed!");
}

async function testSimpleFile() {
    console.log("Test 1: Simple file without zip64");
    
    const entries = [{
        filename: FILENAME_FILE,
        size: TEXT_CONTENT_SMALL.length,
        uncompressedSize: TEXT_CONTENT_SMALL.length,
        compressedSize: TEXT_CONTENT_SMALL.length, // No compression for test
        directory: false,
        zip64: false
    }];
    
    const expectedSize = calculateZipStreamSize(entries, { zip64: false });
    
    // Create actual zip
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { level: 0 }); // No compression
    await zipWriter.add(FILENAME_FILE, new zip.TextReader(TEXT_CONTENT_SMALL));
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    console.log(`Expected: ${expectedSize}, Actual: ${actualSize}`);
    assertSizeMatch(expectedSize, actualSize, "Simple file");
}

async function testDirectory() {
    console.log("Test 2: Directory without zip64");
    
    const entries = [{
        filename: FILENAME_DIR,
        size: 0,
        uncompressedSize: 0,
        compressedSize: 0,
        directory: true,
        zip64: false
    }];
    
    const expectedSize = calculateZipStreamSize(entries, { zip64: false });
    
    // Create actual zip
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter);
    await zipWriter.add(FILENAME_DIR, null, { directory: true });
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    console.log(`Expected: ${expectedSize}, Actual: ${actualSize}`);
    assertSizeMatch(expectedSize, actualSize, "Directory");
}

async function testMixedContent() {
    console.log("Test 3: Mixed content without zip64");
    
    const entries = [
        {
            filename: FILENAME_DIR,
            size: 0,
            uncompressedSize: 0,
            compressedSize: 0,
            directory: true,
            zip64: false
        },
        {
            filename: FILENAME_NESTED,
            size: TEXT_CONTENT_SMALL.length,
            uncompressedSize: TEXT_CONTENT_SMALL.length,
            compressedSize: TEXT_CONTENT_SMALL.length,
            directory: false,
            zip64: false
        }
    ];
    
    const expectedSize = calculateZipStreamSize(entries, { zip64: false });
    
    // Create actual zip
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { level: 0 });
    await zipWriter.add(FILENAME_DIR, null, { directory: true });
    await zipWriter.add(FILENAME_NESTED, new zip.TextReader(TEXT_CONTENT_SMALL));
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    console.log(`Expected: ${expectedSize}, Actual: ${actualSize}`);
    assertSizeMatch(expectedSize, actualSize, "Mixed content");
}

async function testForceZip64() {
    console.log("Test 4: Force zip64 for small files");
    
    const entries = [{
        filename: FILENAME_FILE,
        size: TEXT_CONTENT_SMALL.length,
        uncompressedSize: TEXT_CONTENT_SMALL.length,
        compressedSize: TEXT_CONTENT_SMALL.length,
        directory: false,
        zip64: true
    }];
    
    const expectedSize = calculateZipStreamSize(entries, { zip64: true });
    
    // Create actual zip with forced zip64
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true, level: 0 });
    await zipWriter.add(FILENAME_FILE, new zip.TextReader(TEXT_CONTENT_SMALL));
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    console.log(`Expected: ${expectedSize}, Actual: ${actualSize}`);
    assertSizeMatch(expectedSize, actualSize, "Force zip64");
}

async function testLargeFile() {
    console.log("Test 5: Large file - using actual compression data");
    
    // First create the zip to get real compression data
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter);
    const entry = await zipWriter.add(FILENAME_FILE, new zip.TextReader(TEXT_CONTENT_LARGE));
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    // Now use the real compression data for our calculation
    const entries = [{
        filename: entry.filename,
        size: entry.uncompressedSize,
        uncompressedSize: entry.uncompressedSize,
        compressedSize: entry.compressedSize, // Use actual compressed size
        directory: entry.directory,
        zip64: entry.zip64
    }];
    
    const expectedSize = calculateZipStreamSize(entries, { zip64: entry.zip64 });
    
    console.log(`Expected: ${expectedSize}, Actual: ${actualSize}`);
    console.log(`Compression ratio: ${(entry.compressedSize / entry.uncompressedSize * 100).toFixed(1)}%`);
    assertSizeMatch(expectedSize, actualSize, "Large file");
}

async function testMultipleEntriesZip64() {
    console.log("Test 6: Multiple entries with zip64 - using actual compression data");
    
    // Create actual zip first to get real compression data
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true });
    
    const entry1 = await zipWriter.add("file1.txt", new zip.TextReader(TEXT_CONTENT_SMALL));
    const entry2 = await zipWriter.add("directory/", null, { directory: true });
    const entry3 = await zipWriter.add("directory/file2.txt", new zip.TextReader(TEXT_CONTENT_LARGE));
    
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    // Use actual compression data for calculation
    const entries = [entry1, entry2, entry3];
    const expectedSize = calculateZipStreamSize(entries, { zip64: true });
    
    console.log(`Expected: ${expectedSize}, Actual: ${actualSize}`);
    console.log(`Entries: ${entries.map(e => `${e.filename}(${e.compressedSize}/${e.uncompressedSize})`).join(', ')}`);
    assertSizeMatch(expectedSize, actualSize, "Multiple entries zip64");
}

async function testEntryMetaDataPattern() {
    console.log("Test 7: Practical EntryMetaData usage pattern");
    
    // Simulate the pattern: const entry:EntryMetaData = await zipWriter.add(entryName, reader, options)
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true });
    
    // Collect entries as they're added
    const entryMetaDataList = [];
    
    // Add first entry
    const reader1 = new zip.TextReader(TEXT_CONTENT_SMALL);
    const entry1 = await zipWriter.add("example.txt", reader1, { comment: "Test file" });
    entryMetaDataList.push(entry1);
    
    // Add directory
    const entry2 = await zipWriter.add("docs/", null, { directory: true });
    entryMetaDataList.push(entry2);
    
    // Add nested file
    const reader3 = new zip.TextReader(TEXT_CONTENT_LARGE);
    const entry3 = await zipWriter.add("docs/readme.txt", reader3);
    entryMetaDataList.push(entry3);
    
    // Calculate expected size using the collected EntryMetaData
    const expectedSize = calculateZipStreamSize(entryMetaDataList, { 
        zip64: true,
        commentSize: 0,
        useDataDescriptor: true,
        splitArchive: false
    });
    
    // Close and get actual size
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    console.log(`Expected: ${expectedSize}, Actual: ${actualSize}`);
    console.log("Entry metadata collected:", entryMetaDataList.map(e => ({
        filename: e.filename,
        size: e.uncompressedSize,
        zip64: e.zip64,
        directory: e.directory
    })));
    
    assertSizeMatch(expectedSize, actualSize, "EntryMetaData pattern");
}

function assertSizeMatch(expected, actual, testName) {
    // ZERO TOLERANCE - exact match required
    const diff = Math.abs(expected - actual);
    
    if (diff !== 0) {
        throw new Error(`${testName}: Size mismatch. Expected: ${expected}, Actual: ${actual}, Diff: ${diff}. ZERO TOLERANCE requires exact match.`);
    }
    
    console.log(`✓ ${testName}: EXACT SIZE MATCH! (${expected} bytes)`);
} 