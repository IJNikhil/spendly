const fs = require('fs');
let code = fs.readFileSync('AppsScript.js', 'utf8');

// 1. Dashboard 6-month txns
const dashLogicOld = `      return success({
        net: net, income: income, expense: expense, invest: invest,
        recent: recent, transactions: txns, loans: loans
      });`;

const dashLogicNew = `
      var endY = new Date().getFullYear();
      var endM = new Date().getMonth() + 1;
      if (year !== 'all') endY = parseInt(year);
      if (month !== 'all') endM = parseInt(month);
      
      var sixMonthTxns = [];
      for (var i = data.length - 1; i >= 1; i--) {
        if (account !== 'all' && String(data[i][17]) !== account) continue;
        var rY = parseInt(data[i][11]);
        var rM = parseInt(data[i][10]);
        // Simple approx check for last 6 months
        var diff = (endY - rY) * 12 + (endM - rM);
        if (diff >= 0 && diff <= 5) {
          sixMonthTxns.push(rowToObj(data[i]));
        }
      }

      return success({
        net: net, income: income, expense: expense, invest: invest,
        recent: recent, transactions: txns, loans: loans,
        sixMonthTxns: sixMonthTxns
      });`;
code = code.replace(dashLogicOld, dashLogicNew);

// 2. Custom Date Range for P&L
const plOld = `    if (action === 'plreport') {
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
        var rType = String(data[i][3]).toLowerCase();
        var rAmt = parseFloat(data[i][4]) || 0;
        var rM = parseInt(data[i][10]), rY = parseInt(data[i][11]);
        
        var moIdx = report.findIndex(function(x) { return x.month === rM && x.year === rY; });
        if (moIdx > -1) {
          if (rType === 'income') report[moIdx].income += rAmt;
          if (rType === 'expense') report[moIdx].expense += rAmt;
          if (rType === 'investment') report[moIdx].investment += rAmt;
        }
      }
      return success({fy:fy, report:report});
    }`;

const plNew = `    if (action === 'plreport') {
      var startDate = e.parameter.startDate;
      var endDate = e.parameter.endDate;
      var sd = startDate ? new Date(startDate) : null;
      var ed = endDate ? new Date(endDate) : null;
      
      var reportMap = {};
      for (var i = 1; i < data.length; i++) {
        var dt = new Date(data[i][1]); // Date string
        if (sd && dt < sd) continue;
        if (ed && dt > ed) continue;
        
        var rType = String(data[i][3]).toLowerCase();
        var rAmt = parseFloat(data[i][4]) || 0;
        var rM = parseInt(data[i][10]), rY = parseInt(data[i][11]);
        var key = rY + '_' + rM;
        
        if (!reportMap[key]) {
          reportMap[key] = {month: rM, year: rY, income: 0, expense: 0, investment: 0};
        }
        
        if (rType === 'income') reportMap[key].income += rAmt;
        if (rType === 'expense') reportMap[key].expense += rAmt;
        if (rType === 'investment') reportMap[key].investment += rAmt;
      }
      
      var report = Object.keys(reportMap).map(function(k) { return reportMap[k]; });
      // Sort chronologically
      report.sort(function(a,b) { return (a.year - b.year) || (a.month - b.month); });
      
      return success({report:report});
    }`;
code = code.replace(plOld, plNew);


// 3. Automated Emails
const emailCode = `
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
code += '\n' + emailCode;

fs.writeFileSync('AppsScript.js', code);
console.log('AppsScript patched for Phase 6!');
