// Spendly Pro Phase 4 - CA Grade Frontend
const APP_VERSION = 'v2.9.5';
console.log('[Spendly] Running version:', APP_VERSION);
const S = {
  url: localStorage.getItem('sp_pro_url') || '',
  apiSecret: localStorage.getItem('sp_api_secret') || '',
  type: 'expense',
  chart: null,
  budgets: JSON.parse(localStorage.getItem('sp_budgets') || '{}'),
  taxDataCache: [],
  csvParsedRows: [],
  categories: {
    income: ['Salary', 'Bonus', 'Freelance', 'Dividends', 'Other Income'],
    expense: ['Rent/Mortgage', 'Groceries', 'Utilities', 'Transport', 'Subscriptions', 'Dining Out', 'Healthcare', 'Shopping', 'Other Expense'],
    investment: ['Stock Market', 'Mutual Funds', 'Fixed Deposit', 'Crypto', 'PPF', 'NPS', 'Real Estate', 'Savings'],
    business: ['Travel', 'Meals', 'Office Supplies', 'Software', 'Other Business']
  },
  currentRegime: 'new',
  itrData: null,
  plData: null
};

const fetchWithTimeout = (url, options = {}, timeout = 15000) => {
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
    clearCache();
    if (document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
  });
}

function init() {
  document.getElementById('inp-url').value = S.url;
  document.getElementById('inp-secret').value = S.apiSecret;
  document.getElementById('mod-date').valueAsDate = new Date();
  
  if(localStorage.getItem('sp_theme') === 'light') {
    document.body.classList.add('light-mode');
    document.getElementById('theme-toggle').checked = true;
  }
  
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  
  // Ledger
  const mSel = document.getElementById('hist-month');
  const ySel = document.getElementById('hist-year');
  months.forEach((m, i) => { mSel.appendChild(new Option(m, i+1, false, i === now.getMonth())); });
  for(let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) ySel.appendChild(new Option(y, y));

  // Dashboard
  renderBankAccounts();
  const dMSel = document.getElementById('dash-month');
  const dYSel = document.getElementById('dash-year');
  dMSel.appendChild(new Option('All Time', 'all'));
  months.forEach((m, i) => { dMSel.appendChild(new Option(m, i+1, false, false)); });
  dMSel.value = 'all';
  dYSel.appendChild(new Option('All Years', 'all'));
  for(let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) dYSel.appendChild(new Option(y, y, false, y === now.getFullYear()));

  // ITR & P&L FY Dropdowns
  const itrFySel = document.getElementById('itr-fy');
  const plFySel = document.getElementById('pl-fy');
  const currentFy = now.getMonth() < 3 ? now.getFullYear() : now.getFullYear() + 1;
  for(let y = currentFy + 1; y >= currentFy - 4; y--) {
    let txt = `FY ${y-1}-${y.toString().slice(-2)}`;
    itrFySel.appendChild(new Option(txt, y, false, y === currentFy));
    if (plFySel) plFySel.appendChild(new Option(txt, y, false, y === currentFy));
  }

  setTxnType('expense');

  if (S.url) {
    nav('dashboard', document.querySelectorAll('.nav-item')[0]);
  } else {
    nav('settings', document.querySelectorAll('.nav-item')[4]);
  }
}

function nav(viewId, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
  
  document.getElementById('view-' + viewId).classList.add('active');
  if(el) el.classList.add('active');

  if (viewId === 'dashboard') loadDashboard();
  if (viewId === 'history') loadHistory();
  if (viewId === 'itr') loadITR();
  if (viewId === 'plreport') loadPLReport();
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
  if(S.chart) S.chart.update();
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
  S.categories[type].forEach(c => catSel.appendChild(new Option(c, c)));

  const entityWrap = document.getElementById('mod-entity-wrap');
  const taxWrap = document.getElementById('wrap-tax');
  const recWrap = document.getElementById('wrap-rec');
  const splitWrap = document.getElementById('wrap-split');
  const lblEntity = document.getElementById('lbl-entity');
  
  const taxSecWrap = document.getElementById('wrap-tax-section');
  const incomeHeadWrap = document.getElementById('wrap-income-head');

  if (type === 'business') {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Employer / Client';
    taxWrap.style.display = 'none'; recWrap.style.display = 'none'; splitWrap.style.display = 'none';
    taxSecWrap.style.display = 'none'; incomeHeadWrap.style.display = 'none';
  } else if (type === 'income') {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Source / Company';
    taxWrap.style.display = 'none'; recWrap.style.display = 'block'; splitWrap.style.display = 'none';
    taxSecWrap.style.display = 'none'; incomeHeadWrap.style.display = 'block';
  } else if (type === 'investment') {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Brokerage / Asset';
    taxWrap.style.display = 'flex'; recWrap.style.display = 'block'; splitWrap.style.display = 'none';
    taxSecWrap.style.display = 'flex'; incomeHeadWrap.style.display = 'none';
  } else {
    entityWrap.style.display = 'block'; lblEntity.innerText = 'Merchant / Payee';
    taxWrap.style.display = 'flex'; recWrap.style.display = 'flex'; splitWrap.style.display = 'flex';
    taxSecWrap.style.display = 'flex'; incomeHeadWrap.style.display = 'none';
  }
}

function saveSettings() {
  const url = document.getElementById('inp-url').value.trim();
  const secret = document.getElementById('inp-secret').value.trim();
  if(url && !url.startsWith('https://')) { toast('Invalid URL', 'err'); return; }
  S.url = url;
  localStorage.setItem('sp_pro_url', url);
  S.apiSecret = secret;
  localStorage.setItem('sp_api_secret', secret);
  toast('Connection Saved', 'ok');
  nav('dashboard', document.querySelectorAll('.nav-item')[0]);
}

// --- DASHBOARD & RENDERING ---
function renderDashboardData(d) {
  animateValue('val-net', d.availableBalance || (d.netFlow || 0)); animateValue('val-income', d.income);
  animateValue('val-expense', d.expense); animateValue('val-invest', d.investment);
  renderTxnList(d.recent || [], 'recent-list', true);
  renderChart(d.categories || {});
  renderBudgets(d.categories || {});
  renderSubscriptions(d.subscriptions || []);
  renderLoans(d.loans || []);
  
  const m = document.getElementById('dash-month').value;
  const y = document.getElementById('dash-year').value;
  renderTrendChart(d.sixMonthTxns || [], y, m, d.availableBalance || 0);
  
  if (d.businessPending > 0) {
    document.getElementById('advance-tax-banner').style.display = 'flex';
    document.getElementById('advance-tax-banner').innerHTML = `<div style="background:var(--business-dim); color:var(--business); padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; border:1px solid var(--business);">
      <span style="font-weight:600;">You have ₹${fmt(d.businessPending)} in Pending Business Claims.</span>
      <button class="btn btn-primary" onclick="nav('history', document.querySelectorAll('.nav-item')[1])" style="padding:6px 12px; font-size:12px;">View Ledger</button>
    </div>`;
  } else {
    document.getElementById('advance-tax-banner').style.display = 'none';
  }
}

function clearDashCache() { clearCache(); }

