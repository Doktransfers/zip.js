import * as zip from './index.js';
import { calculateZipStreamSize } from './lib/core/zip-size-calculator.js';

/**
 * Analyze zip64 structure to fix the 8-byte difference
 */
async function analyzeZip64() {
    console.log('=== ZIP64 ANALYSIS ===\n');
    
    const text = "Hello, World!";
    const filename = "test.txt";
    
    // Create zip64 zip and analyze it
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true, level: 0 }); // Force zip64
    const entry = await zipWriter.add(filename, new zip.TextReader(text));
    await zipWriter.close();
    
    const zipBlob = await blobWriter.getData();
    const actualSize = zipBlob.size;
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    
    // Calculate expected size using our function
    const entries = [{
        filename: entry.filename,
        size: entry.uncompressedSize,
        uncompressedSize: entry.uncompressedSize,
        compressedSize: entry.compressedSize,
        directory: entry.directory,
        zip64: entry.zip64
    }];
    
    const calculatedSize = calculateZipStreamSize(entries, { zip64: true });
    
    console.log('=== SIZE COMPARISON ===');
    console.log(`📊 Calculated: ${calculatedSize} bytes`);
    console.log(`🎯 Actual: ${actualSize} bytes`);
    console.log(`📏 Difference: ${actualSize - calculatedSize} bytes`);
    console.log('');
    
    console.log('=== ENTRY METADATA ===');
    console.log(`Filename: "${entry.filename}" (${entry.filename.length} bytes)`);
    console.log(`Uncompressed: ${entry.uncompressedSize} bytes`);
    console.log(`Compressed: ${entry.compressedSize} bytes`);
    console.log(`Zip64: ${entry.zip64}`);
    console.log(`Directory: ${entry.directory}`);
    console.log('');
    
    // Parse actual zip64 structure
    console.log('=== ACTUAL ZIP64 STRUCTURE ===');
    analyzeActualZip64Structure(zipBytes);
    console.log('');
    
    // Compare with our calculation assumptions
    console.log('=== CALCULATED ASSUMPTIONS ===');
    console.log('Local header extra field:');
    console.log('  - Extended timestamp: 9 bytes');
    console.log('  - NTFS timestamp: 36 bytes');
    console.log('  - Zip64 extra field: 4 + 20 bytes (28 - 8 for first entry)');
    console.log('  - Total: 9 + 36 + 24 = 69 bytes');
    console.log('');
    console.log('Central directory extra field:');
    console.log('  - Extended timestamp: 9 bytes');
    console.log('  - NTFS timestamp: 36 bytes');
    console.log('  - Zip64 extra field: 4 + 20 bytes (28 - 8 for first entry)');
    console.log('  - Total: 9 + 36 + 24 = 69 bytes');
}

function analyzeActualZip64Structure(zipBytes) {
    let offset = 0;
    const length = zipBytes.length;
    
    while (offset < length - 4) {
        const signature = readUint32LE(zipBytes, offset);
        
        if (signature === 0x04034b50) { // Local file header
            console.log(`📁 LOCAL FILE HEADER at offset ${offset}:`);
            const info = parseLocalHeader(zipBytes, offset);
            console.log(`   Header size: ${info.headerSize} bytes`);
            console.log(`   Extra field size: ${info.extraFieldSize} bytes`);
            if (info.extraFieldSize > 0) {
                console.log('   Extra field breakdown:');
                parseExtraField(zipBytes.slice(offset + 30 + info.filenameLength, offset + 30 + info.filenameLength + info.extraFieldSize), '     ');
            }
            offset += info.headerSize;
            
            // Skip file data and data descriptor
            offset += info.compressedSize + 12; // Data descriptor without signature
            
        } else if (signature === 0x02014b50) { // Central directory header
            console.log(`📋 CENTRAL DIRECTORY HEADER at offset ${offset}:`);
            const info = parseCentralHeader(zipBytes, offset);
            console.log(`   Header size: ${info.headerSize} bytes`);
            console.log(`   Extra field size: ${info.extraFieldSize} bytes`);
            if (info.extraFieldSize > 0) {
                console.log('   Extra field breakdown:');
                parseExtraField(zipBytes.slice(offset + 46 + info.filenameLength, offset + 46 + info.filenameLength + info.extraFieldSize), '     ');
            }
            offset += info.headerSize;
            
        } else if (signature === 0x06064b50) { // Zip64 end of central directory
            console.log(`🏁 ZIP64 END OF CENTRAL DIRECTORY at offset ${offset}:`);
            const recordSize = readUint64LE(zipBytes, offset + 4);
            console.log(`   Record size: ${recordSize} bytes`);
            console.log(`   Total structure size: ${12 + recordSize} bytes`);
            offset += 12 + Number(recordSize);
            
        } else if (signature === 0x07064b50) { // Zip64 end of central directory locator
            console.log(`📍 ZIP64 END OF CENTRAL DIRECTORY LOCATOR at offset ${offset}:`);
            console.log(`   Size: 20 bytes`);
            offset += 20;
            
        } else if (signature === 0x06054b50) { // Regular end of central directory
            console.log(`🏁 END OF CENTRAL DIRECTORY at offset ${offset}:`);
            console.log(`   Size: 22 bytes`);
            offset += 22;
            
        } else {
            offset++;
        }
    }
}

function parseLocalHeader(bytes, offset) {
    const start = offset;
    offset += 26; // Skip to filename length
    
    const filenameLength = readUint16LE(bytes, offset);
    const extraFieldLength = readUint16LE(bytes, offset + 2);
    const compressedSize = readUint32LE(bytes, offset - 8); // Go back to compressed size field
    
    return {
        headerSize: 30 + filenameLength + extraFieldLength,
        filenameLength,
        extraFieldSize: extraFieldLength,
        compressedSize
    };
}

function parseCentralHeader(bytes, offset) {
    const start = offset;
    offset += 28; // Skip to filename length
    
    const filenameLength = readUint16LE(bytes, offset);
    const extraFieldLength = readUint16LE(bytes, offset + 2);
    const commentLength = readUint16LE(bytes, offset + 4);
    
    return {
        headerSize: 46 + filenameLength + extraFieldLength + commentLength,
        filenameLength,
        extraFieldSize: extraFieldLength
    };
}

function parseExtraField(extraFieldBytes, indent = '') {
    let offset = 0;
    while (offset < extraFieldBytes.length) {
        if (offset + 4 > extraFieldBytes.length) break;
        
        const type = readUint16LE(extraFieldBytes, offset);
        const size = readUint16LE(extraFieldBytes, offset + 2);
        
        let typeName = 'Unknown';
        if (type === 0x5455) typeName = 'Extended timestamp';
        else if (type === 0x000a) typeName = 'NTFS timestamp';
        else if (type === 0x0001) typeName = 'Zip64 extended info';
        
        console.log(`${indent}Type: 0x${type.toString(16)} (${typeName}), Size: ${size} bytes`);
        
        if (type === 0x0001 && size > 0) {
            // Parse zip64 extra field
            const zip64Data = extraFieldBytes.slice(offset + 4, offset + 4 + size);
            console.log(`${indent}  Zip64 data (${size} bytes):`, Array.from(zip64Data).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
        
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

analyzeZip64().catch(console.error); 