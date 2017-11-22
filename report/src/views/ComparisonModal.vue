<template>
  <div>
    <modal name="comparison">
      <div class="wrapper">
        <div class="modal">
          <div class="markers-area">
            <img :src="srcActual" />
            <div v-if="matching">
              <div class="markers" v-for="m in matching.matches">
                <div class="rect bounding" v-bind:style="{ left: sx1(m[0].bounding), top: sy1(m[0].bounding), width: sw1(m[0].bounding), height: sh1(m[0].bounding) }"></div>
                <div v-for="r in m[0].diffMarkers">
                  <div class="rect diff" v-bind:style="{ left: sx1(r), top: sy1(r), width: sw1(r), height: sh1(r) }"></div>
                </div>
              </div>
              <div v-for="r in matching.strayingRects[0]">
                <div class="rect straying" v-bind:style="{ left: sx1(r), top: sy1(r), width: sw1(r), height: sh1(r) }"></div>
              </div>
            </div>
          </div>
          <div class="markers-area">
            <img :src="srcExpected" />
            <div v-if="matching">
              <div class="markers" v-for="m in matching.matches">
                <div class="rect bounding" v-bind:style="{ left: sx1(m[1].bounding), top: sy1(m[1].bounding), width: sw1(m[1].bounding), height: sh1(m[1].bounding) }"></div>
                <div v-for="r in m[1].diffMarkers">
                  <div class="rect diff" v-bind:style="{ left: sx2(r), top: sy2(r), width: sw2(r), height: sh2(r) }"></div>
                </div>
              </div>
              <div v-for="r in matching.strayingRects[1]">
                <div class="rect straying" v-bind:style="{ left: sx2(r), top: sy2(r), width: sw2(r), height: sh2(r) }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </modal>
  </div>
</template>

<script>
module.exports = {
  name: 'ComparisonModal',
  props: ['srcActual', 'srcExpected', 'matching'],
  computed: {
    w1: function () {
      return this.matching ? this.matching.images[0].width : 100;
    },
    w2: function () {
      return this.matching ? this.matching.images[1].width : 100;
    },
    h: function () {
      return this.matching ? Math.max(this.matching.images[0].height, this.matching.images[1].height) : 100;
    },
  },
  methods: {
    sx1: function(rect) {
      return `${rect.x / this.w1 * 100}%`;
    },
    sy1: function(rect) {
      return `${rect.y / this.h * 100}%`;
    },
    sw1: function(rect) {
      return `${rect.width / this.w1 * 100}%`;
    },
    sh1: function(rect) {
      return `${rect.height / this.h * 100}%`;
    },
    sx2: function(rect) {
      return `${rect.x / this.w2 * 100}%`;
    },
    sy2: function(rect) {
      return `${rect.y / this.h * 100}%`;
    },
    sw2: function(rect) {
      return `${rect.width / this.w2 * 100}%`;
    },
    sh2: function(rect) {
      return `${rect.height / this.h * 100}%`;
    },
  }
}
</script>

<style scoped>
.wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px;
  font-size: 0;
}

.modal {
  display: flex;
}

.modal > *:first-child {
  margin-right: 30px;
}

img {
  max-width: calc(50vw - 75px);
}

.markers-area {
  position: relative;
  line-height: 0;
}

.markers {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
}

.rect {
  position: absolute;
  outline: 2px solid currentColor;
}

.rect.bounding {
  outline-width: 1px;
  color: #4183C4;
}

.rect.diff {
  color: #DB2828;
}

.rect.straying {
  color: #B413EC;
}
</style>