function loadDashboard() {
  if(!S.url) return;
  const now = new Date();
  const m = document.getElementById('dash-month').value;
  const y = document.getElementById('dash-year').value;
  const isAllTime = (m === 'all' || y === 'all');
  const acc = document.getElementById('dash-account') ? document.getElementById('dash-account').value : 'all';
  const cacheKey = `sp_cache_dash_${acc}_${m}_${y}`;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label = isAllTime ? 'All Time Overview' : `${months[parseInt(m)-1]} ${y}`;
  const sub = document.getElementById('current-date');
  if(sub) sub.innerText = label;

  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { renderDashboardData(JSON.parse(cached)); } catch(e){}
  } else {
    document.getElementById('recent-list').innerHTML = '<div class="loading-state">Syncing data...</div>';
  }
  
  const url = `${S.url}?action=dashboard&month=${m}&year=${y}&account=${acc}`;
  fetchWithTimeout(url, {})
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
  const acc = document.getElementById('hist-account') ? document.getElementById('hist-account').value : 'all';
  const cacheKey = `sp_cache_hist_${acc}_${m}_${y}`;
  
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { renderTxnList(JSON.parse(cached), 'hist-list'); } catch(e){}
  } else {
    document.getElementById('hist-list').innerHTML = '<div class="loading-state">Syncing ledger...</div>';
  }
  
  fetchWithTimeout(`${S.url}?action=history&month=${m}&year=${y}&account=${acc}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error();
      localStorage.setItem(cacheKey, JSON.stringify(d.transactions || []));
      renderTxnList(d.transactions || [], 'hist-list');
    }).catch(() => {
      if (!cached) document.getElementById('hist-list').innerHTML = '<div class="loading-state">Failed to load ledger.</div>';
    });
}

// --- ITR VIEW (NEW CA LOGIC) ---
function loadITR() {
  if(!S.url) return;
  const fy = document.getElementById('itr-fy').value;
  const cacheKey = `sp_cache_itr_${fy}`;

  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { S.itrData = JSON.parse(cached); renderITR(S.itrData, S.currentRegime); } catch(e){}
  } else {
    document.getElementById('itr-content').innerHTML = '<div class="loading-state">Computing tax report...</div>';
  }

  fetchWithTimeout(`${S.url}?action=itr&fy=${fy}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error(d.error);
      localStorage.setItem(cacheKey, JSON.stringify(d));
      S.itrData = d;
      renderITR(d, S.currentRegime);
    }).catch(e => {
      if (!cached) document.getElementById('itr-content').innerHTML = '<div class="loading-state">Failed to load ITR data.</div>';
    });
}

