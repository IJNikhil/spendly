const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

// Update version string
app = app.replace("const APP_VERSION = 'v2.6-ca';", "const APP_VERSION = 'v2.7';");

// Fix HTML template in renderTxnList
const badTemplate = `      <div class="txn-item \${compact ? '' : 'swipeable'}" \${!compact ? 'ontouchstart="handleTouchStart(event, this)" ontouchmove="handleTouchMove(event, this)" ontouchend="handleTouchEnd(event, this)"' : ''}>
        <div class="txn-icon">\${icon}</div>
        <div class="txn-details">
          <div class="txn-title">\${esc(t.title)}</div>
          <div class="txn-meta">\${esc(t.dateStr)} • \${esc(t.category)} \${taxTag}\${recTag}\${pendingTag}</div>
          <div class="txn-meta" style="color:var(--text-dim)">\${esc(t.bankAccount)} | \${esc(t.paymentMode)}</div>
        </div>
        <div class="txn-amount-wrap" style="text-align:right;">
          <div class="txn-amount" style="color:\${t.type==='expense'||t.type==='investment'?'var(--expense)':'var(--income)'}">\${sign}₹\${fmt(t.amount)}</div>
          \${compact ? '' : '<div style="font-size:10px; color:var(--text-dim); margin-top:4px;">&lt; Swipe &gt;</div>'}
        </div>
      </div>`;

const goodTemplate = `      <div class="txn-row \${compact ? '' : 'swipeable'}" \${!compact ? 'ontouchstart="handleTouchStart(event, this)" ontouchmove="handleTouchMove(event, this)" ontouchend="handleTouchEnd(event, this)"' : ''}>
        <div class="txn-icon \${t.type}">\${icon}</div>
        <div class="txn-info">
          <div class="txn-title">\${esc(t.title)}</div>
          <div class="txn-meta">\${esc(t.dateStr)} • \${esc(t.category)} \${taxTag}\${recTag}\${pendingTag}</div>
          <div class="txn-meta" style="color:var(--text-dim)">\${esc(t.bankAccount)} | \${esc(t.paymentMode)}</div>
        </div>
        <div class="txn-amt-wrap" style="text-align:right;">
          <div class="txn-amt \${t.type}">\${sign}₹\${fmt(t.amount)}</div>
          \${compact ? '' : '<div style="font-size:10px; color:var(--text-dim); margin-top:4px;">&lt; Swipe &gt;</div>'}
        </div>
      </div>`;

app = app.replace(badTemplate, goodTemplate);
fs.writeFileSync('js/app.js', app);
console.log('UI template and version fixed');
