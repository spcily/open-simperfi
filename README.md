# OpenSimperfi

A simple, privacy-focused, local-first crypto portfolio manager.

## Overview

OpenSimperfi allows you to track your crypto assets without sending your data to a third-party server. All data is stored locally in your browser using IndexedDB. It uses a professional **double-entry ledger** system to ensure accurate accounting of your trades, deposits, and transfers.

## Features

- **Local Only** – No account required. Everything lives in IndexedDB on your machine.
- **Double-Entry Ledger** – Trades, deposits, withdrawals, and transfers are recorded as balanced ledger entries with historical USD prices for cost basis.
- **Trading Pair System** – Buy and sell using pairs (e.g., ETH/USDC, BTC/USDT) with automatic price fetching from Binance API.
- **Intelligent Forms** – Inline amount + asset layouts, auto-account selection, stablecoin detection, and responsive grids.
- **Live & Manual Pricing** – Binance WebSocket miniTickers keep quotes in sync, while manual overrides let you hardcode prices for obscure tickers.
- **Comprehensive Dashboard** – 
  - Holdings table with balance, price, avg buy, last buy delta, unrealized PnL, and allocation vs target
  - Portfolio value chart (30-day history with clear full-value Y-axis labels)
  - 4 metric cards: Total Value, Unrealized PnL, Realized PnL, 30-Day Change
- **Portfolio Targets** – Define desired percentage per asset and monitor drift.
- **Database Management** – Create, clone, select, and delete isolated Dexie databases for experiments or multiple portfolios.
- **Backups & Snapshots** – One-click JSON export/import plus automatic daily snapshots (last five days) per database.
- **Dark Mode** – Full dark/light/system theme support with persistent preferences.
- **Smart Asset Input** – Autocomplete dropdown for asset tickers with top 10 suggestions from your portfolio.
- **Mobile Responsive** – Optimized card-based layouts for phones and tablets with touch-friendly controls.

## Getting Started

### Prerequisites
- Node.js 20+ (tested on v25)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/spcily/open-simperfi.git
    cd open-simperfi
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

4.  Open your browser to `http://localhost:5173`.

## Architecture

- **Frontend**: React + Vite + TypeScript
- **Styling/UI**: Tailwind CSS, shadcn/ui (Radix primitives), Recharts for visualizations
- **Persistence**: Dexie.js (IndexedDB) with live queries; multiple database instances managed via local metadata
- **Ledger Engine**: Weighted-average cost basis + last-buy tracking + realized PnL from sell orders
- **Live Prices**: Custom `useLivePrices` hook for Binance WebSocket streams with manual override support
- **Snapshots/Backups**: Shared export/import utilities used by backups, clones, and daily snapshot retention

## Transaction Types

- **Buy** – Purchase crypto with fiat or another crypto (pair-based: BTC/USDT)
- **Sell** – Sell crypto for fiat or another crypto (pair-based: ETH/USDC)
- **Deposit** – Add assets to your portfolio (external transfers in)
- **Withdraw** – Remove assets from your portfolio (external transfers out)
- **Transfer** – Move assets between your accounts (internal transfers)

## License

MIT
