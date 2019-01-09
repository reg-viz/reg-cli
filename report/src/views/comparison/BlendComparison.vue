<template>
  <div class="blend" v-on:click.self="$emit('backgroundClicked')">
    <div class="ui secondary segment controls">
      <span v-on:click="blend=0">After</span>
      <input type="range" min="0" max="1" step="0.01" v-model="blend" />
      <span v-on:click="blend=1">Before</span>
    </div>
    <div class="images">
      <div class="image-with-markers actual" :style="actualImageStyle">
        <img :src="srcActual"/>
        <markers forActual :matching="matching"/>
      </div>
      <div class="image-with-markers expected" :style="expectedImageStyle">
        <img :src="srcExpected" />
        <markers forExpected :matching="matching"/>
      </div>
    </div>
  </div>
</template>

<script>

import Markers from './Markers.vue';

export default {
  name: 'BlendComparison',
  props: ['srcActual', 'srcExpected', 'matching'],
  components: {
    'markers': Markers,
  },
  data: function() {
    return {
      blend: 0.5
    }
  },
  computed: {
    actualImageStyle: function() {
      return {
        opacity: 1
      };
    },
    expectedImageStyle: function() {
      return {
        opacity: this.blend
      };
    },
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

.blend {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.controls {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  padding: 5px 0px;
  margin-bottom: 10px;
}

.controls span {
  padding: 0 15px;
  cursor: pointer;
  user-select: none;
}

.controls input {
  width: 200px;
}

.image-with-markers {
  line-height: 0;
}

.expected {
  position: relative;
  z-index: 20; /* Needed to display above the markers who have z-index: 10 */
}

.actual {
  position: absolute;
}

img {
  max-width: calc(50vw - 75px);
}
</style>
