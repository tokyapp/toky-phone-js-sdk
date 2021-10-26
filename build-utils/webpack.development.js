/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin

module.exports = () => {
  return {
    plugins: [
      new BundleAnalyzerPlugin({ analyzerPort: 8889, openAnalyzer: false }),
      new HtmlWebpackPlugin({
        // target template to copy the structure from
        template: 'example/template.html',
        // insert the bundle to the head so we can run the initialization script after it
        inject: 'head',
        // used for cache refreshing
        hash: true,
      }),
      new ForkTsCheckerWebpackPlugin({
        async: true,
      }),
    ],
    devServer: {
      // since our index.html is located in the dist folder, we need to provide different content bases
      static: {
        directory: path.join(__dirname, '../example/'),
        watch: true,
      },
      compress: true,
      port: 8080,
      hot: true,
      open: true,
    },
  }
}
