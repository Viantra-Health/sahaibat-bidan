export default function OfflinePage() {
  return (
    <main style={{ padding: 24, maxWidth: 420, margin: '0 auto', minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Tidak ada sinyal</h1>
      <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.6, margin: 0 }}>
        Halaman ini belum tersimpan di perangkat. Data pemeriksaan yang sudah Anda
        isi <strong>tetap aman</strong> dan akan terkirim otomatis saat sinyal kembali.
      </p>
    </main>
  );
}
