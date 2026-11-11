# NetWorth Tracker v2 - Project Features

This document compiles all the features and capabilities developed for the NetWorth Tracker v2 project across our conversations.

## 1. Dashboard & Overview
*   **Comprehensive Summary:** Real-time calculation of Total Assets, Total Liabilities, Net Worth, Investment P&L, and Net Cash Flow.
*   **Visual Breakdown:** Quick overview cards for assets, liabilities, and cash flow.
*   **Interactive Charts:** Trend graphs and pie charts showing net worth progress and asset allocations.

## 2. Asset & Liability Management
*   **Assets:** Track various assets (Cash, Bank Accounts, Real Estate, Crypto, Stocks, etc.) with current valuations.
*   **Liabilities:** Track debts and loans (Home Loan, Car Loan, Credit Cards, etc.).
*   **Historical Trends:** Line and bar charts to visualize asset growth and liability reduction over time.

## 3. Cashflow Tracking & Internal Transfers
*   **Income & Expenses:** Record day-to-day income and expenses with automatic bank account balance sync.
*   **Account-Linked Transactions:** Link expenses to a "Paid From" bank account (auto-deducting balance) and income to a "Deposited To" account (auto-crediting balance).
*   **Internal Account Transfers:** Move money between accounts (e.g. Kotak Bank ➔ Stock Broking Account) with complete audit trail and zero net worth distortion.
*   **Account Passbook & Statements:** View full chronological transaction statements for any bank account or asset with total inflows, outflows, and net movement.
*   **Categorization:** Automatically categorize cash flow entries (Salary, Rental, Housing, Utilities, etc.).
*   **Income vs Expense Chart:** Visual performance graph comparing total income against total expenses.

## 4. Investment Portfolio
*   **Detailed Tracking:** Track individual investments including Buy Price, Current Price, Quantity, Platform, and SIP status.
*   **Auto-Fetch Live Prices:** Connect assets to Yahoo Finance Ticker Symbols (e.g., `NVDA`, `RELIANCE.NS`) to pull real-time market prices with a single click.
*   **P&L Calculation:** Automatically calculates Invested Amount vs Current Value to display Profit/Loss.
*   **Investment Categories:** Supports Stocks, Mutual Funds, Crypto, FD/RD, Bonds, and more.

## 5. Advanced Budget Planner
*   **Monthly Budgets:** Create independent budgets for different categories on a monthly basis.
*   **Expense (Transaction) Tracking:** Log individual expenses/transactions under specific budgets.
*   **Visual Indicators:** Progress bars showing the percentage of the budget used, and pie charts breaking down expenses vs remaining budget.
*   **PDF Export:** Ability to export individual budget reports and expense splits as a PDF document.

## 6. Snapshot History & Reporting
*   **Data Snapshots:** Take point-in-time snapshots of your entire financial state (Net Worth, Assets, Liabilities, Income, Expenses).
*   **Snapshot Reports:** Generate text-based snapshot reports that can be copied to the clipboard for sharing or external record-keeping.
*   **Historical Table:** View a tabular history of all past snapshots.

## 7. User Settings & Customization
*   **Currency Customization:** Switch between multiple currencies (INR, USD, EUR, GBP, AED) with proper symbols.
*   **Date Formatting:** Customize how dates are displayed across the app (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD).
*   **Category Management:** Built-in default categories for all financial modules.

## 8. Authentication & Security
*   **User Accounts:** Secure Login and Registration system to keep financial data private.
*   **JWT Authorization:** Backend API secured with token-based authentication.

## 9. Technical Architecture & Data
*   **Tech Stack:** React (Vite) frontend with Recharts for data visualization, and an Express.js Node backend.
*   **Database:** SQLite integration (`sql.js`) for lightweight, portable database management.
*   **Data Migration:** Custom migration scripts to seamlessly transfer data from the legacy V1 Electron AppData folder to the new V2 server architecture.

## 10. Savings Goals
*   **Goal Tracking:** Create specific financial goals with target amounts and dates.
*   **Visual Progress:** Circular progress rings track your savings progress directly on the dashboard.

## 11. Subscriptions & Recurring
*   **Subscription Manager:** Dedicated tab to track Netflix, Gym, Rent, Utilities, etc.
*   **Auto-Logging:** Automatically injects recurring subscriptions into your Cashflow ledger on their due date.

## 12. FIRE & Projections
*   **FIRE Calculator:** Model your projected net worth 10-20 years into the future based on your current savings and ROI.
*   **Retirement Modeling:** Determines what age you can theoretically retire based on safe withdrawal rates.

## 13. Debt Payoff Planner & Loan Management
*   **Strategy Simulator:** Compare Avalanche (highest interest) and Snowball (lowest balance) payoff methods.
*   **Timeline:** Visual charts and exact payoff dates calculated for your liabilities.
*   **Active Loan Schedules:** Track total remaining EMIs, loan maturity date, and monthly EMI due day.
*   **Monthly EMI Confirmation:** Interactive "Pay EMI" workflow calculating monthly interest vs. principal repayment, automatically reducing the liability balance, decrementing remaining EMIs, and syncing payments with Cashflow expenses.
*   **Loan Foreclosure & Prepayment:** Settle or close debts early with optional prepayment charges and Cashflow ledger recording.
*   **Direct Debt Management:** Add and edit debts/loans directly inside the Debt Planner without switching pages.

## 14. Bulk Imports
*   **CSV Import:** Upload bank statement CSVs with a dynamic column mapping tool for instant bulk Cashflow entry.

## 15. Advanced Configuration
*   **Multi-Currency Support:** Define exchange rates to automatically convert foreign assets to your base dashboard currency.
*   **Dashboard Layouts:** Fully customize and reorder your dashboard widgets (charts, stats, goals) using the layout manager.

## 16. Insurance & Protection Portfolio
*   **Comprehensive Policy Tracking:** Manage Term Life Insurance, Endowment policies, ULIPs, Health insurance, and Vehicle policies.
*   **Coverage & Protection Metrics:** Overview of Total Life Cover (Sum Assured), Total Health Cover, and Total Annual Premium outflows.
*   **Cash / Surrender Value Accounting:** Cash values for endowment and ULIP policies directly contribute to Total Assets and Net Worth.
*   **Interactive "Pay Premium" Workflow:** Advance premium due dates by policy frequency and automatically log the payment in Cashflow, deducted from your chosen bank account.
