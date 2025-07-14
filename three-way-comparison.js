import * as zip from './index.js';
import { calculateZipStreamSize as calculateStable } from './lib/core/zip-size-calculator.stable.js';
import { calculateZipStreamSizeAdvanced as calculateAdvanced } from './lib/core/zip-size-calculator.advanced.js';
import { calculateZipStreamSize as calculateBackup } from './lib/core/zip-size-calculator.bkp.js';
import { MAX_32_BITS } from './lib/core/constants.js';

/**
 * Three-way comparison: Backup vs Stable vs Advanced calculators
 * Focuses on cases where they might handle things differently
 */
async function threeWayComparison() {
    console.log('='.repeat(80));
    console.log('THREE-WAY CALCULATOR COMPARISON: BACKUP vs STABLE vs ADVANCED');
    console.log('='.repeat(80));
    console.log();

    const scenarios = [
        {
            name: "UTF-8 Filenames",
            description: "Test filename length calculation differences (char vs byte length)",
            options: {},
            files: [
                { name: "résumé.txt", content: "French filename" },
                { name: "файл.txt", content: "Russian filename" },
                { name: "测试.txt", content: "Chinese filename" },
                { name: "🎯emoji.txt", content: "Emoji filename" }
            ]
        },
        {
            name: "UTF-8 Filenames + Forced Zip64",
            description: "UTF-8 names with zip64 to test local header zip64 field differences",
            options: { zip64: true },
            files: [
                { name: "很长的中文文件名.txt", content: "Long Chinese filename" },
                { name: "файл_с_длинным_именем.txt", content: "Long Russian filename" }
            ]
        },
        {
            name: "Edge Case: First Entry Large",
            description: "Test the '8 bytes less for first entry' logic",
            options: { zip64: true },
            files: [
                { name: "large-first.bin", content: "X".repeat(100000) },
                { name: "small-second.txt", content: "small" }
            ]
        },
        {
            name: "Directory vs File Zip64",
            description: "Test directory vs file handling (12 vs 28 bytes difference)",
            options: { zip64: true },
            files: [
                { name: "directory/", content: null, isDirectory: true },
                { name: "directory/file.txt", content: "content" },
                { name: "another-dir/", content: null, isDirectory: true }
            ]
        },
        {
            name: "LocalDataSize Threshold",
            description: "Test scenario where localDataSize accumulation triggers zip64",
            options: {},
            files: Array.from({ length: 50 }, (_, i) => ({
                name: `large-file-${i}.txt`,
                content: "X".repeat(100000) // Each file ~100KB
            }))
        },
        {
            name: "Mixed LocalDataSize + Force Zip64",
            description: "Combined localDataSize accumulation with forced zip64",
            options: { zip64: true },
            files: Array.from({ length: 20 }, (_, i) => ({
                name: `file-${i}.txt`,
                content: "Y".repeat(50000)
            }))
        },
        {
            name: "Comment Length Edge Case",
            description: "Test comment handling differences",
            options: {},
            files: [
                { name: "commented.txt", content: "file with comment", comment: "This is a comment with special chars: résumé 测试" },
                { name: "no-comment.txt", content: "file without comment" }
            ]
        },
        {
            name: "Long Paths",
            description: "Test very long filename handling",
            options: {},
            files: [
                { 
                    name: "very/long/path/to/深层/directory/structure/with/multiple/levels/and/unicode/测试/file.txt",
                    content: "Deep nested file"
                }
            ]
        }
    ];

    let totalTests = 0;
    let discrepancies = 0;
    const results = [];

    for (const scenario of scenarios) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TEST: ${scenario.name}`);
        console.log(`${scenario.description}`);
        console.log(`Files: ${scenario.files.length}`);
        console.log(`Options: ${JSON.stringify(scenario.options)}`);
        console.log('-'.repeat(60));

        try {
            const result = await runThreeWayComparison(scenario);
            results.push(result);
            totalTests++;
            
            // Check for significant discrepancies between calculators
            const maxDiff = Math.max(
                Math.abs(result.stableSize - result.backupSize),
                Math.abs(result.advancedSize - result.backupSize),
                Math.abs(result.stableSize - result.advancedSize)
            );
            
            if (maxDiff > 100 || result.actualSize === 0) { // Significant difference or error
                discrepancies++;
                console.log('⚠️  SIGNIFICANT DISCREPANCY DETECTED');
            } else {
                console.log('✅ CALCULATORS AGREE (within tolerance)');
            }
        } catch (error) {
            console.error(`❌ ERROR: ${error.message}`);
            results.push({ name: scenario.name, error: error.message });
            totalTests++;
            discrepancies++;
        }
    }

    // Detailed Analysis
    console.log('\n' + '='.repeat(80));
    console.log('DETAILED THREE-WAY ANALYSIS');
    console.log('='.repeat(80));
    
    for (const result of results) {
        if (!result.error) {
            console.log(`\n${result.name}:`);
            console.log(`  Actual:   ${result.actualSize.toLocaleString()} bytes`);
            console.log(`  Backup:   ${result.backupSize.toLocaleString()} bytes (${result.backupDiff >= 0 ? '+' : ''}${result.backupDiff}, ${result.backupAccuracy}%)`);
            console.log(`  Stable:   ${result.stableSize.toLocaleString()} bytes (${result.stableDiff >= 0 ? '+' : ''}${result.stableDiff}, ${result.stableAccuracy}%)`);
            console.log(`  Advanced: ${result.advancedSize.toLocaleString()} bytes (${result.advancedDiff >= 0 ? '+' : ''}${result.advancedDiff}, ${result.advancedAccuracy}%)`);
            
            // Highlight significant differences
            const backupVsStable = Math.abs(result.backupSize - result.stableSize);
            const backupVsAdvanced = Math.abs(result.backupSize - result.advancedSize);
            const stableVsAdvanced = Math.abs(result.stableSize - result.advancedSize);
            
            if (backupVsStable > 10) {
                console.log(`  🔍 Backup vs Stable difference: ${backupVsStable} bytes`);
            }
            if (backupVsAdvanced > 10) {
                console.log(`  🔍 Backup vs Advanced difference: ${backupVsAdvanced} bytes`);
            }
            if (stableVsAdvanced > 10) {
                console.log(`  🔍 Stable vs Advanced difference: ${stableVsAdvanced} bytes`);
            }
            
            console.log(`  Best: ${result.bestCalculator}`);
        }
    }

    // Calculator Performance Summary
    console.log('\n' + '='.repeat(50));
    console.log('CALCULATOR PERFORMANCE SUMMARY');
    console.log('='.repeat(50));
    
    let backupWins = 0, stableWins = 0, advancedWins = 0, ties = 0;
    
    for (const result of results) {
        if (!result.error) {
            switch (result.bestCalculator) {
                case 'Backup': backupWins++; break;
                case 'Stable': stableWins++; break;
                case 'Advanced': advancedWins++; break;
                default: ties++; break;
            }
        }
    }
    
    console.log(`Backup calculator wins: ${backupWins}`);
    console.log(`Stable calculator wins: ${stableWins}`);
    console.log(`Advanced calculator wins: ${advancedWins}`);
    console.log(`Ties: ${ties}`);
    console.log(`\nTotal tests: ${totalTests}`);
    console.log(`Significant discrepancies: ${discrepancies}`);
    
    // Key Differences Analysis
    console.log('\n' + '='.repeat(50));
    console.log('KEY DIFFERENCES IDENTIFIED');
    console.log('='.repeat(50));
    
    const utf8Tests = results.filter(r => r.name.includes('UTF-8'));
    if (utf8Tests.length > 0) {
        console.log('\n📝 UTF-8 Filename Handling:');
        utf8Tests.forEach(test => {
            const backupVsStable = Math.abs(test.backupSize - test.stableSize);
            if (backupVsStable > 0) {
                console.log(`  ${test.name}: ${backupVsStable} byte difference (Backup uses char length, Stable/Advanced use UTF-8 byte length)`);
            }
        });
    }
    
    const zip64Tests = results.filter(r => r.zip64Enabled);
    if (zip64Tests.length > 0) {
        console.log('\n🗜️  Zip64 Handling:');
        zip64Tests.forEach(test => {
            const differences = [];
            if (Math.abs(test.backupSize - test.stableSize) > 10) {
                differences.push(`Backup vs Stable: ${Math.abs(test.backupSize - test.stableSize)} bytes`);
            }
            if (Math.abs(test.backupSize - test.advancedSize) > 10) {
                differences.push(`Backup vs Advanced: ${Math.abs(test.backupSize - test.advancedSize)} bytes`);
            }
            if (differences.length > 0) {
                console.log(`  ${test.name}: ${differences.join(', ')}`);
                console.log(`    Likely cause: Different zip64 extra field handling in local headers`);
            }
        });
    }
    
    // Winner
    if (stableWins >= backupWins && stableWins >= advancedWins) {
        console.log('\n🏆 STABLE calculator performs best overall');
    } else if (backupWins >= stableWins && backupWins >= advancedWins) {
        console.log('\n🏆 BACKUP calculator performs best overall');
    } else {
        console.log('\n🏆 ADVANCED calculator performs best overall');
    }
}

async function runThreeWayComparison(scenario) {
    // Create actual zip file
    const { actualSize, actualEntries, zip64Enabled } = await createTestZip(scenario.files, scenario.options);
    
    // Calculate using all three methods
    const backupSize = calculateBackup(actualEntries, scenario.options);
    const stableSize = calculateStable(actualEntries, scenario.options);
    const advancedSize = calculateAdvanced(actualEntries, scenario.options);
    
    // Calculate differences and accuracy
    const backupDiff = backupSize - actualSize;
    const stableDiff = stableSize - actualSize;
    const advancedDiff = advancedSize - actualSize;
    
    const backupAccuracy = actualSize > 0 ? ((1 - Math.abs(backupDiff) / actualSize) * 100).toFixed(2) : '0.00';
    const stableAccuracy = actualSize > 0 ? ((1 - Math.abs(stableDiff) / actualSize) * 100).toFixed(2) : '0.00';
    const advancedAccuracy = actualSize > 0 ? ((1 - Math.abs(advancedDiff) / actualSize) * 100).toFixed(2) : '0.00';
    
    // Determine best calculator
    const errors = [
        { name: 'Backup', error: Math.abs(backupDiff) },
        { name: 'Stable', error: Math.abs(stableDiff) },
        { name: 'Advanced', error: Math.abs(advancedDiff) }
    ];
    
    errors.sort((a, b) => a.error - b.error);
    const bestCalculator = errors[0].name;
    
    // Display results
    console.log(`Actual size:    ${actualSize.toLocaleString()} bytes`);
    console.log(`Zip64 enabled:  ${zip64Enabled}`);
    console.log(`Backup calc:    ${backupSize.toLocaleString()} bytes (${backupDiff >= 0 ? '+' : ''}${backupDiff}, ${backupAccuracy}% accurate)`);
    console.log(`Stable calc:    ${stableSize.toLocaleString()} bytes (${stableDiff >= 0 ? '+' : ''}${stableDiff}, ${stableAccuracy}% accurate)`);
    console.log(`Advanced calc:  ${advancedSize.toLocaleString()} bytes (${advancedDiff >= 0 ? '+' : ''}${advancedDiff}, ${advancedAccuracy}% accurate)`);
    console.log(`Best calculator: ${bestCalculator}`);
    
    // Show sample entries with special focus on UTF-8 names
    console.log(`\nSample entries:`);
    for (let i = 0; i < Math.min(3, actualEntries.length); i++) {
        const entry = actualEntries[i];
        const filename = entry.filename;
        const charLength = filename.length;
        const byteLength = new TextEncoder().encode(filename).length;
        const lengthNote = charLength !== byteLength ? ` (${charLength} chars, ${byteLength} bytes)` : '';
        console.log(`  ${filename}${lengthNote}: ${entry.uncompressedSize} → ${entry.compressedSize} bytes (zip64: ${entry.zip64})`);
    }
    if (actualEntries.length > 3) {
        console.log(`  ... and ${actualEntries.length - 3} more entries`);
    }
    
    return {
        name: scenario.name,
        actualSize,
        zip64Enabled,
        backupSize,
        stableSize,
        advancedSize,
        backupDiff,
        stableDiff,
        advancedDiff,
        backupAccuracy: parseFloat(backupAccuracy),
        stableAccuracy: parseFloat(stableAccuracy),
        advancedAccuracy: parseFloat(advancedAccuracy),
        bestCalculator
    };
}

async function createTestZip(files, options = {}) {
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriterOptions = { 
        level: 6,
        keepOrder: true,
        ...options
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
            const addOptions = {};
            if (file.comment) {
                addOptions.comment = file.comment;
            }
            entry = await zipWriter.add(file.name, reader, addOptions);
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
            comment: entry.comment || ''
        });
    }
    
    await zipWriter.close();
    const zipBlob = await blobWriter.getData();
    const actualSize = zipBlob.size;
    
    return { actualSize, actualEntries, zip64Enabled };
}

// Run the three-way comparison
threeWayComparison().catch(console.error); 