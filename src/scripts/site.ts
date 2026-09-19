const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reduced.matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
  }), { threshold: 0.06 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

document.querySelectorAll<HTMLElement>('[data-tabs]').forEach(group => {
  const tabs = [...group.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement) => tabs.forEach(item => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(item.getAttribute('aria-controls') || '');
    if (panel) panel.hidden = !active;
  });
  // Every panel is available in the server HTML; enhance only after initialization.
  if (tabs.length) select(tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0]);
  group.dataset.tabsReady = '';
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { select(tab); tab.focus({ preventScroll: true }); });
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); select(tabs[next]); tabs[next].focus();
    });
  });
});

// A partially visible next card should become fully readable when reached with Tab.
document.querySelectorAll<HTMLElement>('.home-news-cards').forEach(list => {
  list.addEventListener('focusin', event => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.home-news-item');
    if (!card || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({
      left: list.scrollLeft + card.getBoundingClientRect().left - list.getBoundingClientRect().left - 5,
      behavior: reduced.matches ? 'instant' : 'smooth',
    });
  });
});

const menu = document.querySelector<HTMLDialogElement>('#site-menu');
const menuToggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
const menuSlot = document.querySelector<HTMLElement>('.menu-slot');
const positionMenuToggle = () => {
  if (!menuSlot || !menuToggle) return;
  const bounds = menuSlot.getBoundingClientRect();
  menuToggle.style.setProperty('--menu-top', `${bounds.top}px`);
  menuToggle.style.setProperty('--menu-left', `${bounds.left}px`);
};
const menuHome = document.createComment('Mobile menu button returns here after closing');
menuToggle?.before(menuHome);
let menuCloseTimer: number | undefined;
const setMenuExpanded = (expanded: boolean) => {
  menuToggle?.setAttribute('aria-expanded', String(expanded));
  menuToggle?.setAttribute('aria-label', (expanded ? menuToggle.dataset.closeLabel : menuToggle.dataset.openLabel) || 'Menu');
};
const closeMenu = () => {
  if (!menu?.open || menuCloseTimer !== undefined) return;
  setMenuExpanded(false);
  menu.classList.add('is-closing');
  if (reduced.matches) menu.close();
  else menuCloseTimer = window.setTimeout(() => menu.close(), 300);
};
menuToggle?.addEventListener('click', () => {
  if (!menu) return;
  if (menu.open) { closeMenu(); return; }
  // Keep the very same control in the dialog's top layer, where it remains interactive.
  positionMenuToggle();
  menu.prepend(menuToggle);
  menu.showModal();
  menuToggle.getBoundingClientRect();
  setMenuExpanded(true);
  menuToggle.focus({ preventScroll: true });
  queueScrollUpdate();
});
menu?.addEventListener('close', () => {
  window.clearTimeout(menuCloseTimer);
  menuCloseTimer = undefined;
  menu.classList.remove('is-closing');
  setMenuExpanded(false);
  if (menuToggle) { menuHome.after(menuToggle); menuToggle.focus({ preventScroll: true }); }
  queueScrollUpdate();
});
menu?.addEventListener('cancel', event => { event.preventDefault(); closeMenu(); });
menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
window.matchMedia('(min-width: 901px)').addEventListener('change', event => {
  if (event.matches && menu?.open) menu.close();
});
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => {
  dialog.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) {
      if (dialog === menu) closeMenu(); else dialog.close();
    }
  });
});

const player = document.querySelector<HTMLDialogElement>('#video-dialog');
const container = document.querySelector<HTMLElement>('[data-video-container]');
document.querySelector<HTMLElement>('[data-video-open]')?.addEventListener('click', event => {
  const trigger = event.currentTarget as HTMLButtonElement;
  if (trigger.hidden || !trigger.dataset.player || !player || !container) return;
  const frame = document.createElement('iframe');
  frame.src = trigger.dataset.player;
  frame.title = 'MyBlog 2023 — bilibili'; frame.allowFullscreen = true;
  frame.allow = 'autoplay; fullscreen; picture-in-picture';
  container.replaceChildren(frame); player.showModal();
});
player?.addEventListener('close', () => container?.replaceChildren());

