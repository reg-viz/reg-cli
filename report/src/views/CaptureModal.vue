<template>
  <div>
    <modal name="capture">
      <div class="wrapper">
        <div class="modal">
          <img :src="src" />
        </div>
      </div>
    </modal>
  </div>
</template>

<script>
module.exports = {
  name: 'CaptureModal',
  props: ['src'],
}
</script>

<style scoped>
.wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px;
}

.bg {
  position: absolute;
  opacity: 0.2;
  pointer-events: none;
}

img {
  max-width: 90vw;
}

</style>

<style>
.modal-open {
  overflow: hidden;
}

.modal-open .modal-wrapper {
  display: block;
}

.modal-wrapper {
  display: none;
  position: absolute;
  top: 0;
  left: 0;
  min-height: 100vh;
}

.modal-backdrop {
  opacity: 1;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  min-height: 100vh;
}

.modal-backdrop-enter-active,
.modal-backdrop-leave-active {
  transition: opacity 0ms ease-out;
}

.modal-backdrop-enter,
.modal-backdrop-leave-to {
  opacity: 0;
}

.modal-content-wrapper {
  overflow: auto;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  z-index: 1001;
}

.modal-content {
  position: absolute;
  left: 0;
  right: 0;
  opacity: 1;
  width: auto;
  transform: translateY(0);
  pointer-events: none;
}

.modal-content-enter-active,
.modal-content-leave-active {
  transition: 200ms cubic-bezier(0.51, 0.21, 0.38, 0.98);
  transition-property: opacity, transform;
}

.modal-content-enter,
.modal-content-leave-to {
  opacity: 0;
  transform: translateY(-50px);
}
</style>
