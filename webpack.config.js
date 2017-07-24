const path = require('path');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  entry: './report/src/main.js',
  output: {
    path: path.join(__dirname, '/report/dist'),
    publicPath: '/static',
    filename: 'build.js'
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        use: ["vue-loader"],
      },
      {
        test: /\.js$/,
        use: "babel-loader",
        include: [path.resolve(__dirname, 'report/src')]
      },
      {
        test: /\.(svg)$/,
        use: ["url-loader"],
      },
    ]
  },
  devServer: {
    contentBase: './report',
    port: 5555
  },
  plugins: [
    new UglifyJSPlugin()
  ]
}
