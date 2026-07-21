# Spendly Pro: Complete User Guide

Welcome to Spendly Pro! This guide explains every feature of your personal finance and tax-tracking application. Spendly Pro is built as a Progressive Web App (PWA), meaning you can install it directly to your phone's home screen and use it offline.

---

### 1. The Dashboard (Your Financial Command Center)
The Dashboard gives you an instant overview of your financial health:

* **Available Balance:** Represents your real-time cumulative net cash (Total Income − Expenses − Investments) up to today. Filtering by a specific Bank Account shows the true balance for that specific account.
* **Income / Expenses / Invested Cards:** These three metrics display activity strictly for the currently selected Month and Year.
* **Smart Filters:** Dropdowns at the top right allow you to filter the entire dashboard by Bank Account, Month, and Year.
* **Expense Breakdown Chart:** An interactive doughnut chart grouping your spending by category for the selected month.
* **6-Month Trend & Runway Estimator:** A line/bar chart showing your trailing 6-month cash flow. The Runway Estimator calculates how many months your Available Balance will last based on your average monthly burn rate (excluding one-off outlier purchases).

---

### 2. Smart Budgets
Set monthly spending caps for individual categories (e.g., "Dining Out", "Groceries"):

* **Persistent Rules:** Once you set a category budget, Spendly saves it permanently. At the start of every new month, spending counters reset to zero automatically while preserving your budget targets and past month records.
* **Visual Progress Bars:** Spendly tracks your current month's category spending against your limit using color-coded bars:
  * **Green:** Safe (< 75% used)
  * **Yellow:** Caution (75%–99% used)
  * **Red:** Budget Exceeded (≥ 100% used)
* **Edit / Delete:** Click any budget row to adjust monthly limits or remove a category budget.

---

### 3. Active EMIs & Loans
Track active debts and keep your monthly cash flow synced with your loan payments:

* **Adding a Loan:** Click "Add Loan" and enter the Loan Name, Principal, Monthly EMI, and Total Duration (in months).
* **Recording a Payment:** Clicking the **PAY** button increments your "Paid Months" counter by 1 and automatically logs a new Expense transaction for today's date under the category `"EMI / Loan Payment"`.
* **Completion Badge:** Once `Paid Months = Total Months`, the PAY button converts to a **COMPLETED** badge to prevent duplicate charges.
* **Historical Record:** Paid EMIs remain permanently recorded in your ledger history for audit and tax reference.

---

### 4. Multi-Account Management
Seamlessly track multiple bank accounts, wallets, and credit cards:

* **Account Setup:** Add accounts (e.g., "HDFC Bank", "ICICI Credit Card", "Cash Wallet") in **Settings > Account Manager**.
* **Transaction Linking:** Every income, expense, or transfer is linked to a specific account.
* **Global Account Filter:** Filter the Dashboard or Ledger by a specific account, or select `"All Accounts"` to view your total net worth.

---

### 5. Logging Transactions (New Entry)
Click the floating **+** button to log financial entries across four distinct modes:

* **Income & Expense:** Standard personal transactions. Assign category, date, payment mode, and bank account.
* **Business (Reimbursable):** Log out-of-pocket expenses made for clients/employers. Mark as **Pending** to track unreimbursed money via the Dashboard Banner until marked **Settled**.
* **Investment & Tax:** Log tax-saving investments (Mutual Funds, PPF, LIC). Tag specific Indian Tax Sections (80C, 80D, Sec 24B) for automatic tax calculation.

---

### 6. Ledger & History
A complete searchable record of all past financial actions:

* **Color-Coded Rows:** Green for Income, Red for Expense, Blue for Investment.
* **Instant Search & Filter:** Filter by Month, Year, Bank Account, or search keywords in real time.
* **Mobile Swipe Actions:** On mobile, **Swipe Left** on a row to reveal the **Delete** button, or **Swipe Right** to reveal **Edit**. (Hover controls appear on desktop).

---

### 7. Tax & ITR Center (CA-Grade)
Designed specifically for Indian Financial Years (April 1st to March 31st):

* **FY Crossover Support:** Select an FY (e.g., FY 2025–26) to correctly pull records from April 1 to March 31.
* **Income Heads Breakdown:** Automatically categorizes income into standard heads: *Salary, Business, STCG, LTCG, and Other Sources*.
* **Deduction Engine:** Aggregates tagged investments (80C limit ₹1.5L, 80D limit ₹25k, etc.) and applies the New Tax Regime Standard Deduction (₹75,000) and Sec 87A rebate logic.
* **Custom Date Range P&L:** Generate and export a Profit & Loss statement for any custom date range.

---

### 8. Offline Mode & Background Sync
* **Offline Queue:** If internet connection drops, transactions are securely saved in local storage (`sp_offline_queue`).
* **Auto-Sync:** As soon as network connectivity is restored, Spendly automatically flushes the queue to your Google Sheets backend without data loss.

---

### 9. Monthly Email Automation
* **Automated Delivery:** On the 1st of every month at 8:00 AM, the Google Apps Script backend compiles your previous month's financial metrics, top spending categories, and net savings, delivering a clean summary directly to your Google email inbox!
