import fs from 'node:fs';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const bundleRoot = path.join(packageRoot, 'src-tauri', 'target', 'release', 'bundle');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (predicate(absolute, entry)) found.push(absolute);
    if (entry.isDirectory() && !entry.name.endsWith('.app')) {
      found.push(...findFiles(absolute, predicate));
    }
  }
  return found;
}

assert(fs.existsSync(bundleRoot), `Tauri bundle directory is missing: ${bundleRoot}`);

const apps = findFiles(bundleRoot, (absolute, entry) => entry.isDirectory() && absolute.endsWith('.app'));
const dmgFiles = findFiles(bundleRoot, (absolute, entry) => entry.isFile() && absolute.endsWith('.dmg'));

if (process.platform === 'darwin') {
  assert(apps.length > 0, 'macOS .app bundle was not produced');
  const app = apps[0];
  const infoPlist = fs.readFileSync(path.join(app, 'Contents', 'Info.plist'), 'utf8');
  const executableName = infoPlist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
    ?? 'codeagora-desktop';
  const executable = path.join(app, 'Contents', 'MacOS', executableName);
  assert(fs.existsSync(executable), `macOS app executable is missing: ${executable}`);
  assert(fs.statSync(executable).mode & 0o111, `macOS app executable is not executable: ${executable}`);
}

assert(apps.length > 0 || dmgFiles.length > 0, 'No desktop bundle artifacts were produced');

console.log('CodeAgora desktop bundle smoke passed');
for (const artifact of [...apps, ...dmgFiles]) {
  console.log(`- ${path.relative(packageRoot, artifact)}`);
}
