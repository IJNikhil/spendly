const fs = require('fs');

// 1. Patch index.html
let index = fs.readFileSync('index.html', 'utf8');

const htmlOld = `          <h2 class="card-title">Manage Bank Accounts</h2>
          <p class="text-muted" style="font-size:13px;margin-bottom:16px;">Add your bank accounts (e.g. HDFC - 1234) to track them separately.</p>
          <div class="input-row" style="margin-bottom:16px;">
            <div class="input-group flex-1">
              <input type="text" id="inp-bank-name" placeholder="Bank & Last 4 Digits">
            </div>
            <button class="btn btn-primary" onclick="addBankAccount()">Add</button>
          </div>
          <div id="bank-accounts-list" style="display:flex; flex-direction:column; gap:8px;"></div>`;
const htmlNew = `          <h2 class="card-title">Manage Bank Accounts</h2>
          <p class="text-muted" style="font-size:13px;margin-bottom:16px;">Add your bank accounts to track them separately. These sync directly to your spreadsheet database.</p>
          <div class="input-row" style="margin-bottom:16px;">
            <div class="input-group flex-1">
              <input type="text" id="inp-bank-name" placeholder="Bank Name (e.g. HDFC)">
            </div>
            <div class="input-group flex-1">
              <input type="number" id="inp-bank-last4" placeholder="Last 4 Digits" max="9999">
            </div>
            <button class="btn btn-primary" onclick="addBankAccount()">Add</button>
          </div>
          <div id="bank-accounts-list" style="display:flex; flex-direction:column; gap:8px;"></div>`;
index = index.replace(htmlOld, htmlNew);
index = index.replace("sw.js?v=2.7.1", "sw.js?v=2.8");
index = index.replace('<script src="js/app.js?v=2.7.1"></script>', '<script src="js/app.js?v=2.8"></script>');
fs.writeFileSync('index.html', index);


// 2. Patch sw.js
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace("spendly-pro-v2.3", "spendly-pro-v2.4");
fs.writeFileSync('sw.js', sw);

// 3. Patch app.js
let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace("APP_VERSION = 'v2.7.1'", "APP_VERSION = 'v2.8'");

// We need to change how S is structured to include S.accounts
if (!app.includes("S.accounts")) {
  app = app.replace("loans: []", "loans: [], accounts: ['Default']");
}

// In loadDashboard, it needs to save accounts
const dashFetchOld = `      S.loans = d.loans || [];
      renderDashboardData(d);`;
const dashFetchNew = `      S.loans = d.loans || [];
      S.accounts = d.accounts || ['Default'];
      renderBankAccounts(); // Update dropdowns
      renderDashboardData(d);`;
app = app.replace(dashFetchOld, dashFetchNew);

// Replace getBankAccounts, addBankAccount, removeBankAccount, renderBankAccounts
const accountsOld = `function getBankAccounts() {
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
  updateSelect('hist-account', true);
  updateSelect('dash-account', true);
}`;

const accountsNew = `function getBankAccounts() {
  return S.accounts || ['Default'];
}

function addBankAccount() {
  const bank = document.getElementById('inp-bank-name').value.trim();
  const last4 = document.getElementById('inp-bank-last4').value.trim();
  if(!bank) { toast('Bank Name is required', 'err'); return; }
  let name = bank;
  if(last4) name += ' - ' + last4;
  
  const accounts = getBankAccounts();
  if(accounts.includes(name)) { toast('Account already exists', 'err'); return; }
  
  toast('Saving account...', 'ok');
  fetchWithTimeout(\`\${S.url}?action=syncAccounts\`, {
    method: 'POST',
    body: JSON.stringify({op: 'add', name: name})
  }).then(r=>r.json()).then(d=>{
    if(d.success) {
      S.accounts = d.accounts || ['Default'];
      renderBankAccounts();
      toast('Account saved to database', 'ok');
      document.getElementById('inp-bank-name').value = '';
      document.getElementById('inp-bank-last4').value = '';
    } else {
      toast('Failed to save account', 'err');
    }
  }).catch(() => toast('Network Error', 'err'));
}

function removeBankAccount(name) {
  if(name === 'Default') return;
  if(!confirm('Delete this account from Spendly?')) return;
  
  toast('Deleting account...', 'ok');
  fetchWithTimeout(\`\${S.url}?action=syncAccounts\`, {
    method: 'POST',
    body: JSON.stringify({op: 'delete', name: name})
  }).then(r=>r.json()).then(d=>{
    if(d.success) {
      S.accounts = d.accounts || ['Default'];
      renderBankAccounts();
      toast('Account deleted', 'ok');
    } else {
      toast('Failed to delete account', 'err');
    }
  }).catch(() => toast('Network Error', 'err'));
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
  updateSelect('mod-bank', false); // Fix: The ID in the modal is mod-bank
  updateSelect('hist-account', true);
  updateSelect('dash-account', true);
}`;

app = app.replace(accountsOld, accountsNew);
fs.writeFileSync('js/app.js', app);
console.log('Frontend UI patched for Accounts!');