function switchRegime(regime) {
  S.currentRegime = regime;
  document.querySelectorAll('.regime-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${regime}`).classList.add('active');
  if (S.itrData) renderITR(S.itrData, regime);
}

function calculateTax(income, regime) {
  let tax = 0;
  if (regime === 'new') {
    if (income <= 300000) return 0;
    if (income <= 700000) return 0; 
    let rem = income;
    if (rem > 1500000) { tax += (rem - 1500000) * 0.30; rem = 1500000; }
    if (rem > 1200000) { tax += (rem - 1200000) * 0.20; rem = 1200000; }
    if (rem > 900000)  { tax += (rem - 900000) * 0.15; rem = 900000; }
    if (rem > 600000)  { tax += (rem - 600000) * 0.10; rem = 600000; }
    if (rem > 300000)  { tax += (rem - 300000) * 0.05; }
  } else {
    if (income <= 700000) return 0; // 87A Rebate handles up to 7L in new regime
    let rem = income;
    if (rem > 1500000) { tax += (rem - 1500000) * 0.30; rem = 1500000; }
    if (rem > 1200000) { tax += (rem - 1200000) * 0.20; rem = 1200000; }
    if (rem > 900000)  { tax += (rem - 900000) * 0.15; rem = 900000; }
    if (rem > 600000)  { tax += (rem - 600000) * 0.10; rem = 600000; }
    if (rem > 300000)  { tax += (rem - 300000) * 0.05; }
  }
  return tax + (tax * 0.04); 
}

function renderITR(d, regime) {
  const h = d.incomeByHead || {salary:0, business:0, stcg:0, ltcg:0, otherSources:0};
  const grossSalary = h.salary || 0;
  let standardDed = (grossSalary > 0) ? Math.min(grossSalary, regime === 'new' ? 75000 : 50000) : 0;
  let netSalary = grossSalary - standardDed;
  
  let grossTotalIncome = netSalary + (h.business||0) + (h.stcg||0) + (h.ltcg||0) + (h.otherSources||0);
  
  let totalDed = 0;
  let dedDetails = '';
  
  if (regime === 'old') {
    let ded = d.deductions || {c80:0, d80:0, g80:0, sec24b:0, nps80ccd:0};
    let c80 = Math.min(ded.c80, 150000);
    let d80 = Math.min(ded.d80, 50000);
    let g80 = ded.g80; 
    let sec24b = Math.min(ded.sec24b, 200000);
    let nps80ccd = Math.min(ded.nps80ccd, 50000);
    
    totalDed = c80 + d80 + g80 + sec24b + nps80ccd;
    
    dedDetails = `
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between"><span>80C (Max 1.5L):</span> <span>₹${fmt(c80)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>80D (Health):</span> <span>₹${fmt(d80)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>80CCD(1B) (NPS):</span> <span>₹${fmt(nps80ccd)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Sec 24b (Home Loan Int):</span> <span>₹${fmt(sec24b)}</span></div>
      </div>
    `;
    
    // Also update Dashboard Tax Savings Card
    const dashDeds = document.getElementById('deduction-list');
    if (dashDeds) {
      let pct80c = Math.min((c80/150000)*100, 100);
      dashDeds.innerHTML = `
        <div class="budget-row">
          <div class="budget-header"><span>Section 80C</span><span>₹${fmt(c80)} / ₹1.5L</span></div>
          <div class="progress-bar-bg"><div class="progress-bar-fill progress-safe" style="width:${pct80c}%"></div></div>
        </div>
      `;
    }
  } else {
    dedDetails = `<div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Chapter VI-A Deductions are NOT allowed in the New Regime. Standard deduction of ₹50k is applied.</div>`;
  }
  
  let taxableIncome = Math.max(0, grossTotalIncome - totalDed);
  let computedTax = calculateTax(taxableIncome, regime);

  const html = `
    <div class="dash-layout">
      <div class="dash-main">
        <div class="card">
          <h2 class="card-title">Income Computation (FY ${d.fy-1}-${String(d.fy).slice(-2)})</h2>
          <div class="budget-row"><div class="budget-header"><span>Income from Salary (Gross)</span><span>₹${fmt(grossSalary)}</span></div></div>
          <div class="budget-row"><div class="budget-header"><span>Less: Standard Deduction</span><span style="color:var(--expense)">-₹${fmt(standardDed)}</span></div></div>
          <div class="budget-row"><div class="budget-header"><span style="font-weight:600">Net Salary</span><span style="font-weight:600">₹${fmt(netSalary)}</span></div></div>
          
          <div class="budget-row" style="margin-top:12px;"><div class="budget-header"><span>Income from Business / Profession</span><span>₹${fmt(h.business)}</span></div></div>
          <div class="budget-row"><div class="budget-header"><span>Short Term Capital Gains (STCG)</span><span>₹${fmt(h.stcg)}</span></div></div>
          <div class="budget-row"><div class="budget-header"><span>Long Term Capital Gains (LTCG)</span><span>₹${fmt(h.ltcg)}</span></div></div>
          <div class="budget-row"><div class="budget-header"><span>Income from Other Sources</span><span>₹${fmt(h.otherSources)}</span></div></div>
          
          <hr style="border:none; border-top:1px solid var(--border); margin:16px 0;">
          <div class="budget-row"><div class="budget-header"><span style="font-weight:600;font-size:16px;">Gross Total Income</span><span style="font-weight:600;font-size:16px;color:var(--income)">₹${fmt(grossTotalIncome)}</span></div></div>
        </div>
      </div>
      
      <div class="dash-side">
        <div class="card">
          <h2 class="card-title">Deductions & Tax</h2>
          ${dedDetails}
          <div class="budget-row"><div class="budget-header"><span style="font-weight:600;">Total Deductions</span><span style="color:var(--expense); font-weight:600;">-₹${fmt(totalDed)}</span></div></div>
          <hr style="border:none; border-top:1px dashed var(--border); margin:12px 0;">
          <div class="budget-row"><div class="budget-header"><span style="font-weight:600; font-size:16px;">Taxable Income</span><span style="font-weight:600; font-size:16px;">₹${fmt(taxableIncome)}</span></div></div>
          <div class="budget-row" style="margin-top:16px; background:var(--surface-hover); padding:16px; border-radius:8px; border:1px solid var(--border);">
            <div class="budget-header" style="margin-bottom:0;"><span style="font-weight:700; font-size:18px;">Estimated Tax</span><span style="font-weight:700; font-size:18px; color:var(--expense);">₹${fmt(computedTax)}</span></div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">* Includes 4% Health & Education Cess. Rebate 87A applied if eligible. STCG/LTCG taxed at slab for demo purposes.</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('itr-content').innerHTML = html;
}

// --- P&L REPORT VIEW ---
function loadPLReport() {
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
  }
  const cacheKey = `sp_cache_pl_custom_${sd}_${ed}`;

  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { S.plData = JSON.parse(cached); renderPL(S.plData); } catch(e){}
  } else {
    document.getElementById('pl-content').innerHTML = '<div class="loading-state">Generating P&L Report...</div>';
  }

  fetchWithTimeout(`${S.url}?action=plreport&startDate=${sd}&endDate=${ed}`, {})
    .then(r => r.json())
    .then(d => {
      if(!d.success) throw new Error(d.error);
      localStorage.setItem(cacheKey, JSON.stringify(d));
      S.plData = d;
      renderPL(d);
    }).catch(e => {
      if (!cached) document.getElementById('pl-content').innerHTML = '<div class="loading-state">Failed to load P&L data.</div>';
    });
}

function renderPL(d) {
  let totalInc = 0, totalExp = 0, totalInv = 0;
  
  let tableRows = d.report.map(m => {
    totalInc += m.income; totalExp += m.expense; totalInv += m.investment;
    let net = m.income - m.expense;
    let monthName = new Date(m.year, m.month - 1).toLocaleString('en-US', {month: 'short'});
    return `
      <tr>
        <td>${monthName} ${m.year}</td>
        <td style="color:var(--income)">₹${fmt(m.income)}</td>
        <td style="color:var(--expense)">₹${fmt(m.expense)}</td>
        <td style="color:var(--invest)">₹${fmt(m.investment)}</td>
        <td style="font-weight:600; color:${net >= 0 ? 'var(--income)' : 'var(--expense)'}">₹${fmt(net)}</td>
      </tr>
    `;
  }).join('');

  let totalNet = totalInc - totalExp;

  const html = `
    <div class="card" style="margin-bottom:24px;">
      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:0; padding:12px; gap:16px;">
        <div><div class="m-label">Total Revenue</div><div class="m-value txt-income">₹${fmt(totalInc)}</div></div>
        <div><div class="m-label">Total Expenses</div><div class="m-value txt-expense">₹${fmt(totalExp)}</div></div>
        <div><div class="m-label">Net Profit / Loss</div><div class="m-value" style="color:${totalNet>=0?'var(--income)':'var(--expense)'}">₹${fmt(totalNet)}</div></div>
      </div>
    </div>
    <div class="card" style="overflow-x:auto;">
      <table class="csv-table" style="width:100%; min-width:600px;">
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Expense</th>
            <th>Investment</th>
            <th>Net Cash Flow</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('pl-content').innerHTML = html;
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
    if (t.type === 'income') { icon = '💰'; sign = '+'; }
    if (t.type === 'expense') { icon = '🛒'; sign = '-'; }
    if (t.type === 'investment') { icon = '📈'; sign = '-'; }
    if (t.type === 'business') { icon = '🏢'; sign = ''; } 
    
    let taxTag = t.taxDeductible === 'TRUE' ? '<span class="tax-tag">TAX</span>' : '';
    let recTag = t.recurring === 'TRUE' ? '<span class="tax-tag">🔁</span>' : '';
    let pendingTag = (t.type === 'business' && t.status === 'Pending') ? '<span class="tax-tag" style="background:var(--business-dim);color:var(--business)">PENDING</span>' : '';
    
    let controlsInside = '';
    if (!compact) {
      controlsInside = `
        <div class="swipe-actions">
          <button class="swipe-btn edit" onclick="editTxn('${t.id}')">Edit</button>
          <button class="swipe-btn delete" onclick="deleteTxn('${t.id}')">Delete</button>
        </div>
      `;
    }

    html += `<div class="txn-swipe-container">
      ${controlsInside}
      <div class="txn-row ${compact ? '' : 'swipeable'}" ${!compact ? 'ontouchstart="handleTouchStart(event, this)" ontouchmove="handleTouchMove(event, this)" ontouchend="handleTouchEnd(event, this)"' : ''}>
        <div class="txn-icon ${t.type}">${icon}</div>
        <div class="txn-info">
          <div class="txn-title">${esc(t.title)}</div>
          <div class="txn-meta">${esc(t.dateStr)} • ${esc(t.category)} ${taxTag}${recTag}${pendingTag}</div>
          <div class="txn-meta" style="color:var(--text-dim)">${esc(t.bankAccount)} | ${esc(t.paymentMode)}</div>
        </div>
        <div class="txn-amt-wrap" style="text-align:right;">
          <div class="txn-amt ${t.type}">${sign}₹${fmt(t.amount)}</div>
          ${compact ? '' : '<div style="font-size:10px; color:var(--text-dim); margin-top:4px;">&lt; Swipe &gt;</div>'}
        </div>
      </div>
    </div>`;
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
        backgroundColor: ['#ff4757', '#ffa502', '#2ed573', '#1e90ff', '#3742fa', '#ff5285', '#9b59b6', '#34495e'],
        borderWidth: 0, hoverOffset: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, usePointStyle: true, padding: 20 } } }
    }
  });
}

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
      <div class="budget-row" onclick="openBudgetModal('${esc(cat)}')" style="cursor:pointer">
        <div class="budget-header">
          <span>${esc(cat)} ✏️</span>
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

function openLoanModal(editId = null) {
  document.getElementById('loan-modal').classList.add('open');
  document.getElementById('loan-name').value = '';
  document.getElementById('loan-prin').value = '';
  document.getElementById('loan-emi').value = '';
  document.getElementById('loan-months').value = '';
  document.getElementById('btn-save-loan').removeAttribute('data-edit-id');
  document.getElementById('loan-modal-title').innerText = 'Add Loan / EMI';
  document.getElementById('btn-delete-loan').style.display = 'none';
  
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
      document.getElementById('btn-delete-loan').style.display = 'inline-block';
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

function deleteLoanFromModal() {
  const editId = document.getElementById('btn-save-loan').getAttribute('data-edit-id');
  if (editId) {
    deleteLoan(editId);
    closeLoanModal();
  }
}

function deleteLoan(id) {
  if(!confirm('Delete this loan?')) return;
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'deleteLoan', id: id}) })
    .then(r => r.json()).then(d => {
      toast('Loan Deleted', 'ok');
      clearDashCache();
      loadDashboard();
    }).catch(() => toast('Delete failed', 'err'));
}

