// Spendly Pro Phase 3 - Frontend Logic
const S = {
  url: localStorage.getItem('sp_pro_url') || '',
  type: 'expense',
  chart: null,
  budgets: JSON.parse(localStorage.getItem('sp_budgets') || '{}'),
  taxDataCache: [], // used for PDF export
  csvParsedRows: [], // used for bulk import
  categories: {
    income: ['Salary', 'Bonus', 'Freelance', 'Dividends', 'Other Income'],
    expense: ['Rent/Mortgage', 'Groceries', 'Utilities', 'Transport', 'Subscriptions', 'Dining Out', 'Healthcare', 'Shopping', 'Other Expense'],
    investment: ['Stock Market', 'Crypto', 'Retirement / 401k', 'Real Estate', 'Savings'],
    business: ['Travel', 'Meals', 'Office Supplies', 'Software', 'Other Business']
  }
};

const fetchWithTimeout = (url, options, timeout = 10000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
  ]);
};

function init() {
  document.getElementById('inp-url').value = S.url;
  document.getElementById('mod-date').valueAsDate = new Date();
  
  // Theme
  if(localStorage.getItem('sp_theme') === 'light') {
    document.body.classList.add('light-mode');
    document.getElementById('theme-toggle').checked = true;
  }
  
  // Setup History Selectors
  const mSel = document.getElementById('hist-month');
  const ySel = document.getElementById('hist-year');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  
  months.forEach((m, i) => {
    let opt = document.createElement('option');
    opt.value = i + 1; opt.text = m;
    if(i === now.getMonth()) opt.selected = true;
    mSel.appendChild(opt);
  });
  
  for(let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
    let opt = document.createElement('option'); opt.value = y; opt.text = y;
    ySel.appendChild(opt);
  }

  setTxnType('expense');

  if (S.url) {
    nav('dashboard', document.querySelectorAll('.nav-item')[0]);
  } else {
    nav('settings', document.querySelectorAll('.nav-item')[3]);
  }
}

// --- NAVIGATION & MODALS ---
function nav(viewId, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
  
  document.getElementById('view-' + viewId).classList.add('active');
  if(el) el.classList.add('active');

  if (viewId === 'dashboard') loadDashboard();
  if (viewId === 'history') loadHistory();
  if (viewId === 'tax') loadTax();
}

function openModal() { document.getElementById('add-modal').classList.add('open'); document.getElementById('mod-amt').focus(); }
function closeModal() { document.getElementById('add-modal').classList.remove('open'); }
function toggleTheme() {
  const isLight = document.getElementById('theme-toggle').checked;
  if(isLight) {
    document.body.classList.add('light-mode');
    localStorage.setItem('sp_theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    localStorage.setItem('sp_theme', 'dark');
  }
  if(S.chart) S.chart.update(); // redraw chart with new colors if needed
}

function toggleSplit() {
  const isSplit = document.getElementById('mod-split').checked;
  document.getElementById('split-box').style.display = isSplit ? 'block' : 'none';
}

function setTxnType(type) {
  S.type = type;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  document.getElementById('type-' + type).classList.add('active');

  const catSel = document.getElementById('mod-cat');
  catSel.innerHTML = '';
  S.categories[type].forEach(c => {
    let opt = document.createElement('option');
    opt.value = c; opt.text = c;
    catSel.appendChild(opt);
  });

  const entityWrap = document.getElementById('mod-entity-wrap');
  const taxWrap = document.getElementById('wrap-tax');
  const recWrap = document.getElementById('wrap-rec');
  const splitWrap = document.getElementById('wrap-split');
  const lblEntity = document.getElementById('lbl-entity');

  if (type === 'business') {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Employer / Client';
    taxWrap.style.display = 'none'; recWrap.style.display = 'none'; splitWrap.style.display = 'none';
  } else if (type === 'income') {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Source / Company';
    taxWrap.style.display = 'none'; recWrap.style.display = 'block'; splitWrap.style.display = 'none';
  } else if (type === 'investment') {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Brokerage / Asset';
    taxWrap.style.display = 'none'; recWrap.style.display = 'block'; splitWrap.style.display = 'none';
  } else {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Merchant / Payee';
    taxWrap.style.display = 'flex'; recWrap.style.display = 'flex'; splitWrap.style.display = 'flex';
  }
}

function saveSettings() {
  const url = document.getElementById('inp-url').value.trim();
  if(url && !url.startsWith('https://')) { toast('Invalid URL', 'err'); return; }
  S.url = url;
  localStorage.setItem('sp_pro_url', url);
  toast('Connection Saved', 'ok');
  nav('dashboard', document.querySelectorAll('.nav-item')[0]);
}

// --- DATA FETCHING ---
function loadDashboard() {
  if(!S.url) return;
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  
  document.getElementById('recent-list').innerHTML = '<div class="loading-state">Syncing data...</div>';
  
  fetchWithTimeout(`${S.url}?action=dashboard&month=${m}&year=${y}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error(d.error || 'Server error');
      animateValue('val-net', d.netFlow); animateValue('val-income', d.income);
      animateValue('val-expense', d.expense); animateValue('val-invest', d.investment);
      
      renderTxnList(d.recent || [], 'recent-list', true);
      renderChart(d.categories || {});
      renderBudgets(d.categories || {});
      renderSubscriptions(d.subscriptions || []);
      renderLoans(d.loans || []);
    }).catch(e => {
      document.getElementById('recent-list').innerHTML = `<div class="loading-state">Connection failed: ${e.message === 'timeout' ? 'Timeout' : 'Check URL in Settings'}.</div>`;
    });
}

function loadHistory() {
  if(!S.url) return;
  const m = document.getElementById('hist-month').value;
  const y = document.getElementById('hist-year').value;
  
  document.getElementById('hist-list').innerHTML = '<div class="loading-state">Syncing ledger...</div>';
  
  fetchWithTimeout(`${S.url}?action=history&month=${m}&year=${y}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error();
      renderTxnList(d.transactions || [], 'hist-list');
    }).catch(() => {
      document.getElementById('hist-list').innerHTML = '<div class="loading-state">Failed to load ledger.</div>';
    });
}

