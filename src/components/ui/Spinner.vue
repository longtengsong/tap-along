<template>
  <span class="spinner" aria-hidden="true"></span>
</template>

<style scoped>
.spinner {
  width: 26px;
  height: 26px;
  border: 1.5px solid var(--line);
  border-top-color: var(--ink-soft);
  border-radius: 50%;
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
