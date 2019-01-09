<template>
  <div>
    <modal name="comparison" disable-backdrop>
      <div class="wrapper" v-on:click.self="closeModal">
        <div class="comparisonModes">
          <comparisonModeSwitcher v-bind:comparisonModes="comparisonModes" v-model="currentComparisonMode" v-on:input="saveComparisonMode"/>
        </div>
        <div class="comparison" v-on:click.self="closeModal">
          <component v-bind:is="currentComparisonMode" v-bind="comparisonProps" v-on:backgroundClicked="closeModal"/>
        </div>
      </div>
    </modal>
  </div>
</template>

<script>

import ComparisonModeSwitcher from './ComparisonModeSwitcher.vue';
import SideBySideComparison from './comparison/SideBySideComparison.vue';
import SlideComparison from './comparison/SlideComparison.vue';
import BlendComparison from './comparison/BlendComparison.vue';
import ToggleComparison from './comparison/ToggleComparison.vue';

export default {
  name: 'ComparisonModal',
  props: ['srcActual', 'srcExpected', 'matching'],
  components: {
    'comparisonModeSwitcher': ComparisonModeSwitcher,
    // These components names must match comparisonMode IDs
    'sideBySide': SideBySideComparison,
    'slide': SlideComparison,
    'blend': BlendComparison,
    'toggle': ToggleComparison,
  },
  data: function() {
    return {
      comparisonModes: {
        sideBySide: 'Side-by-side',
        slide: 'Slide',
        blend: 'Blend',
        toggle: 'Toggle',
      },
      currentComparisonMode: 'sideBySide'
    }
  },
  computed: {
    comparisonProps: function() {
      return {
        srcActual: this.srcActual,
        srcExpected: this.srcExpected,
        matching: this.matching,
      }
    },
  },
  mounted: function() {
    this.loadComparisonMode();
  },
  methods: {
    closeModal: function(event) {
      this.$modal.pop();
    },
    loadComparisonMode: function() {
      const storedComparisonMode = window.localStorage.getItem('reg-cli-comparisonMode');
      if(Object.keys(this.comparisonModes).indexOf(storedComparisonMode) > -1) {
        this.currentComparisonMode = storedComparisonMode;
      }
    },
    saveComparisonMode: function() {
      window.localStorage.setItem('reg-cli-comparisonMode', this.currentComparisonMode);
    },
  },
}
</script>

<style scoped>
.wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* font-size: 0; */ /* TODO: Why was this needed? */
  padding: 20px 60px;
  height: 100%;
  pointer-events: all;
}

.comparisonModes {
  display: inline-block;
  margin-bottom: 10px;
}
</style>
