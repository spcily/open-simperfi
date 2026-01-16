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

## In Progress / Next Steps
- [ ] **Historical Analytics** – Persist price history for charts and “vs last trade” metrics.
- [ ] **Portfolio Charts** – Time-series value, allocation drift, realized vs unrealized PnL.
- [ ] **Advanced Reporting** – Tax lots, realized gains, account-level performance.

## Future Improvements
- [ ] **Mobile Optimization** – Responsive tables/forms and sticky summaries.
- [ ] **Multi-Currency Support** – Quote portfolio in EUR/GBP/IDR, localize formatting.
- [ ] **Dark/Light Toggle** – Integrate `next-themes` for explicit theme switching.
- [ ] **Dust & Filtering** – Hide tiny balances, custom sorting, saved table views.
