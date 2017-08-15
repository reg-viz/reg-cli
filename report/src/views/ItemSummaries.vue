<template>
    <div v-if="items.length">
        <h3 :class="'ui header items-header ' + color">
            {{title}}
            <span class="items-header-sub" v-on:click="showSummary = !showSummary">
                {{items.length}} items.
                <i :class="showSummary ? 'ui icon square outline minus' : ' ui icon square outline plus'"></i>
            </span>
        </h3>
        <div class="summary" v-if="showSummary">
            <a :href="'#' + item.encoded" :class="'ui link ' + color" v-for="item in items" v-bind:key="item.encoded">
                <i :class="'ui icon ' + icon"></i>{{item.raw}}
            </a>
        </div>
    </div>
</template>

<script>

module.exports = {
    name: 'ItemSummaries',
    props: ['color', 'title', 'items', 'icon'],
    data: () => ({
        showSummary: false,
    }),
}
</script>

<style scoped src="../styles/common.css"></style>
<style scoped>
.summary {
    margin: 5px 20px 20px;
}
.link {
    display: block;
}
</style>
