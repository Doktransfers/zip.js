import * as zip from './index.js';

/**
 * Analyze the exact content of the file data section
 */
async function analyzeFileData() {
    console.log('=== FILE DATA SECTION ANALYSIS ===\n');
    
    const text = "Hello, World!";
    const filename = "test.txt";
    
    // Create actual zip and analyze it
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { level: 0 }); // No compression
    const entry = await zipWriter.add(filename, new zip.TextReader(text));
    await zipWriter.close();
    
    const zipBlob = await blobWriter.getData();
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    
    console.log('=== METADATA ===');
    console.log(`Original text: "${text}" (${text.length} bytes)`);
    console.log(`Compressed size: ${entry.compressedSize} bytes`);
    console.log(`Uncompressed size: ${entry.uncompressedSize} bytes`);
    console.log(`Total zip size: ${zipBytes.length} bytes`);
    console.log('');
    
    // Find the local file header and parse it
    const localHeaderEnd = findLocalHeaderEnd(zipBytes);
    const fileDataStart = localHeaderEnd;
    
    // Find where file data ends (next signature or central directory)
    let fileDataEnd = fileDataStart;
    for (let i = fileDataStart; i < zipBytes.length - 4; i++) {
        const sig = readUint32LE(zipBytes, i);
        if (sig === 0x08074b50 || sig === 0x02014b50 || sig === 0x06054b50) {
            fileDataEnd = i;
            break;
        }
    }
    
    const fileDataLength = fileDataEnd - fileDataStart;
    console.log(`=== FILE DATA SECTION ===`);
    console.log(`Location: bytes ${fileDataStart} to ${fileDataEnd - 1}`);
    console.log(`Total length: ${fileDataLength} bytes`);
    console.log('');
    
    // Extract and analyze the file data
    const fileData = zipBytes.slice(fileDataStart, fileDataEnd);
    console.log('=== FILE DATA CONTENT ===');
    console.log('Hex dump:');
    printHexDump(fileData);
    console.log('');
    
    // Try to decode as text to see if it's the original data
    try {
        const decoded = new TextDecoder().decode(fileData.slice(0, Math.min(fileData.length, 50)));
        console.log(`As text (first 50 bytes): "${decoded}"`);
    } catch (e) {
        console.log('Cannot decode as text (binary data)');
    }
    console.log('');
    
    // Check if there's a data descriptor after the file data
    console.log('=== CHECKING FOR DATA DESCRIPTOR ===');
    if (fileDataEnd < zipBytes.length - 4) {
        const possibleSig = readUint32LE(zipBytes, fileDataEnd);
        if (possibleSig === 0x08074b50) {
            console.log(`✓ Data descriptor found at byte ${fileDataEnd}`);
            console.log('Data descriptor content:');
            printHexDump(zipBytes.slice(fileDataEnd, fileDataEnd + 16));
            
            const crc32 = readUint32LE(zipBytes, fileDataEnd + 4);
            const compressedSize = readUint32LE(zipBytes, fileDataEnd + 8);
            const uncompressedSize = readUint32LE(zipBytes, fileDataEnd + 12);
            
            console.log(`   CRC32: 0x${crc32.toString(16)}`);
            console.log(`   Compressed size: ${compressedSize}`);
            console.log(`   Uncompressed size: ${uncompressedSize}`);
        } else {
            console.log(`✗ No data descriptor found (next signature: 0x${possibleSig.toString(16)})`);
        }
    }
    console.log('');
    
    // Calculate what we expect vs what we got
    console.log('=== ANALYSIS ===');
    console.log(`Expected compressed data: ${entry.compressedSize} bytes`);
    console.log(`Expected data descriptor: 16 bytes`);
    console.log(`Expected total: ${entry.compressedSize + 16} bytes`);
    console.log(`Actual file data section: ${fileDataLength} bytes`);
    console.log(`Difference: ${fileDataLength - (entry.compressedSize + 16)} bytes`);
}

function findLocalHeaderEnd(zipBytes) {
    // Local header is 30 bytes base
    let offset = 30 - 4; // Skip to filename length (26 bytes from start)
    const filenameLength = readUint16LE(zipBytes, offset);
    const extraFieldLength = readUint16LE(zipBytes, offset + 2);
    
    return 30 + filenameLength + extraFieldLength;
}

function printHexDump(bytes) {
    for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        const hex = Array.from(chunk)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
        const ascii = Array.from(chunk)
            .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
            .join('');
        
        const offset = i.toString(16).padStart(4, '0');
        console.log(`${offset}: ${hex.padEnd(48)} |${ascii}|`);
    }
}

function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

analyzeFileData().catch(console.error); 