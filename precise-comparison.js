import * as zip from './index.js';
import { calculateZipStreamSize } from './lib/core/zip-size-calculator.stable.js';
import { calculateZipStreamSizeAdvanced } from './lib/core/zip-size-calculator.advanced.js';
import { MAX_32_BITS } from './lib/core/constants.js';

/**
 * Comprehensive comparison between calculated and actual zip sizes
 * Tests both stable and advanced calculators against real zip files
 */
async function preciseComparison() {
    console.log('='.repeat(80));
    console.log('COMPREHENSIVE ZIP SIZE CALCULATOR COMPARISON');
    console.log('='.repeat(80));
    console.log();

    const scenarios = [
        {
            name: "Single Small File",
            description: "Basic scenario with one small text file",
            files: [
                { name: "small.txt", content: "Hello, World! This is a small test file." }
            ]
        },
        {
            name: "Multiple Small Files",
            description: "Several small files to test overhead accumulation",
            files: [
                { name: "file1.txt", content: "Content of file 1" },
                { name: "file2.txt", content: "Content of file 2 is a bit longer than file 1" },
                { name: "file3.txt", content: "File 3 content" },
                { name: "folder/file4.txt", content: "File in subfolder" }
            ]
        },
        {
            name: "Mix with Directory",
            description: "Files and directories to test directory handling",
            files: [
                { name: "readme.txt", content: "This is a readme file" },
                { name: "docs/", content: null, isDirectory: true },
                { name: "docs/manual.txt", content: "User manual content goes here" },
                { name: "src/", content: null, isDirectory: true },
                { name: "src/main.js", content: "console.log('Hello from main.js');" }
            ]
        },
        {
            name: "Medium Files",
            description: "Files of medium size to test compression",
            files: [
                { name: "medium1.txt", content: "A".repeat(10000) },
                { name: "medium2.txt", content: "B".repeat(15000) },
                { name: "data.json", content: JSON.stringify({ data: "X".repeat(5000) }, null, 2) }
            ]
        },
        {
            name: "Large File (No Zip64)",
            description: "Large file that doesn't require zip64",
            files: [
                { name: "large.txt", content: "Large file content. ".repeat(50000) } // ~1MB
            ]
        },
        {
            name: "Very Large File (Zip64)",
            description: "File large enough to potentially trigger zip64",
            files: [
                { name: "huge.bin", content: createLargeContent(MAX_32_BITS / 1000000) } // Simulated large file
            ]
        },
        {
            name: "Many Small Files",
            description: "Large number of small files to test entry count limits",
            files: Array.from({ length: 100 }, (_, i) => ({
                name: `file${i.toString().padStart(3, '0')}.txt`,
                content: `Content of file ${i}`
            }))
        },
        {
            name: "Mixed Sizes",
            description: "Combination of small, medium, and large files",
            files: [
                { name: "tiny.txt", content: "tiny" },
                { name: "small.txt", content: "small content here" },
                { name: "medium.txt", content: "M".repeat(5000) },
                { name: "large.txt", content: "L".repeat(100000) },
                { name: "data/", content: null, isDirectory: true },
                { name: "data/file.bin", content: "D".repeat(50000) }
            ]
        }
    ];

    let totalTests = 0;
    let passedTests = 0;
    const results = [];

    for (const scenario of scenarios) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TEST: ${scenario.name}`);
        console.log(`${scenario.description}`);
        console.log(`Files: ${scenario.files.length}`);
        console.log('-'.repeat(60));

        try {
            const result = await runScenarioComparison(scenario);
            results.push(result);
            totalTests++;
            
            if (result.success) {
                passedTests++;
                console.log('✅ PASS');
            } else {
                console.log('❌ FAIL - Large discrepancy detected');
            }
        } catch (error) {
            console.error(`❌ ERROR: ${error.message}`);
            results.push({ name: scenario.name, error: error.message, success: false });
            totalTests++;
        }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY REPORT');
    console.log('='.repeat(80));
    
    console.log(`\nTotal scenarios tested: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    console.log('\nDETAILED ACCURACY ANALYSIS:');
    console.log('-'.repeat(50));
    
    for (const result of results) {
        if (result.success && !result.error) {
            console.log(`\n${result.name}:`);
            console.log(`  Actual size: ${result.actualSize.toLocaleString()} bytes`);
            console.log(`  Stable calc: ${result.stableSize.toLocaleString()} bytes (${result.stableDiff >= 0 ? '+' : ''}${result.stableDiff} bytes, ${result.stableAccuracy}%)`);
            console.log(`  Advanced calc: ${result.advancedSize.toLocaleString()} bytes (${result.advancedDiff >= 0 ? '+' : ''}${result.advancedDiff} bytes, ${result.advancedAccuracy}%)`);
            console.log(`  Best: ${result.bestCalculator}`);
        }
    }

    if (passedTests === totalTests) {
        console.log('\n🎉 All tests passed! Both calculators are highly accurate.');
    } else {
        console.log('\n⚠️ Some tests failed. Review the results above.');
    }
}

