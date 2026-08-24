/**
 * Spendly Pro (v3.0.0) — Core Runtime
 * Zero-Friction, High-Performance Personal Finance & Tax Engine
 */

// Global Exception & Unhandled Rejection Listeners
window.addEventListener('error', (e) => {
  console.error('[Spendly:GlobalError] Uncaught window error:', e.message, 'at', `${e.filename}:${e.lineno}:${e.colno}`, e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Spendly:GlobalError] Unhandled Promise Rejection:', e.reason);
});

const APP_VERSION = '3.0.0';
const CACHE_KEY_TXNS = 'sp_txns_cache';
const CACHE_KEY_ACCOUNTS = 'sp_accounts_cache';
const CACHE_KEY_BUDGETS = 'sp_budgets_cache';
const CACHE_KEY_LOANS = 'sp_loans_cache';

function readCache(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (!value) {
      console.debug(`[Spendly:Cache] No cached data for "${key}", using default.`);
      return fallback;
    }
    const parsed = JSON.parse(value);
    console.debug(`[Spendly:Cache] Loaded "${key}":`, Array.isArray(parsed) ? `${parsed.length} items` : typeof parsed === 'object' && parsed !== null ? `${Object.keys(parsed).length} entries` : parsed);
    return parsed;
  } catch (error) {
    console.warn(`[Spendly:Cache] Could not parse "${key}"; using fallback local cache.`, error);
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

console.info(`[Spendly:Init] State loaded with ${S.transactions.length} txns, ${S.accounts.length} accounts, ${Object.keys(S.budgets).length} budgets, ${S.loans.length} loans.`);

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
  console.info(`[Spendly:Init] DOMContentLoaded triggered on path: "${window.location.pathname}" (search: "${window.location.search}")`);
  const isWorkspacePage = window.location.pathname.endsWith('/workspace.html') || window.location.search.includes('workspace=1');
  const isConnected = localStorage.getItem('spendly_drive_connected') === 'true';

  if (isWorkspacePage && !isConnected) {
    console.warn('[Spendly:Init] Unauthenticated attempt to access workspace.html. Redirecting to login.html.');
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
    console.info('[Spendly:Network] Device is back ONLINE. Checking Drive sync...');
    if (localStorage.getItem('spendly_drive_connected') === 'true') {
      showToast('Connection restored. Syncing...', 'info');
      syncDriveBackup(true);
    }
  });
  window.addEventListener('offline', () => {
    console.warn('[Spendly:Network] Device is now OFFLINE. Operating in local-first mode.');
    updateStatusChip('offline', 'Local-first');
  });
  initInteractionPolish();

  // Restore active user session on startup without triggering popup blocker
  if (isConnected) {
    console.info('[Spendly:Auth] Active user session verified:', S.userProfile?.email || 'Local User');
    setDriveStatus('Google Drive connected', true);
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
  console.debug('[Spendly:Init] Entry flow status:', { isWorkspacePage, isSignInPage, hasEntered });
  welcome.hidden = hasEntered || isSignInPage;
  if (auth) auth.hidden = !isSignInPage;
  workspaceParts.forEach(part => { part.hidden = !hasEntered; });
}

function showAuthPage() {
  console.debug('[Spendly:Navigation] Switching to Auth Page.');
  document.getElementById('view-landing')?.setAttribute('hidden', '');
  const auth = document.getElementById('view-auth');
  if (auth) auth.hidden = false;
}

function showLandingPage() {
  console.debug('[Spendly:Navigation] Switching to Landing Page.');
  document.getElementById('view-auth')?.setAttribute('hidden', '');
  document.getElementById('view-landing')?.removeAttribute('hidden');
}

function getGoogleClientId() {
  const clientId = document.querySelector('meta[name="google-client-id"]')?.content.trim() || '';
  if (!clientId) {
    console.warn('[Spendly:Auth] <meta name="google-client-id"> is missing or has empty content.');
  } else {
    console.debug('[Spendly:Auth] Resolved Google Client ID:', clientId.substring(0, 15) + '...');
  }
  return clientId;
}

