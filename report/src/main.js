import Vue from 'vue';
import VueLazyload from 'vue-lazyload';
import VueThinModal from 'vue-thin-modal'

const App = require('./App.vue');

Vue.use(VueThinModal);
Vue.use(VueLazyload, {
  preLoad: 1.3,
  loading: 'https://github.com/bokuweb/reg-cli/blob/master/docs/image.png?raw=true',
  error: 'https://github.com/bokuweb/reg-cli/blob/master/docs/image.png?raw=true',
});

new Vue({
  el: '#app',
  render: h => h(App),
});
