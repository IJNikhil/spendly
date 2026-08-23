/**
 * Spendly Pro (v3.0.0) — Core Runtime
 * Zero-Friction, High-Performance Personal Finance & Tax Engine
 */

const APP_VERSION = '3.0.0';
const CACHE_KEY_TXNS = 'sp_txns_cache';
const CACHE_KEY_ACCOUNTS = 'sp_accounts_cache';
const CACHE_KEY_BUDGETS = 'sp_budgets_cache';
const CACHE_KEY_LOANS = 'sp_loans_cache';

function readCache(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key}; using an empty local cache.`, error);
    return fallback;
  }
}

// Global Application State
const S = {
  currentType: 'expense',
  currentRegime: 'new',
  activeView: 'dashboard',
  transactions: readCache(CACHE_KEY_TXNS, []),
  accounts: readCache(CACHE_KEY_ACCOUNTS, ['Savings', 'Credit Card', 'Cash']),
  budgets: readCache(CACHE_KEY_BUDGETS, {}),
  loans: readCache(CACHE_KEY_LOANS, []),
  categories: {
    expense: ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Entertainment', 'Health', 'General'],
    income: ['Salary', 'Freelance', 'Investment Return', 'Rental', 'Refund', 'Other'],
    transfer: ['Internal Transfer'],
    investment: ['Mutual Funds', 'Stocks (Direct)', 'PPF / EPF', 'NPS', 'Fixed Deposit', 'Gold / Sovereign']
  },
  userProfile: readCache('spendly_user_profile', null)
};

// Integer-Paise Math Precision Helpers
const toPaise = (rupees) => Math.round(parseFloat(rupees || 0) * 100);
const fromPaise = (paise) => (paise || 0) / 100;
const fmtINR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
let driveAccessToken = '';
let driveTokenClient = null;

/* --------------------------------------------------------------------------
   Initialization & Direct Dashboard Launch
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const isWorkspacePage = window.location.pathname.endsWith('/workspace.html') || window.location.search.includes('workspace=1');
  if (isWorkspacePage && localStorage.getItem('spendly_drive_connected') !== 'true') {
    window.location.href = 'login.html';
    return;
  }

  initEntryFlow();
  initTheme();
  setupSegmentGliders();
  populateDropdowns();
  renderAccounts();
  populateDateInput();
  renderDashboard();
  initTouchGestures();
  initFileDropzone();
  window.addEventListener('resize', setupSegmentGliders);
  window.addEventListener('online', () => {
    if (localStorage.getItem('spendly_drive_connected') === 'true') {
      showToast('Connection restored. Syncing...', 'info');
      syncDriveBackup(true);
    }
  });
  initInteractionPolish();

  // Try to restore/sync Drive backup if already connected
  if (localStorage.getItem('spendly_drive_connected') === 'true') {
    let retries = 0;
    const checkGsi = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(checkGsi);
        signInWithGoogle();
      } else {
        retries++;
        if (retries >= 30) {
          clearInterval(checkGsi);
          console.warn('Google Identity Services script failed to load in time.');
          setDriveStatus('Connection timed out (verify network)', false);
        }
      }
    }, 500);
  }
});

function initEntryFlow() {
  const welcome = document.getElementById('view-landing');
  const auth = document.getElementById('view-auth');
  const workspaceParts = document.querySelectorAll('.app-header, #main-viewport, .bottom-nav');
  if (!welcome) return;
  const isWorkspacePage = window.location.pathname.endsWith('/workspace.html') || window.location.search.includes('workspace=1');
  const isSignInPage = window.location.hash === '#signin';
  const hasEntered = !isSignInPage && (isWorkspacePage || localStorage.getItem('spendly_workspace_entered') === 'true' || localStorage.getItem('spendly_drive_connected') === 'true');
  welcome.hidden = hasEntered || isSignInPage;
  if (auth) auth.hidden = !isSignInPage;
  workspaceParts.forEach(part => { part.hidden = !hasEntered; });
}

function showAuthPage() {
  document.getElementById('view-landing')?.setAttribute('hidden', '');
  const auth = document.getElementById('view-auth');
  if (auth) auth.hidden = false;
}

function showLandingPage() {
  document.getElementById('view-auth')?.setAttribute('hidden', '');
  document.getElementById('view-landing')?.removeAttribute('hidden');
}

function getGoogleClientId() {
  return document.querySelector('meta[name="google-client-id"]')?.content.trim() || '';
}

function setDriveStatus(message, connected = false) {
  const statusBadge = document.getElementById('gdrive-status-badge');
  if (statusBadge) {
    statusBadge.textContent = message;
    statusBadge.classList.toggle('connected', connected);
  }
  const authStatus = document.getElementById('welcome-auth-status');
  if (authStatus) authStatus.textContent = message;
  const authPageStatus = document.getElementById('auth-status');
  if (authPageStatus) authPageStatus.textContent = message;

  // Manage visibility of Settings cards sync/restore actions
  const cardSync = document.getElementById('card-gdrive-sync');
  const btnToggle = document.getElementById('btn-gdrive-toggle');
  const profileCard = document.getElementById('gdrive-profile-card');

  if (connected) {
    if (cardSync) cardSync.style.display = 'block';
    if (btnToggle) btnToggle.textContent = 'Disconnect Google Account';
    
    if (profileCard && S.userProfile) {
      const avatar = document.getElementById('gdrive-avatar');
      const username = document.getElementById('gdrive-username');
      const email = document.getElementById('gdrive-email');
      if (avatar) avatar.src = S.userProfile.picture || '';
      if (username) username.textContent = S.userProfile.name || 'User';
      if (email) email.textContent = S.userProfile.email || '';
      profileCard.style.display = 'flex';
    }
  } else {
    if (cardSync) cardSync.style.display = 'none';
    if (btnToggle) btnToggle.textContent = 'Connect Google Drive';
    if (profileCard) profileCard.style.display = 'none';
  }

  // Update dynamic status chip in header/dashboard
  if (message.includes('Backed up') || message.includes('Restored') || message.includes('connected')) {
    updateStatusChip('synced', 'Drive Synced');
  } else if (message.includes('paused') || message.includes('expired')) {
    updateStatusChip('paused', 'Sync paused');
  } else if (message.includes('Checking') || message.includes('Restoring') || message.includes('backing up') || message.includes('Syncing')) {
    updateStatusChip('syncing', 'Syncing...');
  } else {
    updateStatusChip('offline', 'Local-first');
  }
}

function updateStatusChip(state, text) {
  const chip = document.getElementById('global-status-chip');
  if (!chip) return;
  chip.className = `status-chip ${state}`;
  chip.innerHTML = `<span class="status-dot"></span><span>${text}</span>`;
}

function signInWithGoogle() {
  const clientId = getGoogleClientId();
  if (!clientId) {
    setDriveStatus('Google Drive sign-in is not available yet. You can continue locally.');
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    setDriveStatus('Google sign-in is still loading. Try again in a moment.');
    return;
  }
  driveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: async response => {
      if (response.error) {
        setDriveStatus('Google sign-in was not completed.');
        return;
      }
      driveAccessToken = response.access_token;
      localStorage.setItem('spendly_drive_connected', 'true');
      
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${driveAccessToken}` }
        });
        if (res.ok) {
          const profile = await res.json();
          S.userProfile = {
            name: profile.name,
            email: profile.email,
            picture: profile.picture
          };
          localStorage.setItem('spendly_user_profile', JSON.stringify(S.userProfile));
        }
      } catch (err) {
        console.warn('Failed to fetch user profile', err);
      }

      setDriveStatus('Google Drive connected', true);
      enterWorkspace();
      checkAndRestoreDriveBackup();
    }
  });
  driveTokenClient.requestAccessToken({
    prompt: localStorage.getItem('spendly_drive_connected') === 'true' ? '' : 'select_account'
  });
}

