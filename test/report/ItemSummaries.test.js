import test from 'ava';
import Vue from 'vue';
import ItemSummaries from '../../report/src/views/ItemSummaries.vue';
import { getInstance } from '../helpers/get-instance';

test('should render ItemSummaries with a summary', async t => {
    const instance = getInstance(ItemSummaries, {
        title: 'foo',
        items: ['sample.png'],
        color: 'red',
        icon: 'remove',
    });
    instance.$data.showSummary = true;
    instance.$forceUpdate();
    instance.$nextTick(() => {
        t.is(instance.$el.querySelectorAll('a').length, 1);
    })
});

test('should render ItemSummaries with 3 summaries', async t => {
    const instance = getInstance(ItemSummaries, {
        title: 'foo',
        items: ['sample.png', 'foo.png', 'bar.png'],
        color: 'red',
        icon: 'remove',
    });
    instance.$data.showSummary = true;
    instance.$forceUpdate();
    instance.$nextTick(() => {
        t.is(instance.$el.querySelectorAll('a').length, 3);
    })
});