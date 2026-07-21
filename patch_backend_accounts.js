const fs = require('fs');
let code = fs.readFileSync('AppsScript.js', 'utf8');

// 1. Add Accounts Sheet init logic
const initOld = `    var ls = ss.getSheetByName('Loans');
    if (!ls) {
      ls = ss.insertSheet('Loans');
      ls.appendRow(['ID','Name','Principal','MonthlyEMI','TotalMonths','PaidMonths']);
      ls.getRange(1,1,1,6).setFontWeight('bold').setBackground('#9b59b6').setFontColor('#ffffff');
      ls.setFrozenRows(1);
    }`;
const initNew = `    var ls = ss.getSheetByName('Loans');
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
    }`;
code = code.replace(initOld, initNew);

// 2. Fetch Accounts in dashboard action
const dashOld = `      var sixMonthTxns = [];`;
const dashNew = `      var accounts = ['Default'];
      var as = ss.getSheetByName('Accounts');
      if (as && as.getLastRow() > 1) {
        var accData = as.getRange(2, 1, as.getLastRow() - 1, 1).getValues();
        accounts = []; // Clear default
        for (var i = 0; i < accData.length; i++) {
          if (accData[i][0]) accounts.push(String(accData[i][0]));
        }
      }
      if (accounts.length === 0) accounts = ['Default'];
      
      var sixMonthTxns = [];`;
code = code.replace(dashOld, dashNew);

const dashReturnOld = `        recent: recent, transactions: txns, loans: loans,
        sixMonthTxns: sixMonthTxns
      });`;
const dashReturnNew = `        recent: recent, transactions: txns, loans: loans,
        sixMonthTxns: sixMonthTxns, accounts: accounts
      });`;
code = code.replace(dashReturnOld, dashReturnNew);

// 3. Add syncAccounts action
const syncAccountsCode = `    if (action === 'syncAccounts') {
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
    }`;

// Insert before the plreport block
code = code.replace("if (action === 'plreport')", syncAccountsCode + "\n\n    if (action === 'plreport')");

fs.writeFileSync('AppsScript.js', code);
console.log('AppsScript patched for Accounts!');