async function runScenarioComparison(scenario) {
    // Create actual zip file
    const { actualSize, actualEntries } = await createActualZip(scenario.files);
    
    // Calculate using both methods
    const stableSize = calculateZipStreamSize(actualEntries);
    const advancedSize = calculateZipStreamSizeAdvanced(actualEntries);
    
    // Calculate differences and accuracy
    const stableDiff = stableSize - actualSize;
    const advancedDiff = advancedSize - actualSize;
    const stableAccuracy = ((1 - Math.abs(stableDiff) / actualSize) * 100).toFixed(2);
    const advancedAccuracy = ((1 - Math.abs(advancedDiff) / actualSize) * 100).toFixed(2);
    
    // Determine best calculator
    const bestCalculator = Math.abs(stableDiff) <= Math.abs(advancedDiff) ? 'Stable' : 'Advanced';
    
    // Display results
    console.log(`Actual size:    ${actualSize.toLocaleString()} bytes`);
    console.log(`Stable calc:    ${stableSize.toLocaleString()} bytes (${stableDiff >= 0 ? '+' : ''}${stableDiff}, ${stableAccuracy}% accurate)`);
    console.log(`Advanced calc:  ${advancedSize.toLocaleString()} bytes (${advancedDiff >= 0 ? '+' : ''}${advancedDiff}, ${advancedAccuracy}% accurate)`);
    console.log(`Best calculator: ${bestCalculator}`);
    
    // Display entry details
    console.log(`\nEntry details:`);
    for (const entry of actualEntries) {
        console.log(`  ${entry.filename}: ${entry.uncompressedSize} → ${entry.compressedSize} bytes (zip64: ${entry.zip64})`);
    }
    
    // Test passes if both calculators are within 5% or 1KB (whichever is larger)
    const tolerance = Math.max(1024, actualSize * 0.05);
    const stablePassed = Math.abs(stableDiff) <= tolerance;
    const advancedPassed = Math.abs(advancedDiff) <= tolerance;
    const success = stablePassed && advancedPassed;
    
    return {
        name: scenario.name,
        actualSize,
        stableSize,
        advancedSize,
        stableDiff,
        advancedDiff,
        stableAccuracy: parseFloat(stableAccuracy),
        advancedAccuracy: parseFloat(advancedAccuracy),
        bestCalculator,
        success
    };
}

async function createActualZip(files) {
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { 
        level: 6, // Use some compression for realism
        keepOrder: true 
    });
    
    const actualEntries = [];
    
    for (const file of files) {
        let entry;
        
        if (file.isDirectory) {
            // Add directory
            entry = await zipWriter.add(file.name, null, { directory: true });
        } else {
            // Add file
            const reader = new zip.TextReader(file.content);
            entry = await zipWriter.add(file.name, reader);
        }
        
        // Store entry metadata for calculation
        actualEntries.push({
            filename: entry.filename,
            size: entry.uncompressedSize,
            uncompressedSize: entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            directory: entry.directory,
            zip64: entry.zip64,
            comment: ''
        });
    }
    
    await zipWriter.close();
    const zipBlob = await blobWriter.getData();
    const actualSize = zipBlob.size;
    
    return { actualSize, actualEntries };
}

function createLargeContent(sizeMB) {
    // Create a large string without actually consuming too much memory
    // We'll simulate this by creating a repeating pattern
    const baseContent = "This is a large file content that repeats. ";
    const targetSize = sizeMB * 1024 * 1024; // Convert MB to bytes
    const repetitions = Math.ceil(targetSize / baseContent.length);
    
    // For very large files, we'll create a smaller representation
    // In a real scenario, you'd use a stream or file reader
    if (sizeMB > 100) {
        return "SIMULATED_LARGE_FILE_" + "X".repeat(Math.min(100000, repetitions));
    }
    
    return baseContent.repeat(repetitions).substring(0, targetSize);
}

// Helper function to analyze zip structure (optional detailed analysis)
function analyzeZipStructure(zipBytes) {
    let offset = 0;
    const structures = [];
    
    while (offset < zipBytes.length - 4) {
        const signature = readUint32LE(zipBytes, offset);
        
        switch (signature) {
            case 0x04034b50: // Local file header
                const localSize = parseLocalHeaderSize(zipBytes, offset);
                structures.push({ type: 'Local Header', offset, size: localSize });
                offset += localSize;
                break;
                
            case 0x08074b50: // Data descriptor
                structures.push({ type: 'Data Descriptor', offset, size: 16 });
                offset += 16;
                break;
                
            case 0x02014b50: // Central directory header
                const centralSize = parseCentralHeaderSize(zipBytes, offset);
                structures.push({ type: 'Central Header', offset, size: centralSize });
                offset += centralSize;
                break;
                
            case 0x06054b50: // End of central directory
                const endSize = parseEndOfCentralDirectorySize(zipBytes, offset);
                structures.push({ type: 'End of Central Dir', offset, size: endSize });
                offset += endSize;
                break;
                
            default:
                // File data or unknown
                offset++;
                break;
        }
    }
    
    return structures;
}

function parseLocalHeaderSize(bytes, offset) {
    const filenameLength = readUint16LE(bytes, offset + 26);
    const extraFieldLength = readUint16LE(bytes, offset + 28);
    return 30 + filenameLength + extraFieldLength;
}

function parseCentralHeaderSize(bytes, offset) {
    const filenameLength = readUint16LE(bytes, offset + 28);
    const extraFieldLength = readUint16LE(bytes, offset + 30);
    const commentLength = readUint16LE(bytes, offset + 32);
    return 46 + filenameLength + extraFieldLength + commentLength;
}

function parseEndOfCentralDirectorySize(bytes, offset) {
    const commentLength = readUint16LE(bytes, offset + 20);
    return 22 + commentLength;
}

function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

// Run the comparison
preciseComparison().catch(console.error); 