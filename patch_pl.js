const fs = require('fs');

// Patch index.html for P&L Dates
let html = fs.readFileSync('index.html', 'utf8');

const plHeaderOld = `        <div class="filters">
          <select id="pl-fy" onchange="loadPLReport()"></select>
        </div>`;
const plHeaderNew = `        <div class="filters" style="display:flex; gap:8px;">
          <input type="date" id="pl-start" style="padding:6px; border-radius:6px; border:1px solid var(--border);" onchange="loadPLReport()">
          <span style="align-self:center; color:var(--text-dim);">to</span>
          <input type="date" id="pl-end" style="padding:6px; border-radius:6px; border:1px solid var(--border);" onchange="loadPLReport()">
        </div>`;
html = html.replace(plHeaderOld, plHeaderNew);
fs.writeFileSync('index.html', html);


// Patch app.js for P&L Dates
let app = fs.readFileSync('js/app.js', 'utf8');

const plAppOld = `function loadPLReport() {
  if(!S.url) return;
  const fy = document.getElementById('pl-fy').value;
  const cacheKey = \`sp_cache_pl_\${fy}\`;`;

const plAppNew = `function loadPLReport() {
  if(!S.url) return;
  const sd = document.getElementById('pl-start').value;
  const ed = document.getElementById('pl-end').value;
  const cacheKey = \`sp_cache_pl_custom_\${sd}_\${ed}\`;`;
app = app.replace(plAppOld, plAppNew);

const plFetchOld = `fetchWithTimeout(\`\${S.url}?action=plreport&fy=\${fy}\`, {})`;
const plFetchNew = `fetchWithTimeout(\`\${S.url}?action=plreport&startDate=\${sd}&endDate=\${ed}\`, {})`;
app = app.replace(plFetchOld, plFetchNew);

fs.writeFileSync('js/app.js', app);
console.log('P&L UI patched for Phase 6!');
