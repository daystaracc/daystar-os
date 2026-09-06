import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Noto_Sans_TC } from 'next/font/google';
import { getLocale } from '@/lib/i18n/server';
import '@/styles/globals.css';

const notoTC = Noto_Sans_TC({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-noto-tc', display: 'swap' });

export const metadata: Metadata = { title: { default: 'DAYSTAR OS', template: '%s · DAYSTAR OS' }, description: 'Business Operating System' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === 'en' ? 'en' : 'zh-Hant'} className={`${GeistSans.variable} ${GeistMono.variable} ${notoTC.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
