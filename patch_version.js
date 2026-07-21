const fs = require('fs');

let index = fs.readFileSync('index.html', 'utf8');
index = index.replace("sw.js?v=2.8", "sw.js?v=2.8.1");
index = index.replace('<script src="js/app.js?v=2.8"></script>', '<script src="js/app.js?v=2.8.1"></script>');
fs.writeFileSync('index.html', index);

let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace("spendly-pro-v2.4", "spendly-pro-v2.5");
fs.writeFileSync('sw.js', sw);

let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace("APP_VERSION = 'v2.8'", "APP_VERSION = 'v2.8.1'");
fs.writeFileSync('js/app.js', app);

console.log('Bumped version to v2.8.1');
