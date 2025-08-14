/*
Test to reproduce worker hang issues after AbortController usage
This isolates the specific problem where workers don't properly clean up after abort,
causing subsequent operations to hang.
*/

import * as zip from "../../index.js";

function makeTestStream(sizeInMB) {
    const totalBytes = sizeInMB * 1024 * 1024;
    const chunkSize = 1024 * 1024; // 1MB chunks
    let bytesWritten = 0;
    
    return new ReadableStream({
        pull(controller) {
            if (bytesWritten >= totalBytes) {
                controller.close();
                return;
            }
            
            const remainingBytes = totalBytes - bytesWritten;
            const currentChunkSize = Math.min(chunkSize, remainingBytes);
            const chunk = new Uint8Array(currentChunkSize);
            
            // Fill with predictable pattern
            for (let i = 0; i < currentChunkSize; i++) {
                chunk[i] = (bytesWritten + i) & 0xFF;
            }
            
            controller.enqueue(chunk);
            bytesWritten += currentChunkSize;
        }
    });
}

async function testNormalOperation() {
    console.log("=== Test 1: Normal Operation (Baseline) ===");
    zip.configure({ useWebWorkers: true, maxWorkers: 1 });
    
    const startTime = Date.now();
    const stream = new zip.ZipWriterStream({ keepOrder: true, level: 0 });
    const readable = makeTestStream(50); // 50MB
    
    // Start reading output immediately
    const reader = stream.readable.getReader();
    let firstChunkTime = null;
    let totalRead = 0;
    let chunks = 0;
    
    const readPromise = (async () => {
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                totalRead += value.length;
                chunks++;
                
                if (chunks === 1) {
                    firstChunkTime = Date.now() - startTime;
                    console.log(`✅ First chunk received after ${firstChunkTime}ms`);
                }
                
                if (chunks % 10 === 0) {
                    console.log(`   Read ${(totalRead / 1024 / 1024).toFixed(1)}MB in ${chunks} chunks`);
                }
            }
        } finally {
            reader.releaseLock();
        }
        return { totalRead, chunks };
    })();
    
    // Add the file
    console.log("Adding file to normal stream...");
    await stream.zipWriter.add("test-normal.bin", readable, {
        level: 0,
        passThrough: true,
        uncompressedSize: 50 * 1024 * 1024
    });
    
    await stream.close();
    const result = await readPromise;
    const totalTime = Date.now() - startTime;
    
    console.log(`✅ Normal operation: ${totalTime}ms total, first chunk at ${firstChunkTime}ms`);
    console.log(`   Read ${(result.totalRead / 1024 / 1024).toFixed(1)}MB in ${result.chunks} chunks\n`);
    
    return { firstChunkTime, totalTime };
}

async function testAbortScenario() {
    console.log("=== Test 2: Abort Scenario ===");
    zip.configure({ useWebWorkers: true, maxWorkers: 1 });
    
    const abortController = new AbortController();
    const stream = new zip.ZipWriterStream({ 
        keepOrder: true, 
        level: 0,
        signal: abortController.signal 
    });
    const readable = makeTestStream(100); // 100MB to ensure we can abort mid-stream
    
    // Start reading and abort after a few chunks
    const reader = stream.readable.getReader();
    let aborted = false;
    
    const readPromise = (async () => {
        let totalRead = 0;
        let chunks = 0;
        
        try {
            while (!aborted && !abortController.signal.aborted) {
                const { done, value } = await reader.read();
                if (done) break;
                
                totalRead += value.length;
                chunks++;
                
                // Abort after reading some data
                if (totalRead > 10 * 1024 * 1024) { // 10MB
                    console.log(`🛑 Triggering abort after reading ${(totalRead / 1024 / 1024).toFixed(1)}MB`);
                    aborted = true;
                    setTimeout(() => abortController.abort("Test abort"), 50);
                    break;
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`✅ Read aborted as expected: ${error.message}`);
            } else {
                console.log(`❌ Unexpected read error: ${error.message}`);
            }
        } finally {
            try {
                reader.releaseLock();
            } catch (e) {
                // Expected if already released
            }
        }
        
        return { totalRead, chunks };
    })();
    
    // Add file operation
    const addPromise = (async () => {
        try {
            console.log("Adding file to stream...");
            await stream.zipWriter.add("test-abort.bin", readable, {
                level: 0,
                passThrough: true,
                uncompressedSize: 100 * 1024 * 1024,
                signal: abortController.signal
            });
            console.log("✅ Add operation completed");
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`✅ Add operation aborted as expected: ${error.message}`);
            } else {
                console.log(`❌ Add operation error: ${error.message}`);
            }
        }
    })();
    
    // Wait for abort to happen
    const readResult = await readPromise;
    console.log(`Read ${(readResult.totalRead / 1024 / 1024).toFixed(1)}MB before abort`);
    
    // Try to cleanup with timeout
    const cleanupStart = Date.now();
    try {
        const cleanupPromise = Promise.all([addPromise, stream.close()]);
        await Promise.race([
            cleanupPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Cleanup timeout")), 5000)
            )
        ]);
        console.log(`✅ Cleanup completed in ${Date.now() - cleanupStart}ms`);
    } catch (error) {
        console.log(`⚠️ Cleanup timeout after ${Date.now() - cleanupStart}ms: ${error.message}`);
    }
    
    console.log("✅ Abort scenario completed\n");
}