function loadTax() {
  if(!S.url) return;
  const y = new Date().getFullYear();
  
  document.getElementById('claims-list').innerHTML = '<div class="loading-state">Checking claims...</div>';
  document.getElementById('tax-list').innerHTML = '<div class="loading-state">Checking tax records...</div>';

  fetchWithTimeout(`${S.url}?action=tax&year=${y}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error();
      let claims = d.claims || [];
      renderTxnList(claims, 'claims-list');
      let totalClaim = claims.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      document.getElementById('badge-claims').innerText = 'Total: ₹' + fmt(totalClaim);
      
      S.taxDataCache = d.tax || [];
      renderTxnList(S.taxDataCache, 'tax-list');
    }).catch(() => {
      document.getElementById('claims-list').innerHTML = '<div class="loading-state">Error loading.</div>';
      document.getElementById('tax-list').innerHTML = '<div class="loading-state">Error loading.</div>';
    });
}

// --- RENDERING (Core) ---
function renderTxnList(txns, containerId, compact = false) {
  const el = document.getElementById(containerId);
  if(!txns.length) {
    el.innerHTML = '<div class="loading-state">No records found.</div>';
    return;
  }
  
  let html = '';
  txns.forEach(t => {
    let icon = '', sign = '';
    if (t.type === 'income') { icon = '↓'; sign = '+'; }
    if (t.type === 'expense') { icon = '↑'; sign = '-'; }
    if (t.type === 'investment') { icon = '↗'; sign = '-'; }
    if (t.type === 'business') { icon = '🏢'; sign = ''; } 
    
    let taxTag = t.taxDeductible === 'TRUE' ? '<span class="tax-tag">TAX</span>' : '';
    let recTag = t.recurring === 'TRUE' ? '<span class="tax-tag">🔁</span>' : '';
    let pendingTag = (t.type === 'business' && t.status === 'Pending') ? '<span class="tax-tag" style="background:var(--business-dim);color:var(--business)">PENDING</span>' : '';
    
    let actions = `<button class="icon-btn" onclick="deleteTxn('${t.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`;
    if (t.type === 'business' && t.status === 'Pending') {
      actions = `<button class="btn-settle" onclick="settleTxn('${t.id}')">CLAIMED</button>` + actions;
    }

    html += `
      <div class="txn-row">
        <div class="txn-icon ${t.type}">${icon}</div>
        <div class="txn-info">
          <div class="txn-title">${esc(t.title || t.category)}</div>
          <div class="txn-meta">${t.dateStr} • ${esc(t.entity || t.category)} ${taxTag} ${recTag} ${pendingTag}</div>
        </div>
        <div class="txn-amt-wrap">
          <div class="txn-amt ${t.type}">${sign}₹${fmt(t.amount)}</div>
        </div>
        ${!compact ? `<div class="txn-actions">${actions}</div>` : ''}
      </div>
    `;
  });
  el.innerHTML = html;
}

