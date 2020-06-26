/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack')
const Dotenv = require('dotenv-webpack')
const webpackMerge = require('webpack-merge')

const libraryName = 'toky-sdk-alpha'

const modeConfig = (env) => require(`./build-utils/webpack.${env}`)(env)

module.exports = ({ mode, presets } = { mode: 'production', presets: [] }) => {
  return webpackMerge(
    {
      target: 'web',
      mode,
      entry: __dirname + '/src/index.ts',
      output: {
        path: __dirname + '/dist',
        filename: libraryName + '.js',
        library: 'TokySDK',
        libraryTarget: 'umd',
        libraryExport: 'default',
        globalObject: 'this',
      },
      module: {
        rules: [
          {
            test: /\.(ts|js)x?$/,
            loader: 'babel-loader',
            exclude: /node_modules/,
          },
        ],
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json', 'jsx'],
      },
      plugins: [
        new Dotenv(),
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(mode),
        }),
        new webpack.ProgressPlugin(),
      ],
      /**
       * SIP.js would be treated as a peer dependency
       * to reduce bundle size
       */
      // externals: ['sip.js'],
    },
    modeConfig(mode)
  )
}
