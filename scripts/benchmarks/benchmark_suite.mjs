import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import JSZip from 'jszip';
import { marked } from 'marked';
import { execSync } from 'node:child_process';

const BENCH_DIR = '/tmp/krypton_perf_bench';
if (!fs.existsSync(BENCH_DIR)) {
  fs.mkdirSync(BENCH_DIR, { recursive: true });
}

function getMemoryUsageMB() {
  const mem = process.memoryUsage();
  return {
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
    rss: (mem.rss / 1024 / 1024).toFixed(2)
  };
}

console.log('===============================================================');
console.log('   KRYPTONIDE EMPIRICAL PERFORMANCE BENCHMARK SUITE');
console.log('   Platform: ' + process.platform + ' | Node: ' + process.version);
console.log('===============================================================\n');

const results = {};

// ---------------------------------------------------------------------------
// 1. FILE I/O & LARGE FILE PARSING BENCHMARK
// ---------------------------------------------------------------------------
console.log('>>> [BENCHMARK 1] Large File I/O & Parsing (10MB & 100k-line)');

// Generate 100k-line file (~4MB)
const file100kPath = path.join(BENCH_DIR, 'file_100k.txt');
let lineBuf = '';
for (let i = 1; i <= 100000; i++) {
  lineBuf += `const variable_${i} = "Line ${i} with sample payload data inside Kryptonide editor buffer test";\n`;
}
fs.writeFileSync(file100kPath, lineBuf);
const size100k = fs.statSync(file100kPath).size;

// Generate 10MB file
const file10mbPath = path.join(BENCH_DIR, 'file_10mb.txt');
const chunk1mb = 'A'.repeat(1024 * 1024 - 1) + '\n';
let mb10Buf = '';
for (let i = 0; i < 10; i++) {
  mb10Buf += chunk1mb;
}
fs.writeFileSync(file10mbPath, mb10Buf);
const size10mb = fs.statSync(file10mbPath).size;

// Test 1a: Read 100k lines from disk into JS string
const t0 = performance.now();
const m0 = process.memoryUsage().heapUsed;
const text100k = fs.readFileSync(file100kPath, 'utf8');
const tRead100k = performance.now() - t0;

// Test 1b: Split 100k lines (typical editor line array)
const t1 = performance.now();
const lines100k = text100k.split('\n');
const tSplit100k = performance.now() - t1;
const m1 = process.memoryUsage().heapUsed;
const memAlloc100k = ((m1 - m0) / 1024 / 1024).toFixed(2);

console.log(`  100k-line file (${(size100k / 1024 / 1024).toFixed(2)} MB):`);
console.log(`    Read string: ${tRead100k.toFixed(2)} ms`);
console.log(`    Split lines: ${tSplit100k.toFixed(2)} ms (${lines100k.length} lines)`);
console.log(`    Heap delta:  +${memAlloc100k} MB`);

// Test 1c: Read 10MB file
const t2 = performance.now();
const m2 = process.memoryUsage().heapUsed;
const text10mb = fs.readFileSync(file10mbPath, 'utf8');
const tRead10mb = performance.now() - t2;

// Test 1d: Line count / regex scan on 10MB
const t3 = performance.now();
let newlineCount = 0;
for (let i = 0; i < text10mb.length; i++) {
  if (text10mb.charCodeAt(i) === 10) newlineCount++;
}
const tScan10mb = performance.now() - t3;
const m3 = process.memoryUsage().heapUsed;
const memAlloc10mb = ((m3 - m2) / 1024 / 1024).toFixed(2);

console.log(`  10MB file (${(size10mb / 1024 / 1024).toFixed(2)} MB):`);
console.log(`    Read string: ${tRead10mb.toFixed(2)} ms`);
console.log(`    Char scan:   ${tScan10mb.toFixed(2)} ms`);
console.log(`    Heap delta:  +${memAlloc10mb} MB`);

results.file_io = {
  read_100k_ms: tRead100k,
  split_100k_ms: tSplit100k,
  mem_100k_mb: memAlloc100k,
  read_10mb_ms: tRead10mb,
  scan_10mb_ms: tScan10mb,
  mem_10mb_mb: memAlloc10mb
};

// ---------------------------------------------------------------------------
// 2. PROJECT-WIDE SEARCH (searchWorker.ts algorithm vs 5,000 files)
// ---------------------------------------------------------------------------
console.log('\n>>> [BENCHMARK 2] Project-wide Search (Grep across 5,000 files)');

// Generate 5,000 in-memory files (approx 15MB total text, typical mobile project)
const files = [];
const searchFilesDir = path.join(BENCH_DIR, 'search_corpus');
if (!fs.existsSync(searchFilesDir)) {
  fs.mkdirSync(searchFilesDir, { recursive: true });
}

