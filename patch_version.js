const fs = require('fs');

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace('sw.js?v=2.9.2', 'sw.js?v=2.9.3');
index = index.replace('<script src="js/app.js?v=2.9.2"></script>', '<script src="js/app.js?v=2.9.3"></script>');
fs.writeFileSync('index.html', index);

let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace('spendly-pro-v2.8', 'spendly-pro-v2.9');
fs.writeFileSync('sw.js', sw);

let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace("APP_VERSION = 'v2.9.2'", "APP_VERSION = 'v2.9.3'");
fs.writeFileSync('js/app.js', app);

console.log('Bumped version to v2.9.3');