function setDriveStatus(message, connected = false) {
  console.info(`[Spendly:Drive] Status change: "${message}" (connected: ${connected})`);
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
    if (btnToggle) btnToggle.textContent = 'Sync / Reconnect Drive';
    
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
  } else if (message.includes('paused') || message.includes('expired') || message.includes('offline')) {
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
  console.debug(`[Spendly:UI] Status chip updated -> state: "${state}", label: "${text}"`);
}

function signInWithGoogle(actionAfterAuth = null) {
  console.info('[Spendly:Auth] signInWithGoogle() called on user gesture.');
  const clientId = getGoogleClientId();
  if (!clientId) {
    console.error('[Spendly:Auth] Sign-in aborted: Google Client ID is not configured.');
    setDriveStatus('Google Drive sign-in is not available yet. You can continue locally.');
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    console.warn('[Spendly:Auth] Google Identity Services library not yet initialized on window.');
    setDriveStatus('Google sign-in is still loading. Try again in a moment.');
    return;
  }
  try {
    driveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: async response => {
        if (response.error) {
          console.error('[Spendly:Auth] TokenClient authorization error response:', response.error, response);
          setDriveStatus('Google sign-in was not completed.');
          return;
        }
        console.info('[Spendly:Auth] Access token received successfully.');
        driveAccessToken = response.access_token;
        localStorage.setItem('spendly_drive_connected', 'true');
        
        try {
          console.debug('[Spendly:Auth] Fetching Google user profile info...');
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${driveAccessToken}` }
          });
          if (res.ok) {
            const profile = await res.json();
            console.info('[Spendly:Auth] User profile fetched:', profile.email, `(${profile.name})`);
            S.userProfile = {
              name: profile.name,
              email: profile.email,
              picture: profile.picture
            };
            localStorage.setItem('spendly_user_profile', JSON.stringify(S.userProfile));
          } else {
            console.warn('[Spendly:Auth] userinfo request returned non-OK status:', res.status, res.statusText);
          }
        } catch (err) {
          console.warn('[Spendly:Auth] Network failure while fetching user profile:', err);
        }

        setDriveStatus('Google Drive connected', true);
        enterWorkspace();
        if (typeof actionAfterAuth === 'function') {
          actionAfterAuth();
        } else {
          checkAndRestoreDriveBackup();
        }
      }
    });

    const isConnected = localStorage.getItem('spendly_drive_connected') === 'true';
    console.debug(`[Spendly:Auth] Requesting access token (prompt: "${isConnected ? '' : 'select_account'}")...`);
    driveTokenClient.requestAccessToken({
      prompt: isConnected ? '' : 'select_account'
    });
  } catch (err) {
    console.error('[Spendly:Auth] Unexpected exception during TokenClient initialization:', err);
  }
}

function handleGoogleSignIn() {
  if (localStorage.getItem('spendly_drive_connected') === 'true') {
    signInWithGoogle(() => {
      showToast('Drive connection refreshed', 'ok');
      syncDriveBackup(false);
    });
  } else {
    signInWithGoogle();
  }
}

function logoutUser() {
  if (!confirm('Sign out of your Spendly session? Your local financial records will remain safe on this device.')) return;
  console.info('[Spendly:Auth] User signed out.');
  driveAccessToken = '';
  localStorage.removeItem('spendly_drive_connected');
  localStorage.removeItem('spendly_user_profile');
  localStorage.removeItem('spendly_workspace_entered');
  S.userProfile = null;
  setDriveStatus('Not connected', false);
  updateStatusChip('offline', 'Local-first');
  showToast('Signed out successfully', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 250);
}

function exportLocalBackup() {
  console.info('[Spendly:Backup] Exporting local JSON backup file...');
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: S.transactions,
    accounts: S.accounts,
    budgets: S.budgets,
    loans: S.loans
  }, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute('href', dataStr);
  const dateTag = new Date().toISOString().split('T')[0];
  dlAnchor.setAttribute('download', `spendly_backup_${dateTag}.json`);
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
  showToast('Backup JSON exported', 'ok');
}

function importLocalBackup(file) {
  if (!file) return;
  console.info('[Spendly:Backup] Reading local JSON backup file:', file.name);
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.transactions)) {
        console.error('[Spendly:Backup] Invalid JSON backup structure.');
        showToast('Invalid backup JSON file', 'err');
        return;
      }
      if (!confirm(`Import backup containing ${data.transactions.length} transactions? This will overwrite your current workspace.`)) {
        return;
      }
      S.transactions = data.transactions || [];
      S.accounts = data.accounts || ['Savings', 'Credit Card', 'Cash'];
      S.budgets = data.budgets || {};
      S.loans = data.loans || [];
      saveLocalCache();
      populateDropdowns();
      renderAccounts();
      renderDashboard();
      showToast('Workspace imported successfully', 'ok');
    } catch (err) {
      console.error('[Spendly:Backup] Failed to parse JSON backup:', err);
      showToast('Corrupted JSON file', 'err');
    }
  };
  reader.readAsText(file);
}

async function syncDriveBackup(isBackground = false) {
  console.info(`[Spendly:Drive] Initiating backup sync (background: ${isBackground}). Transactions: ${S.transactions.length}, Accounts: ${S.accounts.length}`);
  if (!driveAccessToken) {
    console.warn('[Spendly:Drive] syncDriveBackup aborted: No OAuth access token present.');
    if (!isBackground) {
      setDriveStatus('Connect Google Drive before backing up.');
    }
    return;
  }
  const payload = JSON.stringify({ transactions: S.transactions, accounts: S.accounts, budgets: S.budgets, loans: S.loans });
  const headers = { Authorization: `Bearer ${driveAccessToken}`, 'Content-Type': 'application/json' };
  try {
    console.debug('[Spendly:Drive] Querying Drive API for existing spendly_db.json in appDataFolder...');
    const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27spendly_db.json%27%20and%20%27appDataFolder%27%20in%20parents&spaces=appDataFolder&fields=files(id)', { headers });
    if (!search.ok) {
      console.error('[Spendly:Drive] Drive file search HTTP error:', search.status, search.statusText);
      if (search.status === 401) {
        setDriveStatus('Sync paused (reconnect Drive)', false);
        return;
      }
      throw new Error(`Drive lookup failed with status ${search.status}`);
    }
    const matches = await search.json();
    const fileId = matches.files?.[0]?.id;
    const body = new Blob([payload], { type: 'application/json' });
    let response;
    if (fileId) {
      console.info(`[Spendly:Drive] Found existing backup file ID: "${fileId}". Uploading payload (${payload.length} bytes)...`);
      response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers, body });
    } else {
      console.info('[Spendly:Drive] No existing backup file found. Creating metadata entry in appDataFolder...');
      const metadata = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST', headers, body: JSON.stringify({ name: 'spendly_db.json', parents: ['appDataFolder'], mimeType: 'application/json' })
      });
      if (!metadata.ok) {
        console.error('[Spendly:Drive] Drive file metadata creation HTTP error:', metadata.status, metadata.statusText);
        if (metadata.status === 401) {
          setDriveStatus('Sync paused (reconnect Drive)', false);
          return;
        }
        throw new Error(`Drive file creation failed with status ${metadata.status}`);
      }
      const created = await metadata.json();
      console.info(`[Spendly:Drive] Created new backup file ID: "${created.id}". Uploading media payload...`);
      response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`, { method: 'PATCH', headers, body });
    }
    if (!response.ok) {
      console.error('[Spendly:Drive] Media upload HTTP error:', response.status, response.statusText);
      if (response.status === 401) {
        setDriveStatus('Sync paused (reconnect Drive)', false);
        return;
      }
      throw new Error(`Drive backup upload failed with status ${response.status}`);
    }
    console.info('[Spendly:Drive] Cloud backup successfully written to Google Drive.');
    setDriveStatus('Backed up just now', true);
    if (!isBackground) {
      showToast('Workspace backed up to Google Drive', 'ok');
    }
  } catch (error) {
    console.error('[Spendly:Drive] Exception encountered during syncDriveBackup:', error);
    if (!isBackground) {
      setDriveStatus('Drive backup could not be completed.');
      showToast('Drive backup failed', 'err');
    } else {
      setDriveStatus('Sync paused (offline / error)', false);
    }
  }
}

