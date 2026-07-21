const fs = require('fs');

let app = fs.readFileSync('js/app.js', 'utf8');

// Fallback for undefined availableBalance
app = app.replace("animateValue('val-net', d.availableBalance);", "animateValue('val-net', d.availableBalance || (d.netFlow || 0));");

// Add version-based cache invalidation
const initOld = `function init() {
  renderSettings();
  loadDashboard();
}`;
const initNew = `function init() {
  if (localStorage.getItem('sp_app_version') !== APP_VERSION) {
    clearCache();
    localStorage.setItem('sp_app_version', APP_VERSION);
  }
  renderSettings();
  loadDashboard();
}`;
app = app.replace(initOld, initNew);

app = app.replace("APP_VERSION = 'v2.9.3'", "APP_VERSION = 'v2.9.4'");
fs.writeFileSync('js/app.js', app);

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace('sw.js?v=2.9.3', 'sw.js?v=2.9.4');
index = index.replace('<script src="js/app.js?v=2.9.3"></script>', '<script src="js/app.js?v=2.9.4"></script>');
fs.writeFileSync('index.html', index);

let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace('spendly-pro-v2.9', 'spendly-pro-v2.10');
fs.writeFileSync('sw.js', sw);

console.log('Patched NaN and added auto cache clearing!');
