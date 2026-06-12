module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // hermes-stable leaves native #private fields in the bundle; Expo Go 54's
          // Hermes rejects them at runtime. Use the full profile so Babel lowers them.
          native: {
            unstable_transformProfile: 'default',
          },
        },
      ],
    ],
  };
};
