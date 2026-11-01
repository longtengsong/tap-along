/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent;
  export default component;
}
