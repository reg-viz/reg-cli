<template>
  <div class="gap">
    <div class="slide">
      <div class="labels" v-on:click.self="$emit('backgroundClicked')">
        <div class="ui secondary segment image-label">
          <span>After</span>
        </div>
        <div class="ui secondary segment image-label">
          <span>Before</span>
        </div>
      </div>
      <div class="images">
        <image-compare :before="srcActual" :after="srcExpected">
          <i class="small arrow left icon" aria-hidden="true" slot="icon-left"></i>
          <i class="small arrow right icon" aria-hidden="true" slot="icon-right"></i>
        </image-compare>
        <!-- TODO: We draw markers for both images because VueImageCompare can't slide through our markers -->
        <markers forActual :matching="matching"/>
        <markers forExpected :matching="matching"/>
      </div>
    </div>
  </div>
</template>

<script>

import Markers from './Markers.vue';

export default {
  name: 'SlideComparison',
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
}
</script>

<style scoped>

.slide {
  max-width: calc(50vw - 75px);
}

.labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.image-label {
  display: inline-block;
  margin: 0px;
  padding: 5px 10px;
  font-size: 12px;
}

.images {
  position: relative;
  user-select: none;
}

.images i {
  text-shadow: 0px 0px 2px black;
}

.gap {
  /* We need to add some padding to the left and right otherwise it's
  too easy to close the dialog when sliding to the extreme ends */
  padding: 0 100px;
}
</style>

<style>

.image-compare-handle {

  z-index: 20 !important; /* Needed to display above the markers who have z-index: 10 */
  
  width: 81px !important; /* Give the handle a wider grip area. */

  /* 
    Override the default handle so that it doesn't become invisible with a white background.
    This gives us a 3px white, black, white pattern, with transparency on either side 
  */
  background: linear-gradient(
    to right,
    transparent 0,
    transparent 39px,
    rgba(255, 255, 255, 0.5) 39px,
    rgba(255, 255, 255, 0.5) 40px,
    #000 40px,
    #000 41px,
    rgba(255, 255, 255, 0.5) 41px,
    rgba(255, 255, 255, 0.5) 42px,
    transparent 42px
  ) !important;
}
</style>