// require('browser-env')();
const hooks = require('require-extension-hooks');
const Vue = require('vue');
const VueLazyload = require('vue-lazyload');
const VueThinModal = require('vue-thin-modal');

Vue.use(VueThinModal);
Vue.use(VueLazyload, {
    preLoad: 1.3,
});

// Setup Vue.js to remove production tip
Vue.config.productionTip = false;

// Setup vue files to be processed by `require-extension-hooks-vue`
hooks('vue').plugin('vue').push();
// Setup vue and js files to be processed by `require-extension-hooks-babel`
hooks(['vue', 'js']).plugin('babel').push();
