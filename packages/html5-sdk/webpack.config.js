const webpack = require('webpack');
const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const pkg = require('./package.json');

const BANNER = `
/**
 * ${pkg.name} - ${pkg.description}
 * @version ${pkg.version}
 * @author ${pkg.author.name}
 * @license ${pkg.license}
 */
`;

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, pkg.main),
  output: {
    filename: `${pkg.name}-${pkg.version}.js`,
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: 'Kinvey'
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  plugins: [
    new CleanWebpackPlugin(),
    new webpack.BannerPlugin({
      banner: BANNER,
      raw: true
    })
  ]
};
