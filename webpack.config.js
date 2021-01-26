/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack')
const Dotenv = require('dotenv-webpack')
const webpackMerge = require('webpack-merge')
const GitRevisionPlugin = require('git-revision-webpack-plugin')
const gitRevisionPlugin = new GitRevisionPlugin()

const libraryName = 'toky-sdk-alpha'

const modeConfig = (env, dotenv) =>
  require(`./build-utils/webpack.${env}`)(env, dotenv)

const getEnvFile = function (key) {
  const files = {
    master: '.env.prod',
    staging: '.env.staging',
    dev: '.env.dev',
    'dev-bundle': '.env.dev',
  }

  return files[key] || files.dev
}

module.exports = ({ mode, presets } = { mode: 'production', presets: [] }) => {
  const dotenv = new Dotenv({
    path: getEnvFile(gitRevisionPlugin.branch()),
  })

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
        dotenv,
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(mode),
          VERSION: JSON.stringify(gitRevisionPlugin.version()),
          COMMITHASH: JSON.stringify(gitRevisionPlugin.commithash()),
          BRANCH: JSON.stringify(gitRevisionPlugin.branch()),
        }),
        new webpack.ProgressPlugin(),
        new GitRevisionPlugin({
          branch: true,
        }),
      ],
      /**
       * SIP.js would be treated as a peer dependency
       * to reduce bundle size
       */
      // externals: ['sip.js'],
    },
    modeConfig(mode, dotenv)
  )
}
