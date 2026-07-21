const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

// 1. Dashboard default to All Time
app = app.replace("months.forEach((m, i) => { dMSel.appendChild(new Option(m, i+1, false, i === now.getMonth())); });", "months.forEach((m, i) => { dMSel.appendChild(new Option(m, i+1, false, false)); });\n  dMSel.value = 'all';");

// 2. Fix editTxn cache search
const oldCacheSearch = `  let caches = [
    \`sp_cache_hist_\${m}_\${y}\`, \`sp_cache_dash_\${m}_\${y}\`, 
    \`sp_cache_dash_all_all\`, \`sp_cache_itr_\${y}\`, \`sp_cache_pl_\${y}\`
  ];
  
  for(let key of caches) {
    let d = JSON.parse(localStorage.getItem(key) || 'null');
    if (d) {
       let list = d.transactions || d.recent || (Array.isArray(d) ? d : []);
       txn = list.find(t => t.id === id);
       if (txn) break;
    }
  }`;
const newCacheSearch = `  for(let i=0; i<localStorage.length; i++) {
    let key = localStorage.key(i);
    if(key.startsWith('sp_cache_')) {
      let d = JSON.parse(localStorage.getItem(key) || 'null');
      if (d) {
         let list = d.transactions || d.recent || (Array.isArray(d) ? d : []);
         txn = list.find(t => t.id === id);
         if (txn) break;
      }
    }
  }`;
app = app.replace(oldCacheSearch, newCacheSearch);

// 3. Replace promptAddLoan
const oldAddLoan = `function promptAddLoan() {
  if(!S.url) { toast('Connect API first', 'err'); return; }
  let name = prompt('Loan Name (e.g. Home Loan):');
  let prin = prompt('Total Principal Amount (₹):');
  let emi = prompt('Monthly EMI (₹):');
  let months = prompt('Total Duration (Months):');
  
  if(!name || !prin || !emi || !months) return;
  
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({
    action: 'addLoan', id: 'ln_' + Date.now().toString(36),
    name: name, principal: prin, emi: emi, totalMonths: months
  })}).then(r => r.json()).then(d => {
    toast('Loan Added', 'ok');
    loadDashboard();
  }).catch(() => toast('Failed to add loan', 'err'));
}`;

const newAddLoanModal = `function openLoanModal(editId = null) {
  document.getElementById('loan-modal').classList.add('open');
  document.getElementById('loan-name').value = '';
  document.getElementById('loan-prin').value = '';
  document.getElementById('loan-emi').value = '';
  document.getElementById('loan-months').value = '';
  document.getElementById('btn-save-loan').removeAttribute('data-edit-id');
  document.getElementById('loan-modal-title').innerText = 'Add Loan / EMI';
  
  if (editId && typeof editId === 'string') {
    let cached = JSON.parse(localStorage.getItem('sp_cache_dash_all_all_all') || '{}');
    if (!cached.loans) {
      for(let i=0; i<localStorage.length; i++) {
        let key = localStorage.key(i);
        if(key.startsWith('sp_cache_dash_')) {
          let d = JSON.parse(localStorage.getItem(key) || '{}');
          if(d.loans && d.loans.find(l => l.id === editId)) { cached = d; break; }
        }
      }
    }
    let loan = (cached.loans || []).find(l => l.id === editId);
    if (loan) {
      document.getElementById('loan-name').value = loan.name;
      document.getElementById('loan-prin').value = loan.principal;
      document.getElementById('loan-emi').value = loan.emi;
      document.getElementById('loan-months').value = loan.totalMonths;
      document.getElementById('btn-save-loan').setAttribute('data-edit-id', editId);
      document.getElementById('loan-modal-title').innerText = 'Edit Loan';
    }
  }
}
function closeLoanModal() { document.getElementById('loan-modal').classList.remove('open'); }

function saveLoan() {
  if(!S.url) { toast('Connect API first', 'err'); return; }
  let name = document.getElementById('loan-name').value.trim();
  let prin = document.getElementById('loan-prin').value;
  let emi = document.getElementById('loan-emi').value;
  let months = document.getElementById('loan-months').value;
  
  if(!name || !prin || !emi || !months) { toast('Fill all details', 'err'); return; }
  
  let editId = document.getElementById('btn-save-loan').getAttribute('data-edit-id');
  let payload = {
    action: editId ? 'editLoan' : 'addLoan',
    id: editId || 'ln_' + Date.now().toString(36),
    name: name, principal: prin, emi: emi, totalMonths: months
  };
  
  let btn = document.getElementById('btn-save-loan');
  btn.innerText = 'Saving...'; btn.disabled = true;
  
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify(payload) })
    .then(r => r.json()).then(d => {
      toast(editId ? 'Loan Updated' : 'Loan Added', 'ok');
      clearDashCache();
      loadDashboard();
      closeLoanModal();
    }).catch(() => toast('Failed to save loan', 'err'))
    .finally(() => { btn.innerText = 'Save Loan'; btn.disabled = false; });
}

function deleteLoan(id) {
  if(!confirm('Delete this loan?')) return;
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'deleteLoan', id: id}) })
    .then(r => r.json()).then(d => {
      toast('Loan Deleted', 'ok');
      clearDashCache();
      loadDashboard();
    }).catch(() => toast('Delete failed', 'err'));
}`;
app = app.replace(oldAddLoan, newAddLoanModal);

