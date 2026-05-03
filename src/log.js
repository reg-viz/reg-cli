/* @flow */

const chalk = require('chalk');

export default {
  info(text: string) {
    console.log(chalk.cyan(text));
  },
  warn(text: string) {
    console.log(chalk.gray(text));
  },
  success(text: string) {
    console.log(chalk.green(text));
  },
  fail(text: string) {
    console.log(chalk.red(text));
  },
};
