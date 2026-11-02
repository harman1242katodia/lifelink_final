const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function scan(dir) {
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && !item.name.includes('backup')) {
        scan(full);
      }
    } else if (item.name.endsWith('.js')) {
      execSync(`node -c "${full}"`);
      console.log('Syntax Verified:', item.name);
    }
  }
}

['config', 'models', 'middleware', 'routes', 'LifeLink'].forEach(scan);
execSync('node -c "server.js"');
console.log('Syntax Verified: server.js');
console.log('--- ALL JAVASCRIPT FILES SYNTAX VERIFIED CLEAN ---');
