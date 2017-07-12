<template>
  <div class="wrapper">
    <div class="main-header">
      <div class="logo">REG</div>
      <div>
        <a href="https://github.com/bokuweb/reg-cli">
          <i class="ui icon github big"></i>
        </a>
        <div class="ui input mini icon">
          <input type="text" placeholder="Search..." @input="addParams" v-model="search">
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
  
      <h2 class="ui header items-header" v-if="!isNotFound">
        Summary
      </h2>
      <div class="ui clearing divider summary-divider"></div>
  
      <item-summaries :title="'Changed items'" :icon="'remove'" :color="'red'" :items="failedItems">
      </item-summaries>
  
      <!--<h3 class="ui header items-header red" v-if="failedItems.length">
                Changed items
                <span class="items-header-sub" v-on:click="showChangedItemSummary = !showChangedItemSummary">
                  {{failedItems.length}} changed items.
                  <i :class="showChangedItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
                </span>
              </h3>
          
              <div class="summary" v-if="showChangedItemSummary">
                <a :href="'#' + item.encoded" class="ui link red" v-for="item in failedItems" v-bind:key="item.encoded">
                  <i class="ui icon remove"></i>{{item.raw}}
                </a>
              </div>-->
  
      <h3 class="ui header items-header grey" v-if="newItems.length">
        New items
        <span class="items-header-sub" v-on:click="showNewItemSummary = !showNewItemSummary">
          {{newItems.length}} new items.
          <i :class="showNewItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
        </span>
      </h3>
  
      <div class="summary" v-if="showNewItemSummary">
        <a :href="'#' + item.encoded" class="ui link grey" v-for="item in newItems" v-bind:key="item.encoded">
          <i class="ui icon File Outline"></i>{{item.raw}}
        </a>
      </div>
  
      <h3 class="ui header items-header grey" v-if="deletedItems.length">
        Deleted items
        <span class="items-header-sub" v-on:click="showDeletedItemSummary = !showDeletedItemSummary">
          {{deletedItems.length}} deleted items.
          <i :class="showDeletedItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
        </span>
      </h3>
  
      <div class="summary" v-if="showDeletedItemSummary">
        <a :href="'#' + item.encoded" class="ui link grey" v-for="item in deletedItems" v-bind:key="item.encoded">
          <i class="ui icon Trash Outline"></i>{{item.raw}}
        </a>
      </div>
  
      <h3 class="ui header items-header green" v-if="passedItems.length">
        Passed items
        <span class="items-header-sub" v-on:click="showPassedItemSummary = !showPassedItemSummary">
          {{passedItems.length}} passed items.
          <i :class="showPassedItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
        </span>
      </h3>
  
      <div class="summary" v-if="showPassedItemSummary">
        <a :href="'#' + item.encoded" class="ui link green" v-for="item in passedItems" v-bind:key="item.encoded">
          <i class="ui icon Checkmark"></i>{{item.raw}}
        </a>
      </div>
  
      <h2 class="ui header items-header detail" v-if="!isNotFound">
        Detail
      </h2>
  
      <div class="ui divider"></div>
  
      <h3 class="ui header items-header red" v-if="failedItems.length">
        Changed items
      </h3>
      <div class="items" v-for="item in failedItems" v-bind:key="item.encoded">
        <a :href="'#' + item.encoded" :id="item.encoded" class="ui link red">
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
  
      <h3 class="ui header items-header" v-if="newItems.length">
        New items
      </h3>
      <div class="items" v-for="item in newItems" v-bind:key="item.encoded">
        <a :href="'#' + item.encoded" :id="item.encoded" class="ui link grey">
          <i class="ui icon File Outline"></i>{{item.raw}}
        </a>
        <div class="captures">
          <div class="capture" v-on:click="open(actualDir + item.raw)">
            <capture-image :src="actualDir + item.raw" :kind="'New'"></capture-image>
          </div>
        </div>
      </div>
  
      <h3 class="ui header items-header" v-if="deletedItems.length">
        Deleted items
      </h3>
      <div class="items" v-for="item in deletedItems" v-bind:key="item.encoded">
        <a :href="'#' + item.encoded" :id="item.encoded" class="ui link grey">
          <i class="ui icon Trash Outline"></i>{{item.raw}}
        </a>
        <div class="captures">
          <div class="capture" v-on:click="open(expectedDir + item.raw)">
            <capture-image :src="expectedDir + item.raw" :kind="'Deleted'"></capture-image>
          </div>
        </div>
      </div>
  
      <h3 class="ui header items-header green" v-if="passedItems.length">
        Passed items
      </h3>
      <div class="items" v-for="item in passedItems" v-bind:key="item.encoded">
        <a :href="'#' + item.encoded" :id="item.encoded" class="ui link green">
          <i class="ui icon Checkmark"></i>{{item.raw}}
        </a>
        <div class="captures">
          <div class="capture" v-on:click="open(actualDir + item.raw)">
            <capture-image :src="actualDir + item.raw" :kind="'Passed'"></capture-image>
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
const ItemSummaries = require('./views/ItemSummaries.vue');

function searchItems(type) {
  return window['__reg__'][type]
    .filter(item => {
      const words = this.search.split(' ');
      return words.every(w => item.raw.indexOf(w) !== -1);
    });
}

function getSearchParams() {
  const s = location.search.match(/search=(.*?)(&|$)/);
  console.log(s)
  if (!s || !s[1]) return "";
  return decodeURIComponent(s[1]) || "";
}

module.exports = {
  name: 'App',
  components: {
    'capture-image': CaptureImage,
    'capture-modal': CaptureModal,
    'item-summaries': ItemSummaries,
  },
  data: () => ({
    actualDir: window['__reg__'].actualDir,
    expectedDir: window['__reg__'].expectedDir,
    diffDir: window['__reg__'].diffDir,
    search: getSearchParams(),
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
      }, 200);
    },

    addParams(e) {
      const s = location.search.match(/search=(.*?)(&|$)/);
      history.pushState('', '', `?search=${e.target.value}`);
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

.summary-divider {
  margin-bottom: 30px;
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
  padding: 0;
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
  margin-top: 100px;
  padding: 0 30px;
}

.capture {
  flex-basis: 30%;
  cursor: pointer;
}

.link {
  font-size: 13px;
  display: block;
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

.detail {
  margin-top: 60px;
}
</style>