function renderChart(catData) {
  const ctx = document.getElementById('expenseChart').getContext('2d');
  const labels = Object.keys(catData);
  const data = Object.values(catData);
  
  if(labels.length === 0) { labels.push('No Expenses'); data.push(1); }
  if (S.chart) S.chart.destroy();
  
  const isLight = document.body.classList.contains('light-mode');
  Chart.defaults.color = isLight ? '#6b7280' : '#8b95a5';
  Chart.defaults.font.family = "'Outfit', sans-serif";

  S.chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#3742fa', '#ff5285'],
        borderWidth: 0, hoverOffset: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, usePointStyle: true, padding: 20 } } }
    }
  });
}

// --- PHASE 3 RENDERING (Budgets, Subs, Loans) ---
function promptSetBudget() {
  let cat = prompt('Enter exact Category name to budget (e.g. Dining Out):');
  if(!cat) return;
  if(S.categories.expense.indexOf(cat) === -1) { toast('Invalid Category', 'err'); return; }
  
  let limit = prompt(`Enter monthly limit for ${cat} (₹):`);
  if(!limit || isNaN(limit)) return;
  
  S.budgets[cat] = parseFloat(limit);
  localStorage.setItem('sp_budgets', JSON.stringify(S.budgets));
  toast('Budget Saved', 'ok');
  if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
}

function renderBudgets(expenseCatData) {
  const el = document.getElementById('budget-list');
  const keys = Object.keys(S.budgets);
  if(keys.length === 0) {
    el.innerHTML = '<p class="text-muted" style="font-size:14px">No budgets set. Click Set to limit spending categories.</p>';
    return;
  }
  
  let html = '';
  keys.forEach(cat => {
    let limit = S.budgets[cat];
    let spent = expenseCatData[cat] || 0;
    let pct = Math.min((spent / limit) * 100, 100);
    
    let colorClass = 'progress-safe';
    if(pct > 75) colorClass = 'progress-warn';
    if(pct > 90) colorClass = 'progress-danger';
    
    html += `
      <div class="budget-row">
        <div class="budget-header">
          <span>${esc(cat)}</span>
          <span>₹${fmt(spent)} / ₹${fmt(limit)}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${colorClass}" style="width:${pct}%"></div>
        </div>
        <div class="budget-meta">${fmt(Math.max(0, limit - spent))} remaining</div>
      </div>
    `;
  });
  el.innerHTML = html;
}

function renderSubscriptions(subs) {
  const el = document.getElementById('sub-list');
  let total = subs.reduce((sum, s) => sum + parseFloat(s.amount), 0);
  document.getElementById('badge-subs').innerText = `₹${fmt(total)}/mo`;
  renderTxnList(subs, 'sub-list', true);
}

function promptAddLoan() {
  if(!S.url) { toast('Connect API first', 'err'); return; }
  let name = prompt('Loan Name (e.g. Car Loan):');
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
}

function payLoan(id, emiAmt, name) {
  if(!confirm(`Record payment of ₹${emiAmt} for ${name}?`)) return;
  
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'payLoan', id: id}) })
    .then(r => r.json()).then(d => {
      // Also automatically log this as an expense
      let dt = new Date();
      let payload = {
        action: 'add', id: 'tx_' + Date.now().toString(36), type: 'expense',
        amount: emiAmt, category: 'Other Expense', title: `EMI: ${name}`,
        entity: 'Bank', taxDeductible: false, status: '', recurring: true,
        date: dt.toISOString(),
        dateStr: dt.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}),
        timeStr: new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})
      };
      return fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify(payload) });
    }).then(r => r.json()).then(d => {
      toast('EMI Recorded', 'ok');
      loadDashboard();
    }).catch(() => toast('Error recording payment', 'err'));
}

