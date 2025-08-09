// Debug helper script to run individual tests
const testFile = process.argv[2];
if (!testFile) {
  console.error("Usage: node debug-test.js <test-file-name>");
  console.error("Example: node debug-test.js test-estimate-size-zip64.js");
  process.exit(1);
}

try {
  const testModule = await import(`./all/${testFile}`);
  if (testModule.test) {
    console.log(`Running test: ${testFile}`);
    await testModule.test();
    console.log("Test completed successfully!");
  } else {
    console.error(`No test function exported from ${testFile}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`Error running test ${testFile}:`, error);
  process.exit(1);
}