function payLoan(id, emiAmt, name) {
  if(!confirm(`Record payment of ₹${emiAmt} for ${name}?`)) return;
  
  let acc = document.getElementById('dash-account') ? document.getElementById('dash-account').value : 'all';
  if (acc === 'all') acc = 'Default';

  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'payLoan', id: id}) })
    .then(r => r.json()).then(d => {
      let dt = new Date();
      let payload = {
        action: 'add', id: 'tx_' + Date.now().toString(36), type: 'expense',
        amount: emiAmt, category: 'EMI / Loan Payment', title: `EMI: ${name}`,
        entity: acc, taxDeductible: false, status: '', recurring: true,
        taxSection: '24b', paymentMode: 'Auto-Debit', incomeHead: '',
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
          <span style="cursor:pointer; text-decoration:underline;" onclick="openLoanModal('${l.id}')">${esc(l.name)}</span>
          ${l.paidMonths >= l.totalMonths 
            ? `<span style="font-size:12px; color:var(--text-dim); font-weight:600; padding:6px 12px;">COMPLETED</span>`
            : `<button class="icon-btn" style="color:var(--accent); font-size:12px;" onclick="payLoan('${l.id}', ${l.emi}, '${esc(l.name)}')">PAY ₹${fmt(l.emi)}</button>`}
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
  
  let taxSec = document.getElementById('mod-tax-section').value;
  let payMode = document.getElementById('mod-pay-mode').value;
  let incomeH = document.getElementById('mod-income-head').value;
  let account = document.getElementById('mod-account').value || 'Default';

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
      taxSection: (S.type === 'expense' || S.type === 'investment') ? taxSec : 'None',
      paymentMode: payMode,
      incomeHead: (S.type === 'income') ? incomeH : '', bankAccount: account, bankAccount: account,
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
        clearCache();
        if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
        if(document.getElementById('view-history').classList.contains('active')) loadHistory();
        if(document.getElementById('view-itr').classList.contains('active')) loadITR();
        if(document.getElementById('view-plreport').classList.contains('active')) loadPLReport();
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
      taxSection: taxSec, paymentMode: payMode, incomeHead: '', bankAccount: account,
      date: dt.toISOString(), dateStr: dateStr, timeStr: timeStr
    });
    
    // Their Reimbursable Portion
    txns.push({
      id: 'tx_' + Date.now().toString(36) + 'B', type: 'business',
      amount: splitAmt, category: 'Other Business',
      title: `Split: ${document.getElementById('mod-title').value}`, entity: splitName,
      taxDeductible: false, status: 'Pending', recurring: false,
      taxSection: 'None', paymentMode: payMode, incomeHead: '', bankAccount: account,
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
      taxSection: (S.type === 'expense' || S.type === 'investment') ? taxSec : 'None',
      paymentMode: payMode,
      incomeHead: (S.type === 'income') ? incomeH : '',
      date: dt.toISOString(), dateStr: dateStr, timeStr: timeStr
    });
  }

  let btn = document.getElementById('btn-submit');
  btn.innerText = 'Saving...'; btn.disabled = true;

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
      
      clearCache();
      if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
      if(document.getElementById('view-itr').classList.contains('active')) loadITR();
      if(document.getElementById('view-plreport').classList.contains('active')) loadPLReport();
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
      if(document.getElementById('view-itr').classList.contains('active')) loadITR();
      if(document.getElementById('view-plreport').classList.contains('active')) loadPLReport();
    }).catch(e => toast('Delete failed', 'err'));
}

function editTxn(id) {
  let txn = null;
  const m = document.getElementById('hist-month').value || (new Date().getMonth() + 1);
  const y = document.getElementById('hist-year').value || new Date().getFullYear();
  for(let i=0; i<localStorage.length; i++) {
    let key = localStorage.key(i);
    if(key.startsWith('sp_cache_')) {
      let d = JSON.parse(localStorage.getItem(key) || 'null');
      if (d) {
         let list = d.transactions || d.recent || (Array.isArray(d) ? d : []);
         txn = list.find(t => t.id === id);
         if (txn) break;
      }
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
  
  if (txn.taxSection) document.getElementById('mod-tax-section').value = txn.taxSection;
  if (txn.paymentMode) document.getElementById('mod-pay-mode').value = txn.paymentMode;
  if (txn.incomeHead) document.getElementById('mod-income-head').value = txn.incomeHead;
  
  document.getElementById('btn-submit').setAttribute('data-edit-id', txn.id);
  
  document.getElementById('add-modal').classList.add('open'); 
  document.getElementById('mod-amt').focus();
}

function settleTxn(id) {
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'settle', id: id}) })
    .then(r => r.json()).then(d => {
      if(!d.success) throw new Error(d.error);
      toast('Claim Marked Settled', 'ok');
      clearCache();
      if(document.getElementById('view-dashboard').classList.contains('active')) loadDashboard();
      if(document.getElementById('view-history').classList.contains('active')) loadHistory();
    }).catch(e => toast('Update failed', 'err'));
}

function exportITRPDF() {
  if (!S.itrData) { toast('Load ITR data first', 'err'); return; }
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(18);
  doc.text(`Spendly Pro - ITR Computation (FY ${S.itrData.fy-1}-${String(S.itrData.fy).slice(-2)})`, 14, 22);
  doc.setFontSize(11);
  doc.text(`Regime: ${S.currentRegime.toUpperCase()} | Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
  
  let d = S.itrData;
  let h = d.incomeByHead;
  let gSal = h.salary || 0;
  let sDed = (gSal>0)?Math.min(gSal, S.currentRegime === 'new' ? 75000 : 50000):0;
  let nSal = gSal - sDed;
  let gti = nSal + (h.business||0) + (h.stcg||0) + (h.ltcg||0) + (h.otherSources||0);
  
  let ded = d.deductions || {};
  let totalDed = 0;
  if(S.currentRegime === 'old') {
    totalDed = Math.min(ded.c80,150000) + Math.min(ded.d80,50000) + ded.g80 + Math.min(ded.sec24b,200000) + Math.min(ded.nps80ccd,50000);
  }
  let taxable = Math.max(0, gti - totalDed);
  let tax = calculateTax(taxable, S.currentRegime);

  doc.autoTable({
    startY: 40,
    head: [['Particulars', 'Amount (Rs.)']],
    body: [
      ['Income from Salary (Gross)', fmt(gSal)],
      ['Less: Standard Deduction', '- ' + fmt(sDed)],
      ['Income from Business/Profession', fmt(h.business||0)],
      ['Short Term Capital Gains (STCG)', fmt(h.stcg||0)],
      ['Long Term Capital Gains (LTCG)', fmt(h.ltcg||0)],
      ['Income from Other Sources', fmt(h.otherSources||0)],
      ['GROSS TOTAL INCOME', fmt(gti)],
      ['Less: Chapter VI-A Deductions', '- ' + fmt(totalDed)],
      ['TOTAL TAXABLE INCOME', fmt(taxable)],
      ['COMPUTED TAX LIABILITY (Inc. Cess)', fmt(tax)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [67, 97, 238] }
  });
  
  doc.save(`Spendly_ITR_Report_FY${S.itrData.fy}.pdf`);
}

// --- CSV SMART IMPORT ---
function parseFullCSV(text, delim) {
  let rows = [], row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i], nx = text[i + 1];
    if (c === '"') {
      if (inQ && nx === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (!inQ && c === (delim || ',')) {
      row.push(cur.trim()); cur = '';
    } else if (!inQ && (c === '\n' || c === '\r')) {
      if (c === '\r' && nx === '\n') i++;
      row.push(cur.trim()); cur = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur || row.length) { row.push(cur.trim()); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
}

function processCSV() {
  const fileInput = document.getElementById('csv-file');
  if(!fileInput.files.length) { toast('Please select a CSV file', 'err'); return; }
  
  const file = fileInput.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const text = e.target.result;
    let head = text.substring(0, 500);
    let delim = ',';
    if ((head.match(/\t/g) || []).length > (head.match(/,/g) || []).length) delim = '\t';
    else if ((head.match(/;/g) || []).length > (head.match(/,/g) || []).length) delim = ';';

    let allRows = parseFullCSV(text, delim);
    if (allRows.length < 2) { toast('CSV is empty or invalid', 'err'); return; }

    let headerRowIdx = -1;
    let dtIdx = -1, descIdx = -1, amtIdx = -1, debitIdx = -1, creditIdx = -1;

    for (let i = 0; i < Math.min(allRows.length, 15); i++) {
      let cols = allRows[i].map(h => h.toLowerCase().trim());
      let dIdx  = cols.findIndex(h => h.includes('date'));
      let descI = cols.findIndex(h => h.includes('detail') || h.includes('description') || h.includes('particular') || h.includes('narration') || h.includes('remark') || h.includes('memo'));
      let debI  = cols.findIndex(h => h === 'debit' || h.includes('withdrawal') || h.includes('dr'));
      let credI = cols.findIndex(h => h === 'credit' || h.includes('deposit') || (h === 'cr'));
      let aIdx  = cols.findIndex(h => h === 'amount' || h === 'txn amount');

      if (dIdx !== -1 && (descI !== -1 || debI !== -1 || credI !== -1 || aIdx !== -1)) {
        headerRowIdx = i; dtIdx = dIdx; descIdx = descI; debitIdx = debI; creditIdx = credI; amtIdx = aIdx;
        break;
      }
    }

    if (headerRowIdx === -1 || dtIdx === -1 || (amtIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
      toast('Could not detect columns. Ensure CSV has Date, Debit, Credit headers.', 'err');
      return;
    }

    S.csvParsedRows = [];
    let html = `<div class="csv-table-wrapper"><table class="csv-table">
      <thead><tr><th>Date</th><th>Details</th><th>Type</th><th>Category</th><th>Amount</th></tr></thead><tbody>`;

    let cleanAmt = (val) => {
      if (!val) return NaN;
      let n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? NaN : n;
    };

    for (let i = headerRowIdx + 1; i < allRows.length; i++) {
      let cols = allRows[i];
      if (!cols[dtIdx]) continue;

      let rawDate = cols[dtIdx];
      let rawDesc = (descIdx !== -1 && cols[descIdx]) ? cols[descIdx] : 'Bank Transaction';

      let debitVal  = debitIdx  !== -1 ? cleanAmt(cols[debitIdx])  : NaN;
      let creditVal = creditIdx !== -1 ? cleanAmt(cols[creditIdx]) : NaN;
      let amtVal    = amtIdx    !== -1 ? cleanAmt(cols[amtIdx])    : NaN;

      let type, displayAmt;
      if (!isNaN(debitVal) && debitVal > 0)        { type = 'expense'; displayAmt = debitVal; }
      else if (!isNaN(creditVal) && creditVal > 0) { type = 'income';  displayAmt = creditVal; }
      else if (!isNaN(amtVal) && amtVal !== 0)     { type = amtVal < 0 ? 'income' : 'expense'; displayAmt = Math.abs(amtVal); }
      else continue;

      let lowerDesc = rawDesc.toLowerCase();
      let cat = type === 'income' ? 'Other Income' : 'Other Expense';
      if (lowerDesc.includes('salary') || lowerDesc.includes('payroll')) cat = 'Salary';
      else if (lowerDesc.includes('uber') || lowerDesc.includes('ola') || lowerDesc.includes('irctc') || lowerDesc.includes('fuel') || lowerDesc.includes('petrol')) cat = 'Transport';
      else if (lowerDesc.includes('swiggy') || lowerDesc.includes('zomato') || lowerDesc.includes('restaurant') || lowerDesc.includes('cafe')) cat = 'Dining Out';
      else if (lowerDesc.includes('netflix') || lowerDesc.includes('prime') || lowerDesc.includes('spotify')) cat = 'Subscriptions';
      else if (lowerDesc.includes('hospital') || lowerDesc.includes('pharmacy') || lowerDesc.includes('medical')) cat = 'Healthcare';
      else if (lowerDesc.includes('amazon') || lowerDesc.includes('flipkart') || lowerDesc.includes('myntra')) cat = 'Shopping';

      let dt = new Date();
      if (rawDate.includes('/') || rawDate.includes('-')) {
        let parts = rawDate.trim().split(/[-/]/);
        if (parts.length >= 3) {
          let p0 = parseInt(parts[0]), p1 = parseInt(parts[1]), p2 = parseInt(parts[2]);
          if (p2 < 100) p2 += 2000;
          dt = new Date(p2, p1 - 1, p0);
        }
      }
      if (isNaN(dt)) dt = new Date();

      let catOptions = (S.categories[type] || S.categories.expense);
      let account = document.getElementById('csv-account').value || 'Default';
      S.csvParsedRows.push({
        id: 'tx_csv_' + Date.now().toString(36) + '_' + i,
        type, amount: displayAmt, category: cat,
        title: rawDesc.replace(/\s+/g, ' ').substring(0, 45),
        entity: 'Bank Import', taxDeductible: false, status: '', recurring: false,
        taxSection: 'None', paymentMode: 'Net Banking', incomeHead: type==='income'?'Other Sources':'', bankAccount: account,
        date: dt.toISOString(),
        dateStr: dt.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'}),
        timeStr: '12:00 PM'
      });

      html += `<tr>
        <td>${dt.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}</td>
        <td>${esc(rawDesc.replace(/\s+/g,' ').substring(0, 35))}</td>
        <td><span class="badge badge-accent" style="${type==='income'?'color:var(--income);background:var(--income-dim)':'color:var(--expense);background:var(--expense-dim)'}">
          ${type.toUpperCase()}</span></td>
        <td><select class="csv-cat-select" onchange="S.csvParsedRows[${S.csvParsedRows.length-1}].category=this.value">
            ${catOptions.map(c => `<option value="${c}" ${c===cat?'selected':''}>${c}</option>`).join('')}
        </select></td>
        <td style="${type==='income'?'color:var(--income)':'color:var(--text)'}">₹${fmt(displayAmt)}</td>
      </tr>`;
    }

    if (S.csvParsedRows.length === 0) {
      toast('No valid rows found. Check Debit/Credit columns.', 'err');
      return;
    }

    html += '</tbody></table></div>';
    document.getElementById('csv-body').innerHTML = html;
    document.getElementById('csv-modal').classList.add('open');
    toast(`Parsed ${S.csvParsedRows.length} transactions.`, 'ok');
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

const BACKEND_CODE = `// Spendly Pro Backend - CA Grade (Phase 4)
// Columns: ID(1) Date(2) Time(3) Type(4) Amount(5) Category(6) Title(7) Entity(8)
//          TaxDeductible(9) Status(10) Month(11) Year(12) Week(13) Recurring(14)
//          TaxSection(15) PaymentMode(16) IncomeHead(17) BankAccount(18)

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return error('System busy, try again.'); }

  try {
    var d = JSON.parse(e.postData.contents);

  var expectedSecret = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (expectedSecret && d.secret !== expectedSecret) return error('Unauthorized');

    var action = d.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Ensure Transactions Sheet
    var ts = ss.getSheetByName('Transactions');
    if (!ts) {
      ts = ss.insertSheet('Transactions');
      ts.appendRow(['ID','Date','Time','Type','Amount','Category','Title','Entity',
                    'TaxDeductible','Status','Month','Year','Week','Recurring',
                    'TaxSection','PaymentMode','IncomeHead','BankAccount']);
      ts.getRange(1,1,1,18).setFontWeight('bold').setBackground('#0a0d14').setFontColor('#ffffff');
      ts.setFrozenRows(1);
    }

    // Ensure Loans Sheet
    var ls = ss.getSheetByName('Loans');
    if (!ls) {
      ls = ss.insertSheet('Loans');
      ls.appendRow(['ID','Name','Principal','MonthlyEMI','TotalMonths','PaidMonths']);
      ls.getRange(1,1,1,6).setFontWeight('bold').setBackground('#9b59b6').setFontColor('#ffffff');
      ls.setFrozenRows(1);
    }
    var as = ss.getSheetByName('Accounts');
    if (!as) {
      as = ss.insertSheet('Accounts');
      as.appendRow(['AccountName']);
      as.getRange(1,1,1,1).setFontWeight('bold').setBackground('#2ecc71').setFontColor('#ffffff');
      as.setFrozenRows(1);
      as.appendRow(['Default']); // Seed with a default account
    }

    if (action === 'add') {
      var dt = new Date(d.date);
      ts.appendRow(buildRow(d, dt));
      return success({msg: 'Transaction Added'});
    }

    if (action === 'edit') {
      var row = findRowById(ts, d.id);
      if (row > 0) {
        var dt = new Date(d.date);
        ts.getRange(row, 1, 1, 18).setValues([buildRow(d, dt)]);
        return success({msg: 'Transaction Updated'});
      }
      return error('Transaction not found');
    }

    if (action === 'addBulk') {
      var rows = [];
      for (var i = 0; i < d.transactions.length; i++) {
        var txn = d.transactions[i];
        var dt = new Date(txn.date);
        rows.push(buildRow(txn, dt));
      }
      if (rows.length > 0) {
        ts.getRange(ts.getLastRow() + 1, 1, rows.length, 18).setValues(rows);
      }
      return success({msg: rows.length + ' Transactions Added'});
    }

    if (action === 'delete') {
      var row = findRowById(ts, d.id);
      if (row > 0) { ts.deleteRow(row); return success({msg: 'Transaction Deleted'}); }
      return error('Transaction not found');
    }

    if (action === 'settle') {
      var row = findRowById(ts, d.id);
      if (row > 0) { ts.getRange(row, 10).setValue('Settled'); return success({msg: 'Settled'}); }
      return error('Not found');
    }

    if (action === 'addLoan') {
      ls.appendRow([d.id, d.name, parseFloat(d.principal), parseFloat(d.emi), parseInt(d.totalMonths), parseInt(d.paidMonths || 0)]);
      return success({msg: 'Loan Added'});
    }

    if (action === 'payLoan') {
      var row = findRowById(ls, d.id);
      if (row > 0) {
        var paid = parseInt(ls.getRange(row, 6).getValue()) || 0;
        ls.getRange(row, 6).setValue(paid + 1);
        
        // Auto-generate EMI Expense Transaction
        var dt = new Date();
        if (d.dateOverride) dt = new Date(d.dateOverride);
        
        var txnRow = [
          'tx_emi_' + Date.now().toString(36), // ID
          dt.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'}), // DateStr
          dt.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}), // TimeStr
          'expense', // Type
          parseFloat(d.emi), // Amount
          'EMI / Loan Payment', // Category
          'EMI: ' + String(d.name), // Title
          'Bank', // Entity
          'FALSE', // TaxDeductible
          '', // Status
          dt.getMonth() + 1, // Month
          dt.getFullYear(), // Year
          weekNum(dt), // Week
          'TRUE', // Recurring
          'None', // TaxSection
          'Auto Debit', // PaymentMode
          '', // IncomeHead
          d.bankAccount || 'Default' // BankAccount
        ];
        ts.appendRow(txnRow);
        
        return success({msg: 'Payment Recorded & Transaction Added'});
      }
      return error('Loan not found');
    }

    if (action === 'editLoan') {
      var row = findRowById(ls, d.id);
      if (row > 0) {
        ls.getRange(row, 2, 1, 4).setValues([[d.name, parseFloat(d.principal), parseFloat(d.emi), parseInt(d.totalMonths)]]);
        return success({msg: 'Loan Updated'});
      }
      return error('Loan not found');
    }

    if (action === 'deleteLoan') {
      var row = findRowById(ls, d.id);
      if (row > 0) { ls.deleteRow(row); return success({msg: 'Loan Deleted'}); }
      return error('Not found');
    }

    return error('Invalid action');
  } catch(err) {
    return error(err.toString());
  } finally {
    lock.releaseLock();
  }
}

