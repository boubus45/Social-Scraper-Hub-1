const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// In a pnpm monorepo Metro follows symlinks to their real content-addressable
// paths (e.g. node_modules/.pnpm/expo-router@6.0.24_@types+react-dom…/…/entry).
// Those paths contain @ and + characters that break Android's HTTP client when
// they appear in the bundle download URL.  Enabling symlink support makes Metro
// treat the symlink itself as the canonical path, so the URL stays short and
// Android-safe (node_modules/expo-router/entry.bundle instead of the long hash).
config.resolver.unstable_enableSymlinks = true;

// Make sure Metro can watch and resolve packages from both the artifact root
// and the workspace root (where pnpm hoists shared deps).
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
