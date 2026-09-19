const workMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll<HTMLElement>('[data-works]').forEach(root => {
  const panels = [...root.querySelectorAll<HTMLElement>('[data-work-panel]')];
  if (panels.length < 2) return;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-work-tab]')];
  const controls = root.querySelector<HTMLElement>('[data-work-controls]');
  const play = root.querySelector<HTMLButtonElement>('[data-work-play]');
  const current = root.querySelector<HTMLElement>('[data-work-current]');
  const announcement = root.querySelector<HTMLElement>('[data-work-announcement]');
  const copies = panels.map(panel => panel.querySelector<HTMLElement>('.works-copy')!);
  const rings = tabs.map(tab => tab.querySelector<SVGCircleElement>('[data-work-progress]'));
  const en = root.dataset.lang === 'en';
  const ja = root.dataset.lang === 'ja';
  let index = 0;
  let userPaused = workMotion.matches;
  let hovered = copies[0].matches(':hover') && window.matchMedia('(hover: hover)').matches;
  let focused = root.contains(document.activeElement);
  let inView = false;
  let timer: number | undefined;
  let progress: Animation | undefined;
  const interval = 10_000;

  const stopTimer = () => {
    window.clearTimeout(timer);
    timer = undefined;
    root.dataset.playing = 'false';
    progress?.pause();
  };
  const schedule = () => {
    stopTimer();
    if (userPaused || hovered || focused || !inView || document.hidden) return;
    root.dataset.playing = 'true';
    progress?.cancel();
    const ring = rings[index];
    // The ring shares the timer's restart point; pausing never resets its position.
    progress = !workMotion.matches && typeof ring?.animate === 'function'
      ? ring.animate([{ strokeDashoffset: '0' }, { strokeDashoffset: '100' }], { duration: interval, easing: 'linear', fill: 'forwards' })
      : undefined;
    timer = window.setTimeout(() => select(index + 1, false), interval);
  };
  const select = (next: number, manual: boolean) => {
    progress?.cancel();
    progress = undefined;
    index = (next + panels.length) % panels.length;
    panels.forEach((panel, i) => {
      const active = i === index;
      panel.classList.toggle('is-active', active);
      panel.inert = !active;
      panel.setAttribute('aria-hidden', String(!active));
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabs[i].id);
      tabs[i].setAttribute('aria-selected', String(active));
      tabs[i].tabIndex = active ? 0 : -1;
    });
    hovered = copies[index].matches(':hover') && window.matchMedia('(hover: hover)').matches;
    if (current) current.textContent = String(index + 1).padStart(2, '0');
    if (manual && announcement) announcement.textContent = `${index + 1} / ${panels.length} — ${tabs[index].textContent?.trim()}`;
    schedule();
  };
  const renderPlayback = () => {
    play?.setAttribute('aria-label', userPaused ? (ja ? 'スライドショーを再生' : en ? 'Play slideshow' : '播放轮播') : (ja ? 'スライドショーを停止' : en ? 'Pause slideshow' : '暂停轮播'));
    const icon = play?.querySelector('[data-work-play-icon]');
    const label = play?.querySelector('[data-work-play-label]');
    if (icon) icon.setAttribute('data-paused', String(userPaused));
    if (label) label.textContent = userPaused ? (ja ? '再生' : en ? 'Play' : '播放') : (ja ? '停止' : en ? 'Pause' : '暂停');
  };

  root.classList.add('is-carousel');
  root.setAttribute('aria-roledescription', ja ? 'カルーセル' : en ? 'carousel' : '轮播展示');
  if (controls) controls.hidden = false;
  select(0, false);
  renderPlayback();
  root.querySelector('[data-work-prev]')?.addEventListener('click', () => select(index - 1, true));
  root.querySelector('[data-work-next]')?.addEventListener('click', () => select(index + 1, true));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i, true));
    tab.addEventListener('keydown', event => {
      const destination = event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (i + 1) % panels.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (i - 1 + panels.length) % panels.length : undefined;
      if (destination === undefined) return;
      event.preventDefault();
      tabs[destination].focus({ preventScroll: true });
      select(destination, true);
    });
  });
  play?.addEventListener('click', () => { userPaused = !userPaused; renderPlayback(); schedule(); });
  copies.forEach((copy, i) => {
    copy.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && i === index) { hovered = true; schedule(); } });
    copy.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse' && i === index) { hovered = false; schedule(); } });
  });
  root.addEventListener('focusin', () => { focused = true; schedule(); });
  root.addEventListener('focusout', event => { focused = event.relatedTarget instanceof Node && root.contains(event.relatedTarget); schedule(); });
  document.addEventListener('visibilitychange', schedule);
  workMotion.addEventListener('change', () => {
    // Enabling reduced motion stops rotation; disabling it never overrides an explicit pause.
    if (workMotion.matches) userPaused = true;
    renderPlayback(); schedule();
  });
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      schedule();
    });
    observer.observe(root);
  } else {
    const checkView = () => {
      const bounds = root.getBoundingClientRect();
      const visible = bounds.bottom > 0 && bounds.top < window.innerHeight;
      if (visible !== inView) { inView = visible; schedule(); }
    };
    window.addEventListener('scroll', checkView, { passive: true });
    window.addEventListener('resize', checkView);
    checkView();
  }
  window.addEventListener('pagehide', stopTimer);
  window.addEventListener('pageshow', schedule);
});
