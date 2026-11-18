import { supabaseClient, isSupabaseConfigured } from './services/supabaseClient';
import { getInstanceConfig } from './config/instanceConfig';
import { buildOrgChart } from './services/orgChartBuilder';
import {
  buildOrgTreeModel,
  countReports,
  groupTeamByTitle,
  isManager,
  showEveryReportAsBox,
  teamGroupLabel,
  type OrgTreeModel,
  type OrgTreePerson,
} from './services/orgTreeLayout';

/** Colors cycle by top-level branch so each executive's organization reads as one group. */
const BRANCH_COLORS = ['--oc-b1', '--oc-b2', '--oc-b3', '--oc-b4', '--oc-b5', '--oc-b6'];
const LEADERS_LABEL_JOIN = ' & ';
const company = getInstanceConfig().companyName;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const searchable: HTMLElement[] = [];
const managerOf = new Map<string, string>();

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function tag(node: HTMLElement, person: OrgTreePerson): void {
  node.dataset.name = person.name;
  node.dataset.search = `${person.name} ${person.title} ${person.department}`.toLowerCase();
  searchable.push(node);
}

function personBox(person: OrgTreePerson, color: string, variant = '', note = ''): HTMLElement {
  const box = el('div', `oc-box ${variant}`.trim());
  box.style.setProperty('--c', `var(${color})`);
  box.setAttribute('role', 'treeitem');
  box.append(el('div', 'oc-name', person.name), el('div', 'oc-title', person.title));
  if (note) box.append(el('div', 'oc-note', note));
  const total = countReports(person);
  if (total) {
    box.append(el('span', 'oc-count', `${person.children.length} direct · ${total} total`));
  }
  tag(box, person);
  return box;
}

function teamCard(people: OrgTreePerson[], color: string, managerName: string): HTMLElement {
  const card = el('div', 'oc-team');
  card.style.setProperty('--c', `var(${color})`);
  for (const group of groupTeamByTitle(people)) {
    card.append(el('h3', '', teamGroupLabel(group)));
    const list = el('ol');
    for (const person of group.people) {
      const item = el('li', '', person.name);
      item.title = person.title;
      tag(item, person);
      managerOf.set(person.name, managerName);
      list.append(item);
    }
    card.append(list);
  }
  return card;
}

function branch(person: OrgTreePerson, color: string, managerName: string, note = ''): HTMLLIElement {
  managerOf.set(person.name, managerName);
  const li = el('li', 'oc-node');
  li.append(personBox(person, color, '', note));
  if (!person.children.length) return li;

  const ul = el('ul');
  const boxAll = showEveryReportAsBox(person);
  const boxed = boxAll ? person.children : person.children.filter(isManager);
  const listed = boxAll ? [] : person.children.filter((c) => !isManager(c));
  for (const child of boxed) ul.append(branch(child, color, person.name));
  if (listed.length) {
    const cardLi = el('li', 'oc-node');
    cardLi.append(teamCard(listed, color, person.name));
    ul.append(cardLi);
  }
  li.append(ul);
  return li;
}

/** Builds leaders → reports as one tree; `reports` keeps each person's index for branch color. */
function buildTree(model: OrgTreeModel, reports: { person: OrgTreePerson; index: number }[]): HTMLUListElement {
  const topName = model.leaders.map((p) => p.name).join(LEADERS_LABEL_JOIN);
  const rootUl = el('ul');
  const rootLi = el('li', 'oc-node');
  const leaders = el('div', 'oc-leaders');
  for (const leader of model.leaders) leaders.append(personBox(leader, '--oc-leader', 'oc-leader'));
  rootLi.append(leaders);
  if (reports.length) {
    const ul = el('ul');
    for (const { person, index } of reports) {
      const color = BRANCH_COLORS[index % BRANCH_COLORS.length];
      const note = person.reportsTo ? `Reports to ${person.reportsTo}` : '';
      ul.append(branch(person, color, person.reportsTo || topName, note));
    }
    rootLi.append(ul);
  }
  rootUl.append(rootLi);
  return rootUl;
}

/** Print is one page holding the whole chart at full size; the page is sized to fit it. */
function renderPrintPage(model: OrgTreeModel, company: string, employeeCount: number): void {
  const host = $('ocPrintPages');
  host.replaceChildren();
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const page = el('section', 'oc-print-page');
  const head = el('header', 'oc-print-head');
  head.append(
    el('h2', '', `${company} Org Chart`),
    el('p', '', `${employeeCount} employees · reporting lines as of ${today}`)
  );
  const scaler = el('div', 'oc-print-scaler');
  const tree = el('div', 'oc-tree');
  tree.append(
    buildTree(
      model,
      model.topReports.map((person, index) => ({ person, index }))
    )
  );
  scaler.append(tree);
  page.append(head, scaler);
  host.append(page);
}

function render(model: OrgTreeModel, employeeCount: number): void {
  const tree = $('ocTree');
  tree.replaceChildren();
  searchable.length = 0;
  managerOf.clear();

  tree.append(
    buildTree(
      model,
      model.topReports.map((person, index) => ({ person, index }))
    )
  );

  const legend = $('ocLegend');
  legend.replaceChildren();
  model.topReports.forEach((person, i) => {
    if (!isManager(person)) return;
    const item = el('span');
    const dot = el('i', 'oc-dot');
    dot.style.background = `var(${BRANCH_COLORS[i % BRANCH_COLORS.length]})`;
    item.append(dot, `${person.name}’s organization`);
    legend.append(item);
  });

  // Print pages reuse the same builders; drop their nodes from search afterwards.
  const searchCount = searchable.length;
  renderPrintPage(model, company, employeeCount);
  searchable.length = searchCount;

  const unmatched = $('ocUnmatched');
  const list = $('ocUnmatchedList');
  list.replaceChildren(...model.unmatched.map((p) => el('li', '', `${p.name} · ${p.title}`)));
  unmatched.hidden = !model.unmatched.length;
}

