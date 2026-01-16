# OpenSimperfi Project Context

## Overview
OpenSimperfi is the open-source, privacy-focused edition of the Simperfi portfolio manager. It runs entirely in the browser using IndexedDB (via Dexie.js), so user data never leaves the device. The app ships as a static site (Vite + React) and works well on hosts such as Cloudflare Pages or DigitalOcean App Platform.

## Tech Stack
- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (Radix primitives)
- **Data Layer**:
  - Dexie.js for IndexedDB persistence (wallets, trades, ledger, targets, settings, snapshots)
  - Dexie live queries for reactive UI updates
- **Forms/Validation**: React Hook Form + Zod
- **Realtime Prices**: Custom Binance WebSocket hook with optional manual overrides per ticker
- **Charts**: Recharts (planned for analytics)

## Architecture

### Data Model (Double-Entry Ledger)
- **Trades** – Parent records for each transaction (trade, deposit, withdraw, transfer) storing metadata, timestamps, and notes.
- **Ledger Entries** – Child rows capturing asset movement (positive for inflow, negative for outflow) plus optional USD price at execution for cost-basis math.
- **Holdings** – Derived on the fly by walking ledger history to compute balances, weighted-average cost, last-buy price, and unrealized PnL.

### Data Storage & Management
- **Wallets / Trades / Ledger** – Core financial tables, all tied to a specific Dexie database instance.
- **Targets** – Desired portfolio allocation per ticker, shown beside actual allocation in the dashboard.
- **Settings** – App-level preferences (manual price overrides, etc.).
- **Snapshots** – Daily JSON dumps (first run per day) with retention of the latest five days per database.
- **Managed Databases** – Users can create/clone/delete/select multiple Dexie databases. Each database is isolated (new Dexie name) yet uses the same UI and backup tooling.

### Pricing Strategy
- **Live Feed** – `useLivePrices` hooks into Binance miniTicker WebSocket streams for every tracked asset, keeping USDT quoted prices current.
- **Manual Overrides** – Users can override any ticker price (Settings or inline on the Dashboard). Overridden symbols are excluded from the socket subscription until cleared.

### Privacy
- No authentication required.
- No backend database.
- Data persists inside whichever Dexie database is currently active (IndexedDB inside the user’s browser).
