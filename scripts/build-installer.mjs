import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const exe = resolve(root, "build", "duocode.exe");
const iss = resolve(root, "installer", "duocode-setup.iss");

// 1. Verify duocode.exe exists
if (!existsSync(exe)) {
  console.error(`ERROR: ${exe} not found. Run "npm run build:exe" first.`);
  process.exit(1);
}

// 2. Find ISCC
const knownPaths = [
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
  "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
];

let iscc = null;

// First check well-known install locations
for (const p of knownPaths) {
  if (existsSync(p)) {
    iscc = p;
    break;
  }
}

// Fallback: try "iscc" on PATH
if (!iscc) {
  try {
    execSync("iscc /?", { stdio: "ignore", shell: "cmd.exe" });
    iscc = "iscc";
  } catch {
    // not on PATH
  }
}

if (!iscc) {
  console.error(
    "ERROR: Inno Setup compiler (ISCC.exe) not found.\n" +
      "Install Inno Setup 6 from https://jrsoftware.org/isdownload.php\n" +
      "or add ISCC.exe to your PATH."
  );
  process.exit(1);
}

// 3. Run ISCC
console.log(`Building installer with: ${iscc}`);
try {
  execSync(`"${iscc}" "${iss}"`, { stdio: "inherit", cwd: root, shell: "cmd.exe" });
} catch (err) {
  console.error("Installer build failed.");
  process.exit(1);
}

const output = resolve(root, "build", "duocode-installer.exe");
if (existsSync(output)) {
  console.log(`\nInstaller created: ${output}`);
} else {
  console.error("Expected output not found:", output);
  process.exit(1);
}
