#!/usr/bin/env node
/**
 * Lisa CLI Installer
 * Installs Lisa to ~/.lisa and creates launcher in ~/.local/bin
 */

import { existsSync, mkdirSync, copyFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOME = homedir();
const LISA_DIR = join(HOME, '.lisa');
const APP_DIR = join(LISA_DIR, 'app');
const BIN_DIR = join(HOME, '.local', 'bin');

console.log('\n  Lisa CLI Installer\n  ──────────────────\n');

// Create directories
console.log('  Creating directories...');
[LISA_DIR, APP_DIR, BIN_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`    ✓ Created ${dir}`);
  }
});

// Copy lisa.js
console.log('\n  Installing Lisa...');
const srcPath = join(__dirname, 'lisa.js');
const destPath = join(APP_DIR, 'lisa.js');
copyFileSync(srcPath, destPath);
chmodSync(destPath, 0o755);
console.log(`    ✓ Installed to ${destPath}`);

// Create launcher script
const launcherPath = join(BIN_DIR, 'lisa');
const launcherContent = `#!/usr/bin/env node
import('${APP_DIR}/lisa.js');
`;
writeFileSync(launcherPath, launcherContent);
chmodSync(launcherPath, 0o755);
console.log(`    ✓ Created launcher at ${launcherPath}`);

// Check if ~/.local/bin is in PATH
const pathEnv = process.env.PATH || '';
const inPath = pathEnv.split(':').some(p => p.includes('.local/bin'));

console.log('\n  ──────────────────');
console.log('  Installation complete!\n');

if (!inPath) {
  console.log('  ⚠️  Add ~/.local/bin to your PATH:');
  console.log('');
  console.log('     # Add to ~/.zshrc or ~/.bashrc:');
  console.log('     export PATH="$HOME/.local/bin:$PATH"');
  console.log('');
  console.log('     Then restart your terminal.\n');
} else {
  console.log('  ✓ Ready to use! Run: lisa\n');
}
