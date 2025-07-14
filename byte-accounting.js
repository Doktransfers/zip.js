import * as zip from './index.js';

/**
 * Precise byte-by-byte accounting for zip64
 */
async function byteAccounting() {
    console.log('=== PRECISE BYTE-BY-BYTE ACCOUNTING ===\n');
    
    const text = "Hello, World!";
    const filename = "test.txt";
    
    // Create zip64 zip and analyze it
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true, level: 0 });
    const entry = await zipWriter.add(filename, new zip.TextReader(text));
    await zipWriter.close();
    
    const zipBlob = await blobWriter.getData();
    const actualSize = zipBlob.size;
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    
    console.log(`Total zip size: ${actualSize} bytes`);
    console.log(`File content: "${text}" (${text.length} bytes)`);
    console.log(`Compressed: ${entry.compressedSize} bytes`);
    console.log('');
    
    // Account for every single byte
    let currentOffset = 0;
    let totalAccounted = 0;
    
    // 1. Local file header
    console.log('=== 1. LOCAL FILE HEADER ===');
    const localHeaderStart = currentOffset;
    
    // Parse local header
    const filenameLength = readUint16LE(zipBytes, 26);
    const extraFieldLength = readUint16LE(zipBytes, 28);
    const localHeaderSize = 30 + filenameLength + extraFieldLength;
    
    console.log(`Offset ${currentOffset}: Local file header`);
    console.log(`  - Base header: 30 bytes`);
    console.log(`  - Filename: ${filenameLength} bytes`);
    console.log(`  - Extra field: ${extraFieldLength} bytes`);
    console.log(`  - Total: ${localHeaderSize} bytes`);
    
    currentOffset += localHeaderSize;
    totalAccounted += localHeaderSize;
    
    // 2. File data section (find next signature)
    console.log('\n=== 2. FILE DATA SECTION ===');
    const fileDataStart = currentOffset;
    let fileDataEnd = currentOffset;
    
    // Find next signature
    for (let i = currentOffset; i < zipBytes.length - 4; i++) {
        const sig = readUint32LE(zipBytes, i);
        if (sig === 0x02014b50 || sig === 0x08074b50 || sig === 0x06054b50 || sig === 0x06064b50) {
            fileDataEnd = i;
            break;
        }
    }
    
    const fileDataSize = fileDataEnd - fileDataStart;
    console.log(`Offset ${currentOffset}: File data section`);
    console.log(`  - Size: ${fileDataSize} bytes`);
    console.log(`  - Expected compressed data: ${entry.compressedSize} bytes`);
    console.log(`  - Expected data descriptor: 12 bytes`);
    console.log(`  - Expected total: ${entry.compressedSize + 12} bytes`);
    console.log(`  - Actual: ${fileDataSize} bytes`);
    console.log(`  - Difference: ${fileDataSize - (entry.compressedSize + 12)} bytes`);
    
    // Analyze the file data content
    console.log('  - Content analysis:');
    const fileData = zipBytes.slice(fileDataStart, fileDataEnd);
    const actualFileContent = fileData.slice(0, entry.compressedSize);
    const dataDescriptor = fileData.slice(entry.compressedSize);
    
    console.log(`    File content (${actualFileContent.length} bytes): "${new TextDecoder().decode(actualFileContent)}"`);
    console.log(`    Data descriptor (${dataDescriptor.length} bytes): ${Array.from(dataDescriptor).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    currentOffset = fileDataEnd;
    totalAccounted += fileDataSize;
    
    // 3. Central directory header
    console.log('\n=== 3. CENTRAL DIRECTORY HEADER ===');
    const centralStart = currentOffset;
    
    // Parse central directory header
    const centralFilenameLength = readUint16LE(zipBytes, currentOffset + 28);
    const centralExtraFieldLength = readUint16LE(zipBytes, currentOffset + 30);
    const centralCommentLength = readUint16LE(zipBytes, currentOffset + 32);
    const centralHeaderSize = 46 + centralFilenameLength + centralExtraFieldLength + centralCommentLength;
    
    console.log(`Offset ${currentOffset}: Central directory header`);
    console.log(`  - Base header: 46 bytes`);
    console.log(`  - Filename: ${centralFilenameLength} bytes`);
    console.log(`  - Extra field: ${centralExtraFieldLength} bytes`);
    console.log(`  - Comment: ${centralCommentLength} bytes`);
    console.log(`  - Total: ${centralHeaderSize} bytes`);
    
    currentOffset += centralHeaderSize;
    totalAccounted += centralHeaderSize;
    
    // 4. Rest of the structures
    console.log('\n=== 4. END STRUCTURES ===');
    while (currentOffset < zipBytes.length - 4) {
        const sig = readUint32LE(zipBytes, currentOffset);
        
        if (sig === 0x06064b50) { // Zip64 end of central directory
            const recordSize = readUint64LE(zipBytes, currentOffset + 4);
            const totalSize = 12 + Number(recordSize);
            console.log(`Offset ${currentOffset}: Zip64 end of central directory (${totalSize} bytes)`);
            currentOffset += totalSize;
            totalAccounted += totalSize;
        } else if (sig === 0x07064b50) { // Zip64 locator
            console.log(`Offset ${currentOffset}: Zip64 locator (20 bytes)`);
            currentOffset += 20;
            totalAccounted += 20;
        } else if (sig === 0x06054b50) { // Regular end of central directory
            const commentLength = readUint16LE(zipBytes, currentOffset + 20);
            const totalSize = 22 + commentLength;
            console.log(`Offset ${currentOffset}: End of central directory (${totalSize} bytes)`);
            currentOffset += totalSize;
            totalAccounted += totalSize;
        } else {
            console.log(`Offset ${currentOffset}: Unknown byte 0x${zipBytes[currentOffset].toString(16)}`);
            currentOffset++;
            totalAccounted++;
        }
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total accounted: ${totalAccounted} bytes`);
    console.log(`Actual zip size: ${actualSize} bytes`);
    console.log(`Difference: ${actualSize - totalAccounted} bytes`);
    
    if (currentOffset < zipBytes.length) {
        console.log(`Remaining bytes: ${zipBytes.length - currentOffset}`);
        console.log('Remaining content:', Array.from(zipBytes.slice(currentOffset)).map(b => b.toString(16).padStart(2, '0')).join(' '));
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

byteAccounting().catch(console.error); 