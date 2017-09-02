/* @flow */

const red = '\u001b[31m';
const green = '\u001b[32m';
const yellow = '\u001b[33m';
const blue = '\u001b[34m';
const cyan = '\u001b[36m';
const reset = '\u001b[0m';


export default {
  info(text: string) {
    console.log(`${cyan}${text}${reset}`);
  },
  warn(text: string) {
    console.log(`${yellow}${text}${reset}`);
  },
  success(text: string) {
    console.log(`${green}${text}${reset}`);
  },
  fail(text: string) {
    console.log(`${red}${text}${reset}`);
  },
};
