const log = require('loglevel');
const black   = '\u001b[30m';
const red     = '\u001b[31m';
const green   = '\u001b[32m';
const yellow  = '\u001b[33m';
const blue    = '\u001b[34m';
const magenta = '\u001b[35m';
const cyan    = '\u001b[36m';
const white   = '\u001b[37m';
const reset   = '\u001b[0m';

log.setLevel('debug');

module.exports = {
  ...log,
  info(text) {
    log.info(`${cyan}${text}${reset}`);
  },
  warn(text) {
    log.info(`${yellow}${text}${reset}`);
  },
  success(text) {
    log.info(`${green}${text}${reset}`);
  },
  fail(text) {
    log.info(`${red}${text}${reset}`);
  },
};
