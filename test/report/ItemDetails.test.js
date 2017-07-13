import test from 'ava';
import Vue from 'vue';
import ItemDetails from '../../report/src/views/ItemDetails.vue';
import { getInstance } from '../helpers/get-instance';

test('should render ItemDetails with 3 captures', async t => {
    const instance = getInstance(ItemDetails, {
        items: ['sample.png'],
        color: 'red',
        icon: 'remove',
        open: () => { },
        diffDir: './',
        actualDir: './',
        expectedDir: './',
    });
    t.is(instance.$el.querySelectorAll(".captures").length, 1);
    t.is(instance.$el.querySelectorAll(".captures > div").length, 3);
});

test('should render ItemDetails with a capture', async t => {
    const instance = getInstance(ItemDetails, {
        items: ['sample.png'],
        color: 'red',
        icon: 'remove',
        open: () => { },
        actualDir: './',
    });
    t.is(instance.$el.querySelectorAll(".captures").length, 1);
    t.is(instance.$el.querySelectorAll(".captures > div").length, 1);
});

test('should render ItemDetails with 3 items', async t => {
    const instance = getInstance(ItemDetails, {
        items: ['sample.png', 'foo.png', 'bar.png'],
        color: 'red',
        icon: 'remove',
        open: () => { },
        diffDir: './',
        actualDir: './',
        expectedDir: './',
    });
    t.is(instance.$el.querySelectorAll(".captures").length, 3);
});

