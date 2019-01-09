import Vue from 'vue';

export function getInstance(Component, propsData) {
    const Constructor = Vue.extend(Component)
    return new Constructor({ propsData: propsData }).$mount()
}
