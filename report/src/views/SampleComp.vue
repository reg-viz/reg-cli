<template>
  <div class="test">
    {{page}}!!
  </div>
</template>
<script>
module.exports = {
  name: 'SampleComp',
  data: () => {
    return {
      page: 'about'
    }
  }
}
</script>

<style scoped>
.test {
  color: red;
}
</style>