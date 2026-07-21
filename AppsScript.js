// Spendly Pro Backend - Apps Script (Phase 3)

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return error('System busy, please try again later.');
  }

  try {
    var d = JSON.parse(e.postData.contents);
    var action = d.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Ensure Transactions Sheet
    var ts = ss.getSheetByName('Transactions');
    if (!ts) {
      ts = ss.insertSheet('Transactions');
      // Added Recurring column at the end
      ts.appendRow(['ID', 'Date', 'Time', 'Type', 'Amount', 'Category', 'Title', 'Entity', 'TaxDeductible', 'Status', 'Month', 'Year', 'Week', 'Recurring']);
      ts.getRange(1,1,1,14).setFontWeight('bold').setBackground('#0a0d14').setFontColor('#ffffff');
      ts.setFrozenRows(1);
    }

    // Ensure Loans Sheet
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

    if (action === 'edit') {
      var row = findRowById(ts, d.id);
      if (row > 0) {
        var dt = new Date(d.date);
        var rowData = [
          d.id, d.dateStr, d.timeStr, d.type, parseFloat(d.amount), 
          d.category || '', d.title || '', d.entity || '', d.taxDeductible ? 'TRUE' : 'FALSE', d.status || '', 
          dt.getMonth()+1, dt.getFullYear(), weekNum(dt), d.recurring ? 'TRUE' : 'FALSE'
        ];
        ts.getRange(row, 1, 1, rowData.length).setValues([rowData]);
        return success({msg: 'Transaction Updated'});
      }
      return error('Transaction not found');
    }
    
    if (action === 'addBulk') {
      // Used for CSV Imports or Split Bills
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
      if(rows.length > 0) {
        ts.getRange(ts.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      }
      return success({msg: rows.length + ' Transactions Added'});
    }

    if (action === 'delete') {
      var row = findRowById(ts, d.id);
      if (row > 0) {
        ts.deleteRow(row);
        return success({msg: 'Transaction Deleted'});
      }
      return error('Transaction not found');
    }

    if (action === 'settle') {
      var row = findRowById(ts, d.id);
      if (row > 0) {
        ts.getRange(row, 10).setValue('Settled');
        return success({msg: 'Marked as Settled'});
      }
      return error('Transaction not found');
    }

    // LOAN ACTIONS
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
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 2;
  }
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
      var monthParam = e.parameter.month;
      var yearParam = e.parameter.year;
      var isAllTime = (monthParam === 'all' || yearParam === 'all');
      var month = parseInt(monthParam);
      var year = parseInt(yearParam);
      var income = 0, expense = 0, investment = 0, businessPending = 0;
      var recent = [];
      var categoryTotals = {};
      var subscriptions = [];
      
      for (var i = data.length - 1; i >= 1; i--) {
        var rowType = String(data[i][3]).toLowerCase();
        var rowAmt = parseFloat(data[i][4]) || 0;
        var rowM = parseInt(data[i][10]);
        var rowY = parseInt(data[i][11]);
        var isRecurring = String(data[i][13]).toUpperCase() === 'TRUE';
        
        if (rowType === 'business' && String(data[i][9]).toLowerCase() === 'pending') {
          businessPending += rowAmt;
        }

        var inScope = isAllTime || (rowM === month && rowY === year);
        
        if (inScope) {
          if (rowType === 'income') income += rowAmt;
          if (rowType === 'expense') {
            expense += rowAmt;
            var cat = String(data[i][5]);
            categoryTotals[cat] = (categoryTotals[cat] || 0) + rowAmt;
          }
          if (rowType === 'investment') investment += rowAmt;
          if (recent.length < 10) recent.push(rowToObj(data[i]));
          
          if (isRecurring && rowType === 'expense') {
             subscriptions.push(rowToObj(data[i]));
          }
        }
      }
      
      // Get Loans
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
        if (String(data[i][3]).toLowerCase() === 'business' && String(data[i][9]).toLowerCase() === 'pending') {
          claims.push(rowToObj(data[i]));
        }
        if (parseInt(data[i][11]) === year && String(data[i][8]).toUpperCase() === 'TRUE') {
          tax.push(rowToObj(data[i]));
        }
      }
      return success({claims: claims, tax: tax});
    }

    return success({msg: 'Spendly Pro API Phase 3'});
  } catch(err) {
    return error(err.toString());
  }
}

function rowToObj(row) {
  return {
    id: row[0], dateStr: row[1], timeStr: row[2], type: row[3], amount: row[4],
    category: row[5], title: row[6], entity: row[7], taxDeductible: row[8], status: row[9], recurring: row[13]
  };
}

function success(data) {
  data.success = true;
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function error(msg) {
  return ContentService.createTextOutput(JSON.stringify({success: false, error: msg})).setMimeType(ContentService.MimeType.JSON);
}

function weekNum(d) {
  var j = new Date(d.getFullYear(),0,1);
  return Math.ceil((((d-j)/86400000)+j.getDay()+1)/7);
}
