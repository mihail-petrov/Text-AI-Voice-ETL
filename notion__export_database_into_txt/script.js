const fs                = require('fs');
const path              = require('path');
const { Client }        = require('@notionhq/client');

const NOTION_API_KEY    = '';
const DATABASE_ID       = process.argv[2] || '';
const OUTPUT_DIR        = path.resolve(process.argv[3] || './notion-export');
const GROUP_PROPERTY    = 'Глава';        // <-- exact name of the property the table is grouped by
const UNGROUPED_FOLDER  = 'Ungrouped';
const INDENT            = '    ';

if (!NOTION_API_KEY) {
  console.error('Error: set the NOTION_API_KEY environment variable.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

// ---------- helpers ----------

function sanitizeFilename(name) {
  return (name || 'untitled')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 150) || 'untitled';
}

function indentText(text, prefix) {
  return text
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : line))
    .join('\n');
}

function richTextToMd(richTextArr) {
  if (!richTextArr || richTextArr.length === 0) return '';
  return richTextArr
    .map((rt) => {
      const raw = rt.plain_text || '';
      const [, lead, core, trail] = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (!core) return raw;
      let text = core;
      const ann = rt.annotations || {};
      if (ann.code) text = `\`${text}\``;
      if (ann.bold) text = `**${text}**`;
      if (ann.italic) text = `*${text}*`;
      if (ann.strikethrough) text = `~~${text}~~`;
      const href = rt.href || (rt.text && rt.text.link && rt.text.link.url);
      if (href) text = `[${text}](${href})`;
      return lead + text + trail;
    })
    .join('');
}

async function fetchAllChildren(blockId) {
  const children = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    children.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return children;
}

async function childrenToMd(block) {
  if (!block.has_children) return '';
  return renderBlocks(await fetchAllChildren(block.id));
}

// ---------- blocks -> Markdown ----------

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle']);

async function renderBlocks(blocks) {
  let md = '';
  let prevType = null;
  let counter = 0;

  for (const block of blocks) {
    const type = block.type;
    if (LIST_TYPES.has(prevType) && !LIST_TYPES.has(type)) md += '\n';
    counter = type === 'numbered_list_item' ? (prevType === type ? counter + 1 : 1) : 0;
    md += await renderBlock(block, counter);
    prevType = type;
  }
  if (LIST_TYPES.has(prevType)) md += '\n';
  return md;
}

