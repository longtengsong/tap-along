<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="desk">
    <section class="window" :aria-label="t('a11y.appWindow')">
      <div class="window-body">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.desk {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: 40px;
  background:
    radial-gradient(circle at 18% 10%, rgb(255 255 255 / 55%), transparent 30%),
    radial-gradient(circle at 88% 86%, rgb(132 106 69 / 10%), transparent 34%),
    #e8e4dc;
}

.window {
  position: relative;
  width: min(1180px, 100%);
  height: min(820px, calc(100vh - 80px));
  min-height: 580px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: var(--paper);
  box-shadow: var(--shadow-window);
}

.window-chrome {
  height: 38px;
  flex: 0 0 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-bottom: 1px solid var(--line-soft);
  background: rgb(246 244 239 / 92%);
}

.light {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(40 35 25 / 6%);
}

.light--red {
  background: #e8c4bd;
}

.light--yellow {
  background: #e9dbb9;
}

.light--green {
  background: #c6d6c0;
}

.window-body {
  position: relative;
  flex: 1;
  min-height: 0;
  isolation: isolate;
}

.window-body::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: '';
  background:
    radial-gradient(circle at 50% 0, rgb(255 255 255 / 85%), transparent 48%),
    var(--paper);
}

@media (width <= 900px), (height <= 620px) {
  .desk {
    padding: 0;
  }

  .window {
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
