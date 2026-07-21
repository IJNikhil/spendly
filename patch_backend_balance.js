const fs = require('fs');
let code = fs.readFileSync('AppsScript.js', 'utf8');

const dashOld = `      var monthParam = e.parameter.month;
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
      }`;

const dashNew = `      var monthParam = e.parameter.month;
      var yearParam  = e.parameter.year;
      var accountParam = e.parameter.account || 'all';
      var isAll = (monthParam === 'all' || yearParam === 'all');
      var month = parseInt(monthParam), year = parseInt(yearParam);
      var income = 0, expense = 0, investment = 0, businessPending = 0;
      var availableBalance = 0;
      var recent = [], categoryTotals = {}, subscriptions = [];
      
      var filterAbs = isAll ? Infinity : (year * 12 + month);

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
        
        var inScope = isAll || (rM === month && rY === year);
        if (!inScope) continue;

        if (rType === 'income')     income += rAmt;
        if (rType === 'expense')    { expense += rAmt; var cat = String(r[5]); categoryTotals[cat] = (categoryTotals[cat]||0) + rAmt; }
        if (rType === 'investment') investment += rAmt;
        if (recent.length < 10) recent.push(rowToObj(r));
        if (isRec && rType === 'expense') subscriptions.push(rowToObj(r));
      }`;

code = code.replace(dashOld, dashNew);

const retOld = `      var sixMonthTxns = [];
      return success({income:income, expense:expense, investment:investment,
                      businessPending:businessPending, netFlow:income-expense,
                      categories:categoryTotals, recent:recent, transactions: [], loans: loans,
                      sixMonthTxns: sixMonthTxns, accounts: accounts
      });`;

const retNew = `      var sixMonthTxns = [];
      return success({income:income, expense:expense, investment:investment,
                      businessPending:businessPending, availableBalance:availableBalance,
                      categories:categoryTotals, recent:recent, transactions: [], loans: loans,
                      sixMonthTxns: sixMonthTxns, accounts: accounts
      });`;

code = code.replace(retOld, retNew);

fs.writeFileSync('AppsScript.js', code);
console.log('AppsScript patched for Available Balance!');
