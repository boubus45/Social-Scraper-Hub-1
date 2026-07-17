const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep the project root as the artifact directory so Metro generates clean
// bundle URLs (e.g. /entry.bundle) rather than long pnpm content-addressable
// paths (/node_modules/.pnpm/expo-router@6.0.24_@types+react-dom…) which
// contain @ and + characters that break Android Expo Go's HTTP downloader.
// The local ./entry.js wrapper (package.json "main") is what keeps the URL short.

module.exports = config;
