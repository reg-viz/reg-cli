<template>
  <div class="sideBySide">
    <div class="labels" v-on:click.self="$emit('backgroundClicked')">
      <div class="ui secondary segment image-label actual">
        After
      </div>
      <div class="ui secondary segment image-label expected">
        Before
      </div>
    </div>
    <div class="images" v-on:click.self="$emit('backgroundClicked')">
      <div class="image-with-markers" v-on:mousemove="onMouseMove($event, 'left')" v-on:mouseleave="hideMice">
        <img :src="srcActual" />
        <markers :matching="matching" forActual />
        <div class="left mouse" :style="leftMouseStyle">
          <i class="large mouse pointer icon"></i>
        </div>
      </div>
      <div class="image-with-markers" v-on:mousemove="onMouseMove($event, 'right')" v-on:mouseleave="hideMice">
        <img :src="srcExpected" />
        <markers :matching="matching" forExpected/>
        <div class="right mouse" :style="rightMouseStyle">
          <i class="large mouse pointer icon"></i>
        </div>
      </div>
    </div>
  </div>
</template>

<script>

import Markers from './Markers.vue';

const px = function(val) {
  return val + 'px';
}

const visibleStyle = {
  visibility: 'visible'
}

const invisibleStyle = {
  visibility: 'hidden'
}

export default {
  name: 'SideBySideComparison',
  props: ['srcActual', 'srcExpected', 'matching'],
  components: {
    'markers': Markers,
  },
  data: function() {
    return {
      leftMouseStyle: {
        visibility: 'hidden'
      },
      rightMouseStyle: {
        visibility: 'hidden'
      }
    }
  },
  methods: {
    onMouseMove: function(e, movedOverImage) {
      const clientRect = e.currentTarget.getBoundingClientRect();
      const relativeMousePos = {
        top: px(e.clientY - clientRect.top),
        left: px(e.clientX - clientRect.left),
      };

      if(movedOverImage === 'left') {
        this.leftMouseStyle = invisibleStyle;
        this.rightMouseStyle = Object.assign({}, visibleStyle, relativeMousePos);
      } else {
        this.leftMouseStyle = Object.assign({}, visibleStyle, relativeMousePos);
        this.rightMouseStyle = invisibleStyle;
      }
    },
    hideMice: function() {
        this.leftMouseStyle = invisibleStyle;
        this.rightMouseStyle = invisibleStyle;
    }
  },
}
</script>

<style scoped>
.labels {
  display: flex;
  justify-content: space-around;
  margin-bottom: 10px;
}

.image-label {
  display: inline-block;
  margin: 0px;
  padding: 5px 10px;
  font-size: 12px;
}

.image-label:first-child {
  margin-right: 30px;
}

.images {
  display: flex;
}

.image-with-markers {
  position: relative;
}

.image-with-markers:first-child {
  margin-right: 30px;
}

img {
  max-width: calc(50vw - 75px);
}

.left.mouse, .right.mouse {
  position: absolute;
  text-shadow: 0 0 2px #FFF;
  z-index: 20; /* Needed to display above the markers who have z-index: 10 */
}

.left.mouse > i,
.right.mouse > i {
  position: relative;
  left: -3px;
}
</style>