function renderLoans(loans) {
  const el = document.getElementById('loan-list');
  if(!loans.length) { el.innerHTML = '<div class="loading-state">No active loans.</div>'; return; }
  
  let html = '';
  loans.forEach(l => {
    let pct = Math.min((l.paidMonths / l.totalMonths) * 100, 100);
    html += `
      <div class="budget-row" style="padding-bottom:12px; border-bottom:1px solid var(--border)">
        <div class="budget-header" style="margin-bottom:8px;">
          <span>${esc(l.name)}</span>
          <button class="icon-btn" style="color:var(--accent); font-size:12px;" onclick="payLoan('${l.id}', ${l.emi}, '${esc(l.name)}')">PAY ₹${fmt(l.emi)}</button>
        </div>
        <div class="progress-bar-bg" style="height:6px; margin-top:0;">
          <div class="progress-bar-fill progress-safe" style="width:${pct}%"></div>
        </div>
        <div class="budget-meta" style="display:flex; justify-content:space-between;">
          <span>Principal: ₹${fmt(l.principal)}</span>
          <span>${l.paidMonths} / ${l.totalMonths} Months</span>
        </div>
      </div>
    `;
  });
  el.innerHTML = html;
}

// --- CRUD ---
function submitTxn() {
  if(!S.url) { toast('Connect API in Settings', 'err'); return; }
  
  let amt = parseFloat(document.getElementById('mod-amt').value);
  if(!amt || amt <= 0) { toast('Enter valid amount', 'err'); return; }
  
  let dt = document.getElementById('mod-date').valueAsDate || new Date();
  let isTax = document.getElementById('mod-tax').checked;
  let isRec = document.getElementById('mod-rec').checked;
  let isSplit = document.getElementById('mod-split').checked;
  
  let dateStr = dt.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'});
  let timeStr = new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});

  let txns = [];

  if (isSplit && S.type === 'expense') {
    let splitName = document.getElementById('split-name').value.trim();
    let splitAmt = parseFloat(document.getElementById('split-amt').value);
    
    if(!splitName || !splitAmt || splitAmt >= amt || splitAmt <= 0) {
      toast('Invalid Split details', 'err'); return;
    }
    
    // My Expense Portion
    txns.push({
      id: 'tx_' + Date.now().toString(36) + 'A', type: 'expense',
      amount: amt - splitAmt, category: document.getElementById('mod-cat').value,
      title: document.getElementById('mod-title').value, entity: document.getElementById('mod-entity').value,
      taxDeductible: isTax, status: '', recurring: isRec,
      date: dt.toISOString(), dateStr: dateStr, timeStr: timeStr
    });
    
    // Their Reimbursable Portion
    txns.push({
      id: 'tx_' + Date.now().toString(36) + 'B', type: 'business',
      amount: splitAmt, category: 'Other Business',
      title: `Split: ${document.getElementById('mod-title').value}`, entity: splitName,
      taxDeductible: false, status: 'Pending', recurring: false,
      date: dt.toISOString(), dateStr: dateStr, timeStr: timeStr
    });
  } else {
    txns.push({
      id: 'tx_' + Date.now().toString(36), type: S.type,
      amount: amt, category: document.getElementById('mod-cat').value,
      title: document.getElementById('mod-title').value, entity: document.getElementById('mod-entity').value,
      taxDeductible: (S.type === 'expense' && isTax),
      status: (S.type === 'business') ? 'Pending' : '',
      recurring: isRec,
      date: dt.toISOString(), dateStr: dateStr, timeStr: timeStr
    });
  }

  let btn = document.getElementById('btn-submit');
  btn.innerText = 'Saving...'; btn.disabled = true;

  // We use addBulk since we might have 1 or 2 transactions (due to split)
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'addBulk', transactions: txns}) })
    .then(r => r.json()).then(d => {
      if(!d.success) throw new Error(d.error);
      toast('Saved Successfully', 'ok');
      document.getElementById('mod-amt').value = '';
      document.getElementById('mod-title').value = '';
      document.getElementById('mod-entity').value = '';
      document.getElementById('mod-split').checked = false;
      document.getElementById('split-name').value = '';
      document.getElementById('split-amt').value = '';
      toggleSplit();
      closeModal();
      
      if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
      if(document.getElementById('view-tax').classList.contains('active')) loadTax();
    }).catch(e => {
      toast('Error: ' + (e.message === 'timeout' ? 'Network timeout' : 'Failed to save'), 'err');
    }).finally(() => {
      btn.innerText = 'Save Transaction'; btn.disabled = false;
    });
}

