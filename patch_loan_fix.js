const fs = require('fs');

let index = fs.readFileSync('index.html', 'utf8');
const oldFooter = `<div class="modal-footer">
          <button class="btn" onclick="closeLoanModal()">Cancel</button>
          <button class="btn btn-primary" id="btn-save-loan" onclick="saveLoan()">Save Loan</button>
        </div>`;
const newFooter = `<div class="modal-footer" style="justify-content:space-between">
          <button class="btn" style="color:var(--expense); display:none;" id="btn-delete-loan" onclick="deleteLoanFromModal()">Delete</button>
          <div>
            <button class="btn" onclick="closeLoanModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-save-loan" onclick="saveLoan()">Save</button>
          </div>
        </div>`;
index = index.replace(oldFooter, newFooter);
index = index.replace('sw.js?v=2.9', 'sw.js?v=2.9.1');
index = index.replace('<script src="js/app.js?v=2.9"></script>', '<script src="js/app.js?v=2.9.1"></script>');
fs.writeFileSync('index.html', index);


let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace('spendly-pro-v2.6', 'spendly-pro-v2.7');
fs.writeFileSync('sw.js', sw);

let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace("APP_VERSION = 'v2.9'", "APP_VERSION = 'v2.9.1'");

const oldOpenModal = `document.getElementById('btn-save-loan').removeAttribute('data-edit-id');
  document.getElementById('loan-modal-title').innerText = 'Add Loan / EMI';`;
const newOpenModal = `document.getElementById('btn-save-loan').removeAttribute('data-edit-id');
  document.getElementById('loan-modal-title').innerText = 'Add Loan / EMI';
  document.getElementById('btn-delete-loan').style.display = 'none';`;
app = app.replace(oldOpenModal, newOpenModal);

const oldOpenModalEdit = `document.getElementById('btn-save-loan').setAttribute('data-edit-id', editId);
      document.getElementById('loan-modal-title').innerText = 'Edit Loan';`;
const newOpenModalEdit = `document.getElementById('btn-save-loan').setAttribute('data-edit-id', editId);
      document.getElementById('loan-modal-title').innerText = 'Edit Loan';
      document.getElementById('btn-delete-loan').style.display = 'inline-block';`;
app = app.replace(oldOpenModalEdit, newOpenModalEdit);

const oldRenderLoan = `<div class="budget-header" style="margin-bottom:8px;">
          <span>\${esc(l.name)}</span>
          <button class="icon-btn" style="color:var(--accent); font-size:12px;" onclick="payLoan('\${l.id}', \${l.emi}, '\${esc(l.name)}')">PAY ₹\${fmt(l.emi)}</button>
        </div>`;
const newRenderLoan = `<div class="budget-header" style="margin-bottom:8px;">
          <span style="cursor:pointer; text-decoration:underline;" onclick="openLoanModal('\${l.id}')">\${esc(l.name)}</span>
          \${l.paidMonths >= l.totalMonths 
            ? \`<span style="font-size:12px; color:var(--text-dim); font-weight:600; padding:6px 12px;">COMPLETED</span>\`
            : \`<button class="icon-btn" style="color:var(--accent); font-size:12px;" onclick="payLoan('\${l.id}', \${l.emi}, '\${esc(l.name)}')">PAY ₹\${fmt(l.emi)}</button>\`}
        </div>`;
app = app.replace(oldRenderLoan, newRenderLoan);

const addDeleteFunc = `function deleteLoan(id) {`;
const newDeleteFunc = `function deleteLoanFromModal() {
  const editId = document.getElementById('btn-save-loan').getAttribute('data-edit-id');
  if (editId) {
    deleteLoan(editId);
    closeLoanModal();
  }
}

function deleteLoan(id) {`;
app = app.replace(addDeleteFunc, newDeleteFunc);

fs.writeFileSync('js/app.js', app);

console.log('Loan bugs patched!');
