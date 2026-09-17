import './globals.css';
import type { Metadata, Viewport } from 'next';
import PasscodeGate from '@/components/PasscodeGate';
import SyncDaemon from '@/components/SyncDaemon';
import { C } from '@/components/ui';

export const metadata: Metadata = {
  title: 'SahAIbat Bidan',
  description: 'Dokumentasi ANC & PNC — bekerja tanpa sinyal',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Bidan' },
  // iOS ignores the manifest icons and reads this instead, which is why an
  // iPhone home screen otherwise shows a screenshot of the page.
  icons: {
    icon: [{ url: '/icons/icon-192.png?v=2', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png?v=2', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#8C2F4A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, background: C.bg, color: C.white,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased', minHeight: '100dvh' }}>
        {/* Wraps everything rather than living at a route: a lock you can
            navigate around by typing a URL is not a lock, and a shared
            handset is the whole reason this exists. */}
        {/* Outside the gate on purpose: queued visits must upload whether the
            app is locked, unlocked, or signed out. See SyncDaemon. */}
        {/* Before React hydrates, or a midwife who chose dark gets a white
            flash on every launch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('sahaibat_bidan_theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}`,
          }}
        />
        <SyncDaemon />
        <PasscodeGate>{children}</PasscodeGate>
      </body>
    </html>
  );
}
