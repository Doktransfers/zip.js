import * as zip from './index.js';
import { calculateZipStreamSize } from './lib/core/zip-size-calculator.js';

/**
 * Stress test the zero tolerance implementation with challenging scenarios
 */
async function stressTestZeroTolerance() {
    console.log('=== STRESS TESTING ZERO TOLERANCE ===\n');
    
    let allTestsPassed = true;
    
    try {
        // Test 1: Many files (50 files)
        await testManyFiles();
        
        // Test 2: Very long filenames
        await testLongFilenames();
        
        // Test 3: Mixed long filenames with many files
        await testMixedLongFilenames();
        
        // Test 4: Deep directory structures
        await testDeepDirectories();
        
        // Test 5: Unicode filenames
        await testUnicodeFilenames();
        
    } catch (error) {
        console.error('❌ STRESS TEST FAILED:', error.message);
        allTestsPassed = false;
    }
    
    if (allTestsPassed) {
        console.log('\n🎉 ALL STRESS TESTS PASSED WITH ZERO TOLERANCE! 🎉');
    } else {
        console.log('\n❌ Some stress tests failed');
    }
}

async function testManyFiles() {
    console.log('=== STRESS TEST 1: MANY FILES (50 files) ===');
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { level: 0 }); // No compression for predictability
    
    const entries = [];
    const testText = "Test content";
    
    // Add 50 files
    console.log('Creating 50 files...');
    for (let i = 1; i <= 50; i++) {
        const filename = `file_${i.toString().padStart(3, '0')}.txt`;
        const entry = await zipWriter.add(filename, new zip.TextReader(testText));
        entries.push(entry);
        
        if (i % 10 === 0) {
            console.log(`  Added ${i} files...`);
        }
    }
    
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    // Calculate expected size
    const expectedSize = calculateZipStreamSize(entries, { zip64: false });
    
    console.log(`\n📊 Calculated: ${expectedSize} bytes`);
    console.log(`🎯 Actual: ${actualSize} bytes`);
    console.log(`📏 Difference: ${actualSize - expectedSize} bytes`);
    
    assertZeroTolerance(expectedSize, actualSize, "Many files (50)");
    console.log('✅ PASSED: Many files test\n');
}

async function testLongFilenames() {
    console.log('=== STRESS TEST 2: VERY LONG FILENAMES ===');
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { level: 0 });
    
    const entries = [];
    const testText = "Long filename test";
    
    // Create progressively longer filenames
    const baseName = "very_long_filename_that_exceeds_normal_limits";
    const longFilenames = [
        baseName + "_100_chars_" + "x".repeat(50) + ".txt", // ~100 chars
        baseName + "_200_chars_" + "x".repeat(150) + ".txt", // ~200 chars
        baseName + "_500_chars_" + "x".repeat(450) + ".txt", // ~500 chars
        "directory_with_very_long_name_" + "x".repeat(100) + "/", // Long directory
        "directory_with_very_long_name_" + "x".repeat(100) + "/" + "nested_file_" + "x".repeat(50) + ".txt"
    ];
    
    console.log('Creating files with long names:');
    for (let i = 0; i < longFilenames.length; i++) {
        const filename = longFilenames[i];
        console.log(`  ${i + 1}. "${filename.substring(0, 50)}..." (${filename.length} chars)`);
        
        if (filename.endsWith('/')) {
            const entry = await zipWriter.add(filename, null, { directory: true });
            entries.push(entry);
        } else {
            const entry = await zipWriter.add(filename, new zip.TextReader(testText));
            entries.push(entry);
        }
    }
    
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    // Calculate expected size
    const expectedSize = calculateZipStreamSize(entries, { zip64: false });
    
    console.log(`\n📊 Calculated: ${expectedSize} bytes`);
    console.log(`🎯 Actual: ${actualSize} bytes`);
    console.log(`📏 Difference: ${actualSize - expectedSize} bytes`);
    
    assertZeroTolerance(expectedSize, actualSize, "Long filenames");
    console.log('✅ PASSED: Long filenames test\n');
}

