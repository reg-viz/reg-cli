import Vue from 'vue';
import VueLazyload from 'vue-lazyload';
import VueThinModal from 'vue-thin-modal'

const App = require('./App.vue');

Vue.use(VueThinModal);
Vue.use(VueLazyload, {
  preLoad: 1.3,
  loading: 'assets/image.png',
  error: 'assets/image.png',
});

new Vue({
  el: '#app',
  render: h => h(App),
});