async function checkAndRestoreDriveBackup() {
  if (!driveAccessToken) {
    console.warn('[Spendly:Drive] checkAndRestoreDriveBackup aborted: No access token.');
    return;
  }
  console.info('[Spendly:Drive] Checking cloud backup file status...');
  setDriveStatus('Checking cloud backup...', true);
  updateStatusChip('syncing', 'Checking...');
  
  const headers = { Authorization: `Bearer ${driveAccessToken}` };
  try {
    const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27spendly_db.json%27%20and%20%27appDataFolder%27%20in%20parents&spaces=appDataFolder&fields=files(id)', { headers });
    if (!search.ok) {
      console.error('[Spendly:Drive] Search error during backup check:', search.status);
      throw new Error('Drive search failed');
    }
    const matches = await search.json();
    const fileId = matches.files?.[0]?.id;
    if (!fileId) {
      console.info('[Spendly:Drive] No pre-existing backup file in Drive. Performing initial upload of local state.');
      setDriveStatus('Google Drive connected', true);
      updateStatusChip('synced', 'Drive Synced');
      syncDriveBackup(true);
      return;
    }
    
    console.info(`[Spendly:Drive] Found cloud file "${fileId}". Downloading content...`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
    if (!response.ok) {
      console.error('[Spendly:Drive] Failed to download cloud file media:', response.status);
      throw new Error('Download failed');
    }
    const rawText = await response.text();
    let backupData;
    try {
      backupData = JSON.parse(rawText);
    } catch (e) {
      console.error('[Spendly:Drive] Failed to parse cloud backup JSON:', e);
      setDriveStatus('Connected (corrupt cloud file)', true);
      updateStatusChip('paused', 'Corrupt backup');
      return;
    }
    if (!backupData || !Array.isArray(backupData.transactions)) {
      console.error('[Spendly:Drive] Cloud backup missing required "transactions" array:', backupData);
      setDriveStatus('Connected (invalid cloud format)', true);
      updateStatusChip('paused', 'Invalid format');
      return;
    }

    console.info('[Spendly:Drive] Cloud backup successfully loaded and validated:', {
      txns: backupData.transactions.length,
      accounts: backupData.accounts?.length || 0,
      budgets: Object.keys(backupData.budgets || {}).length,
      loans: backupData.loans?.length || 0
    });

    const localEmpty = S.transactions.length === 0 && S.loans.length === 0 && Object.keys(S.budgets).length === 0;
    let shouldRestore = false;
    
    if (localEmpty) {
      console.info('[Spendly:Drive] Local cache is empty. Automatically restoring cloud backup.');
      shouldRestore = true;
    } else {
      console.info('[Spendly:Drive] Local cache has existing entries. Prompting user for cloud overwrite preference.');
      shouldRestore = confirm('Found existing cloud backup on Google Drive. Restore cloud version and overwrite local entries, or keep current local entries?');
    }

    if (shouldRestore) {
      console.info('[Spendly:Drive] Overwriting local state with cloud backup data.');
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
      console.info('[Spendly:Drive] Keeping local state. Syncing local entries up to cloud.');
      setDriveStatus('Google Drive connected', true);
      updateStatusChip('synced', 'Drive Synced');
      syncDriveBackup(true);
    }
  } catch (error) {
    console.error('[Spendly:Drive] Error during checkAndRestoreDriveBackup:', error);
    setDriveStatus('Failed to check backup.');
    updateStatusChip('paused', 'Sync paused');
  }
}

async function restoreDriveBackup() {
  console.info('[Spendly:Drive] restoreDriveBackup() triggered by user action.');
  if (!confirm('This will replace your local workspace with the backup in Google Drive. Proceed?')) {
    console.debug('[Spendly:Drive] Manual restore cancelled by user prompt.');
    return;
  }
  if (!driveAccessToken) {
    console.info('[Spendly:Drive] Access token not present in memory. Re-authorizing before restore...');
    signInWithGoogle(() => executeDriveRestore());
    return;
  }
  executeDriveRestore();
}

async function executeDriveRestore() {
  setDriveStatus('Restoring from Google Drive...');
  const headers = { Authorization: `Bearer ${driveAccessToken}` };
  try {
    const search = await fetch('https://www.googleapis.com/drive/v3/files?q=name%3D%27spendly_db.json%27%20and%20%27appDataFolder%27%20in%20parents&spaces=appDataFolder&fields=files(id)', { headers });
    if (!search.ok) throw new Error(`Drive search failed with status ${search.status}`);
    const matches = await search.json();
    const fileId = matches.files?.[0]?.id;
    if (!fileId) {
      console.warn('[Spendly:Drive] No backup file found in appDataFolder.');
      setDriveStatus('No backup file found in Google Drive.', true);
      showToast('No backup found', 'err');
      return;
    }
    console.info(`[Spendly:Drive] Downloading file "${fileId}" for manual restoration...`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
    
    const rawText = await response.text();
    let backupData;
    try {
      backupData = JSON.parse(rawText);
    } catch (e) {
      console.error('[Spendly:Drive] Corrupt JSON in cloud backup file:', e);
      setDriveStatus('Corrupt backup file on Drive.', true);
      showToast('Corrupt backup file on Drive', 'err');
      return;
    }
    if (!backupData || !Array.isArray(backupData.transactions)) {
      console.error('[Spendly:Drive] Invalid backup structure:', backupData);
      setDriveStatus('Invalid backup format on Drive.', true);
      showToast('Invalid backup format', 'err');
      return;
    }

    console.info('[Spendly:Drive] Manual restore applying data to S state.');
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
    console.error('[Spendly:Drive] Manual restore failed:', error);
    setDriveStatus('Drive restore could not be completed.');
    showToast('Drive restore failed', 'err');
  }
}

function enterWorkspace() {
  console.info('[Spendly:Navigation] enterWorkspace() called.');
  localStorage.setItem('spendly_workspace_entered', 'true');
  if (!window.location.pathname.endsWith('/workspace.html')) {
    console.debug('[Spendly:Navigation] Redirecting to workspace.html');
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
  console.info(`[Spendly:Navigation] Switching active view to: "${viewId}"`);
  S.activeView = viewId;
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`view-${viewId}`);
  if (target) {
    target.classList.add('active');
  } else {
    console.warn(`[Spendly:Navigation] Target view element "#view-${viewId}" not found in DOM.`);
  }

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
  console.debug(`[Spendly:UI] Selected transaction entry type: "${type}"`);
  S.currentType = type;
  const ctrl = document.getElementById('txn-type-glider-bar');
  if (ctrl) {
    ctrl.querySelectorAll('.segment-btn').forEach(btn => {
      const isActive = btn.dataset.type === type;
      btn.classList.toggle('active', isActive);
      if (isActive) updateSegmentGlider(ctrl, btn);
    });
  }

  const isTransfer = type === 'transfer';
  const singleAccWrap = document.getElementById('wrap-single-account');
  const transferAccWrap = document.getElementById('wrap-transfer-accounts');
  const catWrap = document.getElementById('wrap-category');
  const taxSecWrap = document.getElementById('wrap-tax-section');

  if (singleAccWrap) singleAccWrap.style.display = isTransfer ? 'none' : 'block';
  if (transferAccWrap) transferAccWrap.style.display = isTransfer ? 'grid' : 'none';
  if (catWrap) catWrap.style.display = isTransfer ? 'none' : 'block';
  if (taxSecWrap) taxSecWrap.style.display = (type === 'expense' || type === 'investment') ? 'block' : 'none';

  populateCategoryDropdown(type);
}

function setTaxRegime(regime) {
  console.info(`[Spendly:Tax] Switching tax calculation regime to: "${regime}"`);
  S.currentRegime = regime;
  const ctrl = document.getElementById('tax-regime-switcher');
  if (ctrl) {
    ctrl.querySelectorAll('.segment-btn').forEach(btn => {
      const isActive = btn.dataset.regime === regime;
      btn.classList.toggle('active', isActive);
      if (isActive) updateSegmentGlider(ctrl, btn);
    });
  }
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
  if (!name) {
    console.warn('[Spendly:Accounts] Aborted account addition: Empty name provided.');
    return;
  }
  if (S.accounts.some(account => account.toLowerCase() === name.toLowerCase())) {
    console.warn(`[Spendly:Accounts] Account "${name}" already exists in account list.`);
    showToast('That account already exists', 'err');
    return;
  }
  console.info(`[Spendly:Accounts] Adding new account: "${name}".`);
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
    console.warn('[Spendly:Accounts] Cannot remove the only remaining account.');
    showToast('Keep at least one account', 'err');
    return;
  }
  if (!confirm(`Remove ${name} from your account list? Existing transactions stay unchanged.`)) return;
  console.info(`[Spendly:Accounts] Removing account: "${name}".`);
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

  console.debug(`[Spendly:Dashboard] Calculated balances (filter: "${filterAccount}") -> Total: ${fromPaise(totalBalPaise)}, Income: ${fromPaise(incPaise)}, Expense: ${fromPaise(expPaise)}`);

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

  console.debug('[Spendly:Dashboard] Account balances computed:', balances);

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

  console.debug(`[Spendly:Dashboard] Rendering ledger: ${filtered.length} entries for current month (filter: "${filterAccount}").`);

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

  console.debug(`[Spendly:Dashboard] Rendered budget gauges for ${categories.length} categories.`);

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
  const finalTax = Math.round(tax + (tax * 0.04));
  console.debug(`[Spendly:Tax] calculateTax(taxable: ${taxableIncome}, regime: "${regime}", fy: ${fyYear}) -> Basic Tax: ${tax}, Final (incl cess): ${finalTax}`);
  return finalTax;
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

  console.info(`[Spendly:Tax] Tax Center computed -> FY: ${fyYear}, Regime: "${S.currentRegime}", Gross: ${grossIncome}, Total Deductions: ${totalDeductions}, Taxable Net: ${taxableNet}, Tax: ${netTax}`);

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
  if (!loan) {
    console.error(`[Spendly:Loans] Loan with ID "${loanId}" not found in state.`);
    return;
  }
  const paidMonths = Number(loan.paidMonths) || 0;
  const totalMonths = Number(loan.totalMonths) || 0;
  if (totalMonths > 0 && paidMonths >= totalMonths) {
    console.warn(`[Spendly:Loans] Payment rejected: Loan "${name}" is already fully paid (${paidMonths}/${totalMonths}).`);
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
  console.info(`[Spendly:Loans] Recorded payment for loan "${name}". Paid months updated to ${loan.paidMonths}/${totalMonths}. Created transaction "${newTxn.id}".`);
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
  console.info(`[Spendly:CSV] Processing PhonePe statement file: "${file.name}" (${(file.size / 1024).toFixed(1)} KB, type: "${file.type || 'text/csv'}")`);
  const reader = new FileReader();
  reader.onload = (e) => {
    parseAndDeduplicatePhonePeCSV(e.target.result);
  };
  reader.onerror = (err) => {
    console.error('[Spendly:CSV] FileReader encountered an error while reading statement:', err);
    showToast('Could not read statement file', 'err');
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
  console.info(`[Spendly:CSV] Parsing statement content: ${lines.length} lines detected.`);
  if (lines.length < 2) {
    console.warn('[Spendly:CSV] Statement has insufficient lines (< 2).');
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

  console.debug(`[Spendly:CSV] Discovered header row at line index ${headerRowIndex}.`);

  const headers = parseCSVLine(lines[headerRowIndex]).map(h => h.toLowerCase().replace(/["']/g, '').trim());
  const idxId = headers.findIndex(h => h.includes('transaction id') || h.includes('utr') || h.includes('txn id'));
  const idxDate = headers.findIndex(h => h.includes('date'));
  const idxDesc = headers.findIndex(h => h.includes('description') || h.includes('merchant') || h.includes('payee'));
  const idxType = headers.findIndex(h => h.includes('type') || h.includes('debit/credit'));
  const idxAmt = headers.findIndex(h => h.includes('amount'));
  const idxInstrument = headers.findIndex(h => h.includes('instrument') || h.includes('bank') || h.includes('account') || h.includes('source') || h.includes('payment') || h.includes('card'));

  console.debug('[Spendly:CSV] Mapped header column indices:', { idxId, idxDate, idxDesc, idxType, idxAmt, idxInstrument });

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
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

  console.info(`[Spendly:CSV] Statement parsed: ${parsedNew.length} new transactions ready for import, ${skippedDuplicates} duplicate records skipped.`);

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
    console.warn('[Spendly:CSV] executePhonePeImport called but pendingPhonePeTxns is empty.');
    closePhonePeModal();
    return;
  }

  // Auto-provision new accounts discovered in statements
  const newlyAddedAccounts = [];
  pendingPhonePeTxns.forEach(t => {
    const accName = t.account;
    const match = S.accounts.find(acc => acc.toLowerCase() === accName.toLowerCase());
    if (!match) {
      S.accounts.push(accName);
      newlyAddedAccounts.push(accName);
    }
  });

  if (newlyAddedAccounts.length > 0) {
    console.info('[Spendly:CSV] Auto-provisioned new bank accounts from statement:', newlyAddedAccounts);
  }

  console.info(`[Spendly:CSV] Executing import of ${pendingPhonePeTxns.length} transactions into database.`);
  S.transactions = [...pendingPhonePeTxns, ...S.transactions];
  saveLocalCache();
  populateDropdowns();
  renderAccounts();
  renderDashboard();

  pendingPhonePeTxns = [];
  closePhonePeModal();
  showToast('Statement imported successfully', 'ok');
}

function closePhonePeModal() {
  document.getElementById('modal-phonepe-summary')?.classList.remove('active');
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
  if (!amt) {
    console.warn('[Spendly:Ledger] Aborted transaction submission: Invalid or zero amount.');
    return;
  }

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
      console.warn(`[Spendly:Ledger] Transfer validation failed: Source and destination accounts are both "${newTxn.fromAccount}".`);
      showToast('Source and destination accounts must differ', 'err');
      return;
    }
  } else {
    newTxn.account = document.getElementById('txn-account').value;
    newTxn.category = document.getElementById('txn-category').value;
  }

  console.info(`[Spendly:Ledger] Creating new transaction "${newTxn.id}":`, newTxn);
  S.transactions.unshift(newTxn);
  saveLocalCache();
  renderDashboard();
  closeTxnModal();
  showToast('Entry Recorded', 'ok');
}

function deleteTransaction(id) {
  id = decodeURIComponent(id);
  const transaction = S.transactions.find(item => item.id === id);
  if (!transaction) {
    console.warn(`[Spendly:Ledger] Attempted to delete non-existent transaction ID "${id}".`);
    return;
  }
  console.info(`[Spendly:Ledger] Deleting transaction "${id}" (${transaction.description || transaction.category}, amount: ${transaction.amount}).`);
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
    console.debug('[Spendly:Drive] Debounced sync skipped: Not connected to Google Drive.');
    updateStatusChip('offline', 'Local-first');
    return;
  }
  
  console.debug('[Spendly:Drive] Scheduling debounced background sync in 2000ms...');
  updateStatusChip('syncing', 'Syncing...');
  clearTimeout(driveSyncTimeout);
  
  driveSyncTimeout = setTimeout(async () => {
    try {
      console.debug('[Spendly:Drive] Executing debounced background sync now.');
      await syncWithGoogleDrive(false); // Silent background sync
      updateStatusChip('synced', 'Drive Synced');
    } catch (err) {
      console.error('[Spendly:Drive] Error during debounced background sync:', err);
      updateStatusChip('paused', 'Sync paused');
    }
  }, 2000);
}

async function syncWithGoogleDrive(showFeedback = false) {
  if (!driveAccessToken) {
    console.info('[Spendly:Drive] Access token not active in memory. Re-authenticating on user gesture before sync...');
    signInWithGoogle(() => syncDriveBackup(!showFeedback));
    return;
  }
  await syncDriveBackup(!showFeedback);
}

function saveLocalCache() {
  console.debug(`[Spendly:Cache] Saving state to localStorage (txns: ${S.transactions.length}, accounts: ${S.accounts.length}, budgets: ${Object.keys(S.budgets).length}, loans: ${S.loans.length})`);
  try {
    localStorage.setItem(CACHE_KEY_TXNS, JSON.stringify(S.transactions));
    localStorage.setItem(CACHE_KEY_ACCOUNTS, JSON.stringify(S.accounts));
    localStorage.setItem(CACHE_KEY_BUDGETS, JSON.stringify(S.budgets));
    localStorage.setItem(CACHE_KEY_LOANS, JSON.stringify(S.loans));
  } catch (err) {
    console.error('[Spendly:Cache] Failed to save state to localStorage (storage quota exceeded?):', err);
    showToast('Local storage full / error saving', 'err');
  }
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
  console.debug(`[Spendly:UI] Theme initialized. Light mode: ${isLight}`);
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const light = document.body.classList.toggle('light-mode');
      localStorage.setItem('sp_theme', light ? 'light' : 'dark');
      console.debug(`[Spendly:UI] Theme toggled to: ${light ? 'light' : 'dark'}`);
    });
  });
}

