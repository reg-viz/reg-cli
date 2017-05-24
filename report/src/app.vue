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
        </div>
      </div>
    </div>
    <div class="backdrop" v-if="isModalOpen" @click="close"></div>
    <div class="content">
      <div class="not-found" v-if="isNotFound">
        <div>
          Items not found
        </div>
      </div>
  
      <h3 class="ui header items-header red" v-if="failedItems.length">
        Changed items
        <span class="items-header-sub" v-on:click="showChangedItemSummary = !showChangedItemSummary">
          {{failedItems.length}} chaged items.
          <i :class="showChangedItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
        </span>
      </h3>
      <div class="summary" v-if="showChangedItemSummary">
        <a :href="'#' + item.encoded" class="ui link red" v-for="item in failedItems">
          <i class="ui icon remove"></i>{{item.raw}}
        </a>
      </div>
      <div class="items" v-for="item in failedItems">
        <a :href="'#' + item.encoded" :id="'#' + item.encoded" class="ui link red">
          <i class="ui icon remove"></i>{{item.raw}}
        </a>
        <div class="captures">
          <div class="capture" v-on:click="open(diffDir + item.raw, actualDir + item.raw)">
            <capture-image :src="diffDir + item.raw" :bg="actualDir + item.raw" :kind="'Diff'"></capture-image>
          </div>
          <div class="capture" v-on:click="open(actualDir + item.raw)">
            <capture-image :src="actualDir + item.raw" :kind="'After'"></capture-image>
          </div>
          <div class="capture" v-on:click="open(expectedDir + item.raw)">
            <capture-image :src="expectedDir + item.raw" :kind="'Before'"></capture-image>
          </div>
        </div>
      </div>
  
      <h3 class="ui header items-header green" v-if="passedItems.length">
        Passed items
        <span class="items-header-sub" v-on:click="showPassedItemSummary = !showPassedItemSummary">
          {{passedItems.length}} passed items.
          <i :class="showPassedItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
        </span>
      </h3>
      <div class="summary" v-if="showPassedItemSummary">
        <a :href="'#' + item.encoded" class="ui link green" v-for="item in passedItems">
          <i class="ui icon Checkmark"></i>{{item.raw}}
        </a>
      </div>
      <div class="items" v-for="item in passedItems">
        <a :href="'#' + item.encoded" :id="'#' + item.encoded" class="ui link green">
          <i class="ui icon Checkmark"></i>{{item.raw}}
        </a>
        <div class="captures">
          <div class="capture" v-on:click="open(actualDir + item.raw)">
            <capture-image :src="actualDir + item.raw" :kind="'Passed'"></capture-image>
          </div>
        </div>
      </div>
  
      <h3 class="ui header items-header grey" v-if="newItems.length">
        New items
        <span class="items-header-sub" v-on:click="showNewItemSummary = !showNewItemSummary">
          {{newItems.length}} new items.
          <i :class="showNewItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
        </span>
      </h3>
      <div class="summary" v-if="showNewItemSummary">
        <a :href="'#' + item.encoded" class="ui link grey" v-for="item in newItems">
          <i class="ui icon File Outline"></i>{{item.raw}}
        </a>
      </div>
      <div class="items" v-for="item in newItems">
        <a :href="'#' + item.encoded" :id="'#' + item.encoded" class="ui link grey">
          <i class="ui icon File Outline"></i>{{item.raw}}
        </a>
        <div class="captures">
          <div class="capture" v-on:click="open(actualDir + item.raw)">
            <capture-image :src="actualDir + item.raw" :kind="'New'"></capture-image>
          </div>
        </div>
      </div>
  
      <h3 class="ui header items-header grey" v-if="deletedItems.length">
        Deleted items
        <span class="items-header-sub" v-on:click="showDeletedItemSummary = !showDeletedItemSummary">
          {{deletedItems.length}} new items.
          <i :class="showDeletedItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
        </span>
      </h3>
      <div class="summary" v-if="showDeletedItemSummary">
        <a :href="'#' + item.encoded" class="ui link grey" v-for="item in deletedItems">
          <i class="ui icon Trash Outline"></i>{{item.raw}}
        </a>
      </div>
      <div class="items" v-for="item in deletedItems">
        <a :href="'#' + item.encoded" :id="'#' + item.encoded" class="ui link grey">
          <i class="ui icon Trash Outline"></i>{{item.raw}}
        </a>
        <div class="captures">
          <div class="capture" v-on:click="open(expectedDir + item.raw)">
            <capture-image :src="expectedDir + item.raw" :kind="'Deleted'"></capture-image>
          </div>
        </div>
      </div>
    </div>
    <capture-modal :src="modalSrc" :bg="modalBgSrc">
    </capture-modal>
  </div>
</template>

<script>
const CaptureImage = require('./views/CaptureImage.vue');
const CaptureModal = require('./views/CaptureModal.vue');

function searchItems(type) {
  return window['__reg__'][type]
    .filter(item => {
      const words = this.search.split(' ');
      return words.every(w => item.raw.indexOf(w) !== -1);
    });
}

module.exports = {
  name: 'App',
  components: {
    'capture-image': CaptureImage,
    'capture-modal': CaptureModal,
  },
  data: () => ({
    actualDir: window['__reg__'].actualDir,
    expectedDir: window['__reg__'].expectedDir,
    diffDir: window['__reg__'].diffDir,
    search: "",
    showChangedItemSummary: false,
    showPassedItemSummary: false,
    showNewItemSummary: false,
    showDeletedItemSummary: false,
    modalSrc: "",
    modalBgSrc: null,
    isModalOpen: false,
    scrollTop: 0,
  }),
  computed: {
    failedItems: function () {
      return searchItems.bind(this)('failedItems');
    },
    passedItems: function () {
      return searchItems.bind(this)('passedItems');
    },
    newItems: function () {
      return searchItems.bind(this)('newItems');
    },
    deletedItems: function () {
      return searchItems.bind(this)('deletedItems');
    },
    isNotFound: function () {
      return this.failedItems.length === 0 &&
        this.passedItems.length === 0 &&
        this.newItems.length === 0 &&
        this.deletedItems.length === 0;
    },
  },
  methods: {
    open(src, bg) {
      this.modalSrc = src;
      this.modalBgSrc = bg;
      this.isModalOpen = true;
      this.scrollTop = window.pageYOffset;
      this.$modal.push('capture')
    },

    close() {
      this.isModalOpen = false;
      this.$modal.pop();
      setTimeout(() => {
        window.scrollTo(0, this.scrollTop);
      }, 60);
    }
  }
}
</script>

<style scoped>
.not-found {
  min-height: calc(100% - 80px);
  color: #aaa;
  font-size: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.backdrop {
  min-height: 100vh;
  min-width: 100vw;
  position: fixed;
  z-index: 2000000;
  top: 0;
}

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
  z-index: 1000;
}

a>i.github {
  font-size: 28px;
  margin: 0 20px 0;
  color: #333;
}

.summary {
  margin: 5px 20px 20px;
}

.items-header {
  padding: 30px 0 0;
  color: #333;
  font-weight: normal;
}

.items-header-sub {
  font-size: 12px;
  font-weight: normal;
  margin-left: 15px;
  color: #666;
  cursor: pointer;
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
  cursor: pointer;
}

.link {
  font-size: 15px;
}

.red {
  color: #DB2828;
}

.green {
  color: #21BA45;
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
