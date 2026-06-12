const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

// RN 0.81 @flow sources default to the Hermes parser, which leaves #private fields
// in the bundle. Expo Go 54's Hermes cannot parse those — Babel must lower them.
config.transformer.hermesParser = false;

module.exports = config;
