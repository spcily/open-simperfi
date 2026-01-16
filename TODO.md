# Todo List

## Completed
- [x] **Project Initialization** – Vite + React + TypeScript setup.
- [x] **Dexie Schema & Ledger** – Accounts, trades, ledger, targets, settings, snapshots.
- [x] **Account Management UI** – Add/edit/delete accounts with Dexie live queries.
- [x] **Transaction Workflow** – TradeForm with deposits, withdrawals, transfers, cost basis capture.
- [x] **Dashboard Enhancements** – Holdings table with avg buy price, last-buy delta, PnL, allocation tracking.
- [x] **Live Pricing** – Binance WebSocket hook plus manual price overrides per asset.
- [x] **Backup & Restore** – JSON export/import shared across databases.
- [x] **Database Management** – Multi-DB creation/cloning, selection, deletion, and daily snapshots (last five days retained).
- [x] **Dark/Light Toggle** – Full theme system with dark/light/system modes using context provider and persistent storage.
- [x] **Asset Autocomplete** – Smart combobox component with top 10 filtered suggestions from ledger, auto-uppercase, and keyboard support.
- [x] **Mobile Optimization** – Responsive card-based layouts for Dashboard, Transactions, and Accounts pages with touch-friendly controls.
- [x] **Transaction Form Improvements** – Compact toggle badges for type/account selection, fixed dialog height, widened layout (700px).

## In Progress / Next Steps
- [ ] **Historical Analytics** – Persist price history for charts and "vs last trade" metrics.
- [ ] **Portfolio Charts** – Time-series value, allocation drift, realized vs unrealized PnL.
- [ ] **Advanced Reporting** – Tax lots, realized gains, account-level performance.

## Future Improvements
- [ ] **Multi-Currency Support** – Quote portfolio in EUR/GBP/IDR, localize formatting.
- [ ] **Dust & Filtering** – Hide tiny balances, custom sorting, saved table views.
- [ ] **Keyboard Shortcuts** – Quick transaction entry, navigation shortcuts.
- [ ] **Import from Exchanges** – CSV import templates for major exchanges.

