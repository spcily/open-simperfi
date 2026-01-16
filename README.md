# OpenSimperfi

A simple, privacy-focused, local-first crypto portfolio manager.

## Overview

OpenSimperfi allows you to track your crypto assets without sending your data to a third-party server. All data is stored locally in your browser using IndexedDB. It uses a professional **double-entry ledger** system to ensure accurate accounting of your trades, deposits, and transfers.

## Features

- **Local Only** – No account required. Everything lives in IndexedDB on your machine.
- **Double-Entry Ledger** – Trades, deposits, withdrawals, and transfers are recorded as balanced ledger entries with historical USD prices for cost basis.
- **Live & Manual Pricing** – Binance WebSocket miniTickers keep quotes in sync, while manual overrides let you hardcode prices for obscure tickers.
- **Detailed Dashboard** – Holdings table shows balance, price, avg buy, last buy delta, PnL, and allocation vs target.
- **Portfolio Targets** – Define desired percentage per asset and monitor drift.
- **Database Management** – Create, clone, select, and delete isolated Dexie databases for experiments or multiple portfolios.
- **Backups & Snapshots** – One-click JSON export/import plus automatic daily snapshots (last five days) per database.

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
- **Styling/UI**: Tailwind CSS, shadcn/ui (Radix primitives)
- **Persistence**: Dexie.js (IndexedDB) with live queries; multiple database instances managed via local metadata
- **Ledger Engine**: Weighted-average cost basis + last-buy tracking derived from ledger history
- **Live Prices**: Custom `useLivePrices` hook for Binance WebSocket streams with manual override support
- **Snapshots/Backups**: Shared export/import utilities used by backups, clones, and daily snapshot retention

## License

MIT
