# Spendly Pro: Production-Grade PWA & Personal Finance Workspace

Spendly Pro (v3.2.0) is a private, local-first personal finance PWA and CA-grade Indian Income Tax Optimizer. It is designed to work completely offline, storing data locally inside your browser's secure cache and backing up to your personal Google Drive AppData folder.

The live application is hosted at: **[https://ijnikhil.github.io/spendly/](https://ijnikhil.github.io/spendly/)**

---

## 🔒 Security Architecture (Zero-Trust & Private-by-Design)

Spendly Pro is built with a **100% serverless, zero-trust security model**:
* **No Server-Side Storage**: We do not run databases or middleware servers. Your transactions, budgets, and bank account balances never leave your device.
* **Google Drive AppData Folder Sync**: Backups are written to a hidden, application-specific directory on your personal Google Drive (the `appDataFolder`). Spendly Pro **cannot** read, write, or access any other files or folders in your general Google Drive.
* **Zero Hardcoded Secrets**: Because the app communicates directly with Google's REST APIs using dynamically generated client-side OAuth access tokens, the source code contains absolutely no private database keys or API secret credentials.
* **Google OAuth JavaScript Origin Validation**: The Google Client ID configured in the HTML is safe to expose publicly on GitHub. Google enforces that OAuth tokens are only issued to requests originating from authorized URLs (e.g., `https://ijnikhil.github.io`).

---

## 🚀 Key Features

### 1. Unified Workspace Cockpit & Account Balances
* **Double-Entry Balance Engine**: Tracks assets, cards, and cash wallets across your accounts in real time.
* **Global Cash Flow Calculator**: Computes `Available Balance = Income − (Expenses + Investments)` automatically. Internal account-to-account transfers correctly debit the source wallet and credit the target wallet without double-counting global income or expenses.
* **Real-time Status Feed**: An animated status chip in the top navigation header provides direct visual feedback:
  * 🟢 **Drive Synced**: Connected and fully backed up.
  * 🔵 **Syncing...**: Cloud synchronization actively in progress.
  * 🟡 **Sync paused**: Local changes are saved locally, awaiting reconnection.
  * ⚪ **Local-first**: Running offline without Drive integration.

### 2. Robust PhonePe Statement Ingestion (India Standard)
* **Auto Header Discovery**: The CSV import engine automatically scans the first 10 rows of statement files to discover table headers. This prevents parsing crashes when CSV files contain preamble metadata rows.
* **Payment Instrument Normalization**: Verbosely formatted debit instruments (e.g., `"Debited from Bank Account - HDFC BANK (•••• 4321)"`) are automatically scrubbed and normalized (e.g., `"HDFC ••4321"`).
* **Auto-Provisioning Account Allocation**: The parser matches transactions against your bank list. If a transaction belongs to a bank account not currently in your system, Spendly automatically provisions the account to prevent ingestion friction.
* **Robust Date Normalization**: Successfully parses `DD/MM/YYYY` and `DD-MM-YYYY` formats (common in Indian exports) into standardized ISO `YYYY-MM-DD` database records.

### 3. CA-Grade Indian Tax Optimizer (FY 2025–26 & FY 2026–27)
* **Budget 2025 Slabs**: Supports the updated New Tax Regime slabs (standard deduction of ₹75,000 and Section 87A full rebate up to ₹12 Lakh).
* **Section 87A Marginal Relief**: Includes precise marginal relief calculations for net incomes slightly above ₹12 Lakh.
* **Deduction Breakdown (Old Regime)**: Tracks claims across standard caps including Section 80C (₹1.5L limit), Section 80D (health insurance up to ₹50k for senior citizen parents), Section 80TTA, NPS, and home loans (Section 24b up to ₹2L).

### 4. Smart Budgets & Active EMIs
* **Persistent Category Budgets**: Configure monthly limits with live progress bars. Counters reset automatically at the beginning of each calendar month.
* **EMI Tracker**: Log loan details (EMI, Principal, Duration). Clicking **Pay EMI** increments payment counts and automatically logs transactions to prevent double-posting.

---

## 🛠️ Deploying & Hosting on GitHub Pages

Since Spendly Pro is fully client-side, you can host your own version for free on GitHub Pages:

1. Create a repository on GitHub (e.g., `spendly`).
2. Clone this project repository, configure your files, and push them to your repository main branch:
   ```bash
   git init
   git remote add origin https://github.com/YOUR_USERNAME/spendly.git
   git add .
   git commit -m "Deploy Spendly Pro"
   git branch -M main
   git push -u origin main --force
   ```
3. Go to your GitHub repository **Settings** $\rightarrow$ **Pages**. Under **Branch**, select **`main`** and click **Save**.

### Google OAuth Consent Screen Setup
To enable Google Drive backup syncing on your live site, go to the **Google Cloud Console** and register your domain:
*   **Authorized Domains**: `github.io`
*   **Application Home Page**: `https://YOUR_USERNAME.github.io/spendly/`
*   **Application Privacy Policy**: `https://YOUR_USERNAME.github.io/spendly/privacy.html`
*   **Application Terms of Service**: `https://YOUR_USERNAME.github.io/spendly/terms.html`
*   **Authorized JavaScript Origins**: `https://YOUR_USERNAME.github.io`
*   **OAuth Scopes**: `email`, `profile`, `openid`, and `https://www.googleapis.com/auth/drive.appdata`