/* ---------- zoom ---------- */

let fit = true;
try {
  fit = localStorage.getItem('orbisOrgChartFit') !== '0';
} catch {
  /* storage unavailable */
}

function layout(): void {
  const stage = $('ocStage');
  const scaler = $('ocScaler');
  scaler.style.zoom = '';
  const styles = getComputedStyle(stage);
  const avail =
    stage.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight) - 2;
  const width = scaler.scrollWidth;
  if (fit && width > avail) {
    scaler.style.zoom = String(Math.max(avail / width, 0.2));
  } else {
    stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
  }
  $('ocFit').setAttribute('aria-pressed', String(fit));
  $('ocFull').setAttribute('aria-pressed', String(!fit));
}

function setFit(next: boolean): void {
  fit = next;
  try {
    localStorage.setItem('orbisOrgChartFit', fit ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
  layout();
}

/* ---------- print: one page, sized to the whole chart ---------- */

const PRINT_MARGIN_IN = 0.4;
const PX_PER_IN = 96;

/** Sets the printed page to the chart's own dimensions so nothing is split or shrunk. */
function sizePageForPrint(): void {
  const page = document.querySelector<HTMLElement>('.oc-print-page');
  const scaler = page?.querySelector<HTMLElement>('.oc-print-scaler');
  const head = page?.querySelector<HTMLElement>('.oc-print-head');
  if (!page || !scaler || !head) return;
  // The chart's natural (max-content) size, not whatever width the print layout gives the page.
  const contentWidth = Math.max(scaler.scrollWidth, head.scrollWidth);
  const contentHeight = scaler.scrollHeight + head.offsetHeight;
  const width = contentWidth / PX_PER_IN + 2 * PRINT_MARGIN_IN + 0.1;
  const height = contentHeight / PX_PER_IN + 2 * PRINT_MARGIN_IN + 0.15;
  let style = document.getElementById('ocPageSize');
  if (!style) {
    style = document.createElement('style');
    style.id = 'ocPageSize';
    document.head.append(style);
  }
  style.textContent = `@page { size: ${width.toFixed(2)}in ${height.toFixed(2)}in; margin: ${PRINT_MARGIN_IN}in; }`;
}

/* ---------- search ---------- */

function chainFor(name: string): string[] {
  const chain: string[] = [];
  let current = managerOf.get(name);
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = managerOf.get(current);
  }
  return chain;
}

function onSearch(): void {
  const value = $<HTMLInputElement>('ocSearch').value.trim().toLowerCase();
  const tree = $('ocTree');
  const chain = $('ocChain');
  searchable.forEach((node) => node.classList.remove('oc-hit'));
  if (!value) {
    tree.classList.remove('oc-dimmed');
    chain.textContent = '';
    return;
  }
  const hits = searchable.filter((node) => node.dataset.search?.includes(value));
  hits.forEach((node) => node.classList.add('oc-hit'));
  tree.classList.add('oc-dimmed');
  if (hits.length === 1) {
    const name = hits[0].dataset.name || '';
    const up = chainFor(name);
    const strong = el('b', '', name);
    chain.replaceChildren(strong, up.length ? ` reports to ${up.join(' → ')}` : ' is at the top of the chart');
    if (!fit) hits[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  } else {
    chain.textContent = hits.length ? `${hits.length} matches` : 'No one matches that';
  }
}

/* ---------- data ---------- */

function showMessage(message: string, linkToOrbis = false): void {
  $('ocSummary').textContent = message;
  if (linkToOrbis) {
    const link = el('a', 'oc-link', 'Open Orbis to sign in');
    link.href = '/';
    $('ocSummary').append(' ', link);
  }
}

async function load(): Promise<void> {
  if (!isSupabaseConfigured) {
    showMessage('Orbis isn’t connected to its database on this site.');
    return;
  }
  const { data: session } = await supabaseClient.auth.getSession();
  if (!session.session) {
    showMessage('Sign in to Orbis to see the org chart.', true);
    return;
  }

  const { data, error } = await supabaseClient
    .from('employees')
    .select('id, first_name, last_name, department, position, supervisor, status');

  if (error) {
    showMessage('Couldn’t load the roster. Refresh to try again.');
    console.error('[Org chart] roster load failed', error);
    return;
  }

  const { roots } = buildOrgChart(data || [], { activeOnly: true });
  const model = buildOrgTreeModel(roots);
  const total = (data || []).filter((e) => String(e.status || '').toUpperCase() === 'ACTIVE').length;
  render(model, total);
  sizePageForPrint();
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  $('ocSummary').textContent = `${total} employees · reporting lines as of ${today}`;
  document.fonts?.ready.then(layout);
  layout();
}

$('ocTitle').textContent = `${company} Org Chart`;
document.title = `${company} Org Chart | Orbis`;

$('ocFit').addEventListener('click', () => setFit(true));
$('ocFull').addEventListener('click', () => setFit(false));
$('ocSearch').addEventListener('input', onSearch);
$('ocPrint').addEventListener('click', () => window.print());
window.addEventListener('beforeprint', sizePageForPrint);
window.addEventListener('afterprint', layout);
window.addEventListener('resize', layout);

void load();
