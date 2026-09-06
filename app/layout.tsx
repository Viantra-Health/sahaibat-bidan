import type { Metadata, Viewport } from 'next';
import PasscodeGate from '@/components/PasscodeGate';

export const metadata: Metadata = {
  title: 'SahAIbat Bidan',
  description: 'Dokumentasi ANC & PNC — bekerja tanpa sinyal',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Bidan' },
};

export const viewport: Viewport = {
  themeColor: '#0D1F1C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, background: '#0D1F1C', color: '#fff',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased', minHeight: '100dvh' }}>
        {/* Wraps everything rather than living at a route: a lock you can
            navigate around by typing a URL is not a lock, and a shared
            handset is the whole reason this exists. */}
        <PasscodeGate>{children}</PasscodeGate>
      </body>
    </html>
  );
}
