<template>
  <div class="wrapper">
    <div class="main-header">
      <div class="logo">REG</div>
      <div>
        <a href="https://github.com/bokuweb/reg-cli">
          <i class="ui icon github big"></i>
        </a>
        <div class="ui input mini icon">
          <input type="text" placeholder="Search..." v-model="search">
          <i class="ui icon search"></i>
          {{search}}
        </div>
      </div>
    </div>
    <div class="content">
      <h3 class="ui header items-header red" v-if="failedItems.length">
        Changed items
        <span class="items-header-sub">{{failedItems.length}} items chaged.</span>
      </h3>
      <div class="items" v-for="item in failedItems">
        <a :href="item.encoded" class="ui link red">
          <i class="ui icon remove"></i>{{item.raw}}
        </a>
        <div class="captures">
          <capture-image class="capture" :src="diffDir + item.raw" :kind="'Diff'"></capture-image>
          <capture-image class="capture" :src="actualDir + item.raw" :kind="'After'"></capture-image>
          <capture-image class="capture" :src="expectedDir + item.raw" :kind="'Before'"></capture-image>
        </div>
      </div>
      <h3 class="ui header items-header green" v-if="passedItems.length">
        Passed items
      </h3>
      <div class="captures" v-for="item in passedItems">
        <capture-image class="capture" :kind="'After'"></capture-image>
      </div>
      <h3 class="ui header items-header grey" v-if="newItems.length">
        New items
      </h3>
      <div class="captures" v-for="item in newItems">
        <capture-image class="capture" :kind="'After'"></capture-image>
      </div>
      <h3 class="ui header items-header grey" v-if="deletedItems.length">
        Removed items
      </h3>
      <div class="captures" v-for="item in deletedItems">
        <capture-image class="capture" :kind="'Before'"></capture-image>
      </div>
    </div>
  </div>
</template>

<script>
const CaptureImage = require('./views/CaptureImage.vue');

module.exports = {
  name: 'App',
  components: {
    'capture-image': CaptureImage,
  },
  data: () => ({
    ...window['__reg__'],
    failedItems: window['__reg__'].failedItems.filter(item => {
      return true;
    }),
    search: "",
  }),
}
</script>

<style scoped>
.main-header {
  width: 100%;
  height: 50px;
  padding: 0 30px;
  border-bottom: solid 1px #F5F2F0;
  position: fixed;
  display: flex;
  align-items: center;
  background: #fcfcfc;
  justify-content: space-between;
  top: 0;
}

a>i.github {
  font-size: 28px;
  margin: 0 20px 0;
  color: #333;
}

.items-header {
  padding: 30px 0 20px;
  color: #333;
  font-weight: normal;
}

.items-header-sub {
  font-size: 12px;
  font-weight: normal;
  margin-left: 15px;
  color: #666;
}

.input {
  height: 28px;
  width: 240px;
}

.content {
  margin-top: 50px;
  padding: 0 30px;
}

.capture {
  flex-basis: 30%;
}

.link {
  color: #DB2828;
  font-size: 15px;
}

.captures {
  display: flex;
  justify-content: space-between;
  margin: 15px 0 40px;
}

.logo {
  font-size: 24px;
  font-family: 'Dosis', sans-serif;
  font-weight: bold;
  line-height: 40px;
  color: #333;
}
</style>
