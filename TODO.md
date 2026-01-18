# Todo List

## Completed
- [x] **Project Initialization** – Vite + React + TypeScript setup.
- [x] **Dexie Schema & Ledger** – Accounts, trades, ledger, targets, settings, snapshots.
- [x] **Account Management UI** – Add/edit/delete accounts with Dexie live queries.
- [x] **Transaction Workflow** – Separate forms for Buy, Sell, Deposit, Withdraw, Transfer with cost basis capture.
- [x] **Dashboard Enhancements** – Holdings table with avg buy price, last-buy delta, unrealized PnL, realized PnL, allocation tracking.
- [x] **Live Pricing** – Binance WebSocket hook plus manual price overrides per asset.
- [x] **Backup & Restore** – JSON export/import shared across databases.
- [x] **Database Management** – Multi-DB creation/cloning, selection, deletion, and daily snapshots (last five days retained).
- [x] **Dark/Light Toggle** – Full theme system with dark/light/system modes using context provider and persistent storage.
- [x] **Asset Autocomplete** – Smart combobox component with top 10 filtered suggestions from ledger, auto-uppercase, and keyboard support.
- [x] **Mobile Optimization** – Responsive card-based layouts for Dashboard, Transactions, and Accounts pages with touch-friendly controls.
- [x] **Trading Pair System** – Buy/Sell forms support pair-based trading (e.g., ETH/USDC) with auto-price fetching from Binance.
- [x] **Stablecoin Detection** – Auto-select first stablecoin as default currency in trading forms.
- [x] **Inline Form Layouts** – Amount and asset displayed side-by-side for natural readability (e.g., "1.5 ETH").
- [x] **Responsive Form Grids** – Trading forms adapt: 2-column on desktop, stacked on mobile.
- [x] **Auto-Account Selection** – First account auto-selected in all transaction forms.
- [x] **Portfolio Value Chart** – 30-day historical chart with full value Y-axis labels (not "1k 1k").
- [x] **Realized PnL Card** – Track total profit/loss from completed sell orders.
- [x] **30-Day Change Card** – Show portfolio performance over last 30 days with percentage.

## In Progress / Next Steps
- [ ] **Advanced Reporting** – Tax lots, FIFO/LIFO cost basis methods, account-level performance.
- [ ] **Enhanced Charts** – Allocation drift over time, realized vs unrealized PnL comparison.
- [ ] **Transaction Filtering** – Filter transactions by type, date range, asset, or account.

## Future Improvements
- [ ] **Multi-Currency Support** – Quote portfolio in EUR/GBP/IDR, localize formatting.
- [ ] **Dust & Filtering** – Hide tiny balances, custom sorting, saved table views.
- [ ] **Keyboard Shortcuts** – Quick transaction entry, navigation shortcuts.
- [ ] **Import from Exchanges** – CSV import templates for major exchanges.
- [ ] **Price History Persistence** – Store historical prices for offline chart viewing.
- [ ] **Notes & Tags** – Rich transaction notes with searchable tags.

