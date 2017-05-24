import Vue from 'vue';
import VueLazyload from 'vue-lazyload';

const App = require('./app.vue');

Vue.use(VueLazyload, {
  preLoad: 1.3,
  loading: 'assets/image.png',
  error: 'assets/image.png',
  adapter: {
    loaded({ bindType, el, naturalHeight, naturalWidth, $parent, src, loading, error, Init }) {
      console.log('loaded')
    },
    loading(listender, Init) {
      console.log('loading')
    },
    error(listender, Init) {
      console.log('error')
    }
  }
});

new Vue({
  el: '#app',
  render: h => h(App),
});
