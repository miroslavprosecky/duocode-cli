import { createSpinner } from './ui/spinner.js';
import { printSuccess, printError, printWarning, printKeyValue } from './ui/terminal.js';
import { askConfirm } from './ui/prompt-input.js';
import { VERSION } from './version.js';
import chalk from 'chalk';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

const REPO = 'miroslavprosecky/duocode-cli';
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const EXE_NAME = 'duocode.exe';

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

export function getCurrentVersion(): string {
  return VERSION;
}

export function isSEA(): boolean {
  // When running as a Single Executable Application, process.execPath points to the bundled exe,
  // not to a node binary
  return !process.execPath.toLowerCase().includes('node');
}

export async function checkForUpdate(): Promise<{ current: string; latest: string; updateAvailable: boolean; downloadUrl?: string }> {
  const res = await fetch(RELEASE_URL, {
    headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'duocode-cli' },
  });

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
  }

  const release: GitHubRelease = await res.json() as GitHubRelease;
  const latest = release.tag_name.replace(/^v/, '');
  const current = VERSION;
  const updateAvailable = latest !== current;

  const asset = release.assets.find(a => a.name.toLowerCase() === EXE_NAME);

  return {
    current,
    latest,
    updateAvailable,
    downloadUrl: asset?.browser_download_url,
  };
}

async function downloadUpdate(url: string): Promise<string> {
  const tempPath = join(tmpdir(), 'duocode-update.exe');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'duocode-cli' },
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(tempPath, buffer);

  return tempPath;
}

function applyUpdate(newExePath: string): void {
  const currentExe = process.execPath;
  const batPath = join(tmpdir(), 'duocode-update.bat');

  // Batch script: wait for current process to exit, replace exe, clean up
  const batContent = [
    '@echo off',
    'ping 127.0.0.1 -n 2 > nul',
    `copy /Y "${newExePath}" "${currentExe}"`,
    `del "${newExePath}"`,
    `del "%~f0"`,
  ].join('\r\n');

  // Write bat synchronously via writeFileSync
  const { writeFileSync } = require('fs');
  writeFileSync(batPath, batContent, 'utf-8');

  // Spawn detached so it survives our exit
  const child = spawn('cmd.exe', ['/c', batPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export async function runUpdate(): Promise<void> {
  const spinner = createSpinner('Checking for updates...');
  spinner.start();

  let info;
  try {
    info = await checkForUpdate();
  } catch (err) {
    spinner.fail('Failed to check for updates');
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!info.updateAvailable) {
    spinner.succeed('Already up to date');
    printKeyValue('Version', info.current);
    return;
  }

  spinner.succeed('Update available');
  console.log('');
  printKeyValue('Current', info.current);
  printKeyValue('Latest', info.latest);
  console.log('');

  if (!isSEA()) {
    printWarning('Running from source (not SEA exe). Update the repo manually with git pull.');
    return;
  }

  if (!info.downloadUrl) {
    printError(`No ${EXE_NAME} asset found in the latest release. Download manually from GitHub.`);
    return;
  }

  const proceed = await askConfirm(`Update to v${info.latest}?`, true);
  if (!proceed) {
    printWarning('Update cancelled');
    return;
  }

  const dlSpinner = createSpinner('Downloading update...');
  dlSpinner.start();

  let tempExe: string;
  try {
    tempExe = await downloadUpdate(info.downloadUrl);
  } catch (err) {
    dlSpinner.fail('Download failed');
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  dlSpinner.succeed('Download complete');

  console.log(chalk.dim('  Applying update and restarting...'));
  applyUpdate(tempExe);

  printSuccess(`DuoCode will update to v${info.latest}. Relaunch after exit.`);
  process.exit(0);
}
