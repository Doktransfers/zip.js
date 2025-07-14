import * as zip from './index.js';

/**
 * Detailed byte-by-byte analysis of zip file structure
 * This will help us achieve zero tolerance in size calculations
 */
async function analyzeZipByteByByte() {
    console.log('=== DETAILED ZIP BYTE-BY-BYTE ANALYSIS ===\n');
    
    // Test 1: Simple file analysis
    await analyzeSimpleFile();
    
    // Test 2: Directory analysis
    await analyzeDirectory();
    
    // Test 3: Zip64 analysis
    await analyzeZip64();
}

async function analyzeSimpleFile() {
    console.log('--- Simple File Analysis ---');
    
    const text = "Hello, World!";
    const filename = "test.txt";
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter);
    
    const entry = await zipWriter.add(filename, new zip.TextReader(text));
    await zipWriter.close();
    
    const zipBlob = await blobWriter.getData();
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    
    console.log('Entry metadata:');
    console.log(`  filename: "${entry.filename}" (${entry.filename.length} bytes)`);
    console.log(`  uncompressed: ${entry.uncompressedSize} bytes`);
    console.log(`  compressed: ${entry.compressedSize} bytes`);
    console.log(`  zip64: ${entry.zip64}`);
    console.log(`  directory: ${entry.directory}`);
    
    console.log(`\nTotal zip size: ${zipBytes.length} bytes`);
    console.log(`Original text: "${text}" (${text.length} bytes)`);
    
    // Parse the zip structure
    parseZipStructure(zipBytes);
}

async function analyzeDirectory() {
    console.log('\n--- Directory Analysis ---');
    
    const dirname = "test-dir/";
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter);
    
    const entry = await zipWriter.add(dirname, null, { directory: true });
    await zipWriter.close();
    
    const zipBlob = await blobWriter.getData();
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    
    console.log('Entry metadata:');
    console.log(`  filename: "${entry.filename}" (${entry.filename.length} bytes)`);
    console.log(`  uncompressed: ${entry.uncompressedSize} bytes`);
    console.log(`  compressed: ${entry.compressedSize} bytes`);
    console.log(`  zip64: ${entry.zip64}`);
    console.log(`  directory: ${entry.directory}`);
    
    console.log(`\nTotal zip size: ${zipBytes.length} bytes`);
    
    // Parse the zip structure
    parseZipStructure(zipBytes);
}

async function analyzeZip64() {
    console.log('\n--- Zip64 Analysis ---');
    
    const text = "Hello, World!";
    const filename = "test.txt";
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true });
    
    const entry = await zipWriter.add(filename, new zip.TextReader(text));
    await zipWriter.close();
    
    const zipBlob = await blobWriter.getData();
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    
    console.log('Entry metadata:');
    console.log(`  filename: "${entry.filename}" (${entry.filename.length} bytes)`);
    console.log(`  uncompressed: ${entry.uncompressedSize} bytes`);
    console.log(`  compressed: ${entry.compressedSize} bytes`);
    console.log(`  zip64: ${entry.zip64}`);
    console.log(`  directory: ${entry.directory}`);
    
    console.log(`\nTotal zip size: ${zipBytes.length} bytes`);
    
    // Parse the zip structure
    parseZipStructure(zipBytes);
}