function deleteTxn(id) {
  if(!confirm('Delete this record permanently?')) return;
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'delete', id: id}) })
    .then(r => r.json()).then(d => {
      if(!d.success) throw new Error(d.error);
      toast('Record Deleted', 'ok');
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
      if(document.getElementById('view-tax').classList.contains('active')) loadTax();
    }).catch(e => toast('Delete failed', 'err'));
}

function settleTxn(id) {
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'settle', id: id}) })
    .then(r => r.json()).then(d => {
      if(!d.success) throw new Error(d.error);
      toast('Claim Marked Settled', 'ok');
      if(document.getElementById('view-tax').classList.contains('active')) loadTax();
    }).catch(e => toast('Update failed', 'err'));
}

// --- PDF EXPORT (jsPDF) ---
function exportPDF() {
  if (!S.taxDataCache || S.taxDataCache.length === 0) {
    toast('No Tax records found to export', 'err'); return;
  }
  const doc = new window.jspdf.jsPDF();
  
  doc.setFontSize(18);
  doc.text(`Spendly Pro - Tax Deductible Report (${new Date().getFullYear()})`, 14, 22);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  let total = S.taxDataCache.reduce((s,t) => s + parseFloat(t.amount), 0);
  doc.text(`Total Tax Deductible: Rs. ${total.toFixed(2)}`, 14, 30);
  
  let tableData = S.taxDataCache.map(t => [
    t.dateStr, t.category, t.title || '-', t.entity || '-', `Rs. ${t.amount}`
  ]);
  
  doc.autoTable({
    startY: 40,
    head: [['Date', 'Category', 'Description', 'Merchant', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [67, 97, 238] }
  });
  
  doc.save(`Spendly_Tax_Report_${new Date().getFullYear()}.pdf`);
}

// --- CSV SMART IMPORT ---
function processCSV() {
  const fileInput = document.getElementById('csv-file');
  if(!fileInput.files.length) { toast('Please select a CSV file', 'err'); return; }
  
  const file = fileInput.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if(lines.length < 2) { toast('CSV is empty or invalid', 'err'); return; }
    
    // Heuristic sniffing for standard columns
    let dtIdx = -1, amtIdx = -1, descIdx = -1;
    let headers = lines[0].split(',').map(h => h.toLowerCase().trim());
    
    // Attempt header match first
    headers.forEach((h, i) => {
      if(h.includes('date')) dtIdx = i;
      if(h.includes('amount') || h.includes('withdrawal') || h.includes('debit')) amtIdx = i;
      if(h.includes('description') || h.includes('particulars') || h.includes('narration')) descIdx = i;
    });
    
    // Fallback heuristic on first data row if headers are weird
    if(dtIdx===-1 || amtIdx===-1 || descIdx===-1) {
      let cols = lines[1].split(',');
      cols.forEach((c, i) => {
        if(c.match(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/) && dtIdx===-1) dtIdx = i;
        if(c.match(/^-?\d+(\.\d+)?$/) && amtIdx===-1) amtIdx = i;
        if(c.length > 10 && !c.match(/^\d+$/) && descIdx===-1) descIdx = i;
      });
    }

    if(dtIdx===-1 || amtIdx===-1 || descIdx===-1) {
      toast('Could not auto-detect columns. Ensure CSV has Date, Amount, Description.', 'err'); return;
    }

    S.csvParsedRows = [];
    let html = `<div class="csv-table-wrapper"><table class="csv-table">
      <thead><tr><th>Date</th><th>Description</th><th>Detected Category</th><th>Amount</th></tr></thead><tbody>`;
    
    for(let i=1; i<Math.min(lines.length, 100); i++) { // Limit 100 per import batch for safety
      let cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim()); // simple unquote
      if(cols.length <= Math.max(dtIdx, amtIdx, descIdx)) continue;
      
      let rawDate = cols[dtIdx];
      let rawAmt = cols[amtIdx].replace(/,/g,'');
      let rawDesc = cols[descIdx];
      
      // Smart Auto-Categorization
      let lowerDesc = rawDesc.toLowerCase();
      let cat = 'Other Expense';
      if(lowerDesc.includes('uber') || lowerDesc.includes('ola') || lowerDesc.includes('irctc')) cat = 'Transport';
      else if(lowerDesc.includes('swiggy') || lowerDesc.includes('zomato') || lowerDesc.includes('restaurant')) cat = 'Dining Out';
      else if(lowerDesc.includes('netflix') || lowerDesc.includes('amazon') || lowerDesc.includes('prime')) cat = 'Subscriptions';
      else if(lowerDesc.includes('hospital') || lowerDesc.includes('pharmacy')) cat = 'Healthcare';
      
      let amount = parseFloat(rawAmt);
      if(isNaN(amount)) continue;
      
      let type = amount >= 0 ? 'expense' : 'income'; // Assuming positive amounts in banks are often withdrawals (expenses). If negative, it's credit. (Depends on bank, but standard fallback)
      let displayAmt = Math.abs(amount);
      
      let dt = new Date(rawDate);
      if(isNaN(dt)) dt = new Date(); // fallback
      
      S.csvParsedRows.push({
        id: 'tx_csv_' + Date.now().toString(36) + i,
        type: type, amount: displayAmt, category: cat,
        title: rawDesc.substring(0,40), entity: 'Bank Import', taxDeductible: false, status: '', recurring: false,
        date: dt.toISOString(),
        dateStr: dt.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}),
        timeStr: '12:00 PM'
      });
      
      html += `<tr>
        <td>${dt.toLocaleDateString()}</td>
        <td>${esc(rawDesc.substring(0,30))}</td>
        <td><select class="csv-cat-select" onchange="S.csvParsedRows[${S.csvParsedRows.length-1}].category=this.value">
            ${S.categories.expense.map(c => `<option value="${c}" ${c===cat?'selected':''}>${c}</option>`).join('')}
        </select></td>
        <td class="${type==='income'?'csv-valid':'csv-invalid'}">₹${fmt(displayAmt)}</td>
      </tr>`;
    }
    
    html += '</tbody></table></div>';
    document.getElementById('csv-body').innerHTML = html;
    document.getElementById('csv-modal').classList.add('open');
  };
  reader.readAsText(file);
}

