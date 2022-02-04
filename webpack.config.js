/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')
const webpack = require('webpack')
const Dotenv = require('dotenv-webpack')
const { merge } = require('webpack-merge')
const { GitRevisionPlugin } = require('git-revision-webpack-plugin')
const gitRevisionPlugin = new GitRevisionPlugin()
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const libraryName = 'toky-sdk-alpha'

const modeConfig = (env) =>
  require(`./build-utils/webpack.${env}`)()

const getEnvFile = function (key) {
  const files = {
    master: '.env.prod',
    main: '.env.prod',
    staging: '.env.staging',
    dev: '.env.dev',
    'dev-bundle': '.env.dev',
  }

  return files[key] || files.dev
}

module.exports = (env, argv) => {
  const mode = argv.mode

  const envFilePath = path.resolve(__dirname, getEnvFile(gitRevisionPlugin.branch()))
  const dotenv = new Dotenv({
    path: envFilePath,
    allowEmptyValues: true,
  })

  return merge(
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
          {
            test: /\.m?js$/,
            resolve: {
              fullySpecified: false, // solve SIP.JS import problems
            },
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
          LASTCOMMITDATETIME: JSON.stringify(gitRevisionPlugin.lastcommitdatetime()),
        }),
        new webpack.ProgressPlugin(),
        new GitRevisionPlugin({
          branch: true,
          versionCommand: 'describe --always --tags',
        }),
        new CleanWebpackPlugin({
          protectWebpackAssets: false,
          cleanAfterEveryBuildPatterns: ['*.LICENSE.txt'],
        }),
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
