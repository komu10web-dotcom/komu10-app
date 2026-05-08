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
      {
        source: '/themoneybook-s94-archive',
        destination: '/themoneybook-s94-archive.html',
      },
    ];
  },
};

module.exports = nextConfig;
