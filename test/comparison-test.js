import { calculateZipStreamSize } from "../lib/core/zip-size-calculator.stable.js";
import { calculateZipStreamSizeAdvanced, getZip64ExtraFieldSize } from "../lib/core/zip-size-calculator.advanced.js";
import { MAX_32_BITS } from "../lib/core/constants.js";

// Test helper
function createEntry(filename, size = 1000, options = {}) {
	return {
		filename,
		size,
		uncompressedSize: size,
		compressedSize: Math.floor(size * 0.7),
		directory: options.directory || filename.endsWith('/'),
		zip64: options.zip64 || false,
		comment: options.comment || ''
	};
}

console.log("=".repeat(60));
console.log("ZIP64 EXTRA FIELD COMPARISON");
console.log("=".repeat(60));

// Test individual zip64 extra field calculations
const testEntries = [
	{ name: "Small file", entry: createEntry("small.txt", 1000) },
	{ name: "Large file", entry: createEntry("large.bin", MAX_32_BITS + 1000) },
	{ name: "Directory", entry: createEntry("dir/", 0, { directory: true }) },
	{ name: "Forced zip64", entry: createEntry("small.txt", 1000, { zip64: true }) }
];

for (const test of testEntries) {
	console.log(`\n${test.name}:`);
	
	// Check if entry would need zip64
	const needsZip64 = test.entry.zip64 || 
		test.entry.uncompressedSize > MAX_32_BITS ||
		test.entry.compressedSize > MAX_32_BITS;
	
	// Stable approach: simple 32 bytes if zip64 needed
	const stableExtra = needsZip64 ? 32 : 0;
	
	// Advanced approach: detailed calculation
	const advancedExtra = getZip64ExtraFieldSize(test.entry, false, false, 0);
	
	console.log(`  Needs zip64: ${needsZip64}`);
	console.log(`  Stable extra field: ${stableExtra} bytes`);
	console.log(`  Advanced extra field: ${advancedExtra} bytes`);
}

console.log("\n" + "=".repeat(60));
console.log("OVERALL SIZE COMPARISON");
console.log("=".repeat(60));

const scenarios = [
	{
		name: "Small files only",
		entries: [
			createEntry("file1.txt", 1000),
			createEntry("file2.txt", 2000)
		]
	},
	{
		name: "Mix with large file",
		entries: [
			createEntry("small.txt", 1000),
			createEntry("large.bin", MAX_32_BITS + 1000)
		]
	},
	{
		name: "Forced zip64",
		entries: [
			createEntry("file1.txt", 1000, { zip64: true }),
			createEntry("file2.txt", 2000)
		]
	}
];

for (const scenario of scenarios) {
	console.log(`\n${scenario.name}:`);
	
	const stableSize = calculateZipStreamSize(scenario.entries);
	const advancedSize = calculateZipStreamSizeAdvanced(scenario.entries);
	const difference = Math.abs(stableSize - advancedSize);
	
	console.log(`  Stable:   ${stableSize.toLocaleString()} bytes`);
	console.log(`  Advanced: ${advancedSize.toLocaleString()} bytes`);
	console.log(`  Diff:     ${difference} bytes`);
} 