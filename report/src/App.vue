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
  
      <item-summaries class="summaries" :title="'Changed items'" :icon="'remove'" :color="'red'" :items="failedItems">
      </item-summaries>
      <item-summaries class="summaries" :title="'New items'" :icon="'File Outline'" :color="'grey'" :items="newItems">
      </item-summaries>
      <item-summaries class="summaries" :title="'Deleted items'" :icon="'Trash Outline'" :color="'grey'" :items="deletedItems">
      </item-summaries>
      <item-summaries class="summaries" :title="'Passed items'" :icon="'Checkmark'" :color="'green'" :items="passedItems">
      </item-summaries>
      <h2 class="ui header items-header detail" v-if="!isNotFound">
        Detail
      </h2>
      <div class="ui divider"></div>
      <h3 class="ui header items-header red" v-if="failedItems.length">
        Changed items
      </h3>
      <item-details class="items" :icon="'remove'" :color="'red'" :items="failedItems" :open="open" :diffDir="diffDir" :actualDir="actualDir" :expectedDir="expectedDir">
      </item-details>
  
      <h3 class="ui header items-header" v-if="newItems.length">
        New items
      </h3>
  
      <item-details class="items" :icon="'File Outline'" :color="'grey'" :items="newItems" :open="open" :actualDir="actualDir">
      </item-details>
  
      <h3 class="ui header items-header" v-if="deletedItems.length">
        Deleted items
      </h3>
      <item-details class="items" :icon="'Trash Outline'" :color="'grey'" :items="deletedItems" :open="open" :expectedDir="expectedDir">
      </item-details>
  
      <h3 class="ui header items-header green" v-if="passedItems.length">
        Passed items
      </h3>
      <item-details class="items" :icon="'Checkmark'" :color="'green'" :items="passedItems" :open="open" :actualDir="actualDir">
      </item-details>
    </div>
    <capture-modal :src="modalSrc" :bg="modalBgSrc">
    </capture-modal>
  </div>
</template>

<script>
const CaptureModal = require('./views/CaptureModal.vue');
const ItemSummaries = require('./views/ItemSummaries.vue');
const ItemDetails = require('./views/ItemDetails.vue');

function searchItems(type) {
  return window['__reg__'][type]
    .filter(item => {
      const words = this.search.split(' ');
      return words.every(w => item.raw.indexOf(w) !== -1);
    });
}

function getSearchParams() {
  const s = location.search.match(/search=(.*?)(&|$)/);
  if (!s || !s[1]) return "";
  return decodeURIComponent(s[1]) || "";
}

module.exports = {
  name: 'App',
  components: {
    'capture-modal': CaptureModal,
    'item-summaries': ItemSummaries,
    'item-details': ItemDetails,
  },
  data: () => ({
    actualDir: window['__reg__'].actualDir,
    expectedDir: window['__reg__'].expectedDir,
    diffDir: window['__reg__'].diffDir,
    search: getSearchParams(),
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

<style scoped src="./styles/common.css"></style>
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

.summaries {
  margin-top: 30px;
}

a>i.github {
  font-size: 28px;
  margin: 0 20px 0;
  color: #333;
}

.input {
  height: 28px;
  width: 240px;
}

.content {
  margin-top: 100px;
  padding: 0 30px;
}

.link {
  font-size: 13px;
  display: block;
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
