<template>
  <div class="wrapper">
    <div class="main-header">
      <div class="branding">
        <img src="../assets/reglogo.svg" alt="reg">
        <div class="logo">REG</div>
      </div>
      <div>
        <a href="https://github.com/reg-viz/reg-cli">
          <i class="ui icon github big"></i>
        </a>
        <div class="ui input mini icon">
          <input type="text" placeholder="Search..." @input="inputSearch" :value="search">
          <i class="ui icon search"></i>
        </div>
      </div>
    </div>
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
      <item-summaries class="summaries" :title="'New items'" :icon="'file outline'" :color="'grey'" :items="newItems">
      </item-summaries>
      <item-summaries class="summaries" :title="'Deleted items'" :icon="'trash outline'" :color="'grey'" :items="deletedItems">
      </item-summaries>
      <item-summaries class="summaries" :title="'Passed items'" :icon="'checkmark'" :color="'green'" :items="passedItems">
      </item-summaries>
      <h2 class="ui header items-header detail" v-if="!isNotFound">
        Detail
      </h2>
      <div class="ui divider"></div>
      <h3 class="ui header items-header red" v-if="failedItems.length">
        Changed items
      </h3>
      <item-details class="items" :icon="'remove'" :color="'red'" :items="failedItems" :openCapture="openCapture" :openComparison="openComparison" :diffDir="diffDir" :actualDir="actualDir" :expectedDir="expectedDir">
      </item-details>
  
      <h3 class="ui header items-header" v-if="newItems.length">
        New items
      </h3>
  
      <item-details class="items" :icon="'file outline'" :color="'grey'" :items="newItems" :openCapture="openCapture" :actualDir="actualDir">
      </item-details>
  
      <h3 class="ui header items-header" v-if="deletedItems.length">
        Deleted items
      </h3>
      <item-details class="items" :icon="'trash outline'" :color="'grey'" :items="deletedItems" :openCapture="openCapture" :expectedDir="expectedDir">
      </item-details>
  
      <h3 class="ui header items-header green" v-if="passedItems.length">
        Passed items
      </h3>
      <item-details class="items" :icon="'checkmark'" :color="'green'" :items="passedItems" :openCapture="openCapture" :actualDir="actualDir">
      </item-details>
    </div>
    <div class="footer">
      <p>Powered by <a href="https://github.com/reg-viz">reg-viz</a></p>
    </div>
    <capture-modal :src="modalSrc" :bg="modalBgSrc">
    </capture-modal>
    <comparison-modal :src="modalSrc" :srcActual="selectedSrcActual" :srcExpected="selectedSrcExpected" :matching="selectedMatchingResult" :bg="modalBgSrc"></comparison-modal>
  </div>
</template>

<script>
const SEARCH_DEBOUNCE_MSEC = 50;
const debounce = require('lodash.debounce');
const workerClient = require('./worker-client').default;
const CaptureModal = require('./views/CaptureModal.vue');
const ComparisonModal = require('./views/ComparisonModal.vue');
const ItemSummaries = require('./views/ItemSummaries.vue');
const ItemDetails = require('./views/ItemDetails.vue');

function searchItems(type, search) {
  return window['__reg__'][type]
    .filter(item => {
      const words = search.split(' ');
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
    'comparison-modal': ComparisonModal,
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
    failedItems: searchItems('failedItems', getSearchParams()),
    passedItems: searchItems('passedItems', getSearchParams()),
    newItems: searchItems('newItems', getSearchParams()),
    deletedItems: searchItems('deletedItems', getSearchParams()),
    lastRequestSequence: null,
    selectedRaw: "",
    selectedSrcActual: "",
    selectedSrcExpected: "",
    selectedMatchingResult: null,
  }),
  created: function () {
    workerClient.subscribe(data => {
      if (this.lastRequestSequence === data.seq && this.isModalOpen) {
        this.selectedMatchingResult = data.result;
      }
    });
  },
  computed: {
    isNotFound: function () {
      return this.failedItems.length === 0 &&
        this.passedItems.length === 0 &&
        this.newItems.length === 0 &&
        this.deletedItems.length === 0;
    },
  },
  methods: {
    openCapture(src, bg) {
      this.modalSrc = src;
      this.modalBgSrc = bg;
      this.isModalOpen = true;
      this.$modal.push('capture')
    },

    openComparison(src) {
      this.modalSrc = src;
      this.selectedSrcActual = this.actualDir + src;
      this.selectedSrcExpected = this.expectedDir + src;
      this.lastRequestSequence = workerClient.requestCalc({
        raw: src,
        actualSrc: this.selectedSrcActual,
        expectedSrc: this.selectedSrcExpected
      });
      this.isModalOpen = true;
      this.$modal.push('comparison')
    },

    close() {
      this.isModalOpen = false;
      this.$modal.pop();
      this.selectedSrcActual = "";
      this.selectedSrcExpected = "";
      this.selectedMatchingResult = null;
    },

    inputSearch(e) {
      this.search = e.target.value;
      this.filter(this.search);
      history.pushState('', '', `?search=${encodeURIComponent(this.search)}`);
    },

    filter: debounce(function(search) {
      ['failedItems', 'passedItems', 'newItems', 'deletedItems'].forEach(type => this[type] = searchItems(type, search));
    }, SEARCH_DEBOUNCE_MSEC),
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
  min-height: calc(100vh - 270px);
  padding: 0 30px;
}

.link {
  font-size: 13px;
  display: block;
}

.branding {
  display: flex;
  align-items: center;
}

.branding>img{
  margin-left: -6px;
  width: 32px;
  height: 32px;
}

.logo {
  margin-left: .35em;
  font-size: 22px;
  font-family: 'Lato', sans-serif;
  letter-spacing: .2em;
  font-weight: 300;
  line-height: 40px;
  color: #333;
}

.detail {
  margin-top: 60px;
}

.footer {
  width: 100%;
  padding: 60px 30px;
  background: #fcfcfc;
  font-size: 14px;
  color: #aaa;
  text-align: center;
}
</style>
