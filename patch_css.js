const fs = require('fs');
let css = fs.readFileSync('css/styles.css', 'utf8');

// Hide settings on mobile, show on desktop
css = css.replace('.nav-add-btn { order: 3; }', '.nav-add-btn { order: 3; }\n.nav-settings { display: none !important; }');
css = css.replace('.nav-item span { display: block; } /* Show text on desktop */', '.nav-item span { display: block; } /* Show text on desktop */\n  .nav-settings { display: flex !important; }\n  .mobile-settings-btn { display: none !important; }');

// Display mobile settings button block
css = css.replace('body.light-mode .nav-bar { background: rgba(255, 255, 255, 0.8); }', 'body.light-mode .nav-bar { background: rgba(255, 255, 255, 0.8); }\n.mobile-settings-btn { display: flex !important; }');

fs.writeFileSync('css/styles.css', css);
console.log('CSS patched');
