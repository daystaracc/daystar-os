import type { NextConfig } from 'next';
// bodySizeLimit covers the raw CSV text sent to server actions like
// revenue/import's importShowmoreOrders/importShowmoreCustomers — those
// intentionally take the *complete* order history (see actions.ts's own doc
// comments), which only grows over time and blew past the previous 2mb cap
// with real data (2026-09-14: ~7k orders, multi-line rows). Set generously
// above what a full order-history export needs, with room to grow.
const nextConfig: NextConfig = { reactStrictMode: true, experimental: { serverActions: { bodySizeLimit: '15mb' } } };
export default nextConfig;
