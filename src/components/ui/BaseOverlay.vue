<template>
  <div class="overlay" role="presentation">
    <div class="overlay__inner" role="dialog" aria-modal="true">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgb(251 250 247 / 88%);
  backdrop-filter: blur(3px);
  animation: overlay-in 220ms ease both;
}

.overlay__inner {
  width: min(360px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 34px 30px;
  text-align: center;
  animation: content-in 320ms var(--ease-out) both;
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
}

@keyframes content-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
}
</style>
