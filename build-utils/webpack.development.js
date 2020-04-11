/* eslint-disable @typescript-eslint/no-var-requires */
const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')

module.exports = () => ({
  plugins: [
    new HtmlWebpackPlugin({
      // target template to copy the structure from
      template: 'public/template.html',
      // insert the bundle to the head so we can run the initialization script after it
      inject: 'head',
      // used for cache refreshing
      hash: true,
    }),
  ],
  devServer: {
    // since our index.html is located in the dist folder, we need to provide different content bases
    contentBase: ['public/'],
    port: 8080,
    publicPath: 'http://localhost:8080/',
    hot: true,
  },
})
