import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFileIconSvg,
  resolveFolderIconSvg,
  registerCustomSvg,
  getCustomSvg,
  registerIconThemeDefinition,
  clearIconEngineCache,
  ensureSvgResponsive,
} from '../src/lib/dynamicIconEngine.ts';

describe('dynamicIconEngine', () => {
  beforeEach(() => {
    clearIconEngineCache();
  });

  describe('Default Krypton Theme (Aesthetic Vector Silhouettes)', () => {
    test('removes rigid rectangular frames from HTML file icon', () => {
      const svg = resolveFileIconSvg('index.html', 'krypton');
      assert.ok(svg.includes('<svg'));
      assert.ok(!svg.includes('rect width="24" height="24" rx="6"'));
      assert.ok(svg.includes('#E06C75')); // Coral accent
    });

    test('resolves CSS file with matcha accent', () => {
      const svg = resolveFileIconSvg('styles.css', 'krypton');
      assert.ok(!svg.includes('rx="6"'));
      assert.ok(svg.includes('#7C9B79')); // Matcha accent
    });

    test('resolves JS file in warm gold', () => {
      const svg = resolveFileIconSvg('app.js', 'krypton');
      assert.ok(svg.includes('#E5C07B'));
    });

    test('resolves TS file in pale blue', () => {
      const svg = resolveFileIconSvg('main.ts', 'krypton');
      assert.ok(svg.includes('#61AFEF'));
    });

    test('resolves React TSX and JSX file with atomic orbit', () => {
      const tsxSvg = resolveFileIconSvg('App.tsx', 'krypton');
      const jsxSvg = resolveFileIconSvg('Button.jsx', 'krypton');
      assert.ok(tsxSvg.includes('ellipse'));
      assert.ok(jsxSvg.includes('ellipse'));
      assert.ok(tsxSvg.includes('#56B6C2'));
    });

    test('resolves Python file with dual-tone snakes', () => {
      const svg = resolveFileIconSvg('script.py', 'krypton');
      assert.ok(svg.includes('#7C9B79'));
      assert.ok(svg.includes('#E5C07B'));
    });

    test('resolves JSON file with matcha curly braces', () => {
      const svg = resolveFileIconSvg('data.json', 'krypton');
      assert.ok(svg.includes('#7C9B79'));
    });

    test('resolves Markdown file with document outline', () => {
      const svg = resolveFileIconSvg('README.md', 'krypton');
      assert.ok(svg.includes('#7C9B79'));
    });

    test('resolves package.json and config files', () => {
      const pkgSvg = resolveFileIconSvg('package.json', 'krypton');
      const gitSvg = resolveFileIconSvg('.gitignore', 'krypton');
      const dockerSvg = resolveFileIconSvg('Dockerfile', 'krypton');
      assert.ok(pkgSvg.includes('<svg'));
      assert.ok(gitSvg.includes('<circle'));
      assert.ok(dockerSvg.includes('<svg'));
    });

    test('resolves default file icon without boxed frames', () => {
      const svg = resolveFileIconSvg('unknown.xyz', 'krypton');
      assert.ok(!svg.includes('rx="6"'));
      assert.ok(svg.includes('stroke="#F3F0E7"'));
    });

    test('resolves closed and open folder icons', () => {
      const closed = resolveFolderIconSvg('src', false, 'krypton');
      const open = resolveFolderIconSvg('src', true, 'krypton');
      assert.ok(closed.includes('#7C9B79'));
      assert.ok(open.includes('#7C9B79'));
      assert.notEqual(closed, open);
    });

    test('resolves Java, Kotlin, Gradle, and XML files in Krypton theme', () => {
      const javaSvg = resolveFileIconSvg('MainActivity.java', 'krypton');
      const ktSvg = resolveFileIconSvg('MainActivity.kt', 'krypton');
      const gradleSvg = resolveFileIconSvg('build.gradle', 'krypton');
      const xmlSvg = resolveFileIconSvg('AndroidManifest.xml', 'krypton');
      assert.ok(javaSvg.includes('<svg'));
      assert.ok(ktSvg.includes('<svg'));
      assert.ok(gradleSvg.includes('<svg'));
      assert.ok(xmlSvg.includes('<svg'));
    });
  });

  describe('Google Material Design Theme', () => {
    test('resolves authentic HTML5 shield', () => {
      const svg = resolveFileIconSvg('index.html', 'material');
      assert.ok(svg.includes('#E44D26'));
      assert.ok(svg.includes('#F16529'));
    });

    test('resolves authentic CSS3 shield', () => {
      const svg = resolveFileIconSvg('style.css', 'material');
      assert.ok(svg.includes('#1572B6'));
      assert.ok(svg.includes('#33A9DC'));
    });

    test('resolves authentic JS yellow square typography', () => {
      const svg = resolveFileIconSvg('index.js', 'material');
      assert.ok(svg.includes('#F7DF1E'));
      assert.ok(svg.includes('#000000'));
    });

    test('resolves authentic TS blue square typography', () => {
      const svg = resolveFileIconSvg('index.ts', 'material');
      assert.ok(svg.includes('#3178C6'));
      assert.ok(svg.includes('#FFFFFF'));
    });

    test('resolves authentic React atom with cyan center', () => {
      const svg = resolveFileIconSvg('App.tsx', 'material');
      assert.ok(svg.includes('#61DAFB'));
      assert.ok(svg.includes('ellipse'));
    });

    test('resolves authentic Python snakes in blue and yellow', () => {
      const svg = resolveFileIconSvg('main.py', 'material');
      assert.ok(svg.includes('#3776AB'));
      assert.ok(svg.includes('#FFD43B'));
    });

    test('resolves authentic JSON yellow brackets', () => {
      const svg = resolveFileIconSvg('manifest.json', 'material');
      assert.ok(svg.includes('#FBC02D'));
    });

    test('resolves authentic Java cup with steam', () => {
      const svg = resolveFileIconSvg('MainActivity.java', 'material');
      assert.ok(svg.includes('#E76F00'));
      assert.ok(svg.includes('#5382A1'));
    });

    test('resolves authentic Kotlin gradient icon', () => {
      const svg = resolveFileIconSvg('MainActivity.kt', 'material');
      assert.ok(svg.includes('ktGrad'));
      assert.ok(svg.includes('#7F52FF'));
    });

    test('resolves authentic Gradle elephant icon', () => {
      const svg = resolveFileIconSvg('build.gradle', 'material');
      assert.ok(svg.includes('#02303A'));
      assert.ok(svg.includes('#05A85C'));
    });

    test('resolves authentic XML tag icon', () => {
      const svg = resolveFileIconSvg('AndroidManifest.xml', 'material');
      assert.ok(svg.includes('#FF9800'));
    });

    test('resolves authentic Material folders with amber tabs', () => {
      const closed = resolveFolderIconSvg('components', false, 'material');
      const open = resolveFolderIconSvg('components', true, 'material');
      assert.ok(closed.includes('#FFA000'));
      assert.ok(closed.includes('#FFCA28'));
      assert.ok(open.includes('#FFD54F'));
    });

    test('resolves material-icon-theme alias identically', () => {
      const svg = resolveFileIconSvg('index.ts', 'material-icon-theme');
      assert.ok(svg.includes('#3178C6'));
      const javaSvg = resolveFileIconSvg('MainActivity.java', 'material-icon-theme');
      assert.ok(javaSvg.includes('#E76F00'));
    });
  });

  describe('Custom VSIX / Registered Themes', () => {
    test('resolves custom SVG registered for theme and icon key', () => {
      const customThemeId = 'custom-theme-test';
      const customSvg = '<svg id="custom-python"></svg>';
      registerCustomSvg(customThemeId, 'python', customSvg);
      assert.equal(getCustomSvg(customThemeId, 'python'), customSvg);
      const resolved = resolveFileIconSvg('main.py', customThemeId);
      assert.equal(resolved, ensureSvgResponsive(customSvg));
    });

    test('resolves custom theme definition by fileNames and fileExtensions', () => {
      const customThemeId = 'my-theme';
      registerCustomSvg(customThemeId, '_custom_config', '<svg id="cfg"></svg>');
      registerCustomSvg(customThemeId, '_custom_ts', '<svg id="ts"></svg>');

      registerIconThemeDefinition(customThemeId, {
        fileNames: { 'special.config': '_custom_config' },
        fileExtensions: { ts: '_custom_ts' },
      });

      assert.equal(resolveFileIconSvg('special.config', customThemeId), ensureSvgResponsive('<svg id="cfg"></svg>'));
      assert.equal(resolveFileIconSvg('code.ts', customThemeId), ensureSvgResponsive('<svg id="ts"></svg>'));
    });

    test('resolves custom folder icons for open and closed states', () => {
      const customThemeId = 'folder-theme';
      registerCustomSvg(customThemeId, '_folder', '<svg id="fld"></svg>');
      registerCustomSvg(customThemeId, '_folder_open', '<svg id="fld-open"></svg>');

      registerIconThemeDefinition(customThemeId, {
        folder: '_folder',
        folderExpanded: '_folder_open',
      });

      assert.equal(resolveFolderIconSvg('docs', false, customThemeId), ensureSvgResponsive('<svg id="fld"></svg>'));
      assert.equal(resolveFolderIconSvg('docs', true, customThemeId), ensureSvgResponsive('<svg id="fld-open"></svg>'));
    });
  });
});