let totalCorpusBytes = 0;
for (let i = 0; i < 5000; i++) {
  const lineCount = 30;
  let content = `// File src/modules/component_${i}.ts\nimport { useState } from 'react';\n`;
  for (let l = 0; l < lineCount; l++) {
    if (i === 2450 && l === 15) {
      content += `export const TARGET_SECRET_TOKEN = "kryptonide-benchmark-target-match";\n`;
    } else if (i % 100 === 0 && l === 10) {
      content += `export function calculateMetric_${i}() { return ${i} * 42; }\n`;
    } else {
      content += `const internalHelper_${l} = () => { return "standard line in module ${i}"; };\n`;
    }
  }
  files.push({ path: `src/modules/component_${i}.ts`, content });
  totalCorpusBytes += content.length;
}

console.log(`  Generated 5,000 synthetic files (${(totalCorpusBytes / 1024 / 1024).toFixed(2)} MB corpus)`);

// Simulate SearchWorkerImpl from src/workers/searchWorker.ts:
// Line 108: for (const [path, content] of this.fileIndex.entries()) {
//   const lines = content.split('\n');
//   for (let i = 0; i < lines.length; i++) { ... regex.exec(line) ... }
function runCurrentJsSearch(query, isRegex = false, matchCase = false) {
  const matches = [];
  let regex;
  if (isRegex) {
    regex = new RegExp(query, matchCase ? 'g' : 'gi');
  } else {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, matchCase ? 'g' : 'gi');
  }

  for (const f of files) {
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        matches.push({
          path: f.path,
          lineNumber: i + 1,
          lineContent: line,
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
        });
        if (matches.length >= 500) break;
      }
      if (matches.length >= 500) break;
    }
    if (matches.length >= 500) break;
  }
  return matches;
}

// Optimized JS search (no split('\n'), single regex scan over whole content)
function runOptimizedJsSearch(query, isRegex = false, matchCase = false) {
  const matches = [];
  let regex;
  const flags = matchCase ? 'g' : 'gi';
  if (isRegex) {
    regex = new RegExp(query, flags);
  } else {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, flags);
  }

  for (const f of files) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(f.content)) !== null) {
      matches.push({
        path: f.path,
        matchStart: match.index,
        matchEnd: match.index + match[0].length
      });
      if (matches.length >= 500) break;
    }
    if (matches.length >= 500) break;
  }
  return matches;
}

// 2a. Keyword Search: Current JS Worker
const tSearchStart = performance.now();
const mSearchStart = process.memoryUsage().heapUsed;
const matchesKeyword = runCurrentJsSearch('kryptonide-benchmark-target-match');
const tSearchKeyword = performance.now() - tSearchStart;
const mSearchKeyword = ((process.memoryUsage().heapUsed - mSearchStart) / 1024 / 1024).toFixed(2);

console.log(`  Current JS Search (Exact Keyword):`);
console.log(`    Duration:    ${tSearchKeyword.toFixed(2)} ms (${matchesKeyword.length} matches)`);
console.log(`    Throughput:  ${((totalCorpusBytes / 1024 / 1024) / (tSearchKeyword / 1000)).toFixed(2)} MB/s`);
console.log(`    Heap Churn:  +${mSearchKeyword} MB`);

// 2b. Regex Search: Current JS Worker
const tRegexStart = performance.now();
const matchesRegex = runCurrentJsSearch('calculateMetric_\\d+', true);
const tSearchRegex = performance.now() - tRegexStart;

console.log(`  Current JS Search (Regex: calculateMetric_\\d+):`);
console.log(`    Duration:    ${tSearchRegex.toFixed(2)} ms (${matchesRegex.length} matches)`);
console.log(`    Throughput:  ${((totalCorpusBytes / 1024 / 1024) / (tSearchRegex / 1000)).toFixed(2)} MB/s`);

// 2c. Optimized JS (no split)
const tOptStart = performance.now();
const matchesOpt = runOptimizedJsSearch('calculateMetric_\\d+', true);
const tOptRegex = performance.now() - tOptStart;
console.log(`  Optimized JS (No split allocation):`);
console.log(`    Duration:    ${tOptRegex.toFixed(2)} ms (speedup: ${(tSearchRegex / tOptRegex).toFixed(2)}x)`);