function resetWorkspace() {
  if (!confirm('WARNING: This will permanently wipe all your transactions, budgets, accounts, and loans from this device. Are you sure?')) {
    return;
  }
  console.warn('[Spendly:System] resetWorkspace() confirmed. Wiping localStorage and reloading page.');
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
    console.warn(`[Spendly:Budgets] Invalid budget limit "${limit}" entered for category "${category}".`);
    showToast('Enter a limit greater than zero', 'err');
    document.getElementById('budget-limit').focus();
    return;
  }
  console.info(`[Spendly:Budgets] Saved budget limit for "${category}": ${limit}`);
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

  if (!name || isNaN(total) || isNaN(emi) || isNaN(tenure)) {
    console.warn('[Spendly:Loans] Aborted loan submission: Missing or invalid loan fields.');
    return;
  }

  const newLoan = {
    id: 'loan_' + Date.now().toString(36),
    name: name,
    principal: total,
    emi: emi,
    totalMonths: tenure,
    paidMonths: 0,
    loanType: type
  };

  console.info(`[Spendly:Loans] Created new loan "${newLoan.id}":`, newLoan);
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
  } catch (err) {
    console.warn(`[Spendly:Date] Exception parsing date "${dStr}", defaulting to today:`, err);
    return new Date().toISOString().split('T')[0];
  }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

