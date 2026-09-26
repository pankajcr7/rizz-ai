// Extends app.json. Test builds talk to a local http:// backend, so they need
// cleartext traffic; production builds must use https and keep it off.
module.exports = ({ config }) => {
  const isProduction = process.env.EAS_BUILD_PROFILE === "production";
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: !isProduction } }],
    ],
  };
};
