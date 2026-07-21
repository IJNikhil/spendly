const fs = require('fs');
const backend = fs.readFileSync('AppsScript.js', 'utf8');
let appjs = fs.readFileSync('js/app.js', 'utf8');

const replacement = `const BACKEND_CODE = \`${backend.replace(/\\/g, '\\\\').replace(/\`/g, '\\`').replace(/\$/g, '\\$')}\`;

function copyBackendCode() {
  let btn = document.getElementById('btn-copy-code');
  if(navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(BACKEND_CODE).then(() => {
      if(btn) btn.innerText = 'Copied to Clipboard! ✓';
      toast('Code copied. Paste into Apps Script!', 'ok');
      setTimeout(() => { if(btn) btn.innerText = 'Copy Apps Script Code'; }, 3000);
    });
  } else {
    let ta = document.createElement('textarea');
    ta.value = BACKEND_CODE;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      if(btn) btn.innerText = 'Copied to Clipboard! ✓';
      toast('Code copied. Paste into Apps Script!', 'ok');
      setTimeout(() => { if(btn) btn.innerText = 'Copy Apps Script Code'; }, 3000);
    } catch (err) {
      toast('Copy failed. Open AppsScript.js manually.', 'err');
    }
    document.body.removeChild(ta);
  }
}
`;

appjs = appjs.replace(/function copyBackendCode\(\) {[\s\S]*?toast\('Please see AppsScript\.js for the complete backend code!', 'ok'\);\s*\}/, replacement);
fs.writeFileSync('js/app.js', appjs);
console.log('Done!');
