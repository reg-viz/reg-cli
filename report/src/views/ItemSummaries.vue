<template>
    <div>
        <h3 class="ui header items-header `${color || ''}`" v-if="items.length">
            {{title}}
            <span class="items-header-sub" v-on:click="showChangedItemSummary = !showChangedItemSummary">
                {{items.length}} {title}.
                <i :class="showChangedItemSummary ? 'ui icon Square Outline Minus' : ' ui icon Square Outline Plus'"></i>
            </span>
        </h3>
        <div class="summary" v-if="showChangedItemSummary">
            <a :href="'#' + item.encoded" class="ui link `${color || ''}`" v-for="item in items" v-bind:key="item.encoded">
                <i class="ui icon remove"></i>{{item.raw}}
            </a>
        </div>
    </div>
</template>

<script>

module.exports = {
    name: 'ItemSummaries',
    props: ['color', 'title', 'items'],
    data: () => ({
        showChangedItemSummary: false,
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
