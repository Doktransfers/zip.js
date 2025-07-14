import * as zip from './index.js';
import { calculateZipStreamSize } from './lib/core/zip-size-calculator.stable.js';
import { calculateZipStreamSizeAdvanced } from './lib/core/zip-size-calculator.advanced.js';
import { MAX_32_BITS } from './lib/core/constants.js';

/**
 * Focused comparison for zip64 scenarios
 */
async function zip64Comparison() {
    console.log('='.repeat(80));
    console.log('ZIP64 SPECIFIC COMPARISON TEST');
    console.log('='.repeat(80));
    console.log();

    const scenarios = [
        {
            name: "Forced Zip64 - Small Files",
            description: "Force zip64 mode on small files to test precision",
            options: { zip64: true },
            files: [
                { name: "small1.txt", content: "Hello World!" },
                { name: "small2.txt", content: "Another small file content." }
            ]
        },
        {
            name: "Forced Zip64 - Mixed Files",
            description: "Force zip64 with mixed file sizes",
            options: { zip64: true },
            files: [
                { name: "tiny.txt", content: "Hi" },
                { name: "medium.txt", content: "M".repeat(1000) },
                { name: "folder/", content: null, isDirectory: true },
                { name: "folder/file.txt", content: "File in directory" }
            ]
        },
        {
            name: "Large File Count (>1000)",
            description: "Many files to test zip64 entry count handling",
            options: {},
            files: Array.from({ length: 1500 }, (_, i) => ({
                name: `file${i.toString().padStart(4, '0')}.txt`,
                content: `Content of file ${i}`
            }))
        },
        {
            name: "Forced Zip64 - Large File Count",
            description: "Force zip64 with many files",
            options: { zip64: true },
            files: Array.from({ length: 200 }, (_, i) => ({
                name: `item${i}.txt`,
                content: `Data for item ${i}`
            }))
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
        console.log(`Force Zip64: ${scenario.options.zip64 || false}`);
        console.log('-'.repeat(60));

        try {
            const result = await runZip64Comparison(scenario);
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
    console.log('ZIP64 COMPARISON SUMMARY');
    console.log('='.repeat(80));
    
    console.log(`\nTotal zip64 scenarios tested: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    console.log('\nZIP64 ACCURACY ANALYSIS:');
    console.log('-'.repeat(50));
    
    for (const result of results) {
        if (result.success && !result.error) {
            console.log(`\n${result.name}:`);
            console.log(`  Actual size: ${result.actualSize.toLocaleString()} bytes`);
            console.log(`  Zip64 enabled: ${result.zip64Enabled}`);
            console.log(`  Stable calc: ${result.stableSize.toLocaleString()} bytes (${result.stableDiff >= 0 ? '+' : ''}${result.stableDiff} bytes, ${result.stableAccuracy}%)`);
            console.log(`  Advanced calc: ${result.advancedSize.toLocaleString()} bytes (${result.advancedDiff >= 0 ? '+' : ''}${result.advancedDiff} bytes, ${result.advancedAccuracy}%)`);
            console.log(`  Calculator difference: ${Math.abs(result.stableSize - result.advancedSize)} bytes`);
            console.log(`  Best: ${result.bestCalculator}`);
        }
    }

    // Calculator comparison
    console.log('\n' + '='.repeat(50));
    console.log('STABLE vs ADVANCED CALCULATOR COMPARISON');
    console.log('='.repeat(50));
    
    let stableWins = 0;
    let advancedWins = 0;
    let ties = 0;
    
    for (const result of results) {
        if (result.success && !result.error) {
            if (result.bestCalculator === 'Stable') stableWins++;
            else if (result.bestCalculator === 'Advanced') advancedWins++;
            else ties++;
        }
    }
    
    console.log(`Stable calculator wins: ${stableWins}`);
    console.log(`Advanced calculator wins: ${advancedWins}`);
    console.log(`Ties: ${ties}`);
    
    if (stableWins > advancedWins) {
        console.log('\n🏆 Stable calculator is more accurate overall');
    } else if (advancedWins > stableWins) {
        console.log('\n🏆 Advanced calculator is more accurate overall');
    } else {
        console.log('\n🤝 Both calculators perform equally well');
    }
}

async function runZip64Comparison(scenario) {
    // Create actual zip file with specific options
    const { actualSize, actualEntries, zip64Enabled } = await createZip64TestZip(scenario.files, scenario.options);
    
    // Calculate using both methods
    const stableSize = calculateZipStreamSize(actualEntries, scenario.options);
    const advancedSize = calculateZipStreamSizeAdvanced(actualEntries, scenario.options);
    
    // Calculate differences and accuracy
    const stableDiff = stableSize - actualSize;
    const advancedDiff = advancedSize - actualSize;
    const stableAccuracy = ((1 - Math.abs(stableDiff) / actualSize) * 100).toFixed(2);
    const advancedAccuracy = ((1 - Math.abs(advancedDiff) / actualSize) * 100).toFixed(2);
    
    // Determine best calculator
    const bestCalculator = Math.abs(stableDiff) <= Math.abs(advancedDiff) ? 'Stable' : 'Advanced';
    
    // Display results
    console.log(`Actual size:    ${actualSize.toLocaleString()} bytes`);
    console.log(`Zip64 enabled:  ${zip64Enabled}`);
    console.log(`Stable calc:    ${stableSize.toLocaleString()} bytes (${stableDiff >= 0 ? '+' : ''}${stableDiff}, ${stableAccuracy}% accurate)`);
    console.log(`Advanced calc:  ${advancedSize.toLocaleString()} bytes (${advancedDiff >= 0 ? '+' : ''}${advancedDiff}, ${advancedAccuracy}% accurate)`);
    console.log(`Difference:     ${Math.abs(stableSize - advancedSize)} bytes between calculators`);
    console.log(`Best calculator: ${bestCalculator}`);
    
    // Display first few entries to show zip64 usage
    console.log(`\nSample entries (showing first 3):`);
    for (let i = 0; i < Math.min(3, actualEntries.length); i++) {
        const entry = actualEntries[i];
        console.log(`  ${entry.filename}: ${entry.uncompressedSize} → ${entry.compressedSize} bytes (zip64: ${entry.zip64})`);
    }
    if (actualEntries.length > 3) {
        console.log(`  ... and ${actualEntries.length - 3} more entries`);
    }
    
    // Test passes if both calculators are within reasonable bounds
    const tolerance = Math.max(1024, actualSize * 0.05);
    const stablePassed = Math.abs(stableDiff) <= tolerance;
    const advancedPassed = Math.abs(advancedDiff) <= tolerance;
    const success = stablePassed && advancedPassed;
    
    return {
        name: scenario.name,
        actualSize,
        zip64Enabled,
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

async function createZip64TestZip(files, options = {}) {
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriterOptions = { 
        level: 6,
        keepOrder: true,
        ...options // This will include zip64: true if specified
    };
    
    const zipWriter = new zip.ZipWriter(blobWriter, zipWriterOptions);
    
    const actualEntries = [];
    let zip64Enabled = false;
    
    for (const file of files) {
        let entry;
        
        if (file.isDirectory) {
            entry = await zipWriter.add(file.name, null, { directory: true });
        } else {
            const reader = new zip.TextReader(file.content);
            entry = await zipWriter.add(file.name, reader);
        }
        
        if (entry.zip64) {
            zip64Enabled = true;
        }
        
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
    
    return { actualSize, actualEntries, zip64Enabled };
}

// Run the zip64 comparison
zip64Comparison().catch(console.error); 