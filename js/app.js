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

const fetchWithTimeout = (url, options = {}, timeout = 15000) => {
  const opts = {
    redirect: 'follow',
    ...options,
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      ...(options.headers || {})
    }
  };
  return Promise.race([
    fetch(url, opts),
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

function openModal() { 
  document.getElementById('add-modal').classList.add('open'); 
  document.getElementById('mod-amt').focus(); 
  document.getElementById('btn-submit').removeAttribute('data-edit-id');
}
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

// --- DATA FETCHING (Offline First Caching) ---
function renderDashboardData(d) {
  animateValue('val-net', d.netFlow); animateValue('val-income', d.income);
  animateValue('val-expense', d.expense); animateValue('val-invest', d.investment);
  renderTxnList(d.recent || [], 'recent-list', true);
  renderChart(d.categories || {});
  renderBudgets(d.categories || {});
  renderSubscriptions(d.subscriptions || []);
  renderLoans(d.loans || []);
}

function loadDashboard() {
  if(!S.url) return;
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const cacheKey = `sp_cache_dash_${m}_${y}`;
  
  // 1. Instantly render from cache if available
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { renderDashboardData(JSON.parse(cached)); } catch(e){}
  } else {
    document.getElementById('recent-list').innerHTML = '<div class="loading-state">Syncing data...</div>';
  }
  
  // 2. Fetch in background and update UI silently
  fetchWithTimeout(`${S.url}?action=dashboard&month=${m}&year=${y}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error(d.error || 'Server error');
      localStorage.setItem(cacheKey, JSON.stringify(d));
      renderDashboardData(d);
    }).catch(e => {
      if (!cached) document.getElementById('recent-list').innerHTML = `<div class="loading-state">Connection failed: ${e.message === 'timeout' ? 'Timeout' : 'Check URL in Settings'}.</div>`;
    });
}

function loadHistory() {
  if(!S.url) return;
  const m = document.getElementById('hist-month').value;
  const y = document.getElementById('hist-year').value;
  const cacheKey = `sp_cache_hist_${m}_${y}`;
  
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { renderTxnList(JSON.parse(cached), 'hist-list'); } catch(e){}
  } else {
    document.getElementById('hist-list').innerHTML = '<div class="loading-state">Syncing ledger...</div>';
  }
  
  fetchWithTimeout(`${S.url}?action=history&month=${m}&year=${y}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error();
      localStorage.setItem(cacheKey, JSON.stringify(d.transactions || []));
      renderTxnList(d.transactions || [], 'hist-list');
    }).catch(() => {
      if (!cached) document.getElementById('hist-list').innerHTML = '<div class="loading-state">Failed to load ledger.</div>';
    });
}

function renderTaxData(d) {
  let claims = d.claims || [];
  renderTxnList(claims, 'claims-list');
  let totalClaim = claims.reduce((sum, t) => sum + parseFloat(t.amount), 0);
  document.getElementById('badge-claims').innerText = 'Total: ₹' + fmt(totalClaim);
  
  S.taxDataCache = d.tax || [];
  renderTxnList(S.taxDataCache, 'tax-list');
}

