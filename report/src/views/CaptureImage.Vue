<template>
  <div class="wrapper">
    <div class="image">
      <div class="ui label mini">{{kind}}</div>
      <div>
        <div class="bg" v-if="bg">
          <img v-lazy="bg" />
        </div>
        <img v-lazy="src" />
      </div>
    </div>
  </div>
</template>

<script>
module.exports = {
  name: 'CaptureImage',
  props: ['bg', 'kind', 'src'],
}
</script>

<style scoped>
img {
  max-width: 100%;
  border: solid 1px #f0f0f0;
  border-radius: 2px;
}

.image>div {
  position: relative;
}

.bg {
  position: absolute;
  opacity: 0.2;
}

.header {
  margin-bottom: 5px !important;
  font-weight: normal;
}

.label {
  border-radius: 2px 2px 0 0 !important;
  margin: 0 0 0 2px !important;
  padding: 5px 10px;
}
</style>