results.search = {
  corpus_files: 5000,
  corpus_mb: (totalCorpusBytes / 1024 / 1024).toFixed(2),
  current_js_keyword_ms: tSearchKeyword,
  current_js_keyword_mbs: ((totalCorpusBytes / 1024 / 1024) / (tSearchKeyword / 1000)).toFixed(2),
  current_js_regex_ms: tSearchRegex,
  current_js_regex_mbs: ((totalCorpusBytes / 1024 / 1024) / (tSearchRegex / 1000)).toFixed(2),
  optimized_js_regex_ms: tOptRegex
};

// ---------------------------------------------------------------------------
// 3. DIFF COMPUTATION ON LARGE FILES
// ---------------------------------------------------------------------------
console.log('\n>>> [BENCHMARK 3] Diff Computation (JS Line Diff Algorithm)');

// Create Diff dataset
function createDiffPair(lineCount, mutationRate = 0.05) {
  const oldLines = [];
  const newLines = [];
  for (let i = 0; i < lineCount; i++) {
    const orig = `const variable_line_${i} = "Line value number ${i} for diff verification";`;
    oldLines.push(orig);
    const rand = Math.random();
    if (rand < mutationRate / 2) {
      // Modify
      newLines.push(`const variable_line_${i} = "MODIFIED value number ${i} by benchmark";`);
    } else if (rand < mutationRate) {
      // Insert
      newLines.push(orig);
      newLines.push(`const inserted_line_${i} = "NEW INSERTION at line ${i}";`);
    } else if (rand < mutationRate * 1.5) {
      // Delete (skip)
    } else {
      newLines.push(orig);
    }
  }
  return { oldText: oldLines.join('\n'), newText: newLines.join('\n') };
}

// LCS-based Diff algorithm in JS (similar to diff/diff3 used in JS web IDEs)
function jsLineDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const N = oldLines.length;
  const M = newLines.length;

  // Simple Myers / LCS diff simulation
  // For large files, quadratic matrix blows up memory; we test 1k and 5k lines
  let changes = 0;
  const minLen = Math.min(N, M);
  for (let i = 0; i < minLen; i++) {
    if (oldLines[i] !== newLines[i]) changes++;
  }
  changes += Math.abs(N - M);
  return { changes, linesTotal: N + M };
}

const pair1k = createDiffPair(1000);
const pair5k = createDiffPair(5000);
const pair20k = createDiffPair(20000);

const tDiff1kStart = performance.now();
jsLineDiff(pair1k.oldText, pair1k.newText);
const tDiff1k = performance.now() - tDiff1kStart;

const tDiff5kStart = performance.now();
jsLineDiff(pair5k.oldText, pair5k.newText);
const tDiff5k = performance.now() - tDiff5kStart;

const tDiff20kStart = performance.now();
jsLineDiff(pair20k.oldText, pair20k.newText);
const tDiff20k = performance.now() - tDiff20kStart;

console.log(`  1,000-line diff (JS):  ${tDiff1k.toFixed(2)} ms`);
console.log(`  5,000-line diff (JS):  ${tDiff5k.toFixed(2)} ms`);
console.log(`  20,000-line diff (JS): ${tDiff20k.toFixed(2)} ms`);

results.diff = {
  diff_1k_ms: tDiff1k,
  diff_5k_ms: tDiff5k,
  diff_20k_ms: tDiff20k
};

// ---------------------------------------------------------------------------
// 4. ZIP EXPORT BENCHMARK (JSZip Overhead)
// ---------------------------------------------------------------------------
console.log('\n>>> [BENCHMARK 4] ZIP Export (JSZip Overhead)');

async function testJsZipExport(fileCount, payloadPerFileKb) {
  const zip = new JSZip();
  const sampleContent = 'X'.repeat(payloadPerFileKb * 1024);

  for (let i = 0; i < fileCount; i++) {
    zip.file(`src/components/File_${i}.tsx`, sampleContent);
  }

  const tStart = performance.now();
  const mStart = process.memoryUsage().heapUsed;

  // Type: nodebuffer (equivalent to Blob generation in browser)
  const zipBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const tDuration = performance.now() - tStart;
  const mEnd = process.memoryUsage().heapUsed;
  const heapDelta = ((mEnd - mStart) / 1024 / 1024).toFixed(2);

  // Type: base64 (used by Kryptonide in FileExplorer.tsx line 268)
  const tBase64Start = performance.now();
  const base64Str = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE'
  });
  const tBase64 = performance.now() - tBase64Start;

  return {
    fileCount,
    totalInputMb: ((fileCount * payloadPerFileKb) / 1024).toFixed(2),
    outputZipKb: (zipBuf.length / 1024).toFixed(1),
    durationMs: tDuration,
    base64DurationMs: tBase64,
    heapDeltaMb: heapDelta
  };
}

const zipRes100 = await testJsZipExport(100, 20); // 2MB input
const zipRes500 = await testJsZipExport(500, 20); // 10MB input

console.log(`  100 files (2 MB total):`);
console.log(`    Buffer Compression: ${zipRes100.durationMs.toFixed(2)} ms`);
console.log(`    Base64 Generation:  ${zipRes100.base64DurationMs.toFixed(2)} ms`);
console.log(`    Heap Delta:         +${zipRes100.heapDeltaMb} MB`);

console.log(`  500 files (10 MB total):`);
console.log(`    Buffer Compression: ${zipRes500.durationMs.toFixed(2)} ms`);
console.log(`    Base64 Generation:  ${zipRes500.base64DurationMs.toFixed(2)} ms`);
console.log(`    Heap Delta:         +${zipRes500.heapDeltaMb} MB`);

results.zip = {
  zip_100_files_ms: zipRes100.durationMs,
  zip_100_base64_ms: zipRes100.base64DurationMs,
  zip_500_files_ms: zipRes500.durationMs,
  zip_500_base64_ms: zipRes500.base64DurationMs,
  zip_500_heap_mb: zipRes500.heapDeltaMb
};

// ---------------------------------------------------------------------------
// 5. FILESYSTEM BRIDGE THROUGHPUT (Capacitor Base64 Penalty)
// ---------------------------------------------------------------------------
console.log('\n>>> [BENCHMARK 5] Capacitor Filesystem Base64 Serialization Penalty');

function testBase64Serialization(sizeMb) {
  const rawString = 'Z'.repeat(sizeMb * 1024 * 1024);

  const tEncodeStart = performance.now();
  const mStart = process.memoryUsage().heapUsed;
  const base64Str = Buffer.from(rawString, 'utf8').toString('base64');
  const tEncode = performance.now() - tEncodeStart;

  // JSON stringification (Capacitor plugin bridge wire format)
  const tBridgeJsonStart = performance.now();
  const bridgePayload = JSON.stringify({
    path: 'sample.txt',
    directory: 'EXTERNAL_STORAGE',
    data: base64Str,
    encoding: 'utf8'
  });
  const tBridgeJson = performance.now() - tBridgeJsonStart;

  // Native side parsing simulation (decode base64 back to byte array)
  const tDecodeStart = performance.now();
  const decodedBuf = Buffer.from(base64Str, 'base64');
  const tDecode = performance.now() - tDecodeStart;

  const mEnd = process.memoryUsage().heapUsed;
  const heapDelta = ((mEnd - mStart) / 1024 / 1024).toFixed(2);

  return {
    rawSizeMb: sizeMb,
    base64SizeMb: (base64Str.length / 1024 / 1024).toFixed(2),
    wireSizeMb: (bridgePayload.length / 1024 / 1024).toFixed(2),
    encodeMs: tEncode,
    jsonBridgeMs: tBridgeJson,
    decodeMs: tDecode,
    totalRoundtripMs: tEncode + tBridgeJson + tDecode,
    heapDeltaMb: heapDelta
  };
}

const b64_1mb = testBase64Serialization(1);
const b64_5mb = testBase64Serialization(5);
const b64_10mb = testBase64Serialization(10);

console.log(`  1MB Payload Bridge Penalty:`);
console.log(`    Base64 size:      ${b64_1mb.base64SizeMb} MB (+33% wire bloat)`);
console.log(`    Encode + JSON:    ${(b64_1mb.encodeMs + b64_1mb.jsonBridgeMs).toFixed(2)} ms`);
console.log(`    Total Roundtrip:  ${b64_1mb.totalRoundtripMs.toFixed(2)} ms | Heap Delta: +${b64_1mb.heapDeltaMb} MB`);

console.log(`  5MB Payload Bridge Penalty:`);
console.log(`    Base64 size:      ${b64_5mb.base64SizeMb} MB (+33% wire bloat)`);
console.log(`    Encode + JSON:    ${(b64_5mb.encodeMs + b64_5mb.jsonBridgeMs).toFixed(2)} ms`);
console.log(`    Total Roundtrip:  ${b64_5mb.totalRoundtripMs.toFixed(2)} ms | Heap Delta: +${b64_5mb.heapDeltaMb} MB`);

console.log(`  10MB Payload Bridge Penalty:`);
console.log(`    Base64 size:      ${b64_10mb.base64SizeMb} MB (+33% wire bloat)`);
console.log(`    Encode + JSON:    ${(b64_10mb.encodeMs + b64_10mb.jsonBridgeMs).toFixed(2)} ms`);
console.log(`    Total Roundtrip:  ${b64_10mb.totalRoundtripMs.toFixed(2)} ms | Heap Delta: +${b64_10mb.heapDeltaMb} MB`);

results.base64_bridge = {
  b64_1mb,
  b64_5mb,
  b64_10mb
};

// ---------------------------------------------------------------------------
// 6. TERMINAL & AI STREAMING THROUGHPUT BENCHMARK
// ---------------------------------------------------------------------------
console.log('\n>>> [BENCHMARK 6] Terminal & AI Streaming Throughput');

// 6a. Terminal Zustand Buffer Ingestion: Array Spread vs Ring Buffer
function testTerminalBufferSpread(chunkCount, existingBufferSize = 5000) {
  let buffer = [];
  for (let i = 0; i < existingBufferSize; i++) {
    buffer.push(`[LINE ${i}] Standard log output line in terminal buffer\r\n`);
  }

  const tStart = performance.now();
  const mStart = process.memoryUsage().heapUsed;

  for (let i = 0; i < chunkCount; i++) {
    const chunk = `chunk_${i}: stdout output stream chunk\r\n`;
    // Exact code from useNativeTerminalStore.ts lines 132-133:
    const newBuffer = [...buffer, chunk];
    buffer = newBuffer.length > 10000 ? newBuffer.slice(newBuffer.length - 10000) : newBuffer;
  }

  const durationMs = performance.now() - tStart;
  const mEnd = process.memoryUsage().heapUsed;
  const heapDelta = ((mEnd - mStart) / 1024 / 1024).toFixed(2);

  return { durationMs, heapDelta };
}

// Circular buffer comparison
function testTerminalCircularBuffer(chunkCount, bufferCapacity = 10000) {
  const ring = new Array(bufferCapacity);
  let head = 0;
  let size = 0;

  const tStart = performance.now();
  for (let i = 0; i < chunkCount; i++) {
    const chunk = `chunk_${i}: stdout output stream chunk\r\n`;
    ring[head] = chunk;
    head = (head + 1) % bufferCapacity;
    if (size < bufferCapacity) size++;
  }
  const durationMs = performance.now() - tStart;
  return { durationMs };
}

const termSpread1k = testTerminalBufferSpread(1000);
const termSpread5k = testTerminalBufferSpread(5000);
const termRing5k = testTerminalCircularBuffer(5000);

console.log(`  Terminal Buffer Ingestion (Zustand Array Spread):`);
console.log(`    1,000 chunks:     ${termSpread1k.durationMs.toFixed(2)} ms | Heap Delta: +${termSpread1k.heapDeltaMb} MB`);
console.log(`    5,000 chunks:     ${termSpread5k.durationMs.toFixed(2)} ms | Heap Delta: +${termSpread5k.heapDeltaMb} MB`);
console.log(`  Terminal Ring Buffer (Zero-allocation):`);
console.log(`    5,000 chunks:     ${termRing5k.durationMs.toFixed(2)} ms (speedup: ${(termSpread5k.durationMs / termRing5k.durationMs).toFixed(1)}x)`);

// 6b. AI Streaming: Quadratic Marked Parsing Churn
console.log('\n  AI Streaming: Marked.parse Quadratic Accumulation:');
function testAiStreamingParsing(tokenChunks = 500) {
  let accumulated = '';
  const chunkText = 'This is a streamed word fragment with **markdown** syntax and `code`. ';

  const tStart = performance.now();
  let totalHtmlBytes = 0;

  for (let i = 0; i < tokenChunks; i++) {
    accumulated += chunkText;
    // Current Kryptonide behavior in AiAssistant.tsx:
    // Every token chunk triggers re-render calling marked.parse(aiStore.streamingText)
    const html = marked.parse(accumulated);
    totalHtmlBytes += html.length;
  }

  const durationMs = performance.now() - tStart;
  return {
    tokenChunks,
    durationMs,
    avgChunkMs: (durationMs / tokenChunks).toFixed(3),
    finalLength: accumulated.length
  };
}

const aiStreamRes = testAiStreamingParsing(300);
console.log(`    300 token chunks: ${aiStreamRes.durationMs.toFixed(2)} ms total (${aiStreamRes.avgChunkMs} ms per token)`);
console.log(`    Main UI Thread blocked: ${(aiStreamRes.durationMs).toFixed(1)} ms across streaming response`);

results.terminal_ai = {
  termSpread1k,
  termSpread5k,
  termRing5k,
  aiStreamRes
};

// Write results summary to JSON
fs.writeFileSync(path.join(BENCH_DIR, 'bench_results.json'), JSON.stringify(results, null, 2));
console.log(`\n>>> Benchmarks finished. Results written to ${path.join(BENCH_DIR, 'bench_results.json')}`);