const pickupIntroduction = document.querySelector<HTMLDialogElement>('#pickup-introduction');
const introductionTriggers = [...document.querySelectorAll<HTMLAnchorElement>('[data-introduction-open]')];
let introductionTrigger = introductionTriggers[0];
introductionTriggers.forEach(trigger => trigger.addEventListener('click', event => {
  if (!pickupIntroduction || typeof pickupIntroduction.showModal !== 'function') return;
  event.preventDefault();
  introductionTrigger = trigger;
  pickupIntroduction.showModal();
}));
pickupIntroduction?.addEventListener('cancel', event => { event.preventDefault(); pickupIntroduction.close(); });
pickupIntroduction?.addEventListener('close', () => {
  const target = introductionTrigger && getComputedStyle(introductionTrigger).display !== 'none'
    ? introductionTrigger : introductionTriggers.find(trigger => getComputedStyle(trigger).display !== 'none') || document.querySelector<HTMLAnchorElement>('.pickup-info h1 a');
  target?.focus({ preventScroll: true });
});
document.querySelector('[data-dismiss-notice]')?.addEventListener('click', () => document.querySelector('.privacy-notice')?.classList.add('dismissed'));

const account = document.querySelector<HTMLDialogElement>('#account-dialog');
document.querySelectorAll('[data-account]').forEach(trigger => trigger.addEventListener('click', event => { event.preventDefault(); account?.showModal(); }));
if (window.location.hash === '#moeqy-account') account?.showModal();

