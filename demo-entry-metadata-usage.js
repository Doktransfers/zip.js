import * as zip from './index.js';
import { calculateZipStreamSize } from './lib/core/zip-size-calculator.js';

/**
 * Practical demonstration of calculateZipStreamSize with EntryMetaData
 * 
 * This shows the pattern mentioned in your query:
 * const entry:EntryMetaData = await zipWriter.add(entryName, reader, options)
 */
async function demonstrateEntryMetaDataPattern() {
    console.log('=== EntryMetaData Pattern Demonstration ===\n');
    
    // Create zipWriter
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true });
    
    // Collect entry metadata as we add files
    const entryMetaDataList = [];
    
    console.log('Adding entries and collecting metadata...\n');
    
    // Add first file
    console.log('1. Adding small text file...');
    const entry1 = await zipWriter.add("readme.txt", new zip.TextReader("Hello, World!"), {
        comment: "A simple readme file"
    });
    entryMetaDataList.push(entry1);
    console.log('   Entry added:', {
        filename: entry1.filename,
        uncompressedSize: entry1.uncompressedSize,
        compressedSize: entry1.compressedSize,
        zip64: entry1.zip64,
        directory: entry1.directory
    });
    
    // Add directory
    console.log('2. Adding directory...');
    const entry2 = await zipWriter.add("docs/", null, { directory: true });
    entryMetaDataList.push(entry2);
    console.log('   Entry added:', {
        filename: entry2.filename,
        uncompressedSize: entry2.uncompressedSize,
        compressedSize: entry2.compressedSize,
        zip64: entry2.zip64,
        directory: entry2.directory
    });
    
    // Add larger file
    console.log('3. Adding larger text file...');
    const largeContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(100);
    const entry3 = await zipWriter.add("docs/large-file.txt", new zip.TextReader(largeContent));
    entryMetaDataList.push(entry3);
    console.log('   Entry added:', {
        filename: entry3.filename,
        uncompressedSize: entry3.uncompressedSize,
        compressedSize: entry3.compressedSize,
        zip64: entry3.zip64,
        directory: entry3.directory
    });
    
    // Calculate expected size before closing
    console.log('\n=== Size Calculation ===');
    const expectedSize = calculateZipStreamSize(entryMetaDataList, {
        zip64: true,
        commentSize: 0,
        useDataDescriptor: true,
        splitArchive: false
    });
    console.log('Expected zip size (calculated):', expectedSize, 'bytes');
    
    // Close the zip and get actual size
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    console.log('Actual zip size:', actualSize, 'bytes');
    console.log('Difference:', Math.abs(expectedSize - actualSize), 'bytes');
    console.log('Accuracy:', (100 - Math.abs(expectedSize - actualSize) / actualSize * 100).toFixed(1) + '%');
    
    // Verify the zip is valid by reading it back
    console.log('\n=== Verification ===');
    const zipReader = new zip.ZipReader(new zip.BlobReader(actualBlob));
    const entries = await zipReader.getEntries();
    console.log('Successfully read back', entries.length, 'entries:');
    entries.forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.filename} (${entry.uncompressedSize} bytes, zip64: ${entry.zip64})`);
    });
    await zipReader.close();
    
    return {
        entryMetaDataList,
        expectedSize,
        actualSize,
        accuracy: 100 - Math.abs(expectedSize - actualSize) / actualSize * 100
    };
}

/**
 * Show progressive size calculation
 * This demonstrates how you might track the growing zip size as you add entries
 */
async function demonstrateProgressiveCalculation() {
    console.log('\n\n=== Progressive Size Calculation ===\n');
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter);
    const entryMetaDataList = [];
    
    console.log('Adding entries one by one and calculating cumulative size...\n');
    
    // Add entries progressively
    const filesToAdd = [
        { name: "file1.txt", content: "Small file 1" },
        { name: "file2.txt", content: "Another small file" },
        { name: "data/", content: null, directory: true },
        { name: "data/large.txt", content: "Large content here. ".repeat(50) }
    ];
    
    for (let i = 0; i < filesToAdd.length; i++) {
        const fileData = filesToAdd[i];
        let entry;
        
        if (fileData.directory) {
            entry = await zipWriter.add(fileData.name, null, { directory: true });
        } else {
            entry = await zipWriter.add(fileData.name, new zip.TextReader(fileData.content));
        }
        
        entryMetaDataList.push(entry);
        
        // Calculate current expected size
        const currentExpectedSize = calculateZipStreamSize(entryMetaDataList, {
            zip64: false,
            commentSize: 0
        });
        
        console.log(`After adding "${fileData.name}": expected size = ${currentExpectedSize} bytes`);
    }
    
    // Final comparison
    await zipWriter.close();
    const finalBlob = await blobWriter.getData();
    const finalActualSize = finalBlob.size;
    
    const finalExpectedSize = calculateZipStreamSize(entryMetaDataList, {
        zip64: false,
        commentSize: 0
    });
    
    console.log(`\nFinal: Expected = ${finalExpectedSize}, Actual = ${finalActualSize}, Diff = ${Math.abs(finalExpectedSize - finalActualSize)}`);
    
    return {
        entryMetaDataList,
        finalExpectedSize,
        finalActualSize
    };
}

// Run the demonstrations
async function main() {
    try {
        await demonstrateEntryMetaDataPattern();
        await demonstrateProgressiveCalculation();
        console.log('\n✅ All demonstrations completed successfully!');
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main(); 