function loadTax() {
  if(!S.url) return;
  const y = new Date().getFullYear();
  const cacheKey = `sp_cache_tax_${y}`;
  
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { renderTaxData(JSON.parse(cached)); } catch(e){}
  } else {
    document.getElementById('claims-list').innerHTML = '<div class="loading-state">Checking claims...</div>';
    document.getElementById('tax-list').innerHTML = '<div class="loading-state">Checking tax records...</div>';
  }

  fetchWithTimeout(`${S.url}?action=tax&year=${y}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error();
      localStorage.setItem(cacheKey, JSON.stringify(d));
      renderTaxData(d);
    }).catch(() => {
      if (!cached) {
        document.getElementById('claims-list').innerHTML = '<div class="loading-state">Error loading.</div>';
        document.getElementById('tax-list').innerHTML = '<div class="loading-state">Error loading.</div>';
      }
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
    
    let editSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; stroke:var(--text-dim);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    let deleteSvg = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    
    let actions = `<button class="icon-btn" onclick="editTxn('${t.id}')">${editSvg}</button><button class="icon-btn" onclick="deleteTxn('${t.id}')">${deleteSvg}</button>`;
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

  let editId = document.getElementById('btn-submit').getAttribute('data-edit-id');
  if (editId && !isSplit) {
    let payload = {
      action: 'edit', id: editId, type: S.type,
      amount: amt, category: document.getElementById('mod-cat').value,
      title: document.getElementById('mod-title').value, entity: document.getElementById('mod-entity').value,
      taxDeductible: (S.type === 'expense' && isTax),
      status: (S.type === 'business') ? 'Pending' : '',
      recurring: isRec,
      date: dt.toISOString(), dateStr: dateStr, timeStr: timeStr
    };
    
    let btn = document.getElementById('btn-submit');
    btn.innerText = 'Saving...'; btn.disabled = true;
    
    fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify(payload) })
      .then(r => r.json()).then(d => {
        if(!d.success) throw new Error(d.error);
        toast('Updated Successfully', 'ok');
        document.getElementById('btn-submit').removeAttribute('data-edit-id');
        document.getElementById('mod-amt').value = '';
        document.getElementById('mod-title').value = '';
        document.getElementById('mod-entity').value = '';
        closeModal();
        if(document.getElementById('view-dashboard').classList.contains('active')) { clearCache(); loadDashboard(); }
        if(document.getElementById('view-history').classList.contains('active')) { clearCache(); loadHistory(); }
        if(document.getElementById('view-tax').classList.contains('active')) { clearCache(); loadTax(); }
      }).catch(e => {
        toast('Error: ' + (e.message === 'timeout' ? 'Network timeout' : 'Failed to update'), 'err');
      }).finally(() => {
        btn.innerText = 'Save Transaction'; btn.disabled = false;
      });
      
    return;
  }

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
      
      if(document.getElementById('view-dashboard').classList.contains('active')) { clearCache(); loadDashboard(); }
      if(document.getElementById('view-history').classList.contains('active')) { clearCache(); loadHistory(); }
      if(document.getElementById('view-tax').classList.contains('active')) { clearCache(); loadTax(); }
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
      clearCache();
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
      if(document.getElementById('view-tax').classList.contains('active')) loadTax();
    }).catch(e => toast('Delete failed', 'err'));
}

function editTxn(id) {
  let txn = null;
  const m = document.getElementById('hist-month').value || (new Date().getMonth() + 1);
  const y = document.getElementById('hist-year').value || new Date().getFullYear();
  let caches = [`sp_cache_hist_${m}_${y}`, `sp_cache_dash_${m}_${y}`, `sp_cache_tax_${y}`];
  
  for(let key of caches) {
    let d = JSON.parse(localStorage.getItem(key) || 'null');
    if (d) {
       let list = d.transactions || d.recent || d.claims || d.tax || (Array.isArray(d) ? d : []);
       txn = list.find(t => t.id === id);
       if (txn) break;
    }
  }
  
  if (!txn) { toast('Transaction data not found', 'err'); return; }
  
  setTxnType(txn.type);
  document.getElementById('mod-amt').value = txn.amount;
  document.getElementById('mod-date').valueAsDate = new Date(txn.date);
  document.getElementById('mod-cat').value = txn.category;
  document.getElementById('mod-title').value = txn.title;
  document.getElementById('mod-entity').value = txn.entity;
  document.getElementById('mod-tax').checked = (txn.taxDeductible === 'TRUE');
  document.getElementById('mod-rec').checked = (txn.recurring === 'TRUE');
  
  document.getElementById('btn-submit').setAttribute('data-edit-id', txn.id);
  
  document.getElementById('add-modal').classList.add('open'); 
  document.getElementById('mod-amt').focus();
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
function parseCsvLine(str, delim) {
  if (delim !== ',') return str.split(delim).map(c => c.replace(/^"|"$/g, '').trim());
  let result = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '"') inQuote = !inQuote;
    else if (str[i] === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
    else cur += str[i];
  }
  result.push(cur.trim());
  return result;
}

function processCSV() {
  const fileInput = document.getElementById('csv-file');
  if(!fileInput.files.length) { toast('Please select a CSV file', 'err'); return; }
  
  const file = fileInput.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if(lines.length < 2) { toast('CSV is empty or invalid', 'err'); return; }
    
    // Sniff Delimiter (comma, tab, semicolon)
    let sample = lines.slice(0, 10).join('\n');
    let delim = ',';
    if((sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length) delim = '\t';
    else if((sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length) delim = ';';

    // Find Header Line in top 15 lines
    let headerLineIdx = -1;
    let dtIdx = -1, descIdx = -1, amtIdx = -1, debitIdx = -1, creditIdx = -1;
    
    for(let i = 0; i < Math.min(lines.length, 15); i++) {
      let cols = parseCsvLine(lines[i], delim).map(h => h.toLowerCase());
      
      let dIdx = cols.findIndex(h => h.includes('date'));
      let descI = cols.findIndex(h => h.includes('detail') || h.includes('description') || h.includes('particular') || h.includes('narration') || h.includes('remark') || h.includes('transaction') || h.includes('info') || h.includes('summary') || h.includes('memo'));
      let debI = cols.findIndex(h => h === 'debit' || h.includes('withdrawal') || h.includes('dr'));
      let credI = cols.findIndex(h => h === 'credit' || h.includes('deposit') || h.includes('cr'));
      let aIdx = cols.findIndex(h => h.includes('amount') || h.includes('txn amount'));
      
      if (dIdx !== -1 && (descI !== -1 || debI !== -1 || aIdx !== -1)) {
        headerLineIdx = i;
        dtIdx = dIdx;
        descIdx = descI !== -1 ? descI : 1; // fallback
        debitIdx = debI;
        creditIdx = credI;
        amtIdx = aIdx;
        break;
      }
    }
    
    // Fallback detection if headers failed
    if (headerLineIdx === -1) {
      headerLineIdx = 0;
      let cols = lines[1] ? parseCsvLine(lines[1], delim) : [];
      cols.forEach((c, i) => {
        if(c.match(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/) && dtIdx === -1) dtIdx = i;
        if(c.match(/^-?\d+(\.\d+)?$/) && amtIdx === -1) amtIdx = i;
        if(c.length > 8 && !c.match(/^\d+$/) && descIdx === -1) descIdx = i;
      });
    }

    if(dtIdx === -1 || (amtIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
      toast('Could not auto-detect columns. Ensure CSV has Date, Amount/Debit, Details.', 'err'); return;
    }

    S.csvParsedRows = [];
    let html = `<div class="csv-table-wrapper"><table class="csv-table">
      <thead><tr><th>Date</th><th>Details</th><th>Type</th><th>Category</th><th>Amount</th></tr></thead><tbody>`;
    
    for(let i = headerLineIdx + 1; i < lines.length; i++) {
      let cols = parseCsvLine(lines[i], delim);
      if(cols.length <= dtIdx) continue;
      
      let rawDate = cols[dtIdx];
      let rawDesc = descIdx !== -1 && cols[descIdx] ? cols[descIdx] : 'Bank Transaction';
      
      let type = 'expense';
      let displayAmt = 0;
      
      let cleanAmt = (val) => {
        if (!val) return NaN;
        let parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        return isNaN(parsed) ? NaN : parsed;
      };

      let debitVal = debitIdx !== -1 ? cleanAmt(cols[debitIdx]) : NaN;
      let creditVal = creditIdx !== -1 ? cleanAmt(cols[creditIdx]) : NaN;
      let amtVal = amtIdx !== -1 ? cleanAmt(cols[amtIdx]) : NaN;

      if (!isNaN(debitVal) && debitVal > 0) {
        type = 'expense';
        displayAmt = debitVal;
      } else if (!isNaN(creditVal) && creditVal > 0) {
        type = 'income';
        displayAmt = creditVal;
      } else if (!isNaN(amtVal) && amtVal !== 0) {
        type = amtVal < 0 ? 'income' : 'expense';
        displayAmt = Math.abs(amtVal);
      } else {
        continue; 
      }

      // Smart Auto-Categorization
      let lowerDesc = rawDesc.toLowerCase();
      let cat = type === 'income' ? 'Salary' : 'Other Expense';
      if(lowerDesc.includes('uber') || lowerDesc.includes('ola') || lowerDesc.includes('irctc') || lowerDesc.includes('fuel') || lowerDesc.includes('petrol')) cat = 'Transport';
      else if(lowerDesc.includes('swiggy') || lowerDesc.includes('zomato') || lowerDesc.includes('restaurant') || lowerDesc.includes('cafe')) cat = 'Dining Out';
      else if(lowerDesc.includes('netflix') || lowerDesc.includes('prime') || lowerDesc.includes('spotify') || lowerDesc.includes('apple')) cat = 'Subscriptions';
      else if(lowerDesc.includes('hospital') || lowerDesc.includes('pharmacy') || lowerDesc.includes('apollo') || lowerDesc.includes('medical')) cat = 'Healthcare';
      else if(lowerDesc.includes('amazon') || lowerDesc.includes('flipkart') || lowerDesc.includes('myntra')) cat = 'Shopping';
      else if(lowerDesc.includes('salary') || lowerDesc.includes('payroll')) cat = 'Salary';

      let dt = new Date(rawDate);
      // Force custom parsing for DD/MM/YYYY since native JS treats 01/05/2026 as Jan 5
      if(rawDate.includes('/') || rawDate.includes('-')) {
        let parts = rawDate.split(/[-/]/);
        if (parts.length >= 3) {
          let p0 = parseInt(parts[0]), p1 = parseInt(parts[1]), p2 = parseInt(parts[2].split(' ')[0]);
          if (p2 < 100) p2 += 2000;
          // Assume DD/MM/YYYY format always for Indian context
          dt = new Date(p2, p1 - 1, p0);
        }
      }
      if(isNaN(dt)) dt = new Date();
      
      S.csvParsedRows.push({
        id: 'tx_csv_' + Date.now().toString(36) + i,
        type: type, amount: displayAmt, category: cat,
        title: rawDesc.substring(0,45), entity: 'Bank Import', taxDeductible: false, status: '', recurring: false,
        date: dt.toISOString(),
        dateStr: dt.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}),
        timeStr: '12:00 PM'
      });
      
      let catOptions = (S.categories[type] || S.categories.expense);
      
      html += `<tr>
        <td>${dt.toLocaleDateString('en-IN', {day:'numeric',month:'short'})}</td>
        <td>${esc(rawDesc.substring(0,35))}</td>
        <td><span class="badge ${type==='income'?'badge-accent':'badge-accent'}" style="${type==='income'?'color:var(--income);background:var(--income-dim)':'color:var(--expense);background:var(--expense-dim)'}">${type.toUpperCase()}</span></td>
        <td><select class="csv-cat-select" onchange="S.csvParsedRows[${S.csvParsedRows.length-1}].category=this.value">
            ${catOptions.map(c => `<option value="${c}" ${c===cat?'selected':''}>${c}</option>`).join('')}
        </select></td>
        <td class="${type==='income'?'csv-valid':'csv-invalid'}" style="${type==='income'?'color:var(--income);text-decoration:none':'color:var(--text);text-decoration:none'}">₹${fmt(displayAmt)}</td>
      </tr>`;
    }
    
    if (S.csvParsedRows.length === 0) {
      toast('No valid transaction rows found in CSV. Check column headers (Date, Debit, Credit)', 'err'); 
      console.log("CSV Debug - Headers detected:", {dtIdx, debitIdx, creditIdx, amtIdx});
      console.log("CSV Debug - First 3 Data Rows:", lines.slice(headerLineIdx + 1, headerLineIdx + 4).map(l => parseCsvLine(l, delim)));
      return;
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
      clearCache();
      document.getElementById('csv-modal').classList.remove('open');
      document.getElementById('csv-file').value = '';
      if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
    }).catch(e => toast('Import Failed', 'err'))
    .finally(() => { btn.innerText = 'Import All Valid Rows'; btn.disabled = false; });
}

// --- UTILS ---
function clearCache() {
  const keys = Object.keys(localStorage);
  keys.forEach(k => { if(k.startsWith('sp_cache_')) localStorage.removeItem(k); });
}

function fmt(n) { return parseFloat(n).toLocaleString('en-IN', {minimumFractionDigits:0, maximumFractionDigits:2}); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function animateValue(id, end) { const obj = document.getElementById(id); if(obj) obj.innerText = (end < 0 ? '-' : '') + '₹' + fmt(Math.abs(end)); }

let _tt;
function toast(msg, cls) {
  let el = document.getElementById('toast');
  let icon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  if (cls === 'ok') icon = '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  if (cls === 'err') icon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  
  el.innerHTML = `<div class="toast-icon">${icon}</div><span class="toast-msg">${esc(msg)}</span>`;
  el.className = 'show ' + (cls || '');
  clearTimeout(_tt); _tt = setTimeout(() => el.className = '', 3000);
}

const BACKEND_CODE = `// Spendly Pro Backend - Apps Script (Phase 3)

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return error('System busy, please try again later.'); }

  try {
    var d = JSON.parse(e.postData.contents);
    var action = d.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    var ts = ss.getSheetByName('Transactions');
    if (!ts) {
      ts = ss.insertSheet('Transactions');
      ts.appendRow(['ID', 'Date', 'Time', 'Type', 'Amount', 'Category', 'Title', 'Entity', 'TaxDeductible', 'Status', 'Month', 'Year', 'Week', 'Recurring']);
      ts.getRange(1,1,1,14).setFontWeight('bold').setBackground('#0a0d14').setFontColor('#ffffff');
      ts.setFrozenRows(1);
    }

    var ls = ss.getSheetByName('Loans');
    if (!ls) {
      ls = ss.insertSheet('Loans');
      ls.appendRow(['ID', 'Name', 'Principal', 'MonthlyEMI', 'TotalMonths', 'PaidMonths']);
      ls.getRange(1,1,1,6).setFontWeight('bold').setBackground('#9b59b6').setFontColor('#ffffff');
      ls.setFrozenRows(1);
    }

    if (action === 'add') {
      var dt = new Date(d.date);
      ts.appendRow([
        d.id, d.dateStr, d.timeStr, d.type, parseFloat(d.amount), 
        d.category || '', d.title || '', d.entity || '', d.taxDeductible ? 'TRUE' : 'FALSE', d.status || '', 
        dt.getMonth()+1, dt.getFullYear(), weekNum(dt), d.recurring ? 'TRUE' : 'FALSE'
      ]);
      return success({msg: 'Transaction Added'});
    } 
    
    if (action === 'addBulk') {
      var rows = [];
      for(var i=0; i<d.transactions.length; i++) {
        var txn = d.transactions[i];
        var dt = new Date(txn.date);
        rows.push([
          txn.id, txn.dateStr, txn.timeStr, txn.type, parseFloat(txn.amount),
          txn.category || '', txn.title || '', txn.entity || '', txn.taxDeductible ? 'TRUE' : 'FALSE', txn.status || '',
          dt.getMonth()+1, dt.getFullYear(), weekNum(dt), txn.recurring ? 'TRUE' : 'FALSE'
        ]);
      }
      if(rows.length > 0) ts.getRange(ts.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      return success({msg: rows.length + ' Transactions Added'});
    }

    if (action === 'delete') {
      var row = findRowById(ts, d.id);
      if (row > 0) { ts.deleteRow(row); return success({msg: 'Transaction Deleted'}); }
      return error('Transaction not found');
    }

    if (action === 'settle') {
      var row = findRowById(ts, d.id);
      if (row > 0) { ts.getRange(row, 10).setValue('Settled'); return success({msg: 'Marked as Settled'}); }
      return error('Transaction not found');
    }

    if (action === 'addLoan') {
      ls.appendRow([d.id, d.name, parseFloat(d.principal), parseFloat(d.emi), parseInt(d.totalMonths), parseInt(d.paidMonths || 0)]);
      return success({msg: 'Loan Added'});
    }
    
    if (action === 'payLoan') {
      var row = findRowById(ls, d.id);
      if (row > 0) {
        var currentPaid = parseInt(ls.getRange(row, 6).getValue()) || 0;
        ls.getRange(row, 6).setValue(currentPaid + 1);
        return success({msg: 'Loan Payment Recorded'});
      }
      return error('Loan not found');
    }

    return error('Invalid action');
  } catch(err) {
    return error(err.toString());
  } finally {
    lock.releaseLock();
  }
}

