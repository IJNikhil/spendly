const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const newAnalyticsCard = `
          <div class="card">
            <h2 class="card-title">6-Month Trend & Runway</h2>
            <div class="chart-container" style="height:200px;"><canvas id="trendChart"></canvas></div>
            <div id="runway-estimator" style="margin-top:16px; font-size:13px; color:var(--text-dim); text-align:center; padding:12px; background:var(--surface-hover); border-radius:8px;">
              Calculating runway...
            </div>
          </div>
`;

html = html.replace('</div>\n\n          <!-- 80C/80D Tax Savings Progress (FY) -->', '</div>\n' + newAnalyticsCard + '\n          <!-- 80C/80D Tax Savings Progress (FY) -->');
fs.writeFileSync('index.html', html);

// Now patch app.js
let app = fs.readFileSync('js/app.js', 'utf8');

const analyticsLogic = `
let trendChartInstance = null;

function renderTrendChart(txns, selectedYear, selectedMonth) {
  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  // Determine the end date for the 6 months
  let endY = new Date().getFullYear();
  let endM = new Date().getMonth() + 1; // 1-12
  
  if (selectedYear !== 'all') endY = parseInt(selectedYear);
  if (selectedMonth !== 'all') endM = parseInt(selectedMonth);

  // Generate last 6 months labels and initialize data
  let labels = [];
  let incomeData = [];
  let expenseData = [];
  let monthKeys = [];
  
  for (let i = 5; i >= 0; i--) {
    let d = new Date(endY, endM - 1 - i, 1);
    let m = d.getMonth() + 1;
    let y = d.getFullYear();
    labels.push(d.toLocaleString('default', { month: 'short' }) + ' ' + y);
    monthKeys.push(y + '_' + m);
    incomeData.push(0);
    expenseData.push(0);
  }

  let totalExpenseRunway = 0;
  
  // Aggregate data
  txns.forEach(t => {
    let key = t.year + '_' + t.month;
    let idx = monthKeys.indexOf(key);
    if (idx !== -1) {
      if (t.type === 'income') incomeData[idx] += t.amount;
      // Filter out non-recurring outliers for runway?
      // User said: "calculate burn rate strictly using Expenses minus one-off non-recurring investments or large isolated outliers (if flagged)."
      // If it's a massive expense and not recurring, we can exclude it from runway, but for chart we show it.
      if (t.type === 'expense') {
        expenseData[idx] += t.amount;
        if (t.amount < 150000 || t.recurring === 'TRUE') {
          totalExpenseRunway += t.amount;
        }
      }
    }
  });

  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Income', data: incomeData, borderColor: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', fill: true, tension: 0.4 },
        { label: 'Expense', data: expenseData, borderColor: '#e74c3c', backgroundColor: 'rgba(231, 76, 60, 0.1)', fill: true, tension: 0.4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: function(value) { return '₹' + (value/1000) + 'k'; } } }
      }
    }
  });

  // Calculate Runway
  let avgBurn = totalExpenseRunway / 6;
  
  // Need to calculate current net worth from ALL transactions (txns passed here are ALL txns because we need 6 months history)
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
    let months = (totalSaved / avgBurn).toFixed(1);
    runwayText = \`<strong style="color:var(--text);font-size:15px;">\${months} Months</strong> of Runway remaining at an avg burn rate of <strong>₹\${fmt(avgBurn)}/mo</strong>\`;
  }
  document.getElementById('runway-estimator').innerHTML = runwayText;
}
`;

app += '\n' + analyticsLogic;

// Now we need to call renderTrendChart in loadDashboard
// loadDashboard currently fetches for the specific month/year. We need the last 6 months.
// The easiest way is to fetch 'all' 'all' in the background, or just use the dashboard endpoint but modify it to return all data, or just use the local sp_cache_dash_all_all.
// Since Dashboard returns summary + recent + transactions for the month, it doesn't return 6 months unless selected 'all'.
// Wait! If the user selects "all", we have all transactions. If they select a specific month, dashboard ONLY returns that month's transactions.
// To fix this without heavy API changes: let's fetch "history" for "all" in the background for the runway calculation, OR modify AppsScript dashboard to return a 6-month aggregate!
// Modifying AppsScript Dashboard is cleaner.

// Actually, I'll update AppsScript in the next step. Let's just put the hook in loadDashboard.
app = app.replace("renderExpenseChart(d.transactions || []);", "renderExpenseChart(d.transactions || []);\n      if(d.sixMonthTxns) renderTrendChart(d.sixMonthTxns, m, y);");

fs.writeFileSync('js/app.js', app);
console.log('Analytics patched in frontend');