async function renderBlock(block, number) {
  const type = block.type;
  const data = block[type] || {};
  const text = richTextToMd(data.rich_text);

  switch (type) {
    case 'paragraph': {
      const inner = await childrenToMd(block);
      return `${text}\n\n${inner}`;
    }
    case 'heading_1': return `# ${text}\n\n`;
    case 'heading_2': return `## ${text}\n\n`;
    case 'heading_3': return `### ${text}\n\n`;

    case 'bulleted_list_item': {
      const inner = await childrenToMd(block);
      return `- ${text}\n${inner ? indentText(inner.replace(/\n+$/, '\n'), INDENT) : ''}`;
    }
    case 'numbered_list_item': {
      const inner = await childrenToMd(block);
      return `${number}. ${text}\n${inner ? indentText(inner.replace(/\n+$/, '\n'), INDENT) : ''}`;
    }
    case 'to_do': {
      const inner = await childrenToMd(block);
      return `- [${data.checked ? 'x' : ' '}] ${text}\n${inner ? indentText(inner.replace(/\n+$/, '\n'), INDENT) : ''}`;
    }
    case 'toggle': {
      const inner = await childrenToMd(block);
      return `- **${text}**\n${inner ? indentText(inner.replace(/\n+$/, '\n'), INDENT) : ''}`;
    }
    case 'quote':
    case 'callout': {
      const icon = type === 'callout' && data.icon && data.icon.emoji ? `${data.icon.emoji} ` : '';
      const inner = await childrenToMd(block);
      const body = `${icon}${text}\n${inner ? '\n' + inner.trim() : ''}`.trim();
      return `${indentText(body, '> ').replace(/^(?=\S)/gm, '> ')}\n\n`.replace(/^> > /gm, '> ');
    }
    case 'code': {
      const code = (data.rich_text || []).map((r) => r.plain_text).join('');
      const lang = data.language && data.language !== 'plain text' ? data.language : '';
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    case 'divider':
      return `---\n\n`;
    case 'image': {
      const url = data.type === 'external' ? data.external.url : data.file.url;
      return `![${richTextToMd(data.caption)}](${url})\n\n`;
    }
    case 'video':
    case 'file':
    case 'pdf': {
      const url = data.type === 'external' ? data.external.url : data.file && data.file.url;
      return `[${type} attachment](${url || '#'})\n\n`;
    }
    case 'bookmark':
    case 'link_preview':
      return `<${data.url || ''}>\n\n`;
    case 'equation':
      return `$$\n${data.expression || ''}\n$$\n\n`;
    case 'table': {
      const rows = (await fetchAllChildren(block.id)).filter((r) => r.type === 'table_row');
      if (rows.length === 0) return '';
      const toRow = (cells) =>
        `| ${cells.map((c) => richTextToMd(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`;
      const width = rows[0].table_row.cells.length;
      const hasHeader = block.table.has_column_header;
      const header = hasHeader ? toRow(rows[0].table_row.cells) : toRow(Array(width).fill([]));
      const body = (hasHeader ? rows.slice(1) : rows).map((r) => toRow(r.table_row.cells));
      return [header, `| ${Array(width).fill('---').join(' | ')} |`, ...body].join('\n') + '\n\n';
    }
    case 'column_list': {
      let out = '';
      for (const col of await fetchAllChildren(block.id)) out += await childrenToMd(col);
      return out;
    }
    case 'child_page':
      return `*[Sub-page: ${data.title || ''}]*\n\n`;
    case 'synced_block':
      return childrenToMd(block);
    default:
      return `<!-- unsupported block type: ${type} -->\n\n`;
  }
}

// ---------- properties ----------

function propertyToString(prop) {
  switch (prop.type) {
    case 'title':        return prop.title.map((t) => t.plain_text).join('');
    case 'rich_text':    return prop.rich_text.map((t) => t.plain_text).join('');
    case 'select':       return prop.select ? prop.select.name : '';
    case 'multi_select': return prop.multi_select.map((s) => s.name).join(', ');
    case 'status':       return prop.status ? prop.status.name : '';
    case 'date':         return prop.date ? `${prop.date.start}${prop.date.end ? ' → ' + prop.date.end : ''}` : '';
    case 'checkbox':     return prop.checkbox ? 'Yes' : 'No';
    case 'number':       return prop.number != null ? String(prop.number) : '';
    case 'url':          return prop.url || '';
    case 'email':        return prop.email || '';
    case 'phone_number': return prop.phone_number || '';
    case 'people':       return prop.people.map((p) => p.name || p.id).join(', ');
    case 'files':        return prop.files.map((f) => f.name).join(', ');
    case 'relation':     return prop.relation.map((r) => r.id).join(', ');
    case 'formula': {
      const v = prop.formula[prop.formula.type];
      return v != null ? String(v) : '';
    }
    default:             return '';
  }
}

function getPageTitle(page) {
  for (const prop of Object.values(page.properties || {})) {
    if (prop.type === 'title' && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join('');
    }
  }
  return page.id;
}

function getGroupName(page) {

  const prop = (page.properties || {})[GROUP_PROPERTY];
  return (prop && propertyToString(prop).trim()) || UNGROUPED_FOLDER;
}

function appendZero(number) {

  if(number >= 0 && number <= 9) {
    return `0${number}`;
  }

  return `${number}`;
}

function getGroupNumber(page) {

  const prop = (page.properties || {})['р.№'];
  return appendZero(prop && propertyToString(prop).trim());
}

function getPageNumber(page) {

  const prop = (page.properties || {})['г.№'];
  return appendZero(prop && propertyToString(prop).trim());
}

function buildFrontMatter(page) {
  const lines = [];
  for (const [name, prop] of Object.entries(page.properties || {})) {
    const value = propertyToString(prop);
    if (value !== '') lines.push(`${JSON.stringify(name)}: ${JSON.stringify(value)}`);
  }
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n` : '';
}

// ---------- data fetching ----------

async function getDataSourceIds(databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  if (db.data_sources && db.data_sources.length > 0) {
    return db.data_sources.map((ds) => ds.id);
  }
  return [databaseId];
}

async function fetchAllDatabasePages(databaseId) {
  const pages = [];
  for (const dataSourceId of await getDataSourceIds(databaseId)) {
    let cursor;
    do {
      const res = await notion.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: 100,
      });
      pages.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
  }
  return pages;
}

// ---------- export ----------

async function exportPage(page, index, total) {

  const groupNumber = getGroupNumber(page)
  const pageNumber  = getPageNumber(page)
  const numberId    = `${groupNumber}_${pageNumber}_`;

  const title       = getPageTitle(page);
  const group       = getGroupName(page);
  const groupDir    = path.join(OUTPUT_DIR, sanitizeFilename(group));

  fs.mkdirSync(groupDir, { recursive: true });

  // 
  let outPath = path.join(groupDir, `${numberId}${sanitizeFilename(title)}.txt`);
  if (fs.existsSync(outPath)) {

    const shortId = page.id.replace(/-/g, '').slice(0, 8);
    outPath = path.join(groupDir, ` ${numberId}${sanitizeFilename(title)}-${shortId}.md`);
  }

  console.log(`[${index + 1}/${total}] ${group} / ${title}`);

  const body = await renderBlocks(await fetchAllChildren(page.id));
  // const doc = `${buildFrontMatter(page)}# ${title}\n\n${body}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  const doc = `# ${title}\n\n${body}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';


  fs.writeFileSync(outPath, doc, 'utf8');
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Fetching pages from database ${DATABASE_ID} ...`);
  const pages = await fetchAllDatabasePages(DATABASE_ID);
  console.log(`Found ${pages.length} page(s). Exporting to ${OUTPUT_DIR} ...`);

  for (let i = 0; i < pages.length; i++) {
    try {
      await exportPage(pages[i], i, pages.length);
    } catch (err) {
      console.error(`Failed to export page ${pages[i].id}:`, err.message);
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});