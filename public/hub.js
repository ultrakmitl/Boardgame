const form = document.querySelector('#game-filters');
const count = document.querySelector('#game-count');
const empty = document.querySelector('#game-empty');
const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().replace(/['’]/g, '');
const tiles = [...document.querySelectorAll('.game-library > li')].map((element) => ({
  element,
  min: Number(element.dataset.min),
  max: Number(element.dataset.max),
  genre: element.dataset.genre,
  text: normalize(element.textContent + ' ' + element.dataset.alias),
}));

function render() {
  const { q, players, genre } = form.elements;
  const terms = normalize(q.value).trim().split(/\s+/).filter(Boolean);
  const partySize = Number(players.value);
  let shown = 0;
  for (const tile of tiles) {
    const matches = (!partySize || (partySize >= tile.min && partySize <= tile.max))
      && (!genre.value || genre.value === tile.genre)
      && terms.every((term) => tile.text.includes(term));
    tile.element.hidden = !matches;
    if (matches) shown += 1;
  }
  count.textContent = `แสดง ${shown} จาก ${tiles.length} เกม`;
  empty.hidden = shown !== 0;
}

function restore() {
  const params = new URLSearchParams(location.search);
  for (const name of ['q', 'players', 'genre']) {
    const field = form.elements.namedItem(name);
    const value = params.get(name) ?? '';
    field.value = field instanceof HTMLSelectElement && ![...field.options].some((option) => option.value === value)
      ? '' : value;
  }
  render();
}

function update() {
  const url = new URL(location.href);
  for (const name of ['q', 'players', 'genre']) {
    const value = form.elements.namedItem(name).value.trim();
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  if (url.href !== location.href) history.replaceState(null, '', url);
  render();
}

form.hidden = false;
restore();
form.addEventListener('input', update);
form.addEventListener('submit', (event) => { event.preventDefault(); update(); });
form.addEventListener('reset', (event) => {
  event.preventDefault();
  for (const name of ['q', 'players', 'genre']) form.elements.namedItem(name).value = '';
  update();
});
window.addEventListener('popstate', restore);
