import { apiGet } from '../api.js';
import { loadActiveCareer } from '../components/career.js';
import { pageHead, esc, emptyState } from '../components/ui.js';

const TAG_CLASS = { Upset: 'loss', Championship: 'win', Blowout: 'win', Recruiting: '', Milestone: '', Recap: '', Playoffs: '' };

function articleCard(n) {
  return `<article class="card news-card">
    <div class="row spread" style="align-items:flex-start">
      <h3 style="margin:0">${esc(n.headline)}</h3>
      <span class="tag ${TAG_CLASS[n.category] || ''}">${esc(n.category)}</span>
    </div>
    <p class="muted" style="margin:8px 0 6px">${esc(n.body)}</p>
    <div class="mono muted" style="font-size:.74rem">Season ${n.season_year} · Week ${n.week}</div>
  </article>`;
}

export async function render(container) {
  const ctx = await loadActiveCareer(container, 'News');
  if (!ctx) return;
  const { career } = ctx;

  let page = 1;
  const limit = 12;
  const items = [];

  async function load() {
    const data = await apiGet(`/api/news/${career.id}?page=${page}&limit=${limit}`);
    items.push(...data.items);
    return data;
  }

  const first = await load();
  if (!first.total) {
    container.innerHTML = pageHead('News')
      + `<div class="card">${emptyState('📰', 'No news yet. Simulate games to make headlines.', '#/schedule', 'Go to schedule')}</div>`;
    return;
  }

  function draw(hasMore) {
    container.innerHTML = pageHead('News', `${first.total} stories this career`)
      + `<div class="stack" id="newsFeed">${items.map(articleCard).join('')}</div>`
      + (hasMore ? `<div class="row" style="justify-content:center;margin-top:18px"><button class="btn" id="more">Load more</button></div>` : '');
    const more = container.querySelector('#more');
    if (more) more.addEventListener('click', async () => {
      page += 1;
      const d = await load();
      draw(d.hasMore);
    });
  }
  draw(first.hasMore);
}
