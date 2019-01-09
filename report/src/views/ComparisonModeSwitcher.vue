<template>
  <span class="ui buttons tiny">
    <button
        v-for="(label, id) in comparisonModes"
        v-bind:key="id"
        class="ui button"
        v-bind:class="{active: id == value}"
        v-on:click="$emit('input', id)"
    >
      {{label}}
    </button>
  </span>
</template>

<script>

export default {
  name: 'ComparisonModeSwitcher',
  props: ['comparisonModes', 'value'],
}
</script>