document.querySelectorAll<HTMLElement>('[data-work-catalog]').forEach(root => {
  const grid = root.querySelector<HTMLElement>('[data-catalog-grid]');
  if (!grid) return;
  const cards = [...grid.querySelectorAll<HTMLElement>('[data-work-card]')];
  const search = root.querySelector<HTMLInputElement>('[data-catalog-search]')!;
  const sort = root.querySelector<HTMLSelectElement>('[data-catalog-sort]')!;
  const filters = [...root.querySelectorAll<HTMLButtonElement>('[data-category-filter]')];
  const empty = root.querySelector<HTMLElement>('[data-catalog-empty]')!;
  let category = '';
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const ordered = sort.value === 'name'
      ? [...cards].sort((a,b)=>(a.dataset.title || '').localeCompare(b.dataset.title || '', document.documentElement.lang))
      : cards;
    let count = 0;
    ordered.forEach(card => {
      card.hidden = !!((category && card.dataset.category !== category) || !(card.dataset.search || '').toLocaleLowerCase().includes(query));
      if (!card.hidden) count++;
      grid.append(card);
    });
    root.querySelector('[data-catalog-count]')!.textContent = String(count);
    empty.hidden = count > 0;
    filters.forEach(button=>button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === category)));
  };
  filters.forEach(button=>button.addEventListener('click',()=>{category=button.dataset.categoryFilter || '';update();}));
  search.addEventListener('input', update);
  sort.addEventListener('change', update);
  root.querySelector('[data-catalog-reset]')?.addEventListener('click',()=>{category='';search.value='';sort.value='default';update();search.focus();});
  root.querySelector<HTMLElement>('[data-catalog-tools]')!.hidden = false;
  update();
});

document.querySelectorAll<HTMLElement>('[data-product-gallery]').forEach(root => {
  const image = root.querySelector<HTMLImageElement>('[data-gallery-image]')!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-gallery-src]')];
  const select = (index: number) => {
    const button = buttons[index];
    image.src = button.dataset.gallerySrc!;
    image.alt = button.dataset.galleryAlt!;
    root.querySelector('[data-gallery-caption]')!.textContent = button.dataset.galleryLabel!;
    root.querySelector('[data-gallery-index]')!.textContent = String(index+1).padStart(2,'0');
    image.parentElement!.classList.toggle('is-logo', index === 1);
    buttons.forEach((item,i)=>item.setAttribute('aria-pressed',String(i===index)));
  };
  buttons.forEach((button,index)=>{
    button.addEventListener('click',()=>select(index));
    button.addEventListener('keydown',event=>{
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1
        : event.key === 'ArrowRight' ? (index+1)%buttons.length : event.key === 'ArrowLeft' ? (index+buttons.length-1)%buttons.length : undefined;
      if (next === undefined) return;
      event.preventDefault();select(next);buttons[next].focus({preventScroll:true});
    });
  });
  root.querySelector<HTMLElement>('[data-gallery-controls]')!.hidden = buttons.length < 2;
});
