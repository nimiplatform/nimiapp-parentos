import { beforeEach } from 'vitest';

function setNavigatorLanguageForTests(): void {
  const navigatorValue = globalThis.navigator ?? {};
  Object.defineProperty(globalThis, 'navigator', {
    value: navigatorValue,
    configurable: true,
  });
  Object.defineProperty(globalThis.navigator, 'language', {
    value: 'zh-CN',
    configurable: true,
  });
}

setNavigatorLanguageForTests();

beforeEach(() => {
  setNavigatorLanguageForTests();
});