function parseZipStructure(zipBytes) {
    console.log('\n=== ZIP STRUCTURE BREAKDOWN ===');
    
    let offset = 0;
    const length = zipBytes.length;
    
    // Find local file headers (signature: 0x04034b50)
    const localHeaders = [];
    const centralHeaders = [];
    
    while (offset < length - 4) {
        const signature = readUint32LE(zipBytes, offset);
        
        if (signature === 0x04034b50) { // Local file header
            console.log(`\n📁 LOCAL FILE HEADER at offset ${offset}:`);
            const header = parseLocalFileHeader(zipBytes, offset);
            localHeaders.push(header);
            offset = header.nextOffset;
        } else if (signature === 0x02014b50) { // Central directory header
            console.log(`\n📋 CENTRAL DIRECTORY HEADER at offset ${offset}:`);
            const header = parseCentralDirectoryHeader(zipBytes, offset);
            centralHeaders.push(header);
            offset = header.nextOffset;
        } else if (signature === 0x06054b50) { // End of central directory
            console.log(`\n🏁 END OF CENTRAL DIRECTORY at offset ${offset}:`);
            const header = parseEndOfCentralDirectory(zipBytes, offset);
            offset = header.nextOffset;
        } else if (signature === 0x06064b50) { // Zip64 end of central directory
            console.log(`\n🏁 ZIP64 END OF CENTRAL DIRECTORY at offset ${offset}:`);
            const header = parseZip64EndOfCentralDirectory(zipBytes, offset);
            offset = header.nextOffset;
        } else if (signature === 0x07064b50) { // Zip64 end of central directory locator
            console.log(`\n📍 ZIP64 END OF CENTRAL DIRECTORY LOCATOR at offset ${offset}:`);
            const header = parseZip64EndOfCentralDirectoryLocator(zipBytes, offset);
            offset = header.nextOffset;
        } else {
            offset++;
        }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total size: ${zipBytes.length} bytes`);
    console.log(`Local headers: ${localHeaders.length}`);
    console.log(`Central headers: ${centralHeaders.length}`);
}

function parseLocalFileHeader(bytes, offset) {
    const start = offset;
    
    console.log(`  Signature: 0x${readUint32LE(bytes, offset).toString(16)} (4 bytes)`);
    offset += 4;
    
    const version = readUint16LE(bytes, offset);
    console.log(`  Version: ${version} (2 bytes)`);
    offset += 2;
    
    const flags = readUint16LE(bytes, offset);
    console.log(`  Flags: 0x${flags.toString(16)} (2 bytes)`);
    offset += 2;
    
    const compression = readUint16LE(bytes, offset);
    console.log(`  Compression: ${compression} (2 bytes)`);
    offset += 2;
    
    const time = readUint16LE(bytes, offset);
    const date = readUint16LE(bytes, offset + 2);
    console.log(`  Time/Date: ${time}/${date} (4 bytes)`);
    offset += 4;
    
    const crc32 = readUint32LE(bytes, offset);
    console.log(`  CRC32: 0x${crc32.toString(16)} (4 bytes)`);
    offset += 4;
    
    const compressedSize = readUint32LE(bytes, offset);
    console.log(`  Compressed size: ${compressedSize} (4 bytes)`);
    offset += 4;
    
    const uncompressedSize = readUint32LE(bytes, offset);
    console.log(`  Uncompressed size: ${uncompressedSize} (4 bytes)`);
    offset += 4;
    
    const filenameLength = readUint16LE(bytes, offset);
    console.log(`  Filename length: ${filenameLength} (2 bytes)`);
    offset += 2;
    
    const extraFieldLength = readUint16LE(bytes, offset);
    console.log(`  Extra field length: ${extraFieldLength} (2 bytes)`);
    offset += 2;
    
    const filename = new TextDecoder().decode(bytes.slice(offset, offset + filenameLength));
    console.log(`  Filename: "${filename}" (${filenameLength} bytes)`);
    offset += filenameLength;
    
    if (extraFieldLength > 0) {
        console.log(`  Extra field: ${extraFieldLength} bytes`);
        parseExtraField(bytes.slice(offset, offset + extraFieldLength));
        offset += extraFieldLength;
    }
    
    console.log(`  📏 Local header total: ${offset - start} bytes`);
    
    // Skip file data
    offset += compressedSize;
    
    // Check for data descriptor
    if (flags & 0x08) {
        console.log(`  📝 Data descriptor: 16 bytes`);
        offset += 16;
    }
    
    return { nextOffset: offset, size: offset - start + compressedSize };
}

function parseCentralDirectoryHeader(bytes, offset) {
    const start = offset;
    
    console.log(`  Signature: 0x${readUint32LE(bytes, offset).toString(16)} (4 bytes)`);
    offset += 4;
    
    // Skip most fields for brevity, just get sizes
    offset += 42; // Skip to filename length
    
    const filenameLength = readUint16LE(bytes, offset);
    const extraFieldLength = readUint16LE(bytes, offset + 2);
    const commentLength = readUint16LE(bytes, offset + 4);
    
    console.log(`  Filename length: ${filenameLength} (2 bytes)`);
    console.log(`  Extra field length: ${extraFieldLength} (2 bytes)`);
    console.log(`  Comment length: ${commentLength} (2 bytes)`);
    
    offset += 6; // Skip length fields
    offset += 12; // Skip remaining fixed fields
    
    offset += filenameLength + extraFieldLength + commentLength;
    
    console.log(`  📏 Central directory entry total: ${offset - start} bytes`);
    
    return { nextOffset: offset, size: offset - start };
}

function parseEndOfCentralDirectory(bytes, offset) {
    const start = offset;
    
    console.log(`  Signature: 0x${readUint32LE(bytes, offset).toString(16)} (4 bytes)`);
    offset += 4;
    
    // Skip to comment length
    offset += 16;
    
    const commentLength = readUint16LE(bytes, offset);
    console.log(`  Comment length: ${commentLength} (2 bytes)`);
    offset += 2;
    
    if (commentLength > 0) {
        offset += commentLength;
    }
    
    console.log(`  📏 End of central directory total: ${offset - start} bytes`);
    
    return { nextOffset: offset, size: offset - start };
}

function parseZip64EndOfCentralDirectory(bytes, offset) {
    const start = offset;
    
    console.log(`  Signature: 0x${readUint32LE(bytes, offset).toString(16)} (4 bytes)`);
    offset += 4;
    
    const recordSize = readUint64LE(bytes, offset);
    console.log(`  Record size: ${recordSize} (8 bytes)`);
    offset += 8;
    
    // Skip the rest of the structure
    offset += Number(recordSize);
    
    console.log(`  📏 Zip64 end of central directory total: ${offset - start} bytes`);
    
    return { nextOffset: offset, size: offset - start };
}

function parseZip64EndOfCentralDirectoryLocator(bytes, offset) {
    const start = offset;
    
    console.log(`  Signature: 0x${readUint32LE(bytes, offset).toString(16)} (4 bytes)`);
    offset += 20; // Fixed size structure
    
    console.log(`  📏 Zip64 locator total: ${offset - start} bytes`);
    
    return { nextOffset: offset, size: offset - start };
}

function parseExtraField(extraFieldBytes) {
    let offset = 0;
    while (offset < extraFieldBytes.length) {
        if (offset + 4 > extraFieldBytes.length) break;
        
        const type = readUint16LE(extraFieldBytes, offset);
        const size = readUint16LE(extraFieldBytes, offset + 2);
        
        console.log(`    Extra field type: 0x${type.toString(16)}, size: ${size}`);
        
        offset += 4 + size;
    }
}

function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function readUint64LE(bytes, offset) {
    const low = readUint32LE(bytes, offset);
    const high = readUint32LE(bytes, offset + 4);
    return low + (high * 0x100000000);
}

analyzeZipByteByByte().catch(console.error); 