import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import git from 'isomorphic-git';

console.log('===============================================================');
console.log('   ISOMORPHIC-GIT VS NATIVE GIT BENCHMARK (HEADLESS)');
console.log('===============================================================\n');

const testDir = '/tmp/krypton_git_bench';
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true });
}
fs.mkdirSync(testDir, { recursive: true });

const isoDir = path.join(testDir, 'iso_repo');
const natDir = path.join(testDir, 'nat_repo');
fs.mkdirSync(isoDir, { recursive: true });
fs.mkdirSync(natDir, { recursive: true });

async function runBenchmark() {
  // 1. Git Init
  console.log('1. Git Init:');
  const t0Iso = performance.now();
  await git.init({ fs, dir: isoDir });
  const tInitIso = performance.now() - t0Iso;
  console.log(`   isomorphic-git init: ${tInitIso.toFixed(2)} ms`);

  const t0Nat = performance.now();
  execSync('git init -q', { cwd: natDir });
  const tInitNat = performance.now() - t0Nat;
  console.log(`   native git init:     ${tInitNat.toFixed(2)} ms`);

  // 2. Syncing files & status for 50 and 200 files
  for (const count of [50, 200, 500]) {
    console.log(`\n2. Operations for ${count} files:`);

    // Write files to both dirs
    for (let i = 0; i < count; i++) {
      const content = `// Source file ${i}\nexport const value_${i} = ${i} * 100;\nexport function execute() { return true; }\n`;
      fs.writeFileSync(path.join(isoDir, `file_${i}.ts`), content);
      fs.writeFileSync(path.join(natDir, `file_${i}.ts`), content);
    }

    // Status Matrix (isomorphic-git)
    const tStatusIsoStart = performance.now();
    const matrix = await git.statusMatrix({ fs, dir: isoDir });
    const tStatusIso = performance.now() - tStatusIsoStart;
    console.log(`   isomorphic-git statusMatrix:            ${tStatusIso.toFixed(2)} ms (${matrix.length} entries)`);

    // Native git status
    const tStatusNatStart = performance.now();
    const natStatus = execSync('git status --porcelain', { cwd: natDir }).toString();
    const tStatusNat = performance.now() - tStatusNatStart;
    console.log(`   native git status:                      ${tStatusNat.toFixed(2)} ms (speedup: ${(tStatusIso / tStatusNat).toFixed(1)}x)`);

    // Stage (git add)
    const tAddIsoStart = performance.now();
    for (const [filepath] of matrix) {
      await git.add({ fs, dir: isoDir, filepath });
    }
    const tAddIso = performance.now() - tAddIsoStart;
    console.log(`   isomorphic-git stageAllFiles (add):     ${tAddIso.toFixed(2)} ms`);

    const tAddNatStart = performance.now();
    execSync('git add -A', { cwd: natDir });
    const tAddNat = performance.now() - tAddNatStart;
    console.log(`   native git add -A:                      ${tAddNat.toFixed(2)} ms (speedup: ${(tAddIso / tAddNat).toFixed(1)}x)`);

    // Commit
    const tCommitIsoStart = performance.now();
    const sha = await git.commit({
      fs,
      dir: isoDir,
      author: { name: 'Krypton User', email: 'user@krypton.local' },
      message: `Commit ${count} files`
    });
    const tCommitIso = performance.now() - tCommitIsoStart;
    console.log(`   isomorphic-git commit:                  ${tCommitIso.toFixed(2)} ms (SHA: ${sha.slice(0, 7)})`);

    const tCommitNatStart = performance.now();
    execSync('git -c user.name="Krypton User" -c user.email="user@krypton.local" commit -q -m "Commit"', { cwd: natDir });
    const tCommitNat = performance.now() - tCommitNatStart;
    console.log(`   native git commit:                      ${tCommitNat.toFixed(2)} ms (speedup: ${(tCommitIso / tCommitNat).toFixed(1)}x)`);

    console.log(`   --> Total Git Cycle (Status+Stage+Commit):`);
    console.log(`       isomorphic-git: ${(tStatusIso + tAddIso + tCommitIso).toFixed(2)} ms`);
    console.log(`       native git:     ${(tStatusNat + tAddNat + tCommitNat).toFixed(2)} ms`);
    console.log(`       Overall Speedup: ${((tStatusIso + tAddIso + tCommitIso) / (tStatusNat + tAddNat + tCommitNat)).toFixed(1)}x`);
  }
}

runBenchmark().catch(console.error);
