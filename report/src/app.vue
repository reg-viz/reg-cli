<template>
  <div class="test">
    {{page}}!!
    <sample-comp></sample-comp>
  </div>
</template>
<script>

const SampleComp = require('./views/SampleComp.vue');

module.exports = {
  name: 'App',
  components: {
    'sample-comp': SampleComp,
  },
  data: function () {
    return {
      page: 'about'
    }
  }
}
</script>

<style scoped>
.test {
  color: blue;
}
</style>