function findRowById(sheet, id) {
  var data = sheet.getRange(2, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < data.length; i++) { if (String(data[i][0]) === String(id)) return i + 2; }
  return -1;
}

function doGet(e) {
  try {
    var action = e.parameter.action || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ts = ss.getSheetByName('Transactions');
    var ls = ss.getSheetByName('Loans');
    
    var data = (ts && ts.getLastRow() >= 2) ? ts.getDataRange().getValues() : [];
    var loanData = (ls && ls.getLastRow() >= 2) ? ls.getDataRange().getValues() : [];

    if (action === 'dashboard') {
      var month = parseInt(e.parameter.month);
      var year = parseInt(e.parameter.year);
      var income = 0, expense = 0, investment = 0, businessPending = 0;
      var recent = [], categoryTotals = {}, subscriptions = [];
      
      for (var i = data.length - 1; i >= 1; i--) {
        var rowType = String(data[i][3]).toLowerCase();
        var rowAmt = parseFloat(data[i][4]) || 0;
        var rowM = parseInt(data[i][10]), rowY = parseInt(data[i][11]);
        var isRecurring = String(data[i][13]).toUpperCase() === 'TRUE';
        
        if (rowType === 'business' && String(data[i][9]).toLowerCase() === 'pending') businessPending += rowAmt;

        if (rowM === month && rowY === year) {
          if (rowType === 'income') income += rowAmt;
          if (rowType === 'expense') { expense += rowAmt; var cat = String(data[i][5]); categoryTotals[cat] = (categoryTotals[cat] || 0) + rowAmt; }
          if (rowType === 'investment') investment += rowAmt;
          if (recent.length < 5) recent.push(rowToObj(data[i]));
          if (isRecurring && rowType === 'expense') subscriptions.push(rowToObj(data[i]));
        }
      }
      
      var activeLoans = [];
      for(var i = 1; i < loanData.length; i++) {
        activeLoans.push({
          id: loanData[i][0], name: loanData[i][1], principal: loanData[i][2],
          emi: loanData[i][3], totalMonths: loanData[i][4], paidMonths: loanData[i][5]
        });
      }

      return success({
        income: income, expense: expense, investment: investment, businessPending: businessPending,
        netFlow: income - expense, categories: categoryTotals, recent: recent,
        subscriptions: subscriptions, loans: activeLoans
      });
    }

    if (action === 'history') {
      var month = parseInt(e.parameter.month);
      var year = parseInt(e.parameter.year);
      var results = [];
      for (var i = data.length - 1; i >= 1; i--) {
        if (parseInt(data[i][10]) === month && parseInt(data[i][11]) === year) results.push(rowToObj(data[i]));
      }
      return success({transactions: results});
    }

    if (action === 'tax') {
      var year = parseInt(e.parameter.year);
      var claims = [], tax = [];
      for (var i = data.length - 1; i >= 1; i--) {
        if (String(data[i][3]).toLowerCase() === 'business' && String(data[i][9]).toLowerCase() === 'pending') claims.push(rowToObj(data[i]));
        if (parseInt(data[i][11]) === year && String(data[i][8]).toUpperCase() === 'TRUE') tax.push(rowToObj(data[i]));
      }
      return success({claims: claims, tax: tax});
    }

    return success({msg: 'Spendly Pro API Phase 3'});
  } catch(err) { return error(err.toString()); }
}

