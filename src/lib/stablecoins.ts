// Common stablecoins list
export const COMMON_STABLECOINS = [
  'USDT',  // Tether
  'USDC',  // USD Coin
  'BUSD',  // Binance USD
  'DAI',   // Dai
  'TUSD',  // TrueUSD
  'USDD',  // USDD
  'USDP',  // Pax Dollar
  'GUSD',  // Gemini Dollar
  'FRAX',  // Frax
  'LUSD',  // Liquity USD
  'USDN',  // Neutrino USD
  'UST',   // TerraUSD
  'FDUSD', // First Digital USD
  'PYUSD', // PayPal USD
];

/**
 * Check if a ticker is a known stablecoin
 */
export function isStablecoin(ticker: string): boolean {
  return COMMON_STABLECOINS.includes(ticker.toUpperCase());
}

/**
 * Filter available assets to return only stablecoins
 */
export function filterStablecoins(assets: string[]): string[] {
  return assets
    .filter(asset => isStablecoin(asset))
    .sort();
}

/**
 * Get USD price for stablecoins (always 1) or other assets
 */
export function getStablecoinPrice(ticker: string): number | null {
  return isStablecoin(ticker) ? 1 : null;
}
