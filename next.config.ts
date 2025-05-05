import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export', // Export as static site
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // When using static export, the default loader is suboptimal.
    // Using 'imgix', 'cloudinary', or 'akamai' is recommended for production.
    // For simplicity here, we'll disable optimization, but consider a provider.
    unoptimized: true,
    // remotePatterns are not needed for unoptimized images, but keeping for potential future use
    // remotePatterns: [
    //   {
    //     protocol: 'https',
    //     hostname: 'picsum.photos',
    //     port: '',
    //     pathname: '/**',
    //   },
    // ],
  },
  // Ensure trailing slashes are not added to URLs, common for static exports
  trailingSlash: false,
};

export default nextConfig;
