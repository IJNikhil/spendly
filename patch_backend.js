const fs = require('fs');
let content = fs.readFileSync('AppsScript.js', 'utf8');

const dashboardBlockRegex = /var filterAbs = isAll \? Infinity : \(year \* 12 \+ month\);/;
if (content.match(dashboardBlockRegex)) {
  const replacement = `var filterAbs = isAll ? Infinity : (year * 12 + month);
      var nowFor6m = new Date();
      var currentAbs = isAll ? (nowFor6m.getFullYear() * 12 + nowFor6m.getMonth() + 1) : (year * 12 + month);
      var sixMonthTxns = [];`;
  content = content.replace(dashboardBlockRegex, replacement);
}

const loopScopeRegex = /var inScope = isAll \|\| \(rM === month && rY === year\);/;
if (content.match(loopScopeRegex)) {
  const replacement2 = `if (txnAbs <= currentAbs && txnAbs > currentAbs - 6) {
          sixMonthTxns.push(rowToObj(r));
        }
        
        var inScope = isAll || (rM === month && rY === year);`;
  content = content.replace(loopScopeRegex, replacement2);
}

const returnRegex = /return success\(\{income:income, expense:expense, investment:investment,\s+businessPending:businessPending, availableBalance:availableBalance,\s+categories:categoryTotals, recent:recent, subscriptions:subscriptions, loans:loans\}\);/;
if (content.match(returnRegex)) {
  const replacement3 = `return success({income:income, expense:expense, investment:investment,
                      businessPending:businessPending, availableBalance:availableBalance,
                      categories:categoryTotals, recent:recent, subscriptions:subscriptions, loans:loans, sixMonthTxns:sixMonthTxns});`;
  content = content.replace(returnRegex, replacement3);
}

fs.writeFileSync('AppsScript.js', content);
console.log('AppsScript.js patched for sixMonthTxns');