function rowToObj(row) {
  return { id: row[0], dateStr: row[1], timeStr: row[2], type: row[3], amount: row[4], category: row[5], title: row[6], entity: row[7], taxDeductible: row[8], status: row[9], recurring: row[13] };
}

function success(data) { data.success = true; return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function error(msg) { return ContentService.createTextOutput(JSON.stringify({success: false, error: msg})).setMimeType(ContentService.MimeType.JSON); }
function weekNum(d) { var j = new Date(d.getFullYear(),0,1); return Math.ceil((((d-j)/86400000)+j.getDay()+1)/7); }`;

function copyBackendCode() {
  let btn = document.getElementById('btn-copy-code');
  if(navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(BACKEND_CODE).then(() => {
      btn.innerText = 'Copied to Clipboard! ✓';
      toast('Code copied. Paste into Apps Script!', 'ok');
      setTimeout(() => { btn.innerText = 'Copy Apps Script Code'; }, 3000);
    });
  } else {
    // Fallback for non-HTTPS local testing or Safari strict blocking
    let ta = document.createElement('textarea');
    ta.value = BACKEND_CODE;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      btn.innerText = 'Copied to Clipboard! ✓';
      toast('Code copied. Paste into Apps Script!', 'ok');
      setTimeout(() => { btn.innerText = 'Copy Apps Script Code'; }, 3000);
    } catch (err) {
      toast('Copy failed. Open AppsScript.js manually.', 'err');
    }
    document.body.removeChild(ta);
  }
}

init();
