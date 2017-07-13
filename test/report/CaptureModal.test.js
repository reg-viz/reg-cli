import test from 'ava';
import Vue from 'vue';
import CaptureModal from '../../report/src/views/CaptureModal.vue';
import { getInstance } from '../helpers/get-instance';

test('should render CaptureModal', async t => {
    const instance = getInstance(CaptureModal, {
        src: './',
        bg: './',
    });
    t.is(instance.$el.querySelectorAll("modal").length, 1);
});

test('should render CaptureModal 2 img', async t => {
    const instance = getInstance(CaptureModal, {
        src: './',
        bg: './',
    });
    t.is(instance.$el.querySelectorAll("img").length, 2);
});

test('should render CaptureModal a img', async t => {
    const instance = getInstance(CaptureModal, {
        src: './',
    });
    t.is(instance.$el.querySelectorAll("img").length, 1);
});