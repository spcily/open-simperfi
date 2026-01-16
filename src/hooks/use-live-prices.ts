import { useEffect, useState, useRef, useMemo } from 'react';

export function useLivePrices(assets: string[], overrides?: Record<string, number>) {
    const [prices, setPrices] = useState<Record<string, number>>({});
    const ws = useRef<WebSocket | null>(null);

    // Dedup assets and create dependency key
    const uniqueAssets = useMemo(() => {
        return [...new Set(assets.map(asset => asset.toUpperCase()))].sort();
    }, [assets]);
    const overridesSignature = JSON.stringify(overrides || {});

    const normalizedOverrides = useMemo(() => {
        const map: Record<string, number> = {};
        if (overrides) {
            Object.entries(overrides).forEach(([ticker, value]) => {
                const symbol = ticker.trim().toUpperCase();
                const price = Number(value);
                if (!symbol || !Number.isFinite(price)) return;
                map[symbol] = price;
            });
        }
        return map;
    }, [overridesSignature]);

    useEffect(() => {
        if (uniqueAssets.length === 0) {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
            return;
        }

        // Initialize USDT to 1 immediately
        setPrices(prev => ({ ...prev, USDT: 1 }));

        const overrideTickers = new Set(Object.keys(normalizedOverrides));

        // Filter out USDT and overridden tickers for socket subscription
        const symbolsToSubscribe = uniqueAssets
            .filter(symbol => symbol !== 'USDT' && !overrideTickers.has(symbol))
            .map(symbol => `${symbol.toLowerCase()}usdt`);

        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }

        if (symbolsToSubscribe.length === 0) {
            return;
        }

        // Binance expects lowercase symbols in the stream name
        const streams = symbolsToSubscribe.map(s => `${s}@miniTicker`).join('/');
        const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
            console.log('Connected to Binance Live Prices');
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                // Format: { stream: "btcusdt@miniTicker", data: { s: "BTCUSDT", c: "45000.12" } }
                if (message.data && message.data.s && message.data.c) {
                    const pair = message.data.s; // e.g. BTCUSDT, ETHUSDT
                    const price = parseFloat(message.data.c);
                    
                    // Simple heuristic to strip USDT and get the base asset
                    // This works for BTCUSDT -> BTC. 
                    const symbol = pair.replace('USDT', '');
                    
                    setPrices(prev => ({
                        ...prev,
                        [symbol]: price
                    }));
                }
            } catch (error) {
                console.error('Error parsing price update:', error);
            }
        };

        socket.onerror = (error) => {
            console.error('Biance WebSocket Error:', error);
        };

        return () => {
            socket.close();
        };
    }, [uniqueAssets, normalizedOverrides]);

    return useMemo(() => ({
        ...prices,
        ...normalizedOverrides,
    }), [prices, normalizedOverrides]);
}
