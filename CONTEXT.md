# OpenSimperfi Project Context

## Overview
OpenSimperfi is the open-source, privacy-focused edition of the Simperfi portfolio manager. It runs entirely in the browser using IndexedDB (via Dexie.js), so user data never leaves the device. The app ships as a static site (Vite + React) and works well on hosts such as Cloudflare Pages or DigitalOcean App Platform.

## Tech Stack
- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Charts**: Recharts (for portfolio value and asset allocation visualization)
- **Data Layer**:
  - Dexie.js for IndexedDB persistence (accounts, trades, ledger, targets, settings, snapshots)
  - Dexie live queries for reactive UI updates
- **Forms/Validation**: React Hook Form + Zod
- **Realtime Prices**: Custom Binance WebSocket hook with optional manual overrides per ticker
- **Theme**: Custom theme provider with dark/light/system modes

## Architecture

### Data Model (Double-Entry Ledger)
- **Trades** – Parent records for each transaction (buy, sell, deposit, withdraw, transfer) storing metadata, timestamps, trading pairs, and notes.
- **Ledger Entries** – Child rows capturing asset movement (positive for inflow, negative for outflow) plus optional USD price at execution for cost-basis math.
- **Holdings** – Derived on the fly by walking ledger history to compute balances, weighted-average cost, last-buy price, unrealized PnL, and realized PnL.

### Trading System
- **Pair-Based Trading** – Buy and Sell transactions use trading pairs (e.g., ETH/USDC, BTC/USDT)
  - `pair`: The trading pair string (e.g., "ETH/USDC")
  - `pairPrice`: Exchange rate (e.g., 3000 USDC per ETH)
  - `actualPrice`: For sell orders, stores inverse price (1/pairPrice) for accurate calculations
- **Auto-Price Fetching** – Automatically fetches current prices from Binance API when both assets are selected
- **Stablecoin Detection** – Smart detection of stablecoins (USDT, USDC, BUSD, DAI, etc.) with auto-selection as default currency

### Data Storage & Management
- **Accounts / Trades / Ledger** – Core financial tables, all tied to a specific Dexie database instance.
- **Targets** – Desired portfolio allocation per ticker, shown beside actual allocation in the dashboard.
- **Settings** – App-level preferences (manual price overrides, theme preference, etc.).
- **Snapshots** – Daily JSON dumps (first run per day) with retention of the latest five days per database.
- **Managed Databases** – Users can create/clone/delete/select multiple Dexie databases. Each database is isolated (new Dexie name) yet uses the same UI and backup tooling.

### UI Components & Features

#### Dashboard Metrics (4 Cards)
1. **Total Portfolio Value** – Current value with cost basis
2. **Unrealized PnL** – Profit/loss on open positions with percentage
3. **Realized PnL** – Total profit/loss from completed sell orders
4. **30-Day Change** – Portfolio performance over last 30 days with percentage

#### Transaction Forms
- **5 Separate Forms**: Buy, Sell, Deposit, Withdraw, Transfer
- **Inline Layouts**: Amount and asset displayed side-by-side (e.g., "1.5 ETH")
- **Responsive Grids**: 
  - Desktop: Buy/Sell show 2 input pairs side-by-side
  - Mobile: All forms stack vertically
- **Auto-Selection**: First account auto-selected on form open
- **Smart Defaults**: Stablecoins auto-selected as currency in trading forms

#### Theme System
- `ThemeProvider` context with `ThemeToggle` dropdown in header
- Dark/light/system modes with localStorage persistence

#### Asset Combobox
- Autocomplete dropdown showing top 10 filtered assets from ledger
- Keyboard support (Enter/Tab to create new)
- Auto-uppercase for consistency

#### Mobile Responsiveness
- **Breakpoint**: md: 768px for desktop/mobile split
- **Desktop**: Traditional tables with full column details
- **Mobile**: Card-based layouts with stacked information
- Applied to Dashboard holdings, Transactions history, and Accounts list
- Touch-friendly button sizes and spacing

### Pricing Strategy
- **Live Feed** – `useLivePrices` hooks into Binance miniTicker WebSocket streams for every tracked asset, keeping USDT quoted prices current.
- **Manual Overrides** – Users can override any ticker price (Settings or inline on the Dashboard). Overridden symbols are excluded from the socket subscription until cleared.

### Charts & Visualization
- **Portfolio Value Chart** – 30-day historical line chart with full currency values on Y-axis
- **Asset Allocation Chart** – Pie chart showing current portfolio distribution by asset

### Privacy
- No authentication required.
- No backend database.
- Data persists inside whichever Dexie database is currently active (IndexedDB inside the user's browser).

## Key File Locations
- **Theme**: `src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`
- **Asset Input**: `src/components/ui/asset-combobox.tsx`
- **Main Pages**: `src/pages/Dashboard.tsx`, `src/pages/TransactionsPage.tsx`, `src/pages/AccountsPage.tsx`
- **Transaction Forms**: 
  - `src/components/forms/BuyFormComponent.tsx`
  - `src/components/forms/SellFormComponent.tsx`
  - `src/components/forms/DepositFormComponent.tsx`
  - `src/components/forms/WithdrawFormComponent.tsx`
  - `src/components/forms/TransferFormComponent.tsx`
- **Database**: `src/lib/db.ts`
- **Utilities**: `src/lib/stablecoins.ts`, `src/lib/utils.ts`
