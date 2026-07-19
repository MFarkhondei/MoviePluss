export const metadata = {
  title: 'پخش‌کننده با زیرنویس خودکار',
  description: 'پخش فیلم/صوت با زیرنویس انگلیسی و فارسی + تکرار خودکار',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
