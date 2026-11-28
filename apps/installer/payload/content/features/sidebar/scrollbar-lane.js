/* Tab rows use the full sidebar width. While the tab list's scrollbar is shown,
   only the rows beside its thumb pull in, so the thumb never covers a title or
   close button; rows ease in and out as the thumb moves past them.
   Gecko marks a shown scrollbar with an `active` attribute but does not report
   it to MutationObservers, so the state is polled while sidebar input or tab
   changes may have revealed it, then stops. */
var ZenniaSidebarScrollbarLane = {
  install(window) {
    const { document, InspectorUtils } = window;
    const ATTR = "zennia-scrollbar-clear";
    const ROWS = ".tabbrowser-tab, .tab-group-label-container, #tabbrowser-arrowscrollbox-periphery, .pinned-tabs-container-separator";
    // Rows this close to the thumb also make room, so it never grazes a row edge.
    const SLOP = 2;
    const toolbox = document.getElementById("navigator-toolbox");
    let timer = null;
    let frame = null;

    const children = node => InspectorUtils.getChildrenForNode(node, true, false);

    function thumbOf(arrows) {
      const box = arrows.shadowRoot?.querySelector("scrollbox");
      if (!box) return null;
      const bar = children(box).find(node => node.localName === "scrollbar" && node.hasAttribute("vertical"));
      if (!bar?.hasAttribute("active")) return null;
      const slider = children(bar).find(node => node.localName === "slider");
      return slider && children(slider).find(node => node.localName === "thumb");
    }

    // Returns whether any tab list still shows its scrollbar.
    function sync() {
      frame = null;
      let shown = false;
      for (const arrows of toolbox.querySelectorAll(".workspace-arrowscrollbox")) {
        const thumb = arrows.hasAttribute("overflowing") ? thumbOf(arrows) : null;
        const rect = thumb?.getBoundingClientRect();
        const visible = rect && rect.height > 0;
        shown ||= !!thumb;
        for (const row of arrows.querySelectorAll(ROWS)) {
          let blocked = false;
          if (visible) {
            const box = row.getBoundingClientRect();
            blocked = box.height > 0 && box.bottom > rect.top - SLOP && box.top < rect.bottom + SLOP;
          }
          if (row.hasAttribute(ATTR) !== blocked) row.toggleAttribute(ATTR, blocked);
        }
      }
      return shown;
    }

    function poll() {
      timer = null;
      if (sync()) timer = window.setTimeout(poll, 100);
    }

    function wake() {
      // The thumb moves with every scroll; follow it on the next frame.
      frame ??= window.requestAnimationFrame(sync);
      // Gecko sets `active` after it handles the input, so check again on the next tick.
      timer ??= window.setTimeout(poll, 0);
    }

    // Scroll covers wheel, keyboard, thumb drags and tabs scrolled into view; it
    // does not bubble, so listen in the capture phase. Pointer movement covers
    // the scrollbar appearing when hovered.
    const sidebarEvents = ["scroll", "mousemove", "mouseleave"];
    const tabEvents = ["TabSelect", "TabOpen", "TabClose", "TabPinned", "TabUnpinned"];
    for (const type of sidebarEvents) toolbox.addEventListener(type, wake, { capture: true, passive: true });
    for (const type of tabEvents) window.gBrowser.tabContainer.addEventListener(type, wake);
    wake();

    return {
      destroy() {
        for (const type of sidebarEvents) toolbox.removeEventListener(type, wake, { capture: true });
        for (const type of tabEvents) window.gBrowser.tabContainer.removeEventListener(type, wake);
        if (timer !== null) window.clearTimeout(timer);
        if (frame !== null) window.cancelAnimationFrame(frame);
        for (const row of toolbox.querySelectorAll(`[${ATTR}]`)) row.removeAttribute(ATTR);
      },
    };
  },
};
