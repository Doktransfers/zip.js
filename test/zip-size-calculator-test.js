import { calculateZipStreamSize } from "../lib/core/zip-size-calculator.stable.js";
import { calculateZipStreamSizeAdvanced, getZip64ExtraFieldSize } from "../lib/core/zip-size-calculator.advanced.js";
import { MAX_32_BITS, MAX_16_BITS } from "../lib/core/constants.js";

// Test helper to create entry metadata
function createEntry(filename, size = 1000, options = {}) {
	return {
		filename,
		size,
		uncompressedSize: size,
		compressedSize: Math.floor(size * 0.7), // 70% compression ratio
		directory: options.directory || filename.endsWith('/'),
		zip64: options.zip64 || false,
		comment: options.comment || ''
	};
}

// Test cases
const testCases = [
	{
		name: "Single small file",
		entries: [createEntry("test.txt", 1000)],
		options: {}
	},
	{
		name: "Multiple small files",
		entries: [
			createEntry("file1.txt", 1000),
			createEntry("file2.txt", 2000),
			createEntry("file3.txt", 500)
		],
		options: {}
	},
	{
		name: "Mix of files and directories",
		entries: [
			createEntry("folder/", 0, { directory: true }),
			createEntry("folder/file1.txt", 1000),
			createEntry("folder/subfolder/", 0, { directory: true }),
			createEntry("folder/subfolder/file2.txt", 2000)
		],
		options: {}
	},
	{
		name: "Large file requiring zip64",
		entries: [
			createEntry("large.bin", MAX_32_BITS + 1000)
		],
		options: {}
	},
	{
		name: "Multiple large files requiring zip64",
		entries: [
			createEntry("large1.bin", MAX_32_BITS + 1000),
			createEntry("large2.bin", MAX_32_BITS + 2000),
			createEntry("folder/", 0, { directory: true }),
			createEntry("folder/large3.bin", MAX_32_BITS + 500)
		],
		options: {}
	},
	{
		name: "Forced zip64 mode",
		entries: [
			createEntry("file1.txt", 1000),
			createEntry("file2.txt", 2000)
		],
		options: { zip64: true }
	},
	{
		name: "With comment",
		entries: [
			createEntry("file1.txt", 1000),
			createEntry("file2.txt", 2000, { comment: "This is a test comment" })
		],
		options: { commentSize: 50 }
	},
	{
		name: "Split archive",
		entries: [
			createEntry("file1.txt", 1000),
			createEntry("file2.txt", MAX_32_BITS + 1000)
		],
		options: { splitArchive: true }
	},
	{
		name: "Many entries (>65535)",
		entries: Array.from({ length: MAX_16_BITS + 10 }, (_, i) => 
			createEntry(`file${i}.txt`, 100)
		),
		options: {}
	},
	{
		name: "Edge case: first entry large, others small",
		entries: [
			createEntry("large-first.bin", MAX_32_BITS + 1000),
			createEntry("small1.txt", 1000),
			createEntry("small2.txt", 2000)
		],
		options: {}
	}
];

// Run tests
console.log("=".repeat(80));
console.log("ZIP SIZE CALCULATOR COMPARISON TEST");
console.log("=".repeat(80));

let totalTests = 0;
let passedTests = 0;

for (const testCase of testCases) {
	totalTests++;
	
	console.log(`\nTest: ${testCase.name}`);
	console.log("-".repeat(60));
	
	const stableSize = calculateZipStreamSize(testCase.entries, testCase.options);
	const advancedSize = calculateZipStreamSizeAdvanced(testCase.entries, testCase.options);
	
	const difference = Math.abs(stableSize - advancedSize);
	const percentDiff = stableSize > 0 ? ((difference / stableSize) * 100).toFixed(2) : 0;
	
	console.log(`Entries: ${testCase.entries.length}`);
	console.log(`Options: ${JSON.stringify(testCase.options)}`);
	console.log(`Stable size:   ${stableSize.toLocaleString()} bytes`);
	console.log(`Advanced size: ${advancedSize.toLocaleString()} bytes`);
	console.log(`Difference:    ${difference.toLocaleString()} bytes (${percentDiff}%)`);
	
	// Test passes if difference is within reasonable bounds (< 5% or < 1KB for small files)
	const tolerance = Math.max(1024, stableSize * 0.05); // 5% or 1KB minimum
	const passed = difference <= tolerance;
	
	if (passed) {
		console.log("✅ PASS");
		passedTests++;
	} else {
		console.log("❌ FAIL - Difference exceeds tolerance");
	}
}

// Test zip64 extra field size calculation separately
console.log("\n" + "=".repeat(80));
console.log("ZIP64 EXTRA FIELD SIZE TESTS");
console.log("=".repeat(80));

const zip64Tests = [
	{
		name: "Small file (no zip64)",
		entry: createEntry("small.txt", 1000),
		isFirst: false,
		expected: 0
	},
	{
		name: "Large file (needs zip64)",
		entry: createEntry("large.bin", MAX_32_BITS + 1000),
		isFirst: false,
		expected: 28 // 4 + 8 + 8 + 8 (header + uncompressed + compressed + offset)
	},
	{
		name: "Large file (first entry)",
		entry: createEntry("large.bin", MAX_32_BITS + 1000),
		isFirst: true,
		expected: 20 // 4 + 8 + 8 (header + uncompressed + compressed, no offset)
	},
	{
		name: "Large directory",
		entry: createEntry("large-dir/", MAX_32_BITS + 1000, { directory: true }),
		isFirst: false,
		expected: 28 // All zip64 flags are enabled when zip64Enabled=true
	},
	{
		name: "Forced zip64 small file",
		entry: createEntry("small.txt", 1000, { zip64: true }),
		isFirst: false,
		expected: 28 // All zip64 flags are enabled when zip64Enabled=true
	}
];

for (const test of zip64Tests) {
	totalTests++;
	
	// Use appropriate offset based on test scenario
	let currentOffset = 0;
	if (!test.isFirst && test.name.includes("Large")) {
		currentOffset = MAX_32_BITS + 1000; // Large offset for large file tests
	} else if (!test.isFirst) {
		currentOffset = 10000; // Small offset for small file tests
	}
	
	const actualSize = getZip64ExtraFieldSize(test.entry, test.isFirst, false, currentOffset);
	const passed = actualSize === test.expected;
	
	console.log(`\n${test.name}`);
	console.log(`Expected: ${test.expected} bytes`);
	console.log(`Actual:   ${actualSize} bytes`);
	console.log(passed ? "✅ PASS" : "❌ FAIL");
	
	if (passed) passedTests++;
}

// Summary
console.log("\n" + "=".repeat(80));
console.log("TEST SUMMARY");
console.log("=".repeat(80));
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${totalTests - passedTests}`);
console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (passedTests === totalTests) {
	console.log("🎉 All tests passed!");
} else {
	console.log("⚠️  Some tests failed. Review the differences above.");
} 