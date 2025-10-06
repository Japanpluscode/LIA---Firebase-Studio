
/** @type {import('next').NextConfig} */
const nextConfig = {
    devIndicators: {
        buildActivity: false
    },
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals.push('ws', '@google-cloud/vertexai');
        }
        return config;
    },
    experimental: {
      allowedDevOrigins: ["*.cluster-c36dgv2kibakqwbbbsgmia3fny.cloudworkstations.dev"]
    }
};

export default nextConfig;
