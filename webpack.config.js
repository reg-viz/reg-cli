const path = require('path');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

module.exports = {
  entry: {
    build: './report/src/main.js',
    worker: './report/src/worker-main.js',
  },
  output: {
    path: path.join(__dirname, '/report/dist'),
    publicPath: '/static',
    filename: '[name].js'
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
