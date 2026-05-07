/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // s94: THE MONEY BOOK ブランド体験ページ(public/themoneybook.html)を /themoneybook で配信
  async rewrites() {
    return [
      {
        source: '/themoneybook',
        destination: '/themoneybook.html',
      },
    ];
  },
};

module.exports = nextConfig;