function handleGoogleSignIn() {
  if (localStorage.getItem('spendly_drive_connected') === 'true') {
    if (confirm('Disconnect Google Drive? Local data remains, but background backups will pause.')) {
      driveAccessToken = '';
      localStorage.removeItem('spendly_drive_connected');
      localStorage.removeItem('spendly_user_profile');
      S.userProfile = null;
      setDriveStatus('Not connected', false);
      updateStatusChip('offline', 'Local-first');
      window.location.href = 'login.html';
    }
  } else {
    signInWithGoogle();
  }
}

async function syncDriveBackup(isBackground = false) {
  if (!driveAccessToken) {
    if (!isBackground) {
      setDriveStatus('Connect Google Drive before backing up.');
    }
    return;
  }
  const payload = JSON.stringify({ transactions: S.transactions, accounts: S.accounts, budgets: S.budgets, loans: S.loans });
  const headers = { Authorization: `Bearer ${driveAccessToken}`, 'Content-Type': 'application/json' };
  try {
    const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27spendly_db.json%27%20and%20%27appDataFolder%27%20in%20parents&spaces=appDataFolder&fields=files(id)', { headers });
    if (!search.ok) {
      if (search.status === 401) {
        setDriveStatus('Sync paused (reconnect Drive)', false);
        return;
      }
      throw new Error('Drive lookup failed');
    }
    const matches = await search.json();
    const fileId = matches.files?.[0]?.id;
    const body = new Blob([payload], { type: 'application/json' });
    let response;
    if (fileId) {
      response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers, body });
    } else {
      const metadata = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST', headers, body: JSON.stringify({ name: 'spendly_db.json', parents: ['appDataFolder'], mimeType: 'application/json' })
      });
      if (!metadata.ok) {
        if (metadata.status === 401) {
          setDriveStatus('Sync paused (reconnect Drive)', false);
          return;
        }
        throw new Error('Drive file creation failed');
      }
      const created = await metadata.json();
      response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`, { method: 'PATCH', headers, body });
    }
    if (!response.ok) {
      if (response.status === 401) {
        setDriveStatus('Sync paused (reconnect Drive)', false);
        return;
      }
      throw new Error('Drive backup failed');
    }
    setDriveStatus('Backed up just now', true);
    if (!isBackground) {
      showToast('Workspace backed up to Google Drive', 'ok');
    }
  } catch (error) {
    console.error(error);
    if (!isBackground) {
      setDriveStatus('Drive backup could not be completed.');
      showToast('Drive backup failed', 'err');
    } else {
      setDriveStatus('Sync paused (offline / error)', false);
    }
  }
}

async function checkAndRestoreDriveBackup() {
  if (!driveAccessToken) return;
  setDriveStatus('Checking cloud backup...', true);
  updateStatusChip('syncing', 'Checking...');
  
  const headers = { Authorization: `Bearer ${driveAccessToken}` };
  try {
    const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27spendly_db.json%27%20and%20%27appDataFolder%27%20in%20parents&spaces=appDataFolder&fields=files(id)', { headers });
    if (!search.ok) throw new Error('Drive search failed');
    const matches = await search.json();
    const fileId = matches.files?.[0]?.id;
    if (!fileId) {
      // No existing backup, perform initial upload
      setDriveStatus('Google Drive connected', true);
      updateStatusChip('synced', 'Drive Synced');
      syncDriveBackup(true);
      return;
    }
    
    // Download backup
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
    if (!response.ok) throw new Error('Download failed');
    const rawText = await response.text();
    let backupData;
    try {
      backupData = JSON.parse(rawText);
    } catch (e) {
      console.warn('Corrupt backup file on Drive', e);
      setDriveStatus('Connected (corrupt cloud file)', true);
      updateStatusChip('paused', 'Corrupt backup');
      return;
    }
    if (!backupData || !Array.isArray(backupData.transactions)) {
      setDriveStatus('Connected (invalid cloud format)', true);
      updateStatusChip('paused', 'Invalid format');
      return;
    }

    const localEmpty = S.transactions.length === 0 && S.loans.length === 0 && Object.keys(S.budgets).length === 0;
    let shouldRestore = false;
    
    if (localEmpty) {
      shouldRestore = true;
    } else {
      shouldRestore = confirm('Found existing cloud backup on Google Drive. Restore cloud version and overwrite local entries, or keep current local entries?');
    }

    if (shouldRestore) {
      S.transactions = backupData.transactions || [];
      S.accounts = backupData.accounts || ['Savings', 'Credit Card', 'Cash'];
      S.budgets = backupData.budgets || {};
      S.loans = backupData.loans || [];
      saveLocalCache();
      populateDropdowns();
      renderAccounts();
      renderDashboard();
      setDriveStatus('Restored cloud backup', true);
      updateStatusChip('synced', 'Drive Synced');
      showToast('Backup restored successfully', 'ok');
    } else {
      // Keep current local entries and sync them to Drive
      setDriveStatus('Google Drive connected', true);
      updateStatusChip('synced', 'Drive Synced');
      syncDriveBackup(true);
    }
  } catch (error) {
    console.error(error);
    setDriveStatus('Failed to check backup.');
    updateStatusChip('paused', 'Sync paused');
  }
}

async function restoreDriveBackup() {
  if (!driveAccessToken) {
    setDriveStatus('Connect Google Drive before restoring.');
    showToast('Connect Google Drive first', 'err');
    return;
  }
  if (!confirm('This will replace your local workspace with the backup in Google Drive. Proceed?')) {
    return;
  }
  setDriveStatus('Restoring from Google Drive...');
  const headers = { Authorization: `Bearer ${driveAccessToken}` };
  try {
    const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27spendly_db.json%27%20and%20%27appDataFolder%27%20in%20parents&spaces=appDataFolder&fields=files(id)', { headers });
    if (!search.ok) throw new Error('Drive search failed');
    const matches = await search.json();
    const fileId = matches.files?.[0]?.id;
    if (!fileId) {
      setDriveStatus('No backup file found in Google Drive.', true);
      showToast('No backup found', 'err');
      return;
    }
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
    if (!response.ok) throw new Error('Download failed');
    
    const rawText = await response.text();
    let backupData;
    try {
      backupData = JSON.parse(rawText);
    } catch (e) {
      setDriveStatus('Corrupt backup file on Drive.', true);
      showToast('Corrupt backup file on Drive', 'err');
      return;
    }
    if (!backupData || !Array.isArray(backupData.transactions)) {
      setDriveStatus('Invalid backup format on Drive.', true);
      showToast('Invalid backup format', 'err');
      return;
    }

    // Restore S state
    S.transactions = backupData.transactions || [];
    S.accounts = backupData.accounts || ['Savings', 'Credit Card', 'Cash'];
    S.budgets = backupData.budgets || {};
    S.loans = backupData.loans || [];

    saveLocalCache();
    populateDropdowns();
    renderAccounts();
    renderDashboard();
    setDriveStatus('Restored just now', true);
    showToast('Backup restored successfully', 'ok');
  } catch (error) {
    console.error(error);
    setDriveStatus('Drive restore could not be completed.');
    showToast('Drive restore failed', 'err');
  }
}

function enterWorkspace() {
  localStorage.setItem('spendly_workspace_entered', 'true');
  if (!window.location.pathname.endsWith('/workspace.html')) {
    window.location.href = 'workspace.html';
    return;
  }
  document.getElementById('view-landing')?.setAttribute('hidden', '');
  document.getElementById('view-auth')?.setAttribute('hidden', '');
  document.querySelectorAll('.app-header, #main-viewport, .bottom-nav').forEach(part => { part.hidden = false; });
  document.getElementById('dash-account-filter')?.focus();
}

function showWelcomeDetails() {
  const details = document.getElementById('welcome-details');
  if (!details) return;
  details.hidden = !details.hidden;
}

/* --------------------------------------------------------------------------
   UI Navigation & Sliding Segment Controls
   -------------------------------------------------------------------------- */
function switchView(viewId) {
  S.activeView = viewId;
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('active');

  const navIdx = ['dashboard', 'itr', 'loans', 'profile'].indexOf(viewId);
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems[navIdx]) navItems[navIdx].classList.add('active');

  if (viewId === 'dashboard') renderDashboard();
  if (viewId === 'itr') calculateTaxCenter();
  if (viewId === 'loans') renderLoans();
  if (viewId === 'profile') renderAccounts();
  requestAnimationFrame(() => {
    setupSegmentGliders();
  });
}

function updateSegmentGlider(container, activeBtn) {
  const glider = container.querySelector('.segment-glider');
  if (!glider || !activeBtn) return;
  glider.style.width = `${activeBtn.offsetWidth}px`;
  glider.style.transform = `translateX(${activeBtn.offsetLeft - 4}px)`;
}

function setupSegmentGliders() {
  document.querySelectorAll('.segmented-control').forEach(ctrl => {
    const active = ctrl.querySelector('.segment-btn.active');
    if (active) updateSegmentGlider(ctrl, active);
  });
}

function setTxnType(type) {
  S.currentType = type;
  const ctrl = document.getElementById('txn-type-glider-bar');
  ctrl.querySelectorAll('.segment-btn').forEach(btn => {
    const isActive = btn.dataset.type === type;
    btn.classList.toggle('active', isActive);
    if (isActive) updateSegmentGlider(ctrl, btn);
  });

  const isTransfer = type === 'transfer';
  document.getElementById('wrap-single-account').style.display = isTransfer ? 'none' : 'block';
  document.getElementById('wrap-transfer-accounts').style.display = isTransfer ? 'grid' : 'none';
  document.getElementById('wrap-category').style.display = isTransfer ? 'none' : 'block';
  document.getElementById('wrap-tax-section').style.display = (type === 'expense' || type === 'investment') ? 'block' : 'none';

  populateCategoryDropdown(type);
}

function setTaxRegime(regime) {
  S.currentRegime = regime;
  const ctrl = document.getElementById('tax-regime-switcher');
  ctrl.querySelectorAll('.segment-btn').forEach(btn => {
    const isActive = btn.dataset.regime === regime;
    btn.classList.toggle('active', isActive);
    if (isActive) updateSegmentGlider(ctrl, btn);
  });
  calculateTaxCenter();
}

function populateDropdowns() {
  const accSel = document.getElementById('txn-account');
  const fromSel = document.getElementById('txn-from-account');
  const toSel = document.getElementById('txn-to-account');
  const dashFilter = document.getElementById('dash-account-filter');

  const accOptions = S.accounts.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
  if (accSel) accSel.innerHTML = accOptions;
  if (fromSel) fromSel.innerHTML = accOptions;
  if (toSel) toSel.innerHTML = accOptions;
  if (dashFilter) dashFilter.innerHTML = `<option value="ALL">All Accounts</option>` + accOptions;

  populateCategoryDropdown(S.currentType);
}

function renderAccounts() {
  const container = document.getElementById('accounts-management-list');
  if (!container) return;
  container.innerHTML = S.accounts.map(account => `
    <div class="account-row">
      <strong>${escapeHtml(account)}</strong>
      <button class="account-delete" type="button" aria-label="Remove ${escapeHtml(account)}" onclick="removeAccount('${encodeURIComponent(account)}')">Remove</button>
    </div>
  `).join('');
}

function addNewAccount() {
  const input = document.getElementById('new-account-name');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  if (S.accounts.some(account => account.toLowerCase() === name.toLowerCase())) {
    showToast('That account already exists', 'err');
    return;
  }
  S.accounts.push(name);
  saveLocalCache();
  populateDropdowns();
  renderAccounts();
  input.value = '';
  showToast('Account added', 'ok');
}

function removeAccount(encodedName) {
  const name = decodeURIComponent(encodedName);
  if (S.accounts.length <= 1) {
    showToast('Keep at least one account', 'err');
    return;
  }
  if (!confirm(`Remove ${name} from your account list? Existing transactions stay unchanged.`)) return;
  S.accounts = S.accounts.filter(account => account !== name);
  saveLocalCache();
  populateDropdowns();
  renderAccounts();
  showToast('Account removed', 'ok');
}

function populateCategoryDropdown(type) {
  const catSel = document.getElementById('txn-category');
  if (!catSel) return;
  const list = S.categories[type] || S.categories.expense;
  catSel.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
}

function populateDateInput() {
  const dateInput = document.getElementById('txn-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
}

/* --------------------------------------------------------------------------
   Dashboard & Ledger Computations
   -------------------------------------------------------------------------- */
function renderDashboard() {
  const filterAccount = document.getElementById('dash-account-filter')?.value || 'ALL';
  let totalBalPaise = 0;
  let incPaise = 0;
  let expPaise = 0;

  // Compute Balances
  S.transactions.forEach(t => {
    const amtPaise = toPaise(t.amount);
    if (t.type === 'income') {
      if (filterAccount === 'ALL' || t.account === filterAccount) {
        totalBalPaise += amtPaise;
        incPaise += amtPaise;
      }
    } else if (t.type === 'expense' || t.type === 'investment') {
      if (filterAccount === 'ALL' || t.account === filterAccount) {
        totalBalPaise -= amtPaise;
        expPaise += amtPaise;
      }
    } else if (t.type === 'transfer') {
      if (filterAccount !== 'ALL') {
        if (t.fromAccount === filterAccount) totalBalPaise -= amtPaise;
        if (t.toAccount === filterAccount) totalBalPaise += amtPaise;
      }
    }
  });

  const availBalEl = document.getElementById('hero-avail-bal');
  const incValEl = document.getElementById('hero-inc-val');
  const expValEl = document.getElementById('hero-exp-val');
  if (availBalEl) availBalEl.textContent = fmtINR.format(fromPaise(totalBalPaise));
  if (incValEl) incValEl.textContent = `+${fmtINR.format(fromPaise(incPaise))}`;
  if (expValEl) expValEl.textContent = `-${fmtINR.format(fromPaise(expPaise))}`;

  renderLedgerList(filterAccount);
  renderBudgetGauges();
  renderAccountBalances();
}

function renderAccountBalances() {
  const container = document.getElementById('dashboard-balances-list');
  if (!container) return;

  const balances = {};
  S.accounts.forEach(acc => {
    balances[acc] = 0;
  });

  S.transactions.forEach(t => {
    const amtPaise = toPaise(t.amount);
    if (t.type === 'income') {
      if (balances[t.account] !== undefined) balances[t.account] += amtPaise;
    } else if (t.type === 'expense' || t.type === 'investment') {
      if (balances[t.account] !== undefined) balances[t.account] -= amtPaise;
    } else if (t.type === 'transfer') {
      if (balances[t.fromAccount] !== undefined) balances[t.fromAccount] -= amtPaise;
      if (balances[t.toAccount] !== undefined) balances[t.toAccount] += amtPaise;
    }
  });

  container.innerHTML = S.accounts.map(acc => {
    const balPaise = balances[acc] || 0;
    const balance = fromPaise(balPaise);
    const formatted = fmtINR.format(balance);
    const balanceClass = balance < 0 ? 'text-expense' : 'text-income';

    return `
      <div class="account-balance-row">
        <span class="account-balance-name">${escapeHtml(acc)}</span>
        <span class="account-balance-value ${balanceClass}">${formatted}</span>
      </div>
    `;
  }).join('');
}

function renderLedgerList(filterAccount) {
  const container = document.getElementById('dashboard-txns-list');
  if (!container) return;

  const filtered = S.transactions.filter(t => {
    if (!isCurrentMonth(t.date)) return false;
    if (filterAccount === 'ALL') return true;
    return t.account === filterAccount || t.fromAccount === filterAccount || t.toAccount === filterAccount;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">No transactions recorded this month.</div>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 50).map(t => {
    const isExp = t.type === 'expense';
    const isInc = t.type === 'income';
    const isTrf = t.type === 'transfer';
    const isInvest = t.type === 'investment';
    const sign = isExp || isInvest ? '-' : isInc ? '+' : '';
    const amtClass = isExp ? 'expense' : isInc ? 'income' : isInvest ? 'investment' : 'transfer';

    return `
      <div class="txn-row-wrapper" data-id="${t.id}">
        <div class="txn-actions-drawer" role="button" tabindex="0" onclick="deleteTransaction('${encodeURIComponent(t.id)}')" onkeydown="if(event.key==='Enter'||event.key===' ')deleteTransaction('${encodeURIComponent(t.id)}')">Delete</div>
        <div class="txn-row">
          <div class="txn-icon ${t.type}">${isExp ? '↓' : isInc ? '↑' : isTrf ? '⇄' : '★'}</div>
          <div class="txn-details">
            <div class="txn-title">${escapeHtml(t.description || t.category)}</div>
            <div class="txn-sub">${t.date} • ${escapeHtml(isTrf ? `${t.fromAccount} → ${t.toAccount}` : t.account || 'Default')}</div>
          </div>
          <div class="txn-amt ${amtClass}">${sign}${fmtINR.format(t.amount)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBudgetGauges() {
  const container = document.getElementById('budget-gauges-list');
  if (!container) return;

  const categories = Object.keys(S.budgets);
  if (!categories.length) {
    container.innerHTML = `<div class="empty-state">No category limits configured.</div>`;
    return;
  }

  const spendByCat = {};
  S.transactions.forEach(t => {
    if (t.type === 'expense' && t.category && isCurrentMonth(t.date)) {
      spendByCat[t.category] = (spendByCat[t.category] || 0) + toPaise(t.amount);
    }
  });

  container.innerHTML = categories.map(cat => {
    const limitPaise = toPaise(S.budgets[cat]);
    const spentPaise = spendByCat[cat] || 0;
    const pct = Math.min(100, Math.round((spentPaise / limitPaise) * 100));
    const statusClass = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'safe';

    return `
      <div class="budget-gauge-item">
        <div class="budget-gauge-header">
          <span>${escapeHtml(cat)}</span>
          <span>${fmtINR.format(fromPaise(spentPaise))} / ${fmtINR.format(fromPaise(limitPaise))} (${pct}%)</span>
        </div>
        <div class="budget-track">
          <div class="budget-fill ${statusClass}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

/* --------------------------------------------------------------------------
   Direction-Locked Mobile Gestures
   -------------------------------------------------------------------------- */
let touchStartX = 0, touchStartY = 0, activeSwipeEl = null, axisLock = null;

function initTouchGestures() {
  document.addEventListener('touchstart', e => {
    const row = e.target.closest('.txn-row');
    if (!row) {
      if (activeSwipeEl) { activeSwipeEl.style.transform = 'translateX(0)'; activeSwipeEl = null; }
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    axisLock = null;
    row.style.transition = 'none';
    if (activeSwipeEl && activeSwipeEl !== row) {
      activeSwipeEl.style.transform = 'translateX(0)';
    }
    activeSwipeEl = row;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!activeSwipeEl) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    if (!axisLock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      axisLock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    if (axisLock === 'y') return; // Allow natural vertical scroll

    if (dx < 0 && dx > -90) {
      activeSwipeEl.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!activeSwipeEl) return;
    activeSwipeEl.style.transition = 'transform 0.2s ease-out';
    const currentTranslate = parseInt(activeSwipeEl.style.transform.replace(/[^0-9-]/g, '') || '0');
    if (currentTranslate < -45) {
      activeSwipeEl.style.transform = 'translateX(-80px)';
    } else {
      activeSwipeEl.style.transform = 'translateX(0)';
      activeSwipeEl = null;
    }
  });
}

/* --------------------------------------------------------------------------
   Statutory Indian Income Tax Calculator Engine
   -------------------------------------------------------------------------- */
function calculateTax(taxableIncome, regime, fyYear) {
  let tax = 0;
  const rem = Math.max(0, taxableIncome);

  if (regime === 'new') {
    if (fyYear >= 2026) {
      // Budget 2025 Slabs (FY 2025-26 & FY 2026-27)
      if (rem <= 1200000) return 0; // Section 87A Full Rebate up to Rs 12 Lakh
      
      let temp = rem;
      if (temp > 2400000) { tax += (temp - 2400000) * 0.30; temp = 2400000; }
      if (temp > 2000000) { tax += (temp - 2000000) * 0.25; temp = 2000000; }
      if (temp > 1600000) { tax += (temp - 1600000) * 0.20; temp = 1600000; }
      if (temp > 1200000) { tax += (temp - 1200000) * 0.15; temp = 1200000; }
      if (temp > 800000)  { tax += (temp - 800000) * 0.10;  temp = 800000; }
      if (temp > 400000)  { tax += (temp - 400000) * 0.05; }

      // Section 87A Marginal Relief check for income slightly above 12L
      const excessIncome = rem - 1200000;
      if (tax > excessIncome) tax = excessIncome;

    } else {
      // Legacy New Regime (FY 2024-25)
      if (rem <= 700000) return 0; // Section 87A Full Rebate up to Rs 7 Lakh

      let temp = rem;
      if (temp > 1500000) { tax += (temp - 1500000) * 0.30; temp = 1500000; }
      if (temp > 1200000) { tax += (temp - 1200000) * 0.20; temp = 1200000; }
      if (temp > 900000)  { tax += (temp - 900000) * 0.15;  temp = 900000; }
      if (temp > 600000)  { tax += (temp - 600000) * 0.10;  temp = 600000; }
      if (temp > 300000)  { tax += (temp - 300000) * 0.05; }
    }
  } else {
    // Statutory Old Tax Regime
    if (rem <= 500000) return 0; // Section 87A applies strictly <= 5L (Max Rs 12,500)

    let temp = rem;
    if (temp > 1000000) { tax += (temp - 1000000) * 0.30; temp = 1000000; }
    if (temp > 500000)  { tax += (temp - 500000) * 0.20;  temp = 500000; }
    if (temp > 250000)  { tax += (temp - 250000) * 0.05; }
  }

  // 4% Health and Education Cess
  return Math.round(tax + (tax * 0.04));
}

function calculateTaxCenter() {
  const fyYear = parseInt(document.getElementById('itr-fy-select')?.value || '2026');
  const seniorParent = document.getElementById('itr-senior-parent')?.checked || false;
  const fyTransactions = S.transactions.filter(t => isInFinancialYear(t.date, fyYear));

  let grossIncome = 0;
  const deds = { c80: 0, d80: 0, e80: 0, g80: 0, tta80: 0, ccd80: 0, sec24b: 0, hra: 0 };

  fyTransactions.forEach(t => {
    if (t.type === 'income') grossIncome += parseFloat(t.amount || 0);
    const sec = t.taxSection;
    const amt = parseFloat(t.amount || 0);
    if (sec === '80C') deds.c80 += amt;
    if (sec === '80D') deds.d80 += amt;
    if (sec === '80E') deds.e80 += amt;
    if (sec === '80G') deds.g80 += amt;
    if (sec === '80TTA') deds.tta80 += amt;
    if (sec === '80CCD') deds.ccd80 += amt;
    if (sec === '24b') deds.sec24b += amt;
    if (sec === 'HRA') deds.hra += amt;
  });

  // Statutory Deduction Caps
  const capped80C = Math.min(150000, deds.c80);
  const cap80D = seniorParent ? 50000 : 25000;
  const capped80D = Math.min(cap80D, deds.d80);
  const capped80TTA = Math.min(10000, deds.tta80);
  const capped80CCD = Math.min(50000, deds.ccd80);
  const capped24b = Math.min(200000, deds.sec24b);

  let totalDeductions = 0;
  let taxableNet = 0;

  if (S.currentRegime === 'new') {
    const stdDed = 75000; // Standard deduction
    totalDeductions = stdDed;
    taxableNet = Math.max(0, grossIncome - totalDeductions);
  } else {
    const stdDed = 50000;
    totalDeductions = stdDed + capped80C + capped80D + deds.e80 + deds.g80 + capped80TTA + capped80CCD + capped24b + deds.hra;
    taxableNet = Math.max(0, grossIncome - totalDeductions);
  }

  const netTax = calculateTax(taxableNet, S.currentRegime, fyYear);

  const grossIncomeEl = document.getElementById('tax-gross-income');
  const totalDeductionsEl = document.getElementById('tax-total-deductions');
  const netLiabilityEl = document.getElementById('tax-net-liability');
  if (grossIncomeEl) grossIncomeEl.textContent = fmtINR.format(grossIncome);
  if (totalDeductionsEl) totalDeductionsEl.textContent = fmtINR.format(totalDeductions);
  if (netLiabilityEl) netLiabilityEl.textContent = fmtINR.format(netTax);

  renderDeductionsBreakdown(deds, capped80C, capped80D, cap80D);
}

function isInFinancialYear(dateValue, fyYear) {
  if (!dateValue) return false;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date(fyYear - 1, 3, 1) && date <= new Date(fyYear, 2, 31, 23, 59, 59, 999);
}

function renderDeductionsBreakdown(deds, c80, d80, cap80D) {
  const container = document.getElementById('itr-deductions-breakdown');
  if (!container) return;

  if (S.currentRegime === 'new') {
    container.innerHTML = `
      <div class="empty-state">
        Standard Deduction of ₹75,000 is automatically applied in the New Regime.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="budget-gauge-item">
      <div class="budget-gauge-header">
        <span>Section 80C (PPF, ELSS, EPF)</span>
        <span>${fmtINR.format(c80)} / ₹1,50,000</span>
      </div>
      <div class="budget-track"><div class="budget-fill safe" style="width:${Math.min(100, (c80/150000)*100)}%"></div></div>
    </div>
    <div class="budget-gauge-item">
      <div class="budget-gauge-header">
        <span>Section 80D (Health Insurance)</span>
        <span>${fmtINR.format(d80)} / ${fmtINR.format(cap80D)}</span>
      </div>
      <div class="budget-track"><div class="budget-fill safe" style="width:${Math.min(100, (d80/cap80D)*100)}%"></div></div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   Loan Payments (Single Write / No Double Posting)
   -------------------------------------------------------------------------- */
function payLoan(loanId, emiAmt, name, loanType) {
  loanId = decodeURIComponent(loanId);
  name = decodeURIComponent(name);
  loanType = decodeURIComponent(loanType);
  const loan = S.loans.find(item => item.id === loanId);
  if (!loan) return;
  const paidMonths = Number(loan.paidMonths) || 0;
  const totalMonths = Number(loan.totalMonths) || 0;
  if (totalMonths > 0 && paidMonths >= totalMonths) {
    showToast('This loan is already complete', 'err');
    return;
  }
  if (!confirm(`Record payment of ${fmtINR.format(emiAmt)} for ${name}?`)) return;

  const taxSec = (loanType === 'home') ? '24b' : 'None';
  const newTxn = {
    id: 'tx_emi_' + Date.now().toString(36),
    type: 'expense',
    amount: parseFloat(emiAmt),
    account: 'Savings',
    category: 'Loan / EMI',
    taxSection: taxSec,
    description: `EMI: ${name}`,
    date: new Date().toISOString().split('T')[0]
  };

  loan.paidMonths = paidMonths + 1;
  S.transactions.unshift(newTxn);
  saveLocalCache();
  renderDashboard();
  showToast('EMI Payment Logged', 'ok');
}

/* --------------------------------------------------------------------------
   PhonePe CSV Client Parser & Deduplication
   -------------------------------------------------------------------------- */
let pendingPhonePeTxns = [];

function handlePhonePeFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    parseAndDeduplicatePhonePeCSV(e.target.result);
  };
  reader.readAsText(file);
}

function initFileDropzone() {
  const dropzone = document.getElementById('phonepe-dropzone');
  if (!dropzone) return;
  dropzone.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    document.getElementById('phonepe-file-input')?.click();
  });
  ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove('drag-over');
  }));
  dropzone.addEventListener('drop', event => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handlePhonePeFile(file);
  });
}

function parseCSVLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

function normalizeAccountName(rawInstrument) {
  if (!rawInstrument) return 'Savings';

  let clean = rawInstrument.replace(/Debited from|Credited to|Bank Account|UPI|Payment via/gi, '').trim();
  // Extract Bank Name and last 4 digits if available (e.g. "HDFC Bank (4321)")
  const bankMatch = clean.match(/(HDFC|SBI|ICICI|Axis|Kotak|PhonePe Wallet|Paytm|Canara|PNB|Bank of Baroda)/i);
  const digitsMatch = clean.match(/\d{3,4}/);

  if (bankMatch) {
    return digitsMatch ? `${bankMatch[0]} ••${digitsMatch[0]}` : bankMatch[0];
  }
  return clean.replace(/[^a-zA-Z0-9\s•-]/g, '').trim().slice(0, 24) || 'Savings';
}

function parseAndDeduplicatePhonePeCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    showToast('Invalid CSV file', 'err');
    return;
  }

  const existingIds = new Set(S.transactions.map(t => t.id));
  const intraFileSeen = new Set();
  const parsedNew = [];
  let skippedDuplicates = 0;

  // Automatic header row discovery (bypasses preamble metadata rows if present)
  let headerRowIndex = 0;
  for (let idx = 0; idx < Math.min(lines.length, 10); idx++) {
    const rowCells = parseCSVLine(lines[idx]).map(h => h.toLowerCase().replace(/["']/g, '').trim());
    const hasId = rowCells.some(h => h.includes('transaction id') || h.includes('utr') || h.includes('txn id'));
    const hasDate = rowCells.some(h => h.includes('date'));
    const hasAmt = rowCells.some(h => h.includes('amount') || h.includes('value'));
    if ((hasId && hasDate) || (hasDate && hasAmt) || (hasId && hasAmt)) {
      headerRowIndex = idx;
      break;
    }
  }

  const headers = parseCSVLine(lines[headerRowIndex]).map(h => h.toLowerCase().replace(/["']/g, '').trim());
  const idxId = headers.findIndex(h => h.includes('transaction id') || h.includes('utr') || h.includes('txn id'));
  const idxDate = headers.findIndex(h => h.includes('date'));
  const idxDesc = headers.findIndex(h => h.includes('description') || h.includes('merchant') || h.includes('payee'));
  const idxType = headers.findIndex(h => h.includes('type') || h.includes('debit/credit'));
  const idxAmt = headers.findIndex(h => h.includes('amount'));
  const idxInstrument = headers.findIndex(h => h.includes('instrument') || h.includes('bank') || h.includes('account') || h.includes('source') || h.includes('payment') || h.includes('card'));

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    // Robust regex parsing handles escaped commas inside quotes
    const row = parseCSVLine(lines[i]);
    if (row.length < 3) continue;

    const rawId = idxId !== -1 ? row[idxId]?.replace(/["']/g, '').trim() : '';
    const rawDate = idxDate !== -1 ? row[idxDate]?.replace(/["']/g, '').trim() : '';
    const rawDesc = idxDesc !== -1 ? row[idxDesc]?.replace(/["']/g, '').trim() : 'PhonePe Payee';
    const rawAmt = idxAmt !== -1 ? parseFloat(row[idxAmt]?.replace(/,/g, '').replace(/[^0-9.-]+/g, '')) || 0 : 0;
    const rawType = idxType !== -1 ? row[idxType]?.toLowerCase() : 'debit';
    const rawInstrument = idxInstrument !== -1 ? row[idxInstrument]?.replace(/["']/g, '').trim() : '';

    if (!rawAmt) continue;

    // Unique Primary Key (fallback to hash if no UTR)
    const txnId = rawId || ('ph_' + Math.abs(hashString(rawDate + rawDesc + rawAmt)).toString(36));

    if (existingIds.has(txnId) || intraFileSeen.has(txnId)) {
      skippedDuplicates++;
      continue;
    }

    intraFileSeen.add(txnId);
    const isCredit = rawType.includes('credit');
    const autoCat = categorizeMerchant(rawDesc);
    const normAccountName = normalizeAccountName(rawInstrument);

    parsedNew.push({
      id: txnId,
      type: isCredit ? 'income' : 'expense',
      amount: Math.abs(rawAmt),
      account: normAccountName,
      category: autoCat,
      taxSection: 'None',
      description: rawDesc,
      date: normalizeDate(rawDate)
    });
  }

  pendingPhonePeTxns = parsedNew;
  document.getElementById('imp-total-rows').textContent = lines.length - 1;
  document.getElementById('imp-new-rows').textContent = parsedNew.length;
  document.getElementById('imp-dup-rows').textContent = skippedDuplicates;
  document.getElementById('modal-phonepe-summary').classList.add('active');
}

function categorizeMerchant(desc) {
  const d = desc.toLowerCase();
  if (/(swiggy|zomato|starbucks|mcdonald|burger|restaurant|cafe|eat)/.test(d)) return 'Food & Dining';
  if (/(blinkit|zepto|instamart|dmart|grocery|supermarket|bigbasket)/.test(d)) return 'Groceries';
  if (/(uber|ola|rapido|metro|fuel|petrol|indian oil|hpcl|bpcl)/.test(d)) return 'Transport';
  if (/(amazon|flipkart|myntra|ajio|tata cliq|nykaa)/.test(d)) return 'Shopping';
  if (/(bescom|airtel|jio|broadband|water|electricity|cesc|gas)/.test(d)) return 'Bills & Utilities';
  return 'General';
}

function executePhonePeImport() {
  if (!pendingPhonePeTxns.length) {
    closePhonePeModal();
    return;
  }

  // Auto-provision new accounts discovered in statements
  pendingPhonePeTxns.forEach(t => {
    const accName = t.account;
    const match = S.accounts.find(acc => acc.toLowerCase() === accName.toLowerCase());
    if (!match) {
      S.accounts.push(accName);
    }
  });

  S.transactions = [...pendingPhonePeTxns, ...S.transactions];
  saveLocalCache();
  populateDropdowns();
  renderAccounts();
  renderDashboard();

  pendingPhonePeTxns = [];
  closePhonePeModal();
}

function closePhonePeModal() {
  document.getElementById('modal-phonepe-summary').classList.remove('active');
}

/* --------------------------------------------------------------------------
   Forms & Modals
   -------------------------------------------------------------------------- */
function openTxnModal() {
  document.getElementById('modal-txn').classList.add('active');
  setupSegmentGliders();
}

function closeTxnModal() {
  document.getElementById('modal-txn').classList.remove('active');
  document.getElementById('form-txn').reset();
}

function openLoanModal() {
  document.getElementById('form-loan')?.reset();
  document.getElementById('modal-loan').classList.add('active');
}

function closeLoanModal() {
  document.getElementById('modal-loan').classList.remove('active');
  document.getElementById('form-loan').reset();
}

function submitTxnForm(e) {
  e.preventDefault();
  const amt = parseFloat(document.getElementById('txn-amount').value);
  if (!amt) return;

  const isTransfer = S.currentType === 'transfer';
  const newTxn = {
    id: 'tx_' + Date.now().toString(36),
    type: S.currentType,
    amount: amt,
    description: document.getElementById('txn-desc').value,
    date: document.getElementById('txn-date').value,
    taxSection: isTransfer ? 'None' : document.getElementById('txn-tax-sec').value
  };

  if (isTransfer) {
    newTxn.fromAccount = document.getElementById('txn-from-account').value;
    newTxn.toAccount = document.getElementById('txn-to-account').value;
    if (newTxn.fromAccount === newTxn.toAccount) {
      showToast('Source and destination accounts must differ', 'err');
      return;
    }
  } else {
    newTxn.account = document.getElementById('txn-account').value;
    newTxn.category = document.getElementById('txn-category').value;
  }

  S.transactions.unshift(newTxn);
  saveLocalCache();
  renderDashboard();
  closeTxnModal();
  showToast('Entry Recorded', 'ok');
}

function deleteTransaction(id) {
  id = decodeURIComponent(id);
  const transaction = S.transactions.find(item => item.id === id);
  S.transactions = S.transactions.filter(t => t.id !== id);
  saveLocalCache();
  renderDashboard();
  showToast('Transaction removed', 'ok');
}



/* --------------------------------------------------------------------------
   Utilities
   -------------------------------------------------------------------------- */
let driveSyncTimeout = null;
function debouncedDriveSync() {
  if (!driveAccessToken) {
    updateStatusChip('offline', 'Local-first');
    return;
  }
  
  updateStatusChip('syncing', 'Syncing...');
  clearTimeout(driveSyncTimeout);
  
  driveSyncTimeout = setTimeout(async () => {
    try {
      await syncWithGoogleDrive(false); // Silent background sync
      updateStatusChip('synced', 'Drive Synced');
    } catch (err) {
      updateStatusChip('paused', 'Sync paused');
    }
  }, 2000);
}

async function syncWithGoogleDrive(showFeedback = false) {
  await syncDriveBackup(!showFeedback);
}

function saveLocalCache() {
  localStorage.setItem(CACHE_KEY_TXNS, JSON.stringify(S.transactions));
  localStorage.setItem(CACHE_KEY_ACCOUNTS, JSON.stringify(S.accounts));
  localStorage.setItem(CACHE_KEY_BUDGETS, JSON.stringify(S.budgets));
  localStorage.setItem(CACHE_KEY_LOANS, JSON.stringify(S.loans));
  debouncedDriveSync();
}

function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

function initTheme() {
  const isLight = localStorage.getItem('sp_theme') === 'light';
  document.body.classList.toggle('light-mode', isLight);
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const light = document.body.classList.toggle('light-mode');
      localStorage.setItem('sp_theme', light ? 'light' : 'dark');
    });
  });
}

function resetWorkspace() {
  if (!confirm('WARNING: This will permanently wipe all your transactions, budgets, accounts, and loans from this device. Are you sure?')) {
    return;
  }
  localStorage.clear();
  window.location.reload();
}

function initInteractionPolish() {
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) backdrop.classList.remove('active');
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.active').forEach(modal => modal.classList.remove('active'));
    }
  });
  const firstNav = document.querySelector('.bottom-nav .nav-item');
  if (firstNav) firstNav.setAttribute('aria-current', 'page');
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}



function openBudgetModal(category = '') {
  const modal = document.getElementById('modal-budget');
  const categorySelect = document.getElementById('budget-category');
  if (!modal || !categorySelect) return;
  categorySelect.innerHTML = S.categories.expense.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  categorySelect.value = category && S.categories.expense.includes(category) ? category : S.categories.expense[0];
  document.getElementById('budget-limit').value = S.budgets[categorySelect.value] || '';
  modal.classList.add('active');
  document.getElementById('budget-limit').focus();
}

function closeBudgetModal() {
  document.getElementById('modal-budget')?.classList.remove('active');
}

function submitBudgetForm(event) {
  event.preventDefault();
  const category = document.getElementById('budget-category').value;
  const limit = Number(document.getElementById('budget-limit').value);
  if (!Number.isFinite(limit) || limit <= 0) {
    showToast('Enter a limit greater than zero', 'err');
    document.getElementById('budget-limit').focus();
    return;
  }
  S.budgets[category] = limit;
  saveLocalCache();
  renderDashboard();
  closeBudgetModal();
  showToast('Budget limit saved', 'ok');
}

function submitLoanForm(e) {
  e.preventDefault();
  const name = document.getElementById('loan-name').value;
  const total = parseFloat(document.getElementById('loan-total').value);
  const emi = parseFloat(document.getElementById('loan-emi').value);
  const tenure = parseInt(document.getElementById('loan-tenure').value);
  const type = document.getElementById('loan-type-select').value;

  const newLoan = {
    id: 'loan_' + Date.now().toString(36),
    name: name,
    principal: total,
    emi: emi,
    totalMonths: tenure,
    paidMonths: 0,
    loanType: type
  };

  S.loans.push(newLoan);
  saveLocalCache();
  renderLoans();
  closeLoanModal();
  showToast('Loan Tracked', 'ok');
}

function renderLoans() {
  const container = document.getElementById('loans-cards-list');
  if (!container) return;
  if (!S.loans.length) {
    container.innerHTML = `<div class="empty-state">No active loans being tracked.</div>`;
    return;
  }
  container.innerHTML = S.loans.map(l => {
    const paid = Number(l.paidMonths) || 0;
    const total = Number(l.totalMonths) || 0;
    const complete = total > 0 && paid >= total;
    const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    return `
      <div class="content-card" style="margin-bottom: 12px; background: var(--surface-subtle);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>${escapeHtml(l.name)}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(l.loanType)} • ${fmtINR.format(l.emi)}/mo • ${complete ? 'Paid off' : `${Math.max(0, total - paid)} payments left`}</div>
          </div>
          <button class="btn-primary mini" ${complete ? 'disabled' : ''} onclick="payLoan('${encodeURIComponent(l.id)}', ${Number(l.emi) || 0}, '${encodeURIComponent(l.name)}', '${encodeURIComponent(l.loanType)}')">${complete ? 'Paid off' : 'Pay EMI'}</button>
        </div>
        <div class="budget-track"><div class="budget-fill safe" style="width:${progress}%"></div></div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:5px;">${paid}/${total || '?'} payments recorded</div>
      </div>
    `;
  }).join('');
}

function normalizeDate(dStr) {
  if (!dStr) return new Date().toISOString().split('T')[0];
  try {
    const clean = dStr.trim();
    const match = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
    const d = new Date(clean);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}
