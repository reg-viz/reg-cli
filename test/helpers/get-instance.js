import Vue from 'vue';

export function getInstance(Component, propsData) {
    const Ctor = Vue.extend(Component);
    return new Ctor({ propsData }).$mount();
}
