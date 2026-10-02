// Typing and open UI layers own their keys, including inside portals and shadow
// roots. Other controls own keys after Tab navigation; focus left by a pointer
// click (or restored when its popup closes) must not swallow arena shortcuts.
export function isUiKeyboardEvent(event: KeyboardEvent, keyboardNavigation: boolean) {
  if (event.key === 'Tab' || event.isComposing) return true;
  return event.composedPath().some(node => node instanceof HTMLElement && (
    node.isContentEditable || node.matches('input, textarea, select, [role="textbox"], [data-ui-layer], [role="menu"], [role="listbox"], [role="dialog"]') ||
    keyboardNavigation && node.matches('button, a[href], [tabindex], [data-ui-control]')
  ));
}

// Native scrollbars live on the scrolling element, including inside a diff's
// shadow root. Keep their pointer gestures out of combat without locking code.
export function isScrollbarAtPoint(element: Element | null, x: number, y: number): boolean {
  for (let node = element; node;) {
    if (node instanceof HTMLElement) {
      const horizontal = node.scrollWidth > node.clientWidth && node.offsetHeight > node.clientHeight;
      const vertical = node.scrollHeight > node.clientHeight && node.offsetWidth > node.clientWidth;
      if (horizontal || vertical) {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        const sx = rect.width / node.offsetWidth, sy = rect.height / node.offsetHeight;
        const left = rect.left + (parseFloat(style.borderLeftWidth) || 0) * sx;
        const right = rect.right - (parseFloat(style.borderRightWidth) || 0) * sx;
        const top = rect.top + (parseFloat(style.borderTopWidth) || 0) * sy;
        const bottom = rect.bottom - (parseFloat(style.borderBottomWidth) || 0) * sy;
        if (x >= left && x < right && y >= top && y < bottom) {
          const clientLeft = rect.left + node.clientLeft * sx;
          const clientRight = clientLeft + node.clientWidth * sx;
          const clientBottom = rect.top + (node.clientTop + node.clientHeight) * sy;
          if (horizontal && /^(auto|scroll)$/.test(style.overflowX) && y >= clientBottom) return true;
          if (vertical && /^(auto|scroll)$/.test(style.overflowY) && (x < clientLeft || x >= clientRight)) return true;
        }
      }
    }
    const root = node.getRootNode();
    node = node.parentElement || (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
}
