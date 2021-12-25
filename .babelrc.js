const targets = {
  node: 'current',
  browsers: [
    'last 4 Chrome versions',
    'last 4 Edge versions',
    'last 4 Firefox versions',
    'last 4 iOS versions',
    'last 4 Opera versions',
    'last 4 Safari versions',
    'last 4 Samsung versions',
  ],
}

module.exports = {
  presets: ['@babel/preset-typescript'],
  env: {
    development: {
      presets: [
        [
          '@babel/preset-env',
          {
            loose: true,
            modules: 'commonjs',
            targets,
          },
        ],
      ],
    },
    rollup: {
      presets: [
        [
          '@babel/preset-env',
          {
            loose: true,
            modules: false,
            targets,
          },
        ],
      ],
    },
    esm: {
      presets: [
        [
          '@babel/preset-env',
          {
            loose: true,
            modules: false,
            targets,
          },
        ],
      ],
    },
  },
}