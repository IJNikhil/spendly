const fs = require('fs');
let code = fs.readFileSync('AppsScript.js', 'utf8');

// 1. Auth & Lock
const authCode = `
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (expectedSecret && d.secret !== expectedSecret) return error('Unauthorized');
`;

const getAuthCode = `
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (expectedSecret && e.parameter.secret !== expectedSecret) return error('Unauthorized');
`;

// Insert into doPost
code = code.replace("var d = JSON.parse(e.postData.contents);", "var d = JSON.parse(e.postData.contents);\n" + authCode);

// Insert into doGet
code = code.replace("function doGet(e) {\n  try {", "function doGet(e) {\n  try {\n" + getAuthCode);

// 2. Centralize getFY
const getFYCode = `
function getFY(month, year) {
  // month is 1-12. If Apr-Dec (>=4), FY is year to year+1. If Jan-Mar (<=3), FY is year-1 to year.
  // We return the end year of the FY. E.g. Mar 2026 -> 2026. May 2025 -> 2026.
  return month >= 4 ? year + 1 : year;
}
`;
code += '\n' + getFYCode;

// Update ITR logic
code = code.replace("var inFY = (rY === fy-1 && rM >= 4) || (rY === fy && rM <= 3);", "var inFY = (getFY(rM, rY) === fy);");

// 3. Update payLoan to generate Expense
const payLoanOld = `    if (action === 'payLoan') {
      var row = findRowById(ls, d.id);
      if (row > 0) {
        var paid = parseInt(ls.getRange(row, 6).getValue()) || 0;
        ls.getRange(row, 6).setValue(paid + 1);
        return success({msg: 'Payment Recorded'});
      }
      return error('Loan not found');
    }`;

const payLoanNew = `    if (action === 'payLoan') {
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
    }`;

code = code.replace(payLoanOld, payLoanNew);

fs.writeFileSync('AppsScript.js', code);
console.log('AppsScript patched!');
