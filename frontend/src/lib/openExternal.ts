import type React from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { platform } from './platform';

/** Keep web anchors native; use the device browser when inside the mobile shell. */
export function openExternal(event: React.MouseEvent<HTMLAnchorElement>) {
  const url = event.currentTarget.href;
  if (!/^https?:\/\//i.test(url)) {
    event.preventDefault();
    return;
  }
  if (!platform.isTauri) return;
  event.preventDefault();
  void openUrl(url).catch(() => {
    window.dispatchEvent(new CustomEvent('utility:link-error'));
  });
}