async function testAfterAbort() {
    console.log("=== Test 3: Operation After Abort (Critical Test) ===");
    // This is where the hang typically occurs
    
    zip.configure({ useWebWorkers: true, maxWorkers: 1 });
    
    const startTime = Date.now();
    const stream = new zip.ZipWriterStream({ keepOrder: true, level: 0 });
    const readable = makeTestStream(20); // 20MB - smaller for faster test
    
    console.log("🧪 Starting post-abort operation...");
    
    // Set up timeout to detect hang
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error("POST-ABORT HANG DETECTED: Operation took longer than 15 seconds"));
        }, 15000);
    });
    
    const operationPromise = (async () => {
        // Start reading output
        const reader = stream.readable.getReader();
        let firstChunkTime = null;
        let totalRead = 0;
        let chunks = 0;
        
        const readPromise = (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    totalRead += value.length;
                    chunks++;
                    
                    if (chunks === 1) {
                        firstChunkTime = Date.now() - startTime;
                        console.log(`✅ First chunk after abort received in ${firstChunkTime}ms`);
                    }
                    
                    if (chunks % 5 === 0) {
                        console.log(`   Read ${(totalRead / 1024 / 1024).toFixed(1)}MB in ${chunks} chunks`);
                    }
                }
            } finally {
                reader.releaseLock();
            }
            return { totalRead, chunks, firstChunkTime };
        })();
        
        // Add the file
        console.log("Adding file after abort...");
        await stream.zipWriter.add("test-after-abort.bin", readable, {
            level: 0,
            passThrough: true,
            uncompressedSize: 20 * 1024 * 1024
        });
        
        await stream.close();
        return await readPromise;
    })();
    
    try {
        const result = await Promise.race([operationPromise, timeoutPromise]);
        const totalTime = Date.now() - startTime;
        
        console.log(`✅ Post-abort operation successful!`);
        console.log(`   Total time: ${totalTime}ms`);
        console.log(`   First chunk: ${result.firstChunkTime}ms`);
        console.log(`   Read ${(result.totalRead / 1024 / 1024).toFixed(1)}MB in ${result.chunks} chunks\n`);
        
        return { success: true, firstChunkTime: result.firstChunkTime, totalTime };
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.log(`❌ ${error.message}`);
        console.log(`   Failed after ${totalTime}ms\n`);
        
        return { success: false, error: error.message, totalTime };
    }
}

async function testWithCompression() {
    console.log("=== Test 4: With Compression (Real Worker Usage) ===");
    zip.configure({ useWebWorkers: true, maxWorkers: 1 });
    
    const abortController = new AbortController();
    const stream = new zip.ZipWriterStream({ 
        keepOrder: true, 
        level: 6, // Enable compression to force worker usage
        signal: abortController.signal 
    });
    const readable = makeTestStream(30); // 30MB
    
    console.log("🧪 Testing with compression (forces worker usage)...");
    
    // Start reading and abort quickly
    const reader = stream.readable.getReader();
    let aborted = false;
    
    const readPromise = (async () => {
        let totalRead = 0;
        let chunks = 0;
        
        try {
            while (!aborted && !abortController.signal.aborted) {
                const { done, value } = await reader.read();
                if (done) break;
                
                totalRead += value.length;
                chunks++;
                
                // Abort quickly to test worker cleanup
                if (chunks >= 2) {
                    console.log(`🛑 Aborting compression after ${chunks} chunks`);
                    aborted = true;
                    setTimeout(() => abortController.abort("Compression test abort"), 50);
                    break;
                }
            }
        } catch (error) {
            console.log(`Compression read result: ${error.name} - ${error.message}`);
        } finally {
            try {
                reader.releaseLock();
            } catch (e) {
                // Expected
            }
        }
        
        return { totalRead, chunks };
    })();
    
    // Add with compression
    const addPromise = (async () => {
        try {
            await stream.zipWriter.add("test-compression.bin", readable, {
                level: 6, // Compression level
                uncompressedSize: 30 * 1024 * 1024,
                signal: abortController.signal
            });
        } catch (error) {
            console.log(`Compression add result: ${error.name} - ${error.message}`);
        }
    })();
    
    await readPromise;
    
    // Cleanup with timeout
    try {
        await Promise.race([
            Promise.all([addPromise, stream.close()]),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Compression cleanup timeout")), 8000)
            )
        ]);
        console.log("✅ Compression test cleanup completed");
    } catch (error) {
        console.log(`⚠️ Compression cleanup: ${error.message}`);
    }
    
    console.log("✅ Compression abort test completed\n");
}

async function runAllTests() {
    console.log("🔬 Worker Abort Hang Test Suite");
    console.log("================================\n");
    
    try {
        // Test 1: Baseline
        const baseline = await testNormalOperation();
        
        // Test 2: Abort scenario
        await testAbortScenario();
        
        // Test 3: Critical test - operation after abort
        const postAbort = await testAfterAbort();
        
        // Test 4: With actual workers (compression)
        await testWithCompression();
        
        // Final analysis
        console.log("=== FINAL ANALYSIS ===");
        
        if (postAbort.success) {
            console.log("✅ NO HANG DETECTED - Workers clean up properly after abort");
            
            if (postAbort.firstChunkTime > baseline.firstChunkTime * 3) {
                console.log(`⚠️ However, streaming is significantly slower after abort:`);
                console.log(`   Baseline first chunk: ${baseline.firstChunkTime}ms`);
                console.log(`   Post-abort first chunk: ${postAbort.firstChunkTime}ms`);
                console.log(`   This suggests worker coordination issues even without hanging`);
            } else {
                console.log("✅ Streaming performance is normal after abort");
            }
        } else {
            console.log("❌ HANG CONFIRMED - Workers do not clean up properly after abort");
            console.log(`   This reproduces the issue you described`);
        }
        
    } catch (error) {
        console.error("💥 Test suite failed:", error.message);
        console.error(error.stack);
    }
}

// Run the tests
runAllTests().catch(console.error);
