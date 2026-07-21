const fs = require('fs');

// 1. Update index.html
let index = fs.readFileSync('index.html', 'utf8');
index = index.replace("sw.js?v=2.7", "sw.js?v=2.7.1");
index = index.replace('<script src="js/app.js?v=2.6"></script>', '<script src="js/app.js?v=2.7.1"></script>');
fs.writeFileSync('index.html', index);

// 2. Update sw.js
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace("spendly-pro-v2.2", "spendly-pro-v2.3");
fs.writeFileSync('sw.js', sw);

// 3. Update app.js version string
let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace("APP_VERSION = 'v2.7'", "APP_VERSION = 'v2.7.1'");
fs.writeFileSync('js/app.js', app);

console.log('Bumped version to v2.7.1');