function buildRow(d, dt) {
  return [
    d.id, d.dateStr, d.timeStr, d.type, parseFloat(d.amount),
    d.category || '', d.title || '', d.entity || '',
    d.taxDeductible ? 'TRUE' : 'FALSE', d.status || '',
    dt.getMonth()+1, dt.getFullYear(), weekNum(dt), d.recurring ? 'TRUE' : 'FALSE',
    d.taxSection || 'None', d.paymentMode || 'UPI', d.incomeHead || '', d.bankAccount || 'Default'
  ];
}

function findRowById(sheet, id) {
  var lr = sheet.getLastRow();
  if (lr < 2) return -1;
  var data = sheet.getRange(2, 1, lr - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function doGet(e) {
  try {

  var expectedSecret = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (expectedSecret && e.parameter.secret !== expectedSecret) return error('Unauthorized');

    var action = e.parameter.action || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ts = ss.getSheetByName('Transactions');
    var ls = ss.getSheetByName('Loans');
    var data = (ts && ts.getLastRow() >= 2) ? ts.getDataRange().getValues() : [];
    var loanData = (ls && ls.getLastRow() >= 2) ? ls.getDataRange().getValues() : [];

    // ─── DASHBOARD ────────────────────────────────────────────────
    if (action === 'dashboard') {
      var monthParam = e.parameter.month;
      var yearParam  = e.parameter.year;
      var accountParam = e.parameter.account || 'all';
      var isAll = (monthParam === 'all' || yearParam === 'all');
      var month = parseInt(monthParam), year = parseInt(yearParam);
      var income = 0, expense = 0, investment = 0, businessPending = 0;
      var availableBalance = 0;
      var recent = [], categoryTotals = {}, subscriptions = [];
      
      var filterAbs = isAll ? Infinity : (year * 12 + month);
      var nowFor6m = new Date();
      var currentAbs = isAll ? (nowFor6m.getFullYear() * 12 + nowFor6m.getMonth() + 1) : (year * 12 + month);
      var sixMonthTxns = [];

      for (var i = data.length - 1; i >= 1; i--) {
        var r = data[i];
        var rType = String(r[3]).toLowerCase();
        var rAmt  = parseFloat(r[4]) || 0;
        var rM = parseInt(r[10]), rY = parseInt(r[11]);
        var isRec = String(r[13]).toUpperCase() === 'TRUE';
        var rAcc = String(r[17] || 'Default');

        if (accountParam !== 'all' && rAcc !== accountParam) continue;
        
        var txnAbs = (rY * 12) + rM;
        if (txnAbs <= filterAbs) {
          if (rType === 'income') availableBalance += rAmt;
          if (rType === 'expense' || rType === 'investment') availableBalance -= rAmt;
        }

        if (rType === 'business' && String(r[9]).toLowerCase() === 'pending') businessPending += rAmt;
        
        if (txnAbs <= currentAbs && txnAbs > currentAbs - 6) {
          sixMonthTxns.push(rowToObj(r));
        }
        
        var inScope = isAll || (rM === month && rY === year);
        if (!inScope) continue;

        if (rType === 'income')     income += rAmt;
        if (rType === 'expense')    { expense += rAmt; var cat = String(r[5]); categoryTotals[cat] = (categoryTotals[cat]||0) + rAmt; }
        if (rType === 'investment') investment += rAmt;
        if (recent.length < 10) recent.push(rowToObj(r));
        if (isRec && rType === 'expense') subscriptions.push(rowToObj(r));
      }

      var loans = [];
      for (var i = 1; i < loanData.length; i++) {
        loans.push({id:loanData[i][0],name:loanData[i][1],principal:loanData[i][2],
                    emi:loanData[i][3],totalMonths:loanData[i][4],paidMonths:loanData[i][5]});
      }
      return success({income:income, expense:expense, investment:investment,
                      businessPending:businessPending, availableBalance:availableBalance,
                      categories:categoryTotals, recent:recent, subscriptions:subscriptions, loans:loans, sixMonthTxns:sixMonthTxns});
    }

    // ─── HISTORY ──────────────────────────────────────────────────
    if (action === 'history') {
      var monthParam = e.parameter.month;
      var yearParam  = e.parameter.year;
      var accountParam = e.parameter.account || 'all';
      var isAll = (monthParam === 'all' || yearParam === 'all');
      var month = parseInt(monthParam), year = parseInt(yearParam);
      var results = [];
      for (var i = data.length - 1; i >= 1; i--) {
        var rAcc = String(data[i][17] || 'Default');
        if (accountParam !== 'all' && rAcc !== accountParam) continue;
        
        if (isAll) {
          results.push(rowToObj(data[i]));
        } else if (parseInt(data[i][10]) === month && parseInt(data[i][11]) === year) {
          results.push(rowToObj(data[i]));
        }
      }
      return success({transactions: results});
    }

    // ─── ITR SUMMARY (Indian FY: Apr–Mar) ─────────────────────────
    if (action === 'itr') {
      var fy = parseInt(e.parameter.fy); // e.g. 2026 means FY 2025-26 (Apr 2025 to Mar 2026)
      var incomeByHead = {salary:0, business:0, stcg:0, ltcg:0, otherSources:0};
      var deductions   = {c80:0, d80:0, g80:0, e80:0, sec24b:0, tta80:0, nps80ccd:0, hra:0};
      var totalIncome = 0, totalExpense = 0;

      for (var i = 1; i < data.length; i++) {
        var r = data[i];
        var rY = parseInt(r[11]), rM = parseInt(r[10]);
        var inFY = (getFY(rM, rY) === fy);
        if (!inFY) continue;

        var rType    = String(r[3]).toLowerCase();
        var rAmt     = parseFloat(r[4]) || 0;
        var rSection = String(r[14] || '').toLowerCase().replace(/\s/g,'');
        var rHead    = String(r[16] || '').toLowerCase();

        if (rType === 'income') {
          totalIncome += rAmt;
          if (rHead.includes('salary') || rHead === '')     incomeByHead.salary      += rAmt;
          else if (rHead.includes('business'))               incomeByHead.business    += rAmt;
          else if (rHead.includes('stcg'))                   incomeByHead.stcg        += rAmt;
          else if (rHead.includes('ltcg'))                   incomeByHead.ltcg        += rAmt;
          else                                                incomeByHead.otherSources+= rAmt;
        }

        if (rType === 'expense' || rType === 'investment') {
          totalExpense += rAmt;
          if (rSection === '80c' || rSection.includes('80c'))      deductions.c80     += rAmt;
          if (rSection === '80d' || rSection.includes('80d'))      deductions.d80     += rAmt;
          if (rSection === '80g' || rSection.includes('80g'))      deductions.g80     += rAmt;
          if (rSection === '80e' || rSection.includes('80e'))      deductions.e80     += rAmt;
          if (rSection === '24b' || rSection.includes('24b'))      deductions.sec24b  += rAmt;
          if (rSection === '80tta'|| rSection.includes('80tta'))   deductions.tta80   += rAmt;
          if (rSection === '80ccd'|| rSection.includes('80ccd'))   deductions.nps80ccd+= rAmt;
          if (rSection === 'hra'  || rSection.includes('hra'))     deductions.hra     += rAmt;
        }
      }

      return success({fy:fy, incomeByHead:incomeByHead, deductions:deductions,
                      totalIncome:totalIncome, totalExpense:totalExpense});
    }

    // ─── P&L REPORT (Month-wise Indian FY) ────────────────────────
        if (action === 'syncAccounts') {
      var op = d.op;
      var accName = d.name;
      var as = ss.getSheetByName('Accounts');
      if (!as) return error('Accounts sheet missing.');
      
      var data = as.getDataRange().getValues();
      var foundIdx = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === accName) { foundIdx = i + 1; break; }
      }
      
      if (op === 'add' && foundIdx === -1) {
        as.appendRow([accName]);
      } else if (op === 'delete' && foundIdx !== -1) {
        as.deleteRow(foundIdx);
      }
      
      // Return updated list
      data = as.getDataRange().getValues();
      var accounts = [];
      for (var i = 1; i < data.length; i++) {
        if (data[i][0]) accounts.push(String(data[i][0]));
      }
      if (accounts.length === 0) accounts = ['Default'];
      return success({accounts: accounts});
    }

    if (action === 'plreport') {
      var sdStr = e.parameter.startDate;
      var edStr = e.parameter.endDate;
      var report = [];
      
      // If dates not provided, default to current FY
      if (!sdStr || !edStr) {
        var now = new Date();
        var y = now.getFullYear();
        var m = now.getMonth() + 1;
        var fy = m <= 3 ? y : y + 1;
        sdStr = (fy - 1) + "-04-01";
        edStr = fy + "-03-31";
      }

      var sdParts = sdStr.split('-');
      var edParts = edStr.split('-');
      var startY = parseInt(sdParts[0]), startM = parseInt(sdParts[1]);
      var endY = parseInt(edParts[0]), endM = parseInt(edParts[1]);
      
      var curY = startY, curM = startM;
      while (curY * 12 + curM <= endY * 12 + endM) {
        report.push({month: curM, year: curY, income: 0, expense: 0, investment: 0});
        curM++;
        if (curM > 12) { curM = 1; curY++; }
      }

      for (var i = 1; i < data.length; i++) {
        var rM = parseInt(data[i][10]), rY = parseInt(data[i][11]);
        var rType = String(data[i][3]).toLowerCase();
        var rAmt  = parseFloat(data[i][4]) || 0;
        
        // Quick check if transaction is within bounds before looping report array
        if ((rY * 12 + rM) >= (startY * 12 + startM) && (rY * 12 + rM) <= (endY * 12 + endM)) {
          for (var j = 0; j < report.length; j++) {
            if (report[j].month === rM && report[j].year === rY) {
              if (rType === 'income')     report[j].income     += rAmt;
              if (rType === 'expense')    report[j].expense    += rAmt;
              if (rType === 'investment') report[j].investment += rAmt;
              break;
            }
          }
        }
      }
      return success({report:report});
    }

    // ─── NET WORTH ─────────────────────────────────────────────────
    if (action === 'networth') {
      var totalIncome = 0, totalExpense = 0, totalInvestment = 0;
      for (var i = 1; i < data.length; i++) {
        var rType = String(data[i][3]).toLowerCase();
        var rAmt  = parseFloat(data[i][4]) || 0;
        if (rType === 'income')     totalIncome     += rAmt;
        if (rType === 'expense')    totalExpense    += rAmt;
        if (rType === 'investment') totalInvestment += rAmt;
      }
      return success({totalIncome:totalIncome, totalExpense:totalExpense,
                      totalInvestment:totalInvestment, netWorth:totalIncome-totalExpense-totalInvestment});
    }

    // ─── LEGACY TAX ────────────────────────────────────────────────
    if (action === 'tax') {
      var year = parseInt(e.parameter.year);
      var claims = [], tax = [];
      for (var i = data.length - 1; i >= 1; i--) {
        if (String(data[i][3]).toLowerCase() === 'business' && String(data[i][9]).toLowerCase() === 'pending') claims.push(rowToObj(data[i]));
        if (parseInt(data[i][11]) === year && String(data[i][8]).toUpperCase() === 'TRUE') tax.push(rowToObj(data[i]));
      }
      return success({claims:claims, tax:tax});
    }

    return success({msg:'Spendly Pro API Phase 4 - CA Edition'});
  } catch(err) {
    return error(err.toString());
  }
}