function confirmCSVImport() {
  if(!S.url) { toast('Connect API in Settings', 'err'); return; }
  if(!S.csvParsedRows.length) return;
  
  let btn = document.querySelector('#csv-modal .btn-primary');
  btn.innerText = 'Importing...'; btn.disabled = true;
  
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'addBulk', transactions: S.csvParsedRows}) }, 20000)
    .then(r => r.json()).then(d => {
      if(!d.success) throw new Error(d.error);
      toast(`Imported ${S.csvParsedRows.length} records!`, 'ok');
      document.getElementById('csv-modal').classList.remove('open');
      document.getElementById('csv-file').value = '';
    }).catch(e => toast('Import Failed', 'err'))
    .finally(() => { btn.innerText = 'Import All Valid Rows'; btn.disabled = false; });
}

// --- UTILS ---
function fmt(n) { return parseFloat(n).toLocaleString('en-IN', {minimumFractionDigits:0, maximumFractionDigits:2}); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function animateValue(id, end) { const obj = document.getElementById(id); if(obj) obj.innerText = (end < 0 ? '-' : '') + '₹' + fmt(Math.abs(end)); }

let _tt;
function toast(msg, cls) {
  let el = document.getElementById('toast');
  el.innerText = msg; el.className = 'show ' + cls;
  clearTimeout(_tt); _tt = setTimeout(() => el.className = '', 2700);
}

function copyBackendCode() {
  let btn = document.getElementById('btn-copy-code');
  btn.innerText = 'Fetching code...';
  
  fetch('AppsScript.js')
    .then(r => r.text())
    .then(text => {
      navigator.clipboard.writeText(text);
      btn.innerText = 'Copied to Clipboard! ✓';
      toast('Code copied. Paste into Apps Script!', 'ok');
      setTimeout(() => { btn.innerText = 'Copy Apps Script Code'; }, 3000);
    })
    .catch(e => {
      toast('Failed to load code.', 'err');
      btn.innerText = 'Copy Apps Script Code';
    });
}

init();
