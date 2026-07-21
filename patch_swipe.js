const fs = require('fs');

let app = fs.readFileSync('js/app.js', 'utf8');

// 1. Rewrite renderTxnList to wrap in swipe container
const oldRenderBody = `
    html += \`<div class="txn-item">
      <div class="txn-icon">\${icon}</div>
      <div class="txn-details">
        <div class="txn-title">\${esc(t.title)}</div>
        <div class="txn-meta">\${esc(t.dateStr)} • \${esc(t.category)} \${taxTag}\${recTag}\${pendingTag}</div>
        <div class="txn-meta" style="color:var(--text-dim)">\${esc(t.bankAccount)} | \${esc(t.paymentMode)}</div>
      </div>
      \${controls}
    </div>\`;
  });
`;

const newRenderBody = `
    let controlsInside = \`\`;
    if (!compact) {
      controlsInside = \`
        <div class="swipe-actions">
          <button class="swipe-btn edit" onclick="editTxn('\${t.id}')">Edit</button>
          <button class="swipe-btn delete" onclick="deleteTxn('\${t.id}')">Delete</button>
        </div>
      \`;
    }

    html += \`<div class="txn-swipe-container">
      \${controlsInside}
      <div class="txn-item \${compact ? '' : 'swipeable'}" \${!compact ? 'ontouchstart="handleTouchStart(event, this)" ontouchmove="handleTouchMove(event, this)" ontouchend="handleTouchEnd(event, this)"' : ''}>
        <div class="txn-icon">\${icon}</div>
        <div class="txn-details">
          <div class="txn-title">\${esc(t.title)}</div>
          <div class="txn-meta">\${esc(t.dateStr)} • \${esc(t.category)} \${taxTag}\${recTag}\${pendingTag}</div>
          <div class="txn-meta" style="color:var(--text-dim)">\${esc(t.bankAccount)} | \${esc(t.paymentMode)}</div>
        </div>
        \${compact ? '' : '<div style="font-size:10px; color:var(--text-dim);">&lt; Swipe &gt;</div>'}
        <div class="txn-amount" style="color:\${t.type==='expense'||t.type==='investment'?'var(--expense)':'var(--income)'}">\${sign}₹\${fmt(t.amount)}</div>
      </div>
    </div>\`;
  });
`;

app = app.replace(/html \+= `\n?\s*<div class="txn-item">[\s\S]*?<\/div>`;\n\s*\}\);/, newRenderBody);
app = app.replace("let controls = '';", "let controls = '';"); // Placeholder to keep logic intact. Actually, let's just write a more exact regex.

// Let's replace the entire renderTxnList manually
const renderTxnListRegex = /function renderTxnList[\s\S]*?el\.innerHTML = html;\n\}/;

const newRenderTxnList = `function renderTxnList(txns, containerId, compact = false) {
  const el = document.getElementById(containerId);
  if(!txns.length) {
    el.innerHTML = '<div class="loading-state">No records found.</div>';
    return;
  }
  
  let html = '';
  txns.forEach(t => {
    let icon = '', sign = '';
    if (t.type === 'income') { icon = '💰'; sign = '+'; }
    if (t.type === 'expense') { icon = '🛒'; sign = '-'; }
    if (t.type === 'investment') { icon = '📈'; sign = '-'; }
    if (t.type === 'business') { icon = '🏢'; sign = ''; } 
    
    let taxTag = t.taxDeductible === 'TRUE' ? '<span class="tax-tag">TAX</span>' : '';
    let recTag = t.recurring === 'TRUE' ? '<span class="tax-tag">🔁</span>' : '';
    let pendingTag = (t.type === 'business' && t.status === 'Pending') ? '<span class="tax-tag" style="background:var(--business-dim);color:var(--business)">PENDING</span>' : '';
    
    let controlsInside = '';
    if (!compact) {
      controlsInside = \`
        <div class="swipe-actions">
          <button class="swipe-btn edit" onclick="editTxn('\${t.id}')">Edit</button>
          <button class="swipe-btn delete" onclick="deleteTxn('\${t.id}')">Delete</button>
        </div>
      \`;
    }

    html += \`<div class="txn-swipe-container">
      \${controlsInside}
      <div class="txn-item \${compact ? '' : 'swipeable'}" \${!compact ? 'ontouchstart="handleTouchStart(event, this)" ontouchmove="handleTouchMove(event, this)" ontouchend="handleTouchEnd(event, this)"' : ''}>
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
      </div>
    </div>\`;
  });
  el.innerHTML = html;
}`;

app = app.replace(renderTxnListRegex, newRenderTxnList);

// 2. Add Swipe Logic to app.js
const swipeLogic = `
// --- NATIVE SWIPE GESTURES ---
let touchStartX = 0;
let currentSwipeEl = null;

function handleTouchStart(e, el) {
  touchStartX = e.touches[0].clientX;
  el.style.transition = 'none';
  if (currentSwipeEl && currentSwipeEl !== el) {
    currentSwipeEl.style.transform = 'translateX(0)';
  }
  currentSwipeEl = el;
}

function handleTouchMove(e, el) {
  let touchX = e.touches[0].clientX;
  let deltaX = touchX - touchStartX;
  
  // Resistance when dragging beyond buttons
  if (deltaX > 80) deltaX = 80 + (deltaX - 80) * 0.2;
  if (deltaX < -80) deltaX = -80 + (deltaX + 80) * 0.2;
  
  el.style.transform = \`translateX(\${deltaX}px)\`;
}

function handleTouchEnd(e, el) {
  el.style.transition = 'transform 0.3s ease';
  let transformStr = el.style.transform;
  let currentX = parseInt(transformStr.replace('translateX(', '').replace('px)', '')) || 0;
  
  if (currentX > 40) {
    // Swiped Right -> Reveal Edit (Left side)
    el.style.transform = 'translateX(80px)';
  } else if (currentX < -40) {
    // Swiped Left -> Reveal Delete (Right side)
    el.style.transform = 'translateX(-80px)';
  } else {
    // Snap back
    el.style.transform = 'translateX(0)';
  }
}
`;
app += '\n' + swipeLogic;

fs.writeFileSync('js/app.js', app);

// 3. Add CSS for Swipe
let css = fs.readFileSync('css/styles.css', 'utf8');
const swipeCss = `
/* Swipe Gestures */
.txn-swipe-container {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}
.swipe-actions {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  background: var(--bg);
}
.swipe-btn {
  width: 80px;
  border: none;
  color: white;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.swipe-btn.edit { background: var(--primary); }
.swipe-btn.delete { background: var(--expense); }
.swipeable {
  background: var(--surface);
  position: relative;
  z-index: 2;
  border-bottom: none !important;
}
`;
css += '\n' + swipeCss;
fs.writeFileSync('css/styles.css', css);

console.log('Swipe gestures implemented');
