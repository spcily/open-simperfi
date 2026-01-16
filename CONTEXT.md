# OpenSimperfi Project Context

## Overview
OpenSimperfi is the open-source, privacy-focused edition of the Simperfi portfolio manager. It runs entirely in the browser using IndexedDB (via Dexie.js), so user data never leaves the device. The app ships as a static site (Vite + React) and works well on hosts such as Cloudflare Pages or DigitalOcean App Platform.

## Tech Stack
- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Data Layer**:
  - Dexie.js for IndexedDB persistence (accounts, trades, ledger, targets, settings, snapshots)
  - Dexie live queries for reactive UI updates
- **Forms/Validation**: React Hook Form + Zod
- **Realtime Prices**: Custom Binance WebSocket hook with optional manual overrides per ticker
- **Theme**: Custom theme provider with dark/light/system modes
- **Charts**: Recharts (planned for analytics)

## Architecture

### Data Model (Double-Entry Ledger)
- **Trades** – Parent records for each transaction (trade, deposit, withdraw, transfer) storing metadata, timestamps, and notes.
- **Ledger Entries** – Child rows capturing asset movement (positive for inflow, negative for outflow) plus optional USD price at execution for cost-basis math.
- **Holdings** – Derived on the fly by walking ledger history to compute balances, weighted-average cost, last-buy price, and unrealized PnL.

### Data Storage & Management
- **Accounts / Trades / Ledger** – Core financial tables, all tied to a specific Dexie database instance.
- **Targets** – Desired portfolio allocation per ticker, shown beside actual allocation in the dashboard.
- **Settings** – App-level preferences (manual price overrides, theme preference, etc.).
- **Snapshots** – Daily JSON dumps (first run per day) with retention of the latest five days per database.
- **Managed Databases** – Users can create/clone/delete/select multiple Dexie databases. Each database is isolated (new Dexie name) yet uses the same UI and backup tooling.

### UI Components & Features
- **Theme System** – `ThemeProvider` context with `ThemeToggle` dropdown in header supporting dark/light/system modes with localStorage persistence.
- **Asset Combobox** – `AssetCombobox` component provides autocomplete dropdown showing top 10 filtered assets from ledger, with keyboard support (Enter/Tab to create new).
- **Transaction Form** – Compact toggle badges for transaction type and account selection, fixed 700px width dialog, responsive height (60vh mobile, 500px desktop).
- **Mobile Responsiveness** – Dual layout strategy using Tailwind breakpoints (md: 768px):
  - **Desktop**: Traditional tables with full column details
  - **Mobile**: Card-based layouts with stacked information
  - Applied to Dashboard holdings, Transactions history, and Accounts list
  - Touch-friendly button sizes and spacing on mobile

### Pricing Strategy
- **Live Feed** – `useLivePrices` hooks into Binance miniTicker WebSocket streams for every tracked asset, keeping USDT quoted prices current.
- **Manual Overrides** – Users can override any ticker price (Settings or inline on the Dashboard). Overridden symbols are excluded from the socket subscription until cleared.

### Privacy
- No authentication required.
- No backend database.
- Data persists inside whichever Dexie database is currently active (IndexedDB inside the user's browser).

## Key File Locations
- **Theme**: `src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`
- **Asset Input**: `src/components/ui/asset-combobox.tsx`
- **Main Pages**: `src/pages/Dashboard.tsx`, `src/pages/TransactionsPage.tsx`, `src/pages/AccountsPage.tsx`
- **Transaction Form**: `src/components/TradeForm.tsx`
- **Database**: `src/lib/db.ts`
