// Extends app.json. Test builds talk to a local http:// backend, so they need
// cleartext traffic; production builds must use https and keep it off.
module.exports = ({ config }) => {
  const isProduction = process.env.EAS_BUILD_PROFILE === "production";
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: !isProduction,
            // Real phones are ARM; dropping x86/x86_64 (emulator-only) cuts the APK size by ~40%.
            buildArchs: ["armeabi-v7a", "arm64-v8a"],
          },
        },
      ],
    ],
  };
};