async function testMixedLongFilenames() {
    console.log('=== STRESS TEST 3: MIXED LONG FILENAMES (25 files) ===');
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { zip64: true, level: 0 }); // Force zip64
    
    const entries = [];
    
    console.log('Creating mixed files with varying name lengths...');
    for (let i = 1; i <= 25; i++) {
        // Vary filename length based on index
        const nameLength = 10 + (i * 5); // 15, 20, 25, ... 135 chars
        const filename = `file_${i}_${"x".repeat(nameLength)}.txt`;
        const content = `Content for file ${i} with ${nameLength + 10} char name`;
        
        const entry = await zipWriter.add(filename, new zip.TextReader(content));
        entries.push(entry);
        
        if (i % 5 === 0) {
            console.log(`  Added ${i}/25 files (last filename: ${nameLength + 10} chars)`);
        }
    }
    
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    // Calculate expected size
    const expectedSize = calculateZipStreamSize(entries, { zip64: true });
    
    console.log(`\n📊 Calculated: ${expectedSize} bytes`);
    console.log(`🎯 Actual: ${actualSize} bytes`);
    console.log(`📏 Difference: ${actualSize - expectedSize} bytes`);
    
    assertZeroTolerance(expectedSize, actualSize, "Mixed long filenames with zip64");
    console.log('✅ PASSED: Mixed long filenames test\n');
}

async function testDeepDirectories() {
    console.log('=== STRESS TEST 4: DEEP DIRECTORY STRUCTURES ===');
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { level: 0 });
    
    const entries = [];
    
    // Create deep nested directories
    const paths = [
        "level1/",
        "level1/level2/",
        "level1/level2/level3/",
        "level1/level2/level3/level4/",
        "level1/level2/level3/level4/level5/",
        "level1/level2/level3/level4/level5/deep_file.txt",
        "another_very_long_directory_name_that_tests_limits/",
        "another_very_long_directory_name_that_tests_limits/nested_very_long_directory_name/",
        "another_very_long_directory_name_that_tests_limits/nested_very_long_directory_name/final_file_with_long_name.txt"
    ];
    
    console.log('Creating deep directory structure:');
    for (const path of paths) {
        console.log(`  ${path}`);
        
        if (path.endsWith('/')) {
            const entry = await zipWriter.add(path, null, { directory: true });
            entries.push(entry);
        } else {
            const entry = await zipWriter.add(path, new zip.TextReader("Deep nested content"));
            entries.push(entry);
        }
    }
    
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    // Calculate expected size
    const expectedSize = calculateZipStreamSize(entries, { zip64: false });
    
    console.log(`\n📊 Calculated: ${expectedSize} bytes`);
    console.log(`🎯 Actual: ${actualSize} bytes`);
    console.log(`📏 Difference: ${actualSize - expectedSize} bytes`);
    
    assertZeroTolerance(expectedSize, actualSize, "Deep directories");
    console.log('✅ PASSED: Deep directories test\n');
}

async function testUnicodeFilenames() {
    console.log('=== STRESS TEST 5: UNICODE FILENAMES ===');
    
    const blobWriter = new zip.BlobWriter("application/zip");
    const zipWriter = new zip.ZipWriter(blobWriter, { level: 0 });
    
    const entries = [];
    
    // Unicode filenames with various scripts
    const unicodeFiles = [
        "файл.txt", // Cyrillic
        "文件.txt", // Chinese
        "ファイル.txt", // Japanese
        "파일.txt", // Korean
        "αρχείο.txt", // Greek
        "ملف.txt", // Arabic
        "📁_folder_with_emoji/", // Emoji
        "📁_folder_with_emoji/🎉_celebration.txt",
        "مجلد_عربي/", // Arabic directory
        "मुख्य_फाइल.txt", // Hindi
        "🌟_unicode_test_файл_文件_🎯.txt" // Mixed scripts with emojis
    ];
    
    console.log('Creating Unicode filenames:');
    for (const filename of unicodeFiles) {
        console.log(`  "${filename}" (${filename.length} chars, ${new TextEncoder().encode(filename).length} bytes)`);
        
        if (filename.endsWith('/')) {
            const entry = await zipWriter.add(filename, null, { directory: true });
            entries.push(entry);
        } else {
            const entry = await zipWriter.add(filename, new zip.TextReader("Unicode content"));
            entries.push(entry);
        }
    }
    
    await zipWriter.close();
    const actualBlob = await blobWriter.getData();
    const actualSize = actualBlob.size;
    
    // Calculate expected size
    const expectedSize = calculateZipStreamSize(entries, { zip64: false });
    
    console.log(`\n📊 Calculated: ${expectedSize} bytes`);
    console.log(`🎯 Actual: ${actualSize} bytes`);
    console.log(`📏 Difference: ${actualSize - expectedSize} bytes`);
    
    assertZeroTolerance(expectedSize, actualSize, "Unicode filenames");
    console.log('✅ PASSED: Unicode filenames test\n');
}

function assertZeroTolerance(expected, actual, testName) {
    const diff = Math.abs(expected - actual);
    if (diff !== 0) {
        throw new Error(`${testName}: Expected ${expected}, got ${actual}, diff: ${diff}. ZERO TOLERANCE requires exact match.`);
    }
}

stressTestZeroTolerance().catch(console.error); 