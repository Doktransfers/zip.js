/*
 Copyright (c) 2024 Gildas Lormeau. All rights reserved.

 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions are met:

 1. Redistributions of source code must retain the above copyright notice,
 this list of conditions and the following disclaimer.

 2. Redistributions in binary form must reproduce the above copyright 
 notice, this list of conditions and the following disclaimer in 
 the documentation and/or other materials provided with the distribution.

 3. The names of the authors may not be used to endorse or promote products
 derived from this software without specific prior written permission.

 THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESSED OR IMPLIED WARRANTIES,
 INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL JCRAFT,
 INC. OR ANY CONTRIBUTORS TO THIS SOFTWARE BE LIABLE FOR ANY DIRECT, INDIRECT,
 INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import {
	MAX_32_BITS,
	MAX_16_BITS,
	END_OF_CENTRAL_DIR_LENGTH,
	ZIP64_END_OF_CENTRAL_DIR_TOTAL_LENGTH
} from "./constants.js";

/**
 * Calculates the expected size of a zip stream with Zip64 support
 * 
 * Based on the detailed explanation by Gildas Lormeau:
 * - Each entry where zip64 is true has up to 32 additional bytes in the extra field
 * - For non-split archives: 28 bytes for files, 12 bytes for folders  
 * - 8 bytes less for the first entry because its offset is 0
 * - Additional zip64 end-of-central-directory structure is 76 bytes long
 * 
 * @param {Array<EntryMetaData>} entries - Array of entry metadata with EntryMetaData interface
 * @param {Object} options - Calculation options
 * @param {boolean} options.zip64 - Whether to force zip64 format
 * @param {number} options.commentSize - Size of zip comment in bytes
 * @param {boolean} options.useDataDescriptor - Whether data descriptors are used
 * @param {boolean} options.splitArchive - Whether this is a split archive
 * @returns {number} Expected zip file size in bytes
 */
function calculateZipStreamSize(entries, options = {}) {
	const {
		zip64 = false,
		commentSize = 0,
		useDataDescriptor = true,
		splitArchive = false
	} = options;

	let totalSize = 0;
	
	// ZIP structure constants (EXACT from byte-by-byte analysis)
	const LOCAL_FILE_HEADER_BASE_SIZE = 30;
	const CENTRAL_DIRECTORY_HEADER_BASE_SIZE = 46;
	const DATA_DESCRIPTOR_SIZE = 12; // CRC32 + compressed size + uncompressed size (no signature)
	
	// EXACT extra field sizes from analysis
	const EXTENDED_TIMESTAMP_LOCAL_SIZE = 9; // Type 0x5455, size 5, total 9 bytes
	const NTFS_TIMESTAMP_LOCAL_SIZE = 36; // Type 0x000a, size 32, total 36 bytes
	const EXTENDED_TIMESTAMP_CENTRAL_SIZE = 9; // Only extended timestamp in central directory
	
	// Total extra field size for local headers (always 45 bytes in zip.js)
	const LOCAL_EXTRA_FIELD_BASE_SIZE = EXTENDED_TIMESTAMP_LOCAL_SIZE + NTFS_TIMESTAMP_LOCAL_SIZE; // 45 bytes
	
	// Track whether zip64 is needed
	let needsZip64 = zip64;
	let localDataSize = 0;
	let centralDirectorySize = 0;
	
	// Calculate size for each entry
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		const isFirstEntry = i === 0;
		const isDirectory = entry.directory || entry.filename.endsWith('/');
		const filename = entry.filename || entry.name || '';
		const filenameLength = new TextEncoder().encode(filename).length; // UTF-8 byte length, not character count
		const commentLength = entry.comment ? new TextEncoder().encode(entry.comment).length : 0; // UTF-8 byte length
		const uncompressedSize = entry.uncompressedSize || entry.size || 0;
		const compressedSize = entry.compressedSize || entry.size || 0;
		
		// Determine if this entry needs zip64
		const entryNeedsZip64 = entry.zip64 || 
			uncompressedSize > MAX_32_BITS ||
			compressedSize > MAX_32_BITS ||
			localDataSize > MAX_32_BITS;
		
		if (entryNeedsZip64) {
			needsZip64 = true;
		}
		
		// Local file header extra field size (always 45 bytes - NO zip64 extra field)
		let localExtraFieldSize = LOCAL_EXTRA_FIELD_BASE_SIZE;
		
		// Local file header total size
		const localHeaderSize = LOCAL_FILE_HEADER_BASE_SIZE + 
			filenameLength + 
			localExtraFieldSize;
		
		// File data + data descriptor
		const fileDataSize = compressedSize;
		// Data descriptor size depends on zip64 mode
		const dataDescriptorSize = entryNeedsZip64 ? 20 : DATA_DESCRIPTOR_SIZE; // 20 bytes for zip64 (64-bit sizes), 12 for regular
		
		// Central directory entry extra field size
		let centralExtraFieldSize = LOCAL_EXTRA_FIELD_BASE_SIZE; // Extended timestamp + NTFS timestamp (45 bytes)
		
		// Add zip64 extra field to central directory if needed (not in local header)
		if (entryNeedsZip64) {
			// Zip64 extra field is always 28 bytes data + 4 bytes header = 32 bytes
			centralExtraFieldSize += 32;
		}
		
		// Central directory entry total size
		const centralHeaderSize = CENTRAL_DIRECTORY_HEADER_BASE_SIZE +
			filenameLength +
			commentLength +
			centralExtraFieldSize;
		
		// Accumulate sizes
		localDataSize += localHeaderSize + fileDataSize + dataDescriptorSize;
		centralDirectorySize += centralHeaderSize;
		
		// Check if zip64 is needed based on accumulated size
		if (localDataSize > MAX_32_BITS || centralDirectorySize > MAX_32_BITS) {
			needsZip64 = true;
		}
	}
	
	// Check if zip64 is needed based on number of entries
	if (entries.length > MAX_16_BITS) {
		needsZip64 = true;
	}
	
	// Calculate total size
	totalSize = localDataSize + centralDirectorySize;
	
	// End of central directory structure
	if (needsZip64) {
		totalSize += ZIP64_END_OF_CENTRAL_DIR_TOTAL_LENGTH; // 76 bytes
	} else {
		totalSize += END_OF_CENTRAL_DIR_LENGTH; // 22 bytes
	}
	
	// Add comment size
	totalSize += commentSize;
	
	return totalSize;
}

export {
	calculateZipStreamSize
}; 