import { executeTerminalCommand } from './ai/toolActions';

export interface LocalToolchainStatus {
  java: boolean;
  gradle: boolean;
  javaVersion?: string;
  gradleVersion?: string;
  androidHome?: string;
  sdkManager?: boolean;
}

export interface LocalBuildResult {
  apkPath: string;
  log: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export async function detectLocalToolchain(): Promise<LocalToolchainStatus> {
  const command = [
    `printf 'JAVA=%s\\n' "$(command -v java || true)"`,
    `printf 'JAVA_VERSION=%s\\n' "$(java -version 2>&1 | head -n 1 || true)"`,
    `printf 'GRADLE=%s\\n' "$(command -v gradle || true)"`,
    `printf 'GRADLE_VERSION=%s\\n' "$(gradle --version 2>/dev/null | head -n 3 | tail -n 1 || true)"`,
    `printf 'ANDROID_HOME=%s\\n' "\${ANDROID_HOME:-}"`,
    `printf 'SDKMANAGER=%s\\n' "$(command -v sdkmanager || true)"`,
  ].join('; ');

  const result = await executeTerminalCommand(command, 15000);
  if (result.exitCode !== 0 && !result.stdout) {
    throw new Error(result.stderr || 'Could not inspect the local Android toolchain');
  }

  const get = (key: string): string | undefined => {
    const match = result.stdout.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match && match[1].trim() ? match[1].trim() : undefined;
  };

  return {
    java: Boolean(get('JAVA')),
    gradle: Boolean(get('GRADLE')),
    javaVersion: get('JAVA_VERSION'),
    gradleVersion: get('GRADLE_VERSION'),
    androidHome: get('ANDROID_HOME'),
    sdkManager: Boolean(get('SDKMANAGER')),
  };
}

/**
 * Builds an Android APK on-device using the Gradle toolchain already present in
 * the native terminal. There is no web fallback: without a native PTY and a
 * real Gradle install this throws and callers should fall back to the cloud
 * workflow explicitly.
 */
export async function buildAndroidApkLocally(
  projectPath: string,
  variant: 'debug' | 'release' = 'debug',
  onOutput?: (line: string) => void
): Promise<LocalBuildResult> {
  const status = await detectLocalToolchain();
  if (!status.gradle) {
    throw new Error(
      'Gradle was not found on the device. Install a local Android toolchain (Gradle + JDK 17 + Android SDK) or use the cloud build instead.'
    );
  }
  if (!status.java) {
    throw new Error(
      'Java was not found on the device. Gradle needs a JDK, or set JAVA_HOME to a local JDK before building.'
    );
  }

  const gradleTask = variant === 'release' ? 'assembleRelease' : 'assembleDebug';
  const command = `cd ${shellQuote(projectPath)} && gradle ${gradleTask} --no-daemon --console=plain`;
  onOutput?.(`$ ${command}`);

  const result = await executeTerminalCommand(command, 20 * 60 * 1000);
  onOutput?.(result.stdout);
  if (result.exitCode !== 0) {
    const tail = (result.stderr || result.stdout || '').split('\n').slice(-40).join('\n');
    throw new Error(`Gradle ${gradleTask} failed with exit code ${result.exitCode}.\n${tail}`);
  }

  const findCommand = [
    `cd ${shellQuote(projectPath)}`,
    `find app/build/outputs/apk/${variant} -name '*.apk' -type f 2>/dev/null | head -n 1`,
  ].join(' && ');
  const found = await executeTerminalCommand(findCommand, 15000);
  const apkRelative = found.stdout.split('\n').map((line) => line.trim()).find(Boolean);

  if (!apkRelative) {
    throw new Error(`Gradle succeeded but no ${variant} APK was found under app/build/outputs/apk/${variant}`);
  }

  const absoluteApk = apkRelative.startsWith('/')
    ? apkRelative
    : `${projectPath.replace(/\/$/, '')}/${apkRelative}`;

  const copyCommand = `cp ${shellQuote(absoluteApk)} "$HOME/../krypton-local-build.apk" && printf '%s' "$HOME/../krypton-local-build.apk"`;
  const copied = await executeTerminalCommand(copyCommand, 30000);
  if (copied.exitCode !== 0) {
    throw new Error(`APK was built at ${absoluteApk} but could not be copied to app storage: ${copied.stderr || copied.stdout}`);
  }

  const apkPath = copied.stdout.trim().split('\n').filter(Boolean).pop() || absoluteApk;
  return { apkPath, log: result.stdout };
}
