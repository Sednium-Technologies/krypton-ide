import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
// @ts-ignore
import AdmZipClass from 'adm-zip';
import { buildVsix } from './fixtures/packVsix';

const AdmZip: any = (AdmZipClass as any)?.default || AdmZipClass;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const TMP_OUTPUT_DIR = path.join(os.tmpdir(), `krypton-vsix-test-${Date.now()}`);

const FIXTURES = [
  {
    name: 'sample-theme-ext',
    dir: path.join(FIXTURES_DIR, 'sample-theme-ext'),
    expectedFiles: ['extension/package.json', 'extension/syntaxes/cyberpunk-neon.json'],
  },
  {
    name: 'sample-snippets-ext',
    dir: path.join(FIXTURES_DIR, 'sample-snippets-ext'),
    expectedFiles: ['extension/package.json', 'extension/snippets/typescript.json'],
  },
  {
    name: 'sample-treeview-ext',
    dir: path.join(FIXTURES_DIR, 'sample-treeview-ext'),
    expectedFiles: ['extension/package.json', 'extension/main.js'],
  },
  {
    name: 'sample-webview-ext',
    dir: path.join(FIXTURES_DIR, 'sample-webview-ext'),
    expectedFiles: ['extension/package.json', 'extension/main.js'],
  },
  {
    name: 'sample-lsp-ext',
    dir: path.join(FIXTURES_DIR, 'sample-lsp-ext'),
    expectedFiles: ['extension/package.json', 'extension/main.js'],
  },
  {
    name: 'sample-agent-ext',
    dir: path.join(FIXTURES_DIR, 'sample-agent-ext'),
    expectedFiles: ['extension/package.json', 'extension/main.js'],
  },
];

describe('Native VSIX Packager & Fixture Matrix', () => {
  after(() => {
    if (fs.existsSync(TMP_OUTPUT_DIR)) {
      fs.rmSync(TMP_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  for (const fixture of FIXTURES) {
    it(`should build valid OPC VSIX package for ${fixture.name}`, () => {
      const outVsix = path.join(TMP_OUTPUT_DIR, `${fixture.name}.vsix`);
      const returnedPath = buildVsix(fixture.dir, outVsix);

      assert.equal(returnedPath, outVsix);
      assert.ok(fs.existsSync(outVsix), `Expected VSIX file to exist at ${outVsix}`);
      assert.ok(fs.statSync(outVsix).size > 100, 'VSIX file size should be > 100 bytes');

      // Verify OPC Archive layout with AdmZip
      const zip = new AdmZip(outVsix);
      const entries = zip.getEntries().map((e: any) => e.entryName);

      // Verify Open Packaging Conventions (OPC) root files
      assert.ok(entries.includes('[Content_Types].xml'), 'Must contain [Content_Types].xml');
      assert.ok(entries.includes('extension.vsixmanifest'), 'Must contain extension.vsixmanifest');
      assert.ok(entries.includes('extension/package.json'), 'Must contain extension/package.json');

      // Verify specific expected fixture payload files
      for (const expectedFile of fixture.expectedFiles) {
        assert.ok(entries.includes(expectedFile), `Must contain entry: ${expectedFile}`);
      }

      // Verify manifest content integrity
      const originalPkg = JSON.parse(fs.readFileSync(path.join(fixture.dir, 'package.json'), 'utf-8'));
      const zipPkg = JSON.parse(zip.readAsText('extension/package.json'));
      assert.deepEqual(zipPkg, originalPkg, 'VSIX package.json must match original fixture package.json');

      const manifestXml = zip.readAsText('extension.vsixmanifest');
      assert.ok(manifestXml.includes(`Id="${originalPkg.name}"`), 'vsixmanifest must have matching Identity Id');
      assert.ok(manifestXml.includes(`Publisher="${originalPkg.publisher}"`), 'vsixmanifest must have matching Publisher');
      assert.ok(manifestXml.includes(`Version="${originalPkg.version}"`), 'vsixmanifest must have matching Version');

      const contentTypesXml = zip.readAsText('[Content_Types].xml');
      assert.ok(contentTypesXml.includes('Extension="json"'), '[Content_Types].xml must declare json');
      assert.ok(contentTypesXml.includes('Extension="js"'), '[Content_Types].xml must declare js');
      assert.ok(contentTypesXml.includes('Extension="vsixmanifest"'), '[Content_Types].xml must declare vsixmanifest');
    });
  }

  it('should reject invalid extension directory without package.json', () => {
    const emptyDir = path.join(TMP_OUTPUT_DIR, 'empty-dir');
    fs.mkdirSync(emptyDir, { recursive: true });
    const outVsix = path.join(TMP_OUTPUT_DIR, 'empty.vsix');

    assert.throws(
      () => buildVsix(emptyDir, outVsix),
      /not found/i,
      'Should throw an error when package.json is missing'
    );
  });

  it('should reject manifest missing mandatory identity fields', () => {
    const invalidDir = path.join(TMP_OUTPUT_DIR, 'invalid-manifest');
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(
      path.join(invalidDir, 'package.json'),
      JSON.stringify({ name: 'test-no-pub', version: '1.0.0' }),
      'utf-8'
    );
    const outVsix = path.join(TMP_OUTPUT_DIR, 'invalid.vsix');

    assert.throws(
      () => buildVsix(invalidDir, outVsix),
      /'publisher' is required/i,
      'Should throw when publisher is missing'
    );
  });
});
