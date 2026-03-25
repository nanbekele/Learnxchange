/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow accessing `next dev` via tunnel domains (e.g. ngrok) during development.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.dev", "*.ngrok-free.dev"],
};

export default nextConfig;
