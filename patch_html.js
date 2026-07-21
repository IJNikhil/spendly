const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Add nav-settings class to settings nav item
html = html.replace(`<a href="#" class="nav-item" onclick="nav('settings', this)">`, `<a href="#" class="nav-item nav-settings" onclick="nav('settings', this)">`);

// 2. Add header settings icon
const headerSettings = `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button class="icon-btn mobile-settings-btn" onclick="nav('settings', document.querySelectorAll('.nav-item')[4])" style="display:none; padding:8px; border-radius:50%; background:var(--surface-hover);">
            <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--text);fill:none;stroke-width:2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
          <div class="filters">
`;
html = html.replace(`<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">\n          <div class="filters">`, headerSettings);

// Add the same header settings icon to History, ITR, PL
html = html.replace(`<header class="page-header">\n        <div>\n          <h1>Ledger</h1>\n        </div>\n        <div class="filters">`, `<header class="page-header">\n        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">\n          <h1>Ledger</h1>\n          <button class="icon-btn mobile-settings-btn" onclick="nav('settings', document.querySelectorAll('.nav-item')[4])" style="display:none; padding:8px; border-radius:50%; background:var(--surface-hover);"><svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:var(--text);fill:none;stroke-width:2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>\n        </div>\n        <div class="filters">`);

// 3. Add Loan & Budget modals at the end of body
const newModals = `
  <!-- LOAN MODAL -->
  <div class="modal" id="loan-modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="loan-modal-title">Add Loan / EMI</h2>
        <button class="close-btn" onclick="closeLoanModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="input-group">
          <label>Loan Name</label>
          <input type="text" id="loan-name" placeholder="e.g. Home Loan">
        </div>
        <div class="input-row">
          <div class="input-group flex-1">
            <label>Total Principal (₹)</label>
            <input type="number" id="loan-prin" placeholder="0.00">
          </div>
          <div class="input-group flex-1">
            <label>Monthly EMI (₹)</label>
            <input type="number" id="loan-emi" placeholder="0.00">
          </div>
        </div>
        <div class="input-group">
          <label>Total Duration (Months)</label>
          <input type="number" id="loan-months" placeholder="e.g. 60">
        </div>
        <div class="modal-footer">
          <button class="btn" onclick="closeLoanModal()">Cancel</button>
          <button class="btn btn-primary" id="btn-save-loan" onclick="saveLoan()">Save Loan</button>
        </div>
      </div>
    </div>
  </div>

  <!-- BUDGET MODAL -->
  <div class="modal" id="budget-modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="budget-modal-title">Set Budget</h2>
        <button class="close-btn" onclick="closeBudgetModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="input-group">
          <label>Category</label>
          <select id="budget-cat">
            <option value="Rent/Mortgage">Rent/Mortgage</option>
            <option value="Groceries">Groceries</option>
            <option value="Utilities">Utilities</option>
            <option value="Transport">Transport</option>
            <option value="Subscriptions">Subscriptions</option>
            <option value="Dining Out">Dining Out</option>
            <option value="Healthcare">Healthcare</option>
            <option value="Shopping">Shopping</option>
            <option value="Other Expense">Other Expense</option>
          </select>
        </div>
        <div class="input-group">
          <label>Monthly Limit (₹)</label>
          <input type="number" id="budget-limit" placeholder="0.00">
        </div>
        <div class="modal-footer">
          <button class="btn" style="color:var(--expense)" id="btn-delete-budget" onclick="deleteBudget()">Delete</button>
          <button class="btn btn-primary" onclick="saveBudget()">Save Budget</button>
        </div>
      </div>
    </div>
  </div>
`;
html = html.replace('</body>', newModals + '\n</body>');

fs.writeFileSync('index.html', html);
console.log('HTML patched');
