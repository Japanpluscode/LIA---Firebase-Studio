/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // ADD THIS - critical for Docker
  reactStrictMode: false, // ADD THIS - fixes double-click issue
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle Firebase Admin SDK in the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
};

export default nextConfig;