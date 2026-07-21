const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

// 1. init()
app = app.replace("const dMSel = document.getElementById('dash-month');", "renderBankAccounts();\n  const dMSel = document.getElementById('dash-month');");

// 2. saveTxn() variable extraction
app = app.replace("let incomeH = document.getElementById('mod-income-head').value;", "let incomeH = document.getElementById('mod-income-head').value;\n  let account = document.getElementById('mod-account').value || 'Default';");

// 3. saveTxn() edit payload
app = app.replace("incomeHead: (S.type === 'income') ? incomeH : '',", "incomeHead: (S.type === 'income') ? incomeH : '', bankAccount: account,");

// 4. saveTxn() split payload A
app = app.replace("taxSection: taxSec, paymentMode: payMode, incomeHead: '',", "taxSection: taxSec, paymentMode: payMode, incomeHead: '', bankAccount: account,");

// 5. saveTxn() split payload B
app = app.replace("taxSection: 'None', paymentMode: payMode, incomeHead: '',", "taxSection: 'None', paymentMode: payMode, incomeHead: '', bankAccount: account,");

// 6. saveTxn() normal payload
app = app.replace("taxSection: (S.type === 'expense' || S.type === 'investment') ? taxSec : 'None',\n      paymentMode: payMode,\n      incomeHead: (S.type === 'income') ? incomeH : '',", "taxSection: (S.type === 'expense' || S.type === 'investment') ? taxSec : 'None',\n      paymentMode: payMode,\n      incomeHead: (S.type === 'income') ? incomeH : '', bankAccount: account,");

// 7. processCSV() payload
app = app.replace("let catOptions = (S.categories[type] || S.categories.expense);", "let catOptions = (S.categories[type] || S.categories.expense);\n      let account = document.getElementById('csv-account').value || 'Default';");
app = app.replace("taxSection: 'None', paymentMode: 'Net Banking', incomeHead: type==='income'?'Other Sources':'',", "taxSection: 'None', paymentMode: 'Net Banking', incomeHead: type==='income'?'Other Sources':'', bankAccount: account,");

// 8. clearDashCache()
app = app.replace("const m = document.getElementById('dash-month').value;\n  const y = document.getElementById('dash-year').value;\n  localStorage.removeItem(`sp_cache_dash_${m}_${y}`);", "const m = document.getElementById('dash-month').value;\n  const y = document.getElementById('dash-year').value;\n  const acc = document.getElementById('dash-account') ? document.getElementById('dash-account').value : 'all';\n  localStorage.removeItem(`sp_cache_dash_${acc}_${m}_${y}`);");

// 9. loadDashboard() url and cache
app = app.replace("const m = document.getElementById('dash-month').value;\n  const y = document.getElementById('dash-year').value;", "const m = document.getElementById('dash-month').value;\n  const y = document.getElementById('dash-year').value;\n  const acc = document.getElementById('dash-account') ? document.getElementById('dash-account').value : 'all';");
app = app.replace("const cacheKey = `sp_cache_dash_${m}_${y}`;", "const cacheKey = `sp_cache_dash_${acc}_${m}_${y}`;");
app = app.replace("const url = `${S.url}?action=dashboard&month=${m}&year=${y}`;", "const url = `${S.url}?action=dashboard&month=${m}&year=${y}&account=${acc}`;");

// 10. loadHistory() url and cache
app = app.replace("const m = document.getElementById('hist-month').value;\n  const y = document.getElementById('hist-year').value;", "const m = document.getElementById('hist-month').value;\n  const y = document.getElementById('hist-year').value;\n  const acc = document.getElementById('hist-account') ? document.getElementById('hist-account').value : 'all';");
app = app.replace("const cacheKey = `sp_cache_hist_${m}_${y}`;", "const cacheKey = `sp_cache_hist_${acc}_${m}_${y}`;");
app = app.replace("fetchWithTimeout(`${S.url}?action=history&month=${m}&year=${y}`, {})", "fetchWithTimeout(`${S.url}?action=history&month=${m}&year=${y}&account=${acc}`, {})");

// 11. Add bank account functions
const functions = `
// --- BANK ACCOUNTS ---
function getBankAccounts() {
  return JSON.parse(localStorage.getItem('sp_bank_accounts') || '["Default"]');
}

function addBankAccount() {
  const name = document.getElementById('inp-bank-name').value.trim();
  if(!name) return;
  const accounts = getBankAccounts();
  if(!accounts.includes(name)) {
    accounts.push(name);
    localStorage.setItem('sp_bank_accounts', JSON.stringify(accounts));
    renderBankAccounts();
    toast('Account Added', 'ok');
  }
  document.getElementById('inp-bank-name').value = '';
}

function removeBankAccount(name) {
  if(name === 'Default') return;
  const accounts = getBankAccounts().filter(a => a !== name);
  localStorage.setItem('sp_bank_accounts', JSON.stringify(accounts));
  renderBankAccounts();
  toast('Account Removed', 'ok');
}

function renderBankAccounts() {
  const accounts = getBankAccounts();
  
  const list = document.getElementById('bank-accounts-list');
  if(list) {
    list.innerHTML = accounts.map(a => \`
      <div style="display:flex;justify-content:space-between;background:var(--surface-hover);padding:10px 14px;border-radius:8px;">
        <span>\${a}</span>
        \${a !== 'Default' ? \`<button onclick="removeBankAccount('\${a}')" style="background:none;border:none;color:var(--expense);cursor:pointer;font-weight:bold;">✕</button>\` : ''}
      </div>
    \`).join('');
  }
  
  const updateSelect = (id, includeAll) => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = includeAll ? '<option value="all">All Accounts</option>' : '';
    accounts.forEach(a => sel.appendChild(new Option(a, a)));
    if(accounts.includes(currentVal) || (includeAll && currentVal === 'all')) sel.value = currentVal;
  };
  
  updateSelect('csv-account', false);
  updateSelect('mod-account', false);
  updateSelect('dash-account', true);
  updateSelect('hist-account', true);
}
`;

app += functions;

fs.writeFileSync('js/app.js', app);
console.log('Done app.js modifications');
