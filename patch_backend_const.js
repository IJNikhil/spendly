const fs = require('fs');

const backendCode = fs.readFileSync('AppsScript.js', 'utf8');
let appCode = fs.readFileSync('js/app.js', 'utf8');

// The BACKEND_CODE string is enclosed in backticks, so we need to escape backticks and ${}
const escapedBackendCode = backendCode.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

// Regex to find the whole BACKEND_CODE block
const regex = /const BACKEND_CODE = `[\s\S]*?`;/m;

if (regex.test(appCode)) {
  appCode = appCode.replace(regex, `const BACKEND_CODE = \`${escapedBackendCode}\`;`);
  fs.writeFileSync('js/app.js', appCode);
  console.log('Successfully updated BACKEND_CODE in app.js');
} else {
  console.log('Failed to find BACKEND_CODE in app.js');
}
