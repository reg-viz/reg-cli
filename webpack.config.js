const path = require('path');

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
        use: ["vue-loader"]
      }
    ]
  },
  devServer: {
    contentBase: './report',
    port: 5555
  },
};
