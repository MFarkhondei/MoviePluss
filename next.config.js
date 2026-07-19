/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // خروجی استاتیک (اختیاری)
  reactStrictMode: true,
  // این بخش برای پشتیبانی از WebAssembly در مرورگر ضروری است
  experimental: {
    // اگر از Next.js 13+ استفاده می‌کنید
    webpackBuildWorker: true,
  },
  // برای اینکه مطمئن شویم WASM فایل‌ها به درستی سرو می‌شوند
  webpack: (config, { isServer }) => {
    // فقط در سمت کلاینت، اجازه بارگذاری فایل‌های WASM را بده
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
