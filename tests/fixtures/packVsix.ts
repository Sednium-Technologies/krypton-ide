import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import AdmZipClass from 'adm-zip';

// AdmZip ESM/CJS compatibility resolution
const AdmZip: any = (AdmZipClass as any)?.default || AdmZipClass;

export interface ExtensionManifestSummary {
  name: string;
  publisher: string;
  version: string;
  displayName?: string;
  description?: string;
  [key: string]: any;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateContentTypesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="xml" ContentType="text/xml" />
  <Default Extension="svg" ContentType="image/svg+xml" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="md" ContentType="text/markdown" />
</Types>`.trim();
}

export function generateVsixManifestXml(manifest: ExtensionManifestSummary): string {
  const identityId = escapeXml(manifest.name);
  const version = escapeXml(manifest.version);
  const publisher = escapeXml(manifest.publisher);
  const displayName = escapeXml(manifest.displayName || manifest.name);
  const description = escapeXml(manifest.description || '');

  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Id="${identityId}" Version="${version}" Publisher="${publisher}" />
    <DisplayName>${displayName}</DisplayName>
    <Description>${description}</Description>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>`.trim();
}

/**
 * Builds an authentic OPC-compliant VSIX package from a fixture extension directory.
 *
 * @param fixtureDir Path to the extension fixture directory containing package.json
 * @param outVsixPath Path where the resulting .vsix archive should be written
 * @returns Normalized absolute path to the generated .vsix package
 */
export function buildVsix(fixtureDir: string, outVsixPath: string): string {
  const resolvedFixtureDir = path.resolve(fixtureDir);
  const packageJsonPath = path.join(resolvedFixtureDir, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Cannot build VSIX: '${packageJsonPath}' not found.`);
  }

  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
  let manifest: ExtensionManifestSummary;
  try {
    manifest = JSON.parse(packageJsonContent);
  } catch (err: any) {
    throw new Error(`Failed to parse '${packageJsonPath}' as JSON: ${err.message}`);
  }

  // Validate mandatory fields according to VS Code / OPC VSIX spec
  if (!manifest.name || typeof manifest.name !== 'string' || manifest.name.trim() === '') {
    throw new Error(`Invalid manifest in ${fixtureDir}: 'name' is required and must be non-empty.`);
  }
  if (!manifest.publisher || typeof manifest.publisher !== 'string' || manifest.publisher.trim() === '') {
    throw new Error(`Invalid manifest in ${fixtureDir}: 'publisher' is required and must be non-empty.`);
  }
  if (!manifest.version || typeof manifest.version !== 'string' || manifest.version.trim() === '') {
    throw new Error(`Invalid manifest in ${fixtureDir}: 'version' is required and must be non-empty.`);
  }

  const zip = new AdmZip();

  // 1. Root XML OPC manifests
  const contentTypesXml = generateContentTypesXml();
  const vsixManifestXml = generateVsixManifestXml(manifest);

  zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf-8'));
  zip.addFile('extension.vsixmanifest', Buffer.from(vsixManifestXml, 'utf-8'));

  // 2. Recursively package all files under 'extension/<relative_path>'
  function walkAndAdd(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(resolvedFixtureDir, fullPath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        walkAndAdd(fullPath);
      } else if (entry.isFile()) {
        const fileData = fs.readFileSync(fullPath);
        zip.addFile(`extension/${relPath}`, fileData);
      }
    }
  }

  walkAndAdd(resolvedFixtureDir);

  // 3. Write VSIX archive to destination
  const resolvedOutPath = path.resolve(outVsixPath);
  const outDir = path.dirname(resolvedOutPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  zip.writeZip(resolvedOutPath);
  return resolvedOutPath;
}
