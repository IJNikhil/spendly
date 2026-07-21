const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

// 1. Add secret to S
app = app.replace("type: 'expense',", "apiSecret: localStorage.getItem('sp_api_secret') || '',\n  type: 'expense',");

// 2. Wrap fetchWithTimeout for secret and offline queue
const oldFetch = `const fetchWithTimeout = (url, options = {}, timeout = 15000) => {
  const opts = { redirect: 'follow', ...options, headers: { 'Content-Type': 'text/plain;charset=utf-8', ...(options.headers || {}) } };
  return Promise.race([
    fetch(url, opts),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
};`;

const newFetch = `const fetchWithTimeout = (url, options = {}, timeout = 15000) => {
  let finalUrl = url;
  if (S.apiSecret) {
    if (options.method === 'POST') {
      if (options.body) {
        try {
          let b = JSON.parse(options.body);
          b.secret = S.apiSecret;
          options.body = JSON.stringify(b);
        } catch(e){}
      }
    } else {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'secret=' + encodeURIComponent(S.apiSecret);
    }
  }

  // Offline Pending Queue for POSTs
  if (options.method === 'POST' && !navigator.onLine) {
    let q = JSON.parse(localStorage.getItem('sp_offline_queue') || '[]');
    q.push({url: finalUrl, options, time: Date.now()});
    localStorage.setItem('sp_offline_queue', JSON.stringify(q));
    toast('Offline: Saved to pending queue', 'ok');
    return Promise.resolve({ json: () => Promise.resolve({success: true, offline: true}) });
  }

  const opts = { redirect: 'follow', ...options, headers: { 'Content-Type': 'text/plain;charset=utf-8', ...(options.headers || {}) } };
  return Promise.race([
    fetch(finalUrl, opts),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
};

window.addEventListener('online', flushOfflineQueue);
function flushOfflineQueue() {
  let q = JSON.parse(localStorage.getItem('sp_offline_queue') || '[]');
  if (!q.length) return;
  toast('Syncing offline transactions...', 'ok');
  let promises = q.map(req => {
    const opts = { redirect: 'follow', ...req.options, headers: { 'Content-Type': 'text/plain;charset=utf-8', ...(req.options.headers || {}) } };
    return fetch(req.url, opts).catch(e=>null);
  });
  Promise.all(promises).then(() => {
    localStorage.removeItem('sp_offline_queue');
    toast('Offline queue synced', 'ok');
    invalidateCaches();
    if (document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
  });
}`;
app = app.replace(oldFetch, newFetch);

// 3. Centralized Cache Eviction
const newInvalidate = `
function invalidateCaches() {
  for(let i=localStorage.length-1; i>=0; i--) {
    let key = localStorage.key(i);
    if(key && key.startsWith('sp_cache_')) {
      localStorage.removeItem(key);
    }
  }
}
function clearCache() { invalidateCaches(); }
function clearDashCache() { invalidateCaches(); }
`;
app = app.replace("function clearDashCache() {\n  const m = document.getElementById('dash-month').value;\n  const y = document.getElementById('dash-year').value;\n  const acc = document.getElementById('dash-account') ? document.getElementById('dash-account').value : 'all';\n  localStorage.removeItem(`sp_cache_dash_${acc}_${m}_${y}`);\n}", newInvalidate);

// Delete the other empty clearCache function if it exists
app = app.replace("function clearCache() {}", "");

// 4. Budget 2024 Tax Slabs (Standard Deduction 75,000 for New Regime)
// In renderITR()
app = app.replace("let standardDed = (grossSalary > 0) ? Math.min(grossSalary, 50000) : 0;", "let standardDed = (grossSalary > 0) ? Math.min(grossSalary, regime === 'new' ? 75000 : 50000) : 0;");
// In loadITR() calculateTax / summary
app = app.replace("let sDed = (gSal>0)?Math.min(gSal,50000):0;", "let sDed = (gSal>0)?Math.min(gSal, S.currentRegime === 'new' ? 75000 : 50000):0;");

// Fix Section 87A rebate for New Regime 700000 cap
const oldCalculateTax = `    if (income <= 250000) return 0;
    if (income <= 500000) return 0;
    let rem = income;
    if (rem > 1000000) { tax += (rem - 1000000) * 0.30; rem = 1000000; }
    if (rem > 500000)  { tax += (rem - 500000) * 0.20; rem = 500000; }
    if (rem > 250000)  { tax += (rem - 250000) * 0.05; }`;
    
const newCalculateTax = `    if (income <= 700000) return 0; // 87A Rebate handles up to 7L in new regime
    let rem = income;
    if (rem > 1500000) { tax += (rem - 1500000) * 0.30; rem = 1500000; }
    if (rem > 1200000) { tax += (rem - 1200000) * 0.20; rem = 1200000; }
    if (rem > 900000)  { tax += (rem - 900000) * 0.15; rem = 900000; }
    if (rem > 600000)  { tax += (rem - 600000) * 0.10; rem = 600000; }
    if (rem > 300000)  { tax += (rem - 300000) * 0.05; }`;
app = app.replace(oldCalculateTax, newCalculateTax);

// 5. Settings saving logic (app.js)
app = app.replace("const url = document.getElementById('inp-url').value.trim();", "const url = document.getElementById('inp-url').value.trim();\n  const secret = document.getElementById('inp-secret').value.trim();");
app = app.replace("localStorage.setItem('sp_pro_url', url);", "localStorage.setItem('sp_pro_url', url);\n  S.apiSecret = secret;\n  localStorage.setItem('sp_api_secret', secret);");
app = app.replace("document.getElementById('inp-url').value = S.url;", "document.getElementById('inp-url').value = S.url;\n  document.getElementById('inp-secret').value = S.apiSecret;");

fs.writeFileSync('js/app.js', app);
console.log('App.js security and cache patched!');
