// Electron can retain emulated dimensions after the original CDP client leaves.
// Reset them explicitly before clearing emulation from a new session.
export async function resetElectronViewport(page) {
  if (!page || page.isClosed()) return;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 0,
      height: 0,
      deviceScaleFactor: 0,
      mobile: false,
    });
    await session.send('Emulation.clearDeviceMetricsOverride');
  } finally {
    await session.detach();
  }
}
