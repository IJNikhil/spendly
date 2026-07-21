const fs = require('fs');
let content = fs.readFileSync('AppsScript.js', 'utf8');

const plRegex = /if \(action === 'plreport'\) \{[\s\S]*?return success\(\{fy:fy, report:report\}\);\s*\}/;

const newPlBlock = `if (action === 'plreport') {
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
    }`;

if (content.match(plRegex)) {
  content = content.replace(plRegex, newPlBlock);
  fs.writeFileSync('AppsScript.js', content);
  console.log('AppsScript patched for plreport');
} else {
  console.log('Could not find plreport block to replace in AppsScript.js');
}
