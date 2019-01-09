<template>
  <div class="toggle" v-on:click="toggleImages" v-on:click.self="$emit('backgroundClicked')">
    <div class="ui secondary segment image-label">
      <span v-if="showActual">After</span>
      <span v-if="showExpected">Before</span>
    </div>
    <div class="image-with-markers" v-if="showActual">
      <img :src="srcActual"/>
      <markers forActual :matching="matching"/>
    </div>
    <div class="image-with-markers" v-if="showExpected">
      <img :src="srcExpected" />
      <markers forExpected :matching="matching"/>
    </div>
  </div>
</template>

<script>

import Markers from './Markers.vue';

export default {
  name: 'ToggleComparison',
  props: ['srcActual', 'srcExpected', 'matching'],
  components: {
    'markers': Markers,
  },
  data: function() {
    return {
      showActual: true,
      showExpected: false,
    }
  },
  methods: {
    toggleImages: function() {
      this.showActual = !this.showActual;
      this.showExpected = !this.showActual;
    }
  }
}
</script>

<style scoped>
.toggle {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  user-select: none;
}

.image-label {
  cursor: pointer;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  padding: 5px 15px;
  margin-bottom: 10px;
}

.image-with-markers {
  position: relative;
  line-height: 0;
}

img {
  cursor: pointer;
  max-width: calc(50vw - 75px);
}
</style>
