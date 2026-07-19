export const metadata = {
  title: 'فیلم پلاس | MoviePluss',
  description: 'پخش فیلم/صوت با زیرنویس خودکار انگلیسی و فارسی + تکرار خودکار',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
