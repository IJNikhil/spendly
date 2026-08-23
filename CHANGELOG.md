# Changelog

All notable changes to **Spendly Pro** will be documented in this file.

## [3.1.0] - 2026-08-23

### Added
- Split the web experience into dedicated marketing, login, and workspace pages.
- Added Google Drive sign-in entry through the restricted `drive.appdata` scope with a local guest fallback.
- Added private Drive backup controls to the workspace Settings view.

## [3.0.1] - 2026-08-23

### Improved
- Reworked the responsive workspace with a desktop side rail, tablet grid, and mobile bottom navigation.
- Added consistent orientation headers across Dashboard, Tax Center, Loans, and Settings.
- Improved dropdown sizing, native option contrast, overflow handling, focus states, and touch targets.
- Improved narrow-screen wrapping for budgets, ledger rows, transfer fields, tax summaries, and modal actions.
- Added keyboard focus visibility, modal dialog semantics, safe-area spacing, and branded PWA icons.
- Safely escaped user-defined account names before rendering dropdown options.

## [3.0.0] - 2026-08-23

### Added
- **Zero-Knowledge Security at Rest**: In-browser client-side encryption using the native Web Cryptography API (`window.crypto.subtle`). Sensitive configs and caches are encrypted using AES-256-GCM and PBKDF2 (SHA-256, 310,000 iterations).
- **Security Lock Screen Overlay**: Friendly touch-friendly PIN keypad for mobile (and keyboard input support for alphanumeric passphrases) with idle session auto-lock (10 minutes) and window visibility change triggers.
- **Statutory Union Budget 2025 Slabs**: Updated income tax engine for FY 2025-26 & FY 2026-27 under the New Tax Regime (Basic exemption to ₹4,00,000, standard deduction of ₹75,000, Section 87A rebate ceiling of ₹12,00,000 with marginal relief calculations).
- **First-Class Internal Account Transfers**: Integrated internal transfers that post credit/debit double ledger rows to satisfied accounts without corrupting aggregate metrics (P&L, gross income/expense burn rate).
- **PhonePe Statement CSV Ingestion**: Multi-format client-side CSV parser with reference/UTR deduplication against historical caches and automated category mapping.
- **Self-Healing Deduplication**: Back-end GAS utility `dedupeTransactions()` to automatically clear database duplicates.

### Fixed
- **EMI Double-Posting**: Eradicated the secondary client-side POST in `payLoan()`, transferring transaction tracking entirely to a single back-end transaction write.
- **Offline Sync Queue Contention**: Shifted from concurrent `Promise.all` sync requests to sequential `for...of` loops with per-item timeout guards, keeping failed transactions safely in queue.
- **Light Mode Accessibility Contrast**: Set WCAG 2.1 AA compliant color tokens for light mode green, red, and yellow buttons/metrics against bright white backdrops.
- **Direction-Locked Gestures**: Touch gesture swipe actions are now horizontally restricted (`|dx| >= |dy|`), preventing list swiping when scrolling vertically.
- **Complete ITR Deductions**: Aggregated all 8 statutory sections (80C, 80D, 80G, 80E, 80TTA, 24B, 80CCD, HRA) inside the PDF and screen-rendered tax calculators.

