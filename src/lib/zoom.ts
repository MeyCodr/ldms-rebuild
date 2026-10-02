/**
 * The page's CSS zoom (--app-zoom in globals.css: 0.75 on desktop, 1 below).
 * getBoundingClientRect() and window.innerWidth/innerHeight are in screen
 * pixels; a fixed-position style set inside the zoomed page is in page pixels
 * and is drawn at that × zoom. So: measure in screen pixels, then divide by
 * this before setting left/top/width.
 */
export function pageZoom(): number {
  if (typeof document === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z > 0 ? z : 1;
}
