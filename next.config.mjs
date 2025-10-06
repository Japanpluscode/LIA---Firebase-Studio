/** @type {import('next').NextConfig} */
const nextConfig = {
    devIndicators: {
        buildActivity: false
    },
    allowedDevOrigins: ["*.cluster-c36dgv2kibakqwbbbsgmia3fny.cloudworkstations.dev"],
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals.push('ws', '@google-cloud/vertexai');
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