import type { Pickup } from '../lib/pickups';

const root = document.querySelector<HTMLElement>('#pickup');
const json = root?.querySelector('[data-pickup-data]')?.textContent;
if (root && json) {
  const items: Pickup[] = JSON.parse(json);
  const controls = root.querySelector<HTMLElement>('[data-pickup-controls]')!;
  const buttons = [...controls.querySelectorAll<HTMLButtonElement>('[data-pickup-select]')];
  const toggle = controls.querySelector<HTMLButtonElement>('[data-pickup-pause]')!;
  const media = root.querySelector<HTMLElement>('[data-video-surface]')!;
  const playButton = root.querySelector<HTMLButtonElement>('[data-video-open]')!;
  const poster = media.querySelector<HTMLImageElement>('.pickup-poster')!;
  const video = media.querySelector<HTMLVideoElement>('video')!;
  const copy = root.querySelector<HTMLElement>('.pickup-copy-layout')!;
  const info = root.querySelector<HTMLElement>('.pickup-info')!;
  const intro = document.querySelector<HTMLDialogElement>('#pickup-introduction')!;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const en = root.dataset.lang === 'en';
  const ja = root.dataset.lang === 'ja';
  let active = 0, paused = motion.matches, inView = false;
  let hovered = info.matches(':hover') && window.matchMedia('(hover: hover)').matches;
  let focused = root.contains(document.activeElement);
  let timer: number | undefined;
  let animations: Animation[] = [];
  const stop = () => {
    window.clearTimeout(timer);
    timer = undefined;
    controls.dataset.running = 'false';
  };
  const schedule = () => {
    stop();
    if (paused || !inView || hovered || focused || document.hidden || document.querySelector('dialog[open]')) return;
    // Restart both the CSS meter and the timer from zero after every interaction.
    controls.getBoundingClientRect();
    controls.dataset.running = 'true';
    timer = window.setTimeout(() => select(active + 1, false), 10_000);
  };
  const renderPlayback = () => {
    controls.dataset.paused = String(paused);
    toggle.setAttribute('aria-label', paused ? (ja ? 'PICK UPの切り替えを再開' : en ? 'Play PICK UP rotation' : '播放 PICK UP 轮播') : (ja ? 'PICK UPの切り替えを停止' : en ? 'Pause PICK UP rotation' : '暂停 PICK UP 轮播'));
  };
  const setLink = (anchor: HTMLAnchorElement, href: string) => {
    anchor.href = href;
    if (href.startsWith('https:')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
    else { anchor.removeAttribute('target'); anchor.removeAttribute('rel'); }
  };
  const setButtonCopy = (anchor: HTMLAnchorElement, text: string) => {
    // Keep the existing SVG icon node and its styling.
    [...anchor.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
    anchor.prepend(document.createTextNode(text));
  };
  const updateMeta = (scope: Element, item: Pickup) => {
    scope.querySelector('.tag')!.textContent = item.category;
    const old = scope.querySelector('time, .pickup-status')!;
    const status = document.createElement(item.date ? 'time' : 'span');
    status.className = 'pickup-status';
    if (item.date) status.setAttribute('datetime', item.date);
    status.textContent = item.status;
    old.replaceWith(status);
  };
  const select = (next: number, manual: boolean) => {
    const index = (next + items.length) % items.length;
    if (index !== active) {
      active = index;
      const item = items[active];
      animations.forEach(animation => animation.cancel());
      root.dataset.pickupId = item.id;
      root.dataset.pickupMedia = item.video ? 'video' : 'image';
      video.pause();
      video.hidden = !item.video;
      video.removeAttribute('src');
      video.replaceChildren();
      poster.src = item.poster;
      root.querySelector<HTMLImageElement>('.pickup-note-film img')!.src = item.poster;
      video.poster = item.poster;
      if (item.video) video.src = item.video;
      video.load();
      if (item.video && !motion.matches && !document.hidden) video.play().catch(() => {});
      playButton.hidden = !item.video || !item.player;
      playButton.setAttribute('aria-label', item.mediaLabel);
      if (item.video && item.player) playButton.dataset.player = item.player;
      else delete playButton.dataset.player;
      const title = copy.querySelector('h1')!;
      title.title = item.title;
      title.querySelector('a')!.textContent = item.title;
      setLink(title.querySelector('a')!, item.titleHref);
      copy.querySelector('.pickup-description')!.textContent = item.description;
      updateMeta(copy, item);
      updateMeta(intro, item);
      intro.querySelector('h2')!.textContent = item.title;
      intro.querySelector('p')!.textContent = item.description;
      root.querySelector('.pickup-graphic-caption b')!.textContent = String(active + 1).padStart(2, '0');
      // The editorial section number stays 01; only the selected visual is numbered.
      for (const anchor of [copy.querySelector<HTMLAnchorElement>('.feature-button')!, intro.querySelector<HTMLAnchorElement>('.pill-button')!]) {
        setLink(anchor, item.href); setButtonCopy(anchor, item.cta);
      }
      root.querySelectorAll<HTMLAnchorElement>('[data-introduction-open]').forEach(anchor => { anchor.href = item.href; });
      buttons.forEach((button,i) => { button.setAttribute('aria-pressed', String(i === active)); button.tabIndex = i === active ? 0 : -1; });
      root.dispatchEvent(new CustomEvent('pickupchange'));
      if (!motion.matches && typeof copy.animate === 'function') {
        // Keep media planes stationary beneath the SVG clip. Animating the
        // decoding video itself can expose an unclipped frame during a switch.
        // Only the foreground copy needs an entrance animation.
        animations = [copy].map(element => {
          const animation = element.animate(
            [{ opacity: .25, translate: '0 8px' }, { opacity: 1, translate: '0 0' }],
            { duration: 600, easing: 'cubic-bezier(.2,.7,.2,1)' },
          );
          // Rapid changes intentionally cancel the previous entrance animation.
          animation.finished.catch(() => {});
          return animation;
        });
      }
    }
    if (manual) root.querySelector('.pickup-announcement')!.textContent = `${active + 1} / ${items.length}: ${items[active].title}`;
    schedule();
  };
  if (items.length > 1) {
    controls.hidden = false;
    renderPlayback();
    buttons.forEach((button,index) => {
      button.addEventListener('click', () => select(index, true));
      button.addEventListener('keydown', event => {
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : ['ArrowRight','ArrowDown'].includes(event.key) ? (index + 1) % items.length
          : ['ArrowLeft','ArrowUp'].includes(event.key) ? (index + items.length - 1) % items.length : undefined;
        if (next === undefined) return;
        event.preventDefault(); select(next, true); buttons[next].focus({ preventScroll: true });
      });
    });
    toggle.addEventListener('click', () => { paused = !paused; renderPlayback(); schedule(); });
    info.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; schedule(); } });
    info.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') { hovered = false; schedule(); } });
    root.addEventListener('focusin', () => { focused = true; schedule(); });
    root.addEventListener('focusout', event => { focused = event.relatedTarget instanceof Node && root.contains(event.relatedTarget); schedule(); });
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', () => {
      if (motion.matches) { paused = true; animations.forEach(animation => animation.cancel()); }
      renderPlayback(); schedule();
    });
    const checkView = () => { const bounds = root.getBoundingClientRect(); inView = bounds.bottom > 0 && bounds.top < window.innerHeight; schedule(); };
    if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); schedule(); }).observe(root);
    else { window.addEventListener('scroll', checkView, {passive:true}); checkView(); }
    const dialogObserver = new MutationObserver(schedule);
    document.querySelectorAll('dialog').forEach(dialog => dialogObserver.observe(dialog, {attributes:true, attributeFilter:['open']}));
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', checkView);
    root.dispatchEvent(new CustomEvent('pickupchange'));
  }
}