function rowToObj(row) {
  return {
    id:row[0], dateStr:row[1], timeStr:row[2], type:row[3], amount:row[4],
    category:row[5], title:row[6], entity:row[7], taxDeductible:row[8], status:row[9],
    recurring:row[13], taxSection:row[14]||'', paymentMode:row[15]||'', incomeHead:row[16]||'',
    bankAccount:row[17]||'Default'
  };
}

function success(data) { data.success = true; return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function error(msg) { return ContentService.createTextOutput(JSON.stringify({success:false,error:msg})).setMimeType(ContentService.MimeType.JSON); }
function weekNum(d) { var j = new Date(d.getFullYear(),0,1); return Math.ceil((((d-j)/86400000)+j.getDay()+1)/7); }


function getFY(month, year) {
  // month is 1-12. If Apr-Dec (>=4), FY is year to year+1. If Jan-Mar (<=3), FY is year-1 to year.
  // We return the end year of the FY. E.g. Mar 2026 -> 2026. May 2025 -> 2026.
  return month >= 4 ? year + 1 : year;
}


// --- AUTOMATION ---
function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('sendMonthlyReport')
    .timeBased()
    .onMonthDay(1)
    .atHour(8)
    .create();
}

function sendMonthlyReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ts = ss.getSheetByName('Transactions');
  if (!ts) return;
  var data = ts.getDataRange().getValues();
  
  var now = new Date();
  var targetM = now.getMonth(); // previous month (0-indexed natively, so 0 is Jan)
  var targetY = now.getFullYear();
  if (targetM === 0) { targetM = 12; targetY -= 1; }
  
  var inc = 0, exp = 0;
  var cats = {};
  
  for (var i = 1; i < data.length; i++) {
    if (parseInt(data[i][10]) === targetM && parseInt(data[i][11]) === targetY) {
      var type = String(data[i][3]).toLowerCase();
      var amt = parseFloat(data[i][4]) || 0;
      var cat = String(data[i][5]);
      if (type === 'income') inc += amt;
      if (type === 'expense') {
        exp += amt;
        cats[cat] = (cats[cat] || 0) + amt;
      }
    }
  }
  
  var topCats = Object.keys(cats).sort(function(a,b){return cats[b]-cats[a]}).slice(0,3);
  var catHtml = topCats.map(function(c) { return "<li>" + c + ": ₹" + cats[c] + "</li>"; }).join('');
  
  var html = "<div style='font-family:sans-serif; max-width:600px; margin:0 auto; padding:20px; border:1px solid #ddd; border-radius:10px;'>";
  html += "<h2 style='color:#333;'>Spendly Monthly Summary</h2>";
  html += "<p>Here is your automated financial report for " + targetM + "/" + targetY + "</p>";
  html += "<h3 style='color:#2ecc71'>Total Income: ₹" + inc + "</h3>";
  html += "<h3 style='color:#e74c3c'>Total Expense: ₹" + exp + "</h3>";
  html += "<hr>";
  html += "<h4>Top Expenses:</h4><ul>" + catHtml + "</ul>";
  html += "<p style='color:#888;font-size:12px;'>Automated by Spendly Apps Script</p></div>";
  
  var email = Session.getEffectiveUser().getEmail();
  if (email) {
    MailApp.sendEmail({
      to: email,
      subject: "Spendly Report: " + targetM + "/" + targetY,
      htmlBody: html
    });
  }
}
`;

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


init();

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
    list.innerHTML = accounts.map(a => `
      <div style="display:flex;justify-content:space-between;background:var(--surface-hover);padding:10px 14px;border-radius:8px;">
        <span>${a}</span>
        ${a !== 'Default' ? `<button onclick="removeBankAccount('${a}')" style="background:none;border:none;color:var(--expense);cursor:pointer;font-weight:bold;">✕</button>` : ''}
      </div>
    `).join('');
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


// --- NATIVE SWIPE GESTURES ---
let touchStartX = 0;
let currentSwipeEl = null;

function handleTouchStart(e, el) {
  touchStartX = e.touches[0].clientX;
  el.style.transition = 'none';
  if (currentSwipeEl && currentSwipeEl !== el) {
    currentSwipeEl.style.transform = 'translateX(0)';
  }
  currentSwipeEl = el;
}

function handleTouchMove(e, el) {
  let touchX = e.touches[0].clientX;
  let deltaX = touchX - touchStartX;
  
  // Resistance when dragging beyond buttons
  if (deltaX > 80) deltaX = 80 + (deltaX - 80) * 0.2;
  if (deltaX < -80) deltaX = -80 + (deltaX + 80) * 0.2;
  
  el.style.transform = `translateX(${deltaX}px)`;
}

function handleTouchEnd(e, el) {
  el.style.transition = 'transform 0.3s ease';
  let transformStr = el.style.transform;
  let currentX = parseInt(transformStr.replace('translateX(', '').replace('px)', '')) || 0;
  
  if (currentX > 40) {
    // Swiped Right -> Reveal Edit (Left side)
    el.style.transform = 'translateX(80px)';
  } else if (currentX < -40) {
    // Swiped Left -> Reveal Delete (Right side)
    el.style.transform = 'translateX(-80px)';
  } else {
    // Snap back
    el.style.transform = 'translateX(0)';
  }
}


let trendChartInstance = null;

function renderTrendChart(txns, selectedYear, selectedMonth, currentNetWorth = 0) {
  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  // Determine the end date for the 6 months
  let endY = new Date().getFullYear();
  let endM = new Date().getMonth() + 1; // 1-12
  
  if (selectedYear !== 'all') endY = parseInt(selectedYear);
  if (selectedMonth !== 'all') endM = parseInt(selectedMonth);

  // Generate last 6 months labels and initialize data
  let labels = [];
  let incomeData = [];
  let expenseData = [];
  let monthKeys = [];
  
  for (let i = 5; i >= 0; i--) {
    let d = new Date(endY, endM - 1 - i, 1);
    let m = d.getMonth() + 1;
    let y = d.getFullYear();
    labels.push(d.toLocaleString('default', { month: 'short' }) + ' ' + y);
    monthKeys.push(y + '_' + m);
    incomeData.push(0);
    expenseData.push(0);
  }

  let totalExpenseRunway = 0;
  
  // Aggregate data
  txns.forEach(t => {
    let key = t.year + '_' + t.month;
    let idx = monthKeys.indexOf(key);
    if (idx !== -1) {
      if (t.type === 'income') incomeData[idx] += t.amount;
      // Filter out non-recurring outliers for runway?
      // User said: "calculate burn rate strictly using Expenses minus one-off non-recurring investments or large isolated outliers (if flagged)."
      // If it's a massive expense and not recurring, we can exclude it from runway, but for chart we show it.
      if (t.type === 'expense') {
        expenseData[idx] += t.amount;
        if (t.amount < 150000 || t.recurring === 'TRUE') {
          totalExpenseRunway += t.amount;
        }
      }
    }
  });

  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Income', data: incomeData, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', fill: true, tension: 0.4 },
        { label: 'Expense', data: expenseData, borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)', fill: true, tension: 0.4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: function(value) { return '₹' + (value/1000) + 'k'; } } }
      }
    }
  });

  // Calculate Runway
  let avgBurn = totalExpenseRunway / 6;
  
  let totalSaved = currentNetWorth;
  let runwayText = '';
  if (avgBurn <= 0) {
    runwayText = 'Burn rate is zero. Infinite runway!';
  } else if (totalSaved <= 0) {
    runwayText = 'Net worth is negative. No runway available.';
  } else {
    let months = (totalSaved / avgBurn).toFixed(1);
    runwayText = `<strong style="color:var(--text);font-size:15px;">${months} Months</strong> of Runway remaining at an avg burn rate of <strong>₹${fmt(avgBurn)}/mo</strong>`;
  }
  document.getElementById('runway-estimator').innerHTML = runwayText;
}
