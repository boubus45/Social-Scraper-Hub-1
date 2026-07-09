// Local entry point wrapper so Metro generates a clean bundle URL
// (/entry.bundle) instead of the long pnpm content-addressable path
// (.../node_modules/.pnpm/expo-router@6.0.24_@types+react-dom...) which
// contains @ and + characters that break Android Expo Go's HTTP downloader.
import 'expo-router/entry';
