// next.config.ts - Corrected Configuration
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
  
  // Server external packages (moved from experimental)
  serverExternalPackages: ['@google-cloud/vertexai', 'ws'],
  
  // Development environment support
  ...(process.env.NODE_ENV === 'development' && {
    allowedDevOrigins: [
      '*firebase.studio',
      '*.cloudworkstations.dev'
    ]
  }),

  // Experimental features (now empty, but keeping structure)
  experimental: {
    // Add any future experimental features here
  },

  // Disable webpack cache in development to prevent worker errors
  ...(process.env.NODE_ENV === 'development' && {
    webpack: (config: any) => {
      config.cache = false;
      return config;
    }
  })
}

export default nextConfig