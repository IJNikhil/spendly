const fs = require('fs');
let content = fs.readFileSync('js/app.js', 'utf8');

const target1 = `function renderDashboardData(d) {
  animateValue('val-net', d.availableBalance || (d.netFlow || 0)); animateValue('val-income', d.income);
  animateValue('val-expense', d.expense); animateValue('val-invest', d.investment);
  renderTxnList(d.recent || [], 'recent-list', true);
  renderChart(d.categories || {});
  renderBudgets(d.categories || {});
  renderSubscriptions(d.subscriptions || []);
  renderLoans(d.loans || []);`;

const replacement1 = `function renderDashboardData(d) {
  animateValue('val-net', d.availableBalance || (d.netFlow || 0)); animateValue('val-income', d.income);
  animateValue('val-expense', d.expense); animateValue('val-invest', d.investment);
  renderTxnList(d.recent || [], 'recent-list', true);
  renderChart(d.categories || {});
  renderBudgets(d.categories || {});
  renderSubscriptions(d.subscriptions || []);
  renderLoans(d.loans || []);
  
  const m = document.getElementById('dash-month').value;
  const y = document.getElementById('dash-year').value;
  renderTrendChart(d.sixMonthTxns || [], y, m, d.availableBalance || 0);`;

content = content.replace(target1, replacement1);

const trendChartSignature = `function renderTrendChart(txns, selectedYear, selectedMonth) {`;
const trendChartReplacement = `function renderTrendChart(txns, selectedYear, selectedMonth, currentNetWorth = 0) {`;
content = content.replace(trendChartSignature, trendChartReplacement);

const runwayCalcOld = `  // Need to calculate current net worth from ALL transactions (txns passed here are ALL txns because we need 6 months history)
  let totalSaved = 0;
  txns.forEach(t => {
    if (t.type === 'income') totalSaved += t.amount;
    if (t.type === 'expense' || t.type === 'investment') totalSaved -= t.amount;
  });

  let runwayText = '';
  if (avgBurn <= 0) {
    runwayText = 'Burn rate is zero. Infinite runway!';
  } else if (totalSaved <= 0) {
    runwayText = 'Net worth is negative. No runway available.';
  } else {
    let months = (totalSaved / avgBurn).toFixed(1);`;

const runwayCalcNew = `  let totalSaved = currentNetWorth;
  let runwayText = '';
  if (avgBurn <= 0) {
    runwayText = 'Burn rate is zero. Infinite runway!';
  } else if (totalSaved <= 0) {
    runwayText = 'Net worth is negative. No runway available.';
  } else {
    let months = (totalSaved / avgBurn).toFixed(1);`;

content = content.replace(runwayCalcOld, runwayCalcNew);

fs.writeFileSync('js/app.js', content);
console.log('Patched app.js for Dashboard features');
