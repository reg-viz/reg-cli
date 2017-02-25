const red = '\u001b[31m';
const green = '\u001b[32m';
const yellow = '\u001b[33m';
const blue = '\u001b[34m';
const cyan = '\u001b[36m';
const reset = '\u001b[0m';


module.exports = {
  info(text) {
    console.log(`${cyan}${text}${reset}`);
  },
  warn(text) {
    console.log(`${yellow}${text}${reset}`);
  },
  success(text) {
    console.log(`${green}${text}${reset}`);
  },
  fail(text) {
    console.log(`${red}${text}${reset}`);
  },
};
