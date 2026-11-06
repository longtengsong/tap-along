import { config } from '@vue/test-utils';
import { i18n } from '@/i18n';

i18n.global.locale.value = 'zh-CN';
document.documentElement.lang = 'zh-CN';

config.global.plugins = [i18n];
