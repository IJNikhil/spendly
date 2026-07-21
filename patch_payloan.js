const fs = require('fs');
let content = fs.readFileSync('js/app.js', 'utf8');

const target3 = `function payLoan(id, emiAmt, name) {
  if(!confirm(\`Record payment of ₹\${emiAmt} for \${name}?\`)) return;
  
  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'payLoan', id: id}) })
    .then(r => r.json()).then(d => {
      let dt = new Date();
      let payload = {
        action: 'add', id: 'tx_' + Date.now().toString(36), type: 'expense',
        amount: emiAmt, category: 'Rent/Mortgage', title: \`EMI: \${name}\`,
        entity: 'Bank', taxDeductible: false, status: '', recurring: true,`;

const replacement3 = `function payLoan(id, emiAmt, name) {
  if(!confirm(\`Record payment of ₹\${emiAmt} for \${name}?\`)) return;
  
  let acc = document.getElementById('dash-account') ? document.getElementById('dash-account').value : 'all';
  if (acc === 'all') acc = 'Default';

  fetchWithTimeout(S.url, { method: 'POST', body: JSON.stringify({action: 'payLoan', id: id}) })
    .then(r => r.json()).then(d => {
      let dt = new Date();
      let payload = {
        action: 'add', id: 'tx_' + Date.now().toString(36), type: 'expense',
        amount: emiAmt, category: 'EMI / Loan Payment', title: \`EMI: \${name}\`,
        entity: acc, taxDeductible: false, status: '', recurring: true,`;

content = content.replace(target3, replacement3);

fs.writeFileSync('js/app.js', content);
console.log('Patched payLoan in app.js');
