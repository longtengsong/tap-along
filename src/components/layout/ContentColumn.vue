<template>
  <div class="content-column">
    <slot />
  </div>
</template>

<style scoped>
.content-column {
  width: 100%;
  max-width: 860px;
  min-height: 0;
  margin: 0 auto;
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 2rem;
}

@media (width <= 900px) {
  .content-column {
    max-width: none;
  }
}
</style>
