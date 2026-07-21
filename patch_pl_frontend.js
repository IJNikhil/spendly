const fs = require('fs');
let content = fs.readFileSync('js/app.js', 'utf8');

const target2 = `function loadPLReport() {
  if(!S.url) return;
  const sd = document.getElementById('pl-start').value;
  const ed = document.getElementById('pl-end').value;`;

const replacement2 = `function loadPLReport() {
  if(!S.url) return;
  let sd = document.getElementById('pl-start').value;
  let ed = document.getElementById('pl-end').value;
  if (!sd || !ed) {
    const now = new Date();
    let y = now.getFullYear();
    let fy = (now.getMonth() + 1 <= 3) ? y : y + 1;
    sd = (fy - 1) + "-04-01";
    ed = fy + "-03-31";
    document.getElementById('pl-start').value = sd;
    document.getElementById('pl-end').value = ed;
  }`;

content = content.replace(target2, replacement2);

fs.writeFileSync('js/app.js', content);
console.log('Patched app.js for PL report dates');