// 4. renderLoans update to add Edit/Delete
const oldRenderLoans = `<button class="btn btn-primary" style="margin-left:auto; font-size:12px; padding:6px 12px;" onclick="payLoan('\${l.id}', \${l.emi}, '\${esc(l.name)}')">Record EMI</button>`;
const newRenderLoans = `<button class="btn btn-primary" style="margin-left:auto; font-size:12px; padding:6px 12px;" onclick="payLoan('\${l.id}', \${l.emi}, '\${esc(l.name)}')">Record EMI</button>
        <button class="icon-btn" onclick="openLoanModal('\${l.id}')" style="margin-left:8px;" title="Edit Loan"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--text-dim);fill:none;stroke-width:2;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
        <button class="icon-btn" onclick="deleteLoan('\${l.id}')" title="Delete Loan"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--expense);fill:none;stroke-width:2;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`;
app = app.replace(oldRenderLoans, newRenderLoans);
app = app.replace("onclick=\"promptAddLoan()\"", "onclick=\"openLoanModal()\"");

// 5. Budget Modal Logic
const budgetLogic = `
function openBudgetModal(cat = null) {
  document.getElementById('budget-modal').classList.add('open');
  if (cat && typeof cat === 'string') {
    document.getElementById('budget-cat').value = cat;
    document.getElementById('budget-limit').value = S.budgets[cat] || '';
    document.getElementById('btn-delete-budget').style.display = 'inline-block';
  } else {
    document.getElementById('budget-limit').value = '';
    document.getElementById('btn-delete-budget').style.display = 'none';
  }
}
function closeBudgetModal() { document.getElementById('budget-modal').classList.remove('open'); }

function saveBudget() {
  let cat = document.getElementById('budget-cat').value;
  let limit = parseFloat(document.getElementById('budget-limit').value);
  if(isNaN(limit) || limit <= 0) { toast('Enter valid limit', 'err'); return; }
  
  S.budgets[cat] = limit;
  localStorage.setItem('sp_budgets', JSON.stringify(S.budgets));
  toast('Budget Saved', 'ok');
  closeBudgetModal();
  loadDashboard();
}

function deleteBudget() {
  let cat = document.getElementById('budget-cat').value;
  delete S.budgets[cat];
  localStorage.setItem('sp_budgets', JSON.stringify(S.budgets));
  toast('Budget Deleted', 'ok');
  closeBudgetModal();
  loadDashboard();
}
`;
app += budgetLogic;

// Replace prompt for budget
app = app.replace("let limit = prompt(`Monthly budget for \${cat} (₹):`);", "return openBudgetModal(cat);");
app = app.replace("if(!limit || isNaN(limit)) return;\n  S.budgets[cat] = parseFloat(limit);\n  localStorage.setItem('sp_budgets', JSON.stringify(S.budgets));\n  loadDashboard();", "");
app = app.replace("onclick=\"promptAddBudget()\"", "onclick=\"openBudgetModal()\"");

// Fix renderBudgets to use edit
app = app.replace("html += `\n      <div class=\"budget-row\">\n        <div class=\"budget-header\">\n          <span>\${esc(cat)}</span>", "html += `\n      <div class=\"budget-row\" onclick=\"openBudgetModal('\${esc(cat)}')\" style=\"cursor:pointer\">\n        <div class=\"budget-header\">\n          <span>\${esc(cat)} ✏️</span>");


fs.writeFileSync('js/app.js', app);
console.log('App.js patched for loans and budgets');
