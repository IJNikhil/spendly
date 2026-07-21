const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

const oldConfirm = `function confirmCSVImport() {
  if(!S.url) { toast('Connect API in Settings', 'err'); return; }
  if(!S.csvParsedRows.length) return;
  
  let btn = document.querySelector('#csv-modal .btn-primary');
  btn.innerText = 'Importing...'; btn.disabled = true;
  
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'addBulk', transactions: S.csvParsedRows}) }, 20000)
    .then(r => r.json()).then(d => {
      if(!d.success) throw new Error(d.error);
      toast(\`Imported \${S.csvParsedRows.length} records!\`, 'ok');
      invalidateCaches();
      document.getElementById('csv-modal').classList.remove('open');
      document.getElementById('csv-file').value = '';
      if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
    }).catch(e => toast('Import Failed', 'err'))
    .finally(() => { btn.innerText = 'Import All Valid Rows'; btn.disabled = false; });
}`;

const newConfirm = `function confirmCSVImport() {
  if(!S.url) { toast('Connect API in Settings', 'err'); return; }
  if(!S.csvParsedRows.length) return;
  
  // Deduplication check
  let existingHashes = new Set();
  for(let i=0; i<localStorage.length; i++) {
    let key = localStorage.key(i);
    if(key && key.startsWith('sp_cache_hist_')) {
      let d = JSON.parse(localStorage.getItem(key) || '[]');
      let list = Array.isArray(d) ? d : (d.transactions || []);
      list.forEach(t => {
        let h = t.dateStr + '_' + t.amount + '_' + t.title;
        existingHashes.add(h);
      });
    }
  }

  let finalRows = [];
  let batchHashes = {};
  for(let t of S.csvParsedRows) {
    let baseHash = t.dateStr + '_' + t.amount + '_' + t.title;
    batchHashes[baseHash] = (batchHashes[baseHash] || 0) + 1;
    let specificHash = baseHash + (batchHashes[baseHash] > 1 ? '_' + batchHashes[baseHash] : '');
    
    // Check if it exists in history and it's the first occurrence in the batch
    if (existingHashes.has(baseHash) && batchHashes[baseHash] === 1) {
      continue;
    }
    finalRows.push(t);
  }

  if (finalRows.length === 0) {
    toast('All records already exist in ledger!', 'err');
    document.getElementById('csv-modal').classList.remove('open');
    return;
  }
  let skipped = S.csvParsedRows.length - finalRows.length;
  
  let btn = document.querySelector('#csv-modal .btn-primary');
  btn.innerText = 'Importing...'; btn.disabled = true;
  
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'addBulk', transactions: finalRows}) }, 20000)
    .then(r => r.json()).then(d => {
      if(!d.success) throw new Error(d.error);
      let msg = \`Imported \${finalRows.length} records!\`;
      if (skipped > 0) msg += \` (\${skipped} duplicates skipped)\`;
      toast(msg, 'ok');
      invalidateCaches();
      document.getElementById('csv-modal').classList.remove('open');
      document.getElementById('csv-file').value = '';
      if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
    }).catch(e => toast('Import Failed', 'err'))
    .finally(() => { btn.innerText = 'Import All Valid Rows'; btn.disabled = false; });
}`;

app = app.replace(oldConfirm, newConfirm);

fs.writeFileSync('js/app.js', app);
console.log('CSV Deduplication patched!');
