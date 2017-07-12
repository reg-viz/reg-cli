<template>
    <div v-if="items.length">
        <h3 :class="'ui header items-header ' + color">
            {{title}}
            <span class="items-header-sub" v-on:click="showSummary = !showSummary">
                {{items.length}} items.
                <i :class="showSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
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

<style scoped>
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

.summary {
    margin: 5px 20px 20px;
}

.red {
    color: #DB2828;
}

.green {
    color: #21BA45;
}
</style>
