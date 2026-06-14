const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'client', 'dist');
const dest = path.join(__dirname, '..', 'server', 'dist', 'public');

if (!fs.existsSync(src)) {
  console.error('client/dist not found — build the client first');
  process.exit(1);
}

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true });
}

fs.cpSync(src, dest, { recursive: true });
console.log(`copied ${src} → ${dest}`);
