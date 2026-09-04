import type { Metadata, Viewport } from 'next';

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
        {children}
      </body>
    </html>
  );
}