const topLink = document.querySelector<HTMLAnchorElement>('.back-to-top');
const topLinkBoundary = document.querySelector<HTMLElement>(document.body.classList.contains('is-home') ? '.blog-banner' : '.site-footer');
const updateTopLink = () => {
  if (!topLink) return;
  const gap = parseFloat(getComputedStyle(topLink).getPropertyValue('--back-top-gap')) || 0;
  const restingCenter = window.innerHeight - gap - topLink.offsetHeight / 2;
  const boundaryTop = topLinkBoundary?.getBoundingClientRect().top ?? Infinity;
  const lift = Math.max(0, restingCenter - boundaryTop);
  // As the boundary enters the button's center, follow it pixel-for-pixel.
  // Scrolling upward releases the button back to its fixed viewport position.
  topLink.style.setProperty('--back-top-lift', `${lift}px`);
  topLink.classList.toggle('is-docked', boundaryTop <= restingCenter);
  topLink.classList.toggle('visible', window.scrollY > 500 || (lift > 0 && window.scrollY > 0));
};
const siteHeader = document.querySelector<HTMLElement>('.site-header');
const videoSurface = document.querySelector<HTMLElement>('[data-video-surface]');
const pickupSection = videoSurface?.closest<HTMLElement>('#pickup');
const pickupInfo = pickupSection?.querySelector<HTMLElement>('.pickup-info');
const pickupGraphic = videoSurface?.querySelector<HTMLElement>('.pickup-graphic');
const pickupNotes = pickupSection?.querySelector<HTMLElement>('.pickup-note-board');
const pickupCopy = pickupInfo?.querySelector<HTMLElement>('.pickup-copy-layout');
const pickupControls = pickupSection?.querySelector<HTMLElement>('[data-pickup-controls]');
let pickupFitKey = '';
const fitPickupCopy = (mobile: boolean) => {
  if (!pickupInfo || !pickupCopy) return;
  const style = getComputedStyle(pickupInfo);
  const available = pickupInfo.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
  if (available <= 0 || pickupInfo.clientWidth <= 0) return;
  const key = `${mobile}/${pickupInfo.clientWidth}/${available}`;
  if (key === pickupFitKey) return;
  pickupFitKey = key;
  // Always use the original description (four desktop lines / two mobile lines).
  // Compact decoration first; never substitute an independently written summary.
  for (const mode of ['full', 'tight', 'minimal']) {
    pickupInfo.dataset.copyMode = mode;
    const description = pickupInfo.querySelector<HTMLElement>('.pickup-description');
    const wrap = pickupInfo.querySelector<HTMLElement>('.pickup-description-wrap');
    if (description && wrap) {
      wrap.dataset.truncated = 'true';
      // With short desktop copy, let the icon flow immediately after the last
      // word. With clamped copy, reserve its space at the last line's right edge.
      if (!mobile && description.scrollHeight <= description.clientHeight + 1) wrap.dataset.truncated = 'false';
    }
    if (pickupCopy.getBoundingClientRect().height <= available + .5) break;
  }
};
type CurvePoint = [number, number];
const desktopCurve: CurvePoint[] = JSON.parse(videoSurface?.dataset.curve || '[]');
let mobileCurve: CurvePoint[] = JSON.parse(videoSurface?.dataset.mobileCurve || '[]');
const mobileClip = document.querySelector<SVGPathElement>('#pickup-curve-mobile path');
const mobilePaper = document.querySelector<SVGPathElement>('#pickup-paper-mobile-shape');
const paperCover = document.querySelector<SVGSVGElement>('.pickup-paper-cover');
const paperDots = document.querySelector<SVGPatternElement>('#pickup-paper-dots');
let paperSize = '';
const updatePaperTexture = (surface: DOMRect) => {
  if (!paperDots || surface.width <= 0 || surface.height <= 0) return;
  const size = `${surface.width}/${surface.height}`;
  if (paperSize === size) return;
  paperSize = size;
  // Keep the existing 9px dot grid and circular decoration at physical size
  // while the foreground path uses normalized video coordinates.
  paperDots.setAttribute('width', String(9 / surface.width));
  paperDots.setAttribute('height', String(9 / surface.height));
  const dot = paperDots.querySelector('ellipse');
  dot?.setAttribute('cx', String(4.5 / surface.width));
  dot?.setAttribute('cy', String(4.5 / surface.height));
  dot?.setAttribute('rx', String(.9 / surface.width));
  dot?.setAttribute('ry', String(.9 / surface.height));
  const radius = Math.hypot(surface.width, surface.height * 1.1) * .28;
  document.querySelectorAll('.pickup-paper-accent').forEach(accent => {
    accent.setAttribute('rx', String(radius / surface.width));
    accent.setAttribute('ry', String(radius / surface.height));
  });
};
let mobileClipSize = '';
const updateMobileClip = (surface: DOMRect, style: CSSStyleDeclaration) => {
  if (!mobileClip || surface.width <= 0 || surface.height <= 0) return;
  const rise = parseFloat(style.getPropertyValue('--folder-rise')) || 40;
  const run = parseFloat(style.getPropertyValue('--folder-run')) || 72;
  if (paperCover && !paperCover.hasAttribute('data-mobile-ready')) paperCover.setAttribute('data-mobile-ready', '');
  const paperHeight = paperCover?.getBoundingClientRect().height || surface.height;
  const size = `${surface.width}/${surface.height}/${paperHeight}/${rise}/${run}`;
  if (size === mobileClipSize) return;
  mobileClipSize = size;
  // Two equal 12px circular fillets meet one straight incline tangentially.
  // Solve its angle from the fixed run/rise, so resizing never flattens it.
  const radius = Math.min(12, rise / 3, run / 4);
  let lo = .01, hi = Math.PI / 2;
  for (let i = 0; i < 24; i++) {
    const angle = (lo + hi) / 2;
    if (rise / Math.tan(angle) + 2 * radius * Math.tan(angle / 2) > run) lo = angle;
    else hi = angle;
  }
  const angle = (lo + hi) / 2, sin = Math.sin(angle), cos = Math.cos(angle);
  const handle = radius * 4 / 3 * Math.tan(angle / 4);
  const ax = radius * sin, ay = radius * (1 - cos);
  const start = surface.width * .32;
  const point = (x: number, y: number): CurvePoint => [(start + x) / surface.width, 1 - y / surface.height];
  const a = point(ax, ay), b = point(run - ax, rise - ay);
  mobileCurve = [[0,1],[.32/3,1],[.32*2/3,1],[.32,1],
    point(handle,0),point(ax-handle*cos,ay-handle*sin),a,
    [a[0]+(b[0]-a[0])/3,a[1]+(b[1]-a[1])/3],
    [a[0]+(b[0]-a[0])*2/3,a[1]+(b[1]-a[1])*2/3],b,
    point(run-ax+handle*cos,rise-ay+handle*sin),point(run-handle,rise),point(run,rise),
    point(run+(surface.width-start-run)/3,rise),point(run+(surface.width-start-run)*2/3,rise),[1,1-rise/surface.height]];
  mobileClip.setAttribute('d', `M0 0 L${mobileCurve[0].join(' ')} ${mobileCurve.slice(1).map((p,i) => `${i % 3 === 0 ? 'C' : ''}${p.join(' ')}`).join(' ')} L1 0 Z`);
  // One opaque sheet covers the shoulder AND the entire information panel.
  const paperCurve = mobileCurve.map(([x,y]) => [x, y * surface.height / paperHeight]);
  mobilePaper?.setAttribute('d', `M0 1 L${paperCurve[0].join(' ')} ${paperCurve.slice(1).map((p,i) => `${i % 3 === 0 ? 'C' : ''}${p.join(' ')}`).join(' ')} L1 1 Z`);
};
// Solve x(t) along the rendered cubic path, then read its y(t). SVG and hit testing
// share the same points, so the header stays in sync with either responsive curve.
const curveHeightAt = (points: CurvePoint[], x: number) => {
  const cubic = (a: number, b: number, c: number, d: number, t: number) =>
    (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d;
  for (let i = 0; i + 3 < points.length; i += 3) {
    const [a,b,c,d] = points.slice(i,i+4);
    if (x > d[0]) continue;
    let lo = 0, hi = 1;
    for (let step = 0; step < 24; step++) {
      const mid = (lo + hi) / 2;
      if (cubic(a[0],b[0],c[0],d[0],mid) < x) lo = mid; else hi = mid;
    }
    return cubic(a[1],b[1],c[1],d[1],(lo+hi)/2);
  }
  return points.at(-1)?.[1] || 0;
};
const headerLanguage = document.querySelector<HTMLElement>('.header-language');
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
const updateHeader = () => {
  if (!siteHeader) return;
  const style = getComputedStyle(siteHeader);
  const expandedHeight = parseFloat(style.getPropertyValue('--header-expanded')) || 108;
  const expandedLogo = parseFloat(style.getPropertyValue('--brand-expanded')) || 180;
  const headerBounds = siteHeader.getBoundingClientRect();
  // An expanded-size anchor avoids a feedback loop while the visible logo shrinks.
  const anchorX = headerBounds.left + (parseFloat(style.paddingLeft) || 0) + expandedLogo / 2;
  const anchorY = expandedHeight / 2;
  let white = 0;
  let progress = clampUnit(window.scrollY / 160);
  const surface = videoSurface?.getBoundingClientRect();
  const videoStyle = videoSurface ? getComputedStyle(videoSurface) : null;
  const isMobileVideo = videoStyle?.getPropertyValue('--video-profile').trim() === 'mobile';
  if (isMobileVideo && surface && videoStyle) updateMobileClip(surface, videoStyle);
  if (surface) updatePaperTexture(paperCover?.getBoundingClientRect() || surface);
  const points = isMobileVideo ? mobileCurve : desktopCurve;
  if (isMobileVideo && surface && pickupSection && pickupNotes) {
    // Place the action cards across the folder seam. Reserve their footprint
    // above the copy, and simplify their contents before reducing tap targets.
    const cardWidth = (pickupNotes.getBoundingClientRect().width - 24) / 3;
    // A tall, narrow phone still needs simplified cards. Fit against the
    // narrowest three-card state so visual changes cannot oscillate the layout.
    const density = surface.height >= 480 && cardWidth >= 112 ? 'full'
      : surface.height >= 350 && cardWidth >= 84 ? 'compact' : 'essential';
    const height = density === 'full' ? Math.min(116, cardWidth * .95) : density === 'compact' ? 72 : 48;
    const rise = parseFloat(videoStyle?.getPropertyValue('--folder-rise') || '') || 40;
    const top = surface.top - pickupSection.getBoundingClientRect().top + surface.height - rise / 2 - height / 2;
    pickupSection.dataset.noteDensity = density;
    pickupNotes.dataset.density = density;
    pickupNotes.style.setProperty('--notes-height', `${height}px`);
    pickupNotes.style.setProperty('--notes-left', 'var(--gutter)');
    pickupNotes.style.setProperty('--notes-top', `${top}px`);
    pickupInfo?.style.setProperty('--notes-info-inset', `${Math.max(16, (height-rise)/2+20)}px`);
  } else {
    pickupSection?.removeAttribute('data-note-density');
    pickupNotes?.removeAttribute('data-density');
    pickupInfo?.style.removeProperty('--notes-info-inset');
  }
  if (surface && surface.width > 0 && pickupGraphic && points.length >= 4) {
    const graphicStyle = getComputedStyle(pickupGraphic);
    const left = parseFloat(graphicStyle.left) || 0;
    const setGraphicProperty = (name: string, value: string) => {
      if (pickupGraphic.style.getPropertyValue(name) !== value) pickupGraphic.style.setProperty(name, value);
    };
    if (isMobileVideo) {
      pickupGraphic.style.removeProperty('--graphic-width');
      // The folder shoulder can pass under the lettering: use its highest edge
      // across the entire graphic, keeping the caption and main letters intact.
      const right = left + pickupGraphic.getBoundingClientRect().width;
      const edge = Math.min(curveHeightAt(points, left / surface.width), curveHeightAt(points, right / surface.width));
      setGraphicProperty('--graphic-bottom', `${(1 - edge) * surface.height + 12}px`);
    } else {
      // End the lettering before the first horizontal segment starts to curve.
      setGraphicProperty('--graphic-width', `${Math.max(0, points[3][0] * surface.width - left - 24)}px`);
      setGraphicProperty('--graphic-bottom', `${(1 - points[0][1]) * surface.height + 16}px`);
    }
  }
  if (surface && surface.width > 0 && pickupControls && pickupSection) {
    if (!isMobileVideo && pickupInfo) {
      const textLeft = pickupInfo.getBoundingClientRect().left + (parseFloat(getComputedStyle(pickupInfo).paddingLeft) || 0);
      const available = Math.max(0, textLeft - pickupControls.getBoundingClientRect().left - 20);
      pickupControls.style.setProperty('--visual-width', `${available}px`);
    } else pickupControls.style.removeProperty('--visual-width');
    const graphicStyle = pickupGraphic ? getComputedStyle(pickupGraphic) : null;
    let baseline: number;
    if (graphicStyle && graphicStyle.display !== 'none') {
      // Stack the entire switcher below PICK UP, sharing its left alignment.
      // Keep the switcher at the original video-edge baseline and reserve its
      // rendered height above it, independently of the entrance animation.
      const gap = isMobileVideo ? 12 : 16;
      pickupGraphic?.style.setProperty('--visual-reserve', `${pickupControls.getBoundingClientRect().height + gap}px`);
      baseline = surface.bottom - (parseFloat(graphicStyle.getPropertyValue('--graphic-bottom')) || 0);
    } else {
      // Very short landscape layouts hide the lettering; retain the compact
      // control placement there so it stays clear of the header and notice.
      const bounds = pickupControls.getBoundingClientRect();
      const edge = curveHeightAt(points, Math.min(1, (bounds.right - surface.left) / surface.width));
      baseline = surface.top + edge * surface.height - (isMobileVideo ? 12 : 16);
    }
    if (isMobileVideo && pickupNotes) {
      const aboveCards = pickupNotes.getBoundingClientRect().top - 14;
      const reserve = Math.max(0, baseline - aboveCards);
      baseline -= reserve;
      if (graphicStyle && graphicStyle.display !== 'none') {
        pickupGraphic?.style.setProperty('--visual-reserve', `${pickupControls.getBoundingClientRect().height + 12 + reserve}px`);
      }
    }
    const bottom = pickupSection.getBoundingClientRect().bottom - baseline;
    pickupControls.style.setProperty('--visual-bottom', `${bottom}px`);
    const firstVisual = pickupControls.querySelector<HTMLElement>('.pickup-visual-image');
    if (isMobileVideo && pickupSection.dataset.noteDensity !== 'full' && firstVisual && pickupGraphic) {
      // The image sits at the bottom of its 48px button. Align to the visible
      // thumbnail, not the larger hit area or the whole control row.
      const image = firstVisual.getBoundingClientRect();
      pickupGraphic.style.setProperty('--compact-graphic-left', `${image.left - surface.left}px`);
      pickupGraphic.style.setProperty('--compact-graphic-bottom', `${surface.bottom - image.top + 8}px`);
    } else {
      pickupGraphic?.style.removeProperty('--compact-graphic-left');
      pickupGraphic?.style.removeProperty('--compact-graphic-bottom');
    }
    const meter = pickupControls.querySelector<HTMLElement>('.pickup-visual-meter-group');
    if (meter) {
      const bounds = meter.getBoundingClientRect();
      const edge = surface.top + curveHeightAt(points, (bounds.left + bounds.width / 2 - surface.left) / surface.width) * surface.height;
      meter.dataset.onVideo = String(bounds.top + bounds.height / 2 < edge);
    }
  }
  if (surface && surface.width > 0 && pickupInfo && pickupSection) {
    if (points === desktopCurve) {
      const copyX = pickupInfo.getBoundingClientRect().left + (parseFloat(getComputedStyle(pickupInfo).paddingLeft) || 0);
      const section = pickupSection.getBoundingClientRect();
      let safeTop = Math.ceil(surface.top - section.top + curveHeightAt(points, (copyX - surface.left) / surface.width) * surface.height + 12);
      if (pickupNotes) {
        pickupNotes.style.removeProperty('--notes-height');
        // Layer the cards across the seam; keep their lower edges above the copy.
        const infoRight = pickupInfo.getBoundingClientRect().right;
        const left = Math.min(infoRight - pickupNotes.offsetWidth, surface.left + points[6][0] * surface.width + 12);
        // Cards may overlap the curve. Anchor to its level upper edge rather
        // than the lower sloping edge under the first card, which needlessly
        // pushed the entire reading column down on centered desktop layouts.
        const edge = surface.top - section.top + points[6][1] * surface.height;
        const top = edge - pickupNotes.offsetHeight * .48;
        pickupNotes.style.setProperty('--notes-left', `${left - section.left}px`);
        pickupNotes.style.setProperty('--notes-top', `${top}px`);
        safeTop = Math.max(safeTop, top + pickupNotes.offsetHeight + 12);
      }
      const value = `${safeTop}px`;
      if (pickupSection.style.getPropertyValue('--pickup-safe-top') !== value) pickupSection.style.setProperty('--pickup-safe-top', value);
      const bottomGap = `${(1 - points[0][1]) * surface.height}px`;
      if (pickupSection.style.getPropertyValue('--pickup-bottom-gap') !== bottomGap) pickupSection.style.setProperty('--pickup-bottom-gap', bottomGap);
    } else {
      pickupSection.style.removeProperty('--pickup-safe-top');
      pickupSection.style.removeProperty('--pickup-bottom-gap');
    }
    fitPickupCopy(isMobileVideo);
  }
  const lowerEdge = (x: number) => surface ? surface.top + curveHeightAt(points, (x - surface.left) / surface.width) * surface.height : 0;
  if (surface && surface.width > 0 && anchorX >= surface.left && anchorX <= surface.right) {
    const remaining = lowerEdge(anchorX) - anchorY;
    const belowTop = anchorY >= surface.top;
    white = belowTop ? clampUnit((remaining + 24) / 48) : 0;
    progress = belowTop ? clampUnit((-remaining - 24) / 160) : 0;
    if (reduced.matches) { white = belowTop && remaining > 0 ? 1 : 0; progress = -remaining >= 184 ? 1 : 0; }
  } else if (reduced.matches) progress = window.scrollY >= 160 ? 1 : 0;
  siteHeader.style.setProperty('--logo-white', String(white));
  siteHeader.style.setProperty('--header-progress', String(progress));
  // The white backdrop fades in as the logo leaves the video and stays visible
  // while the header compacts. Only returning to the video makes it transparent.
  siteHeader.style.setProperty('--header-background', String(1 - white));
  siteHeader.dataset.headerState = white > .99 ? 'video' : white > 0 ? 'edge' : progress >= 1 ? 'compact' : 'color';
  // The raised right-hand edge passes the language/menu controls before the logo.
  [headerLanguage, menuToggle].forEach(control => {
    if (!control) return;
    const rect = (control.querySelector('summary') || control).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const inside = surface && x >= surface.left && x <= surface.right && y >= surface.top && y < lowerEdge(x) - 12;
    control.dataset.onVideo = String(inside && !menu?.open);
  });
  if (menu?.open) positionMenuToggle();
};
let ticking = false;
const updateScroll = () => { updateTopLink(); updateHeader(); ticking = false; };
const queueScrollUpdate = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateScroll); } };
window.addEventListener('scroll', queueScrollUpdate, { passive: true });
window.addEventListener('resize', queueScrollUpdate);
window.addEventListener('pageshow', queueScrollUpdate);
window.addEventListener('hashchange', queueScrollUpdate);
window.addEventListener('load', queueScrollUpdate);
const invalidatePickupFit = () => { pickupFitKey = ''; queueScrollUpdate(); };
pickupSection?.addEventListener('pickupchange', invalidatePickupFit);
document.fonts?.ready.then(invalidatePickupFit);
document.fonts?.addEventListener('loadingdone', invalidatePickupFit);
reduced.addEventListener('change', queueScrollUpdate);
if (typeof ResizeObserver !== 'undefined') {
  const resizeObserver = new ResizeObserver(invalidatePickupFit);
  if (videoSurface) resizeObserver.observe(videoSurface);
  if (pickupInfo) resizeObserver.observe(pickupInfo);
  if (pickupCopy) resizeObserver.observe(pickupCopy);
  resizeObserver.observe(document.documentElement);
  if (topLinkBoundary) resizeObserver.observe(topLinkBoundary);
  if (topLink) resizeObserver.observe(topLink);
}
if (pickupCopy && typeof MutationObserver !== 'undefined') {
  new MutationObserver(invalidatePickupFit).observe(pickupCopy, { childList: true, characterData: true, subtree: true });
}
updateScroll();

const videos = document.querySelectorAll<HTMLVideoElement>('video');
const updateMotion = () => videos.forEach(video => { if (reduced.matches || document.hidden || video.hidden) video.pause(); else video.play().catch(() => {}); });
reduced.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', updateMotion);
updateMotion();

// Native details keeps language navigation available without JavaScript.
const languageMenus = document.querySelectorAll<HTMLDetailsElement>('.header-language-picker, .site-footer .language-picker');
document.addEventListener('click', event => {
  languageMenus.forEach(menu => {
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  languageMenus.forEach(menu => {
    if (!menu.open) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });
});
