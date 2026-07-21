// Spendly Pro Backend - CA Grade (Phase 4)
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
      var recent = [], categoryTotals = {}, subscriptions = [];

      for (var i = data.length - 1; i >= 1; i--) {
        var r = data[i];
        var rType = String(r[3]).toLowerCase();
        var rAmt  = parseFloat(r[4]) || 0;
        var rM = parseInt(r[10]), rY = parseInt(r[11]);
        var isRec = String(r[13]).toUpperCase() === 'TRUE';
        var rAcc = String(r[17] || 'Default');

        if (rType === 'business' && String(r[9]).toLowerCase() === 'pending') businessPending += rAmt;
        if (accountParam !== 'all' && rAcc !== accountParam) continue;
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
                      businessPending:businessPending, netFlow:income-expense,
                      categories:categoryTotals, recent:recent, subscriptions:subscriptions, loans:loans});
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
    if (action === 'plreport') {
      var fy = parseInt(e.parameter.fy);
      var fyMonths = [
        {m:4,y:fy-1},{m:5,y:fy-1},{m:6,y:fy-1},{m:7,y:fy-1},
        {m:8,y:fy-1},{m:9,y:fy-1},{m:10,y:fy-1},{m:11,y:fy-1},{m:12,y:fy-1},
        {m:1,y:fy},{m:2,y:fy},{m:3,y:fy}
      ];
      var report = fyMonths.map(function(mo) {
        return {month:mo.m, year:mo.y, income:0, expense:0, investment:0};
      });

      for (var i = 1; i < data.length; i++) {
        var rM = parseInt(data[i][10]), rY = parseInt(data[i][11]);
        var rType = String(data[i][3]).toLowerCase();
        var rAmt  = parseFloat(data[i][4]) || 0;
        for (var j = 0; j < report.length; j++) {
          if (report[j].month === rM && report[j].year === rY) {
            if (rType === 'income')     report[j].income     += rAmt;
            if (rType === 'expense')    report[j].expense    += rAmt;
            if (rType === 'investment') report[j].investment += rAmt;
            break;
          }
        }
      }
      return success({fy:fy, report:report});
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
