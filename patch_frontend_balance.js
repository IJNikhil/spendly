const fs = require('fs');

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace('<div class="m-label">Net Cash Flow</div>', '<div class="m-label">Available Balance</div>');
index = index.replace('sw.js?v=2.8.1', 'sw.js?v=2.9');
index = index.replace('<script src="js/app.js?v=2.8.1"></script>', '<script src="js/app.js?v=2.9"></script>');
fs.writeFileSync('index.html', index);

let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace('spendly-pro-v2.5', 'spendly-pro-v2.6');
fs.writeFileSync('sw.js', sw);

let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace("APP_VERSION = 'v2.8.1'", "APP_VERSION = 'v2.9'");
app = app.replace("animateValue('val-net', d.netFlow);", "animateValue('val-net', d.availableBalance);");
fs.writeFileSync('js/app.js', app);

console.log('Frontend patched for Available Balance!');
