const fs          = require('fs');
const path        = require('path');
const { Client }  = require('@notionhq/client');

const NOTION_API_KEY    = '';
const databaseIdArg     = "";
const outputDirArg      = "./";

if (!NOTION_API_KEY) {
  console.error('Error: set the NOTION_API_KEY environment variable.');
  process.exit(1);
}
if (!databaseIdArg) {
  console.error('Usage: node notion-db-export.js <database_id> [output_dir]');
  process.exit(1);
}
 
const DATABASE_ID = databaseIdArg;
const OUTPUT_DIR = path.resolve(outputDirArg || 'notion-export');
 
const notion = new Client({ auth: NOTION_API_KEY });
 
// ---------- helpers ----------
 
function sanitizeFilename(name) {
  return (name || 'untitled')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 150) || 'untitled';
}
 
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
 
// Render an array of Notion rich_text objects into inline HTML
function renderRichText(richTextArr) {
  if (!richTextArr || richTextArr.length === 0) return '';
  return richTextArr
    .map((rt) => {
      let text = escapeHtml(rt.plain_text || '');
      const ann = rt.annotations || {};
      if (ann.code) text = `<code>${text}</code>`;
      if (ann.bold) text = `<strong>${text}</strong>`;
      if (ann.italic) text = `<em>${text}</em>`;
      if (ann.strikethrough) text = `<s>${text}</s>`;
      if (ann.underline) text = `<u>${text}</u>`;
      const href = rt.href || (rt.text && rt.text.link && rt.text.link.url);
      if (href) text = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${text}</a>`;
      return text;
    })
    .join('');
}
 
// Fetch ALL children of a block (or page), handling pagination
async function fetchAllChildren(blockId) {
  const children = [];
  let cursor = undefined;
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
 
// Recursively render a list of blocks to HTML, wrapping consecutive
// list items in <ul>/<ol> as appropriate.
async function renderBlocks(blocks) {
  let html = '';
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const type = block.type;
 
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      const tag = type === 'bulleted_list_item' ? 'ul' : 'ol';
      let itemsHtml = '';
      while (i < blocks.length && blocks[i].type === type) {
        itemsHtml += await renderBlock(blocks[i]);
        i++;
      }
      html += `<${tag}>\n${itemsHtml}</${tag}>\n`;
      continue;
    }
 
    html += await renderBlock(block);
    i++;
  }
  return html;
}
 
async function renderChildrenIfAny(block) {
  if (!block.has_children) return '';
  const children = await fetchAllChildren(block.id);
  return await renderBlocks(children);
}
 
async function renderBlock(block) {

  const type = block.type;
  const data = block[type] || {};
  const idAttr = ` data-block-id="${block.id}"`;
 
  switch (type) {
    case 'paragraph': {
      const text = renderRichText(data.rich_text);
      const inner = await renderChildrenIfAny(block);
      return `<p${idAttr}>${text}</p>\n${inner}`;
    }
    case 'heading_1':
      return `<h1${idAttr}>${renderRichText(data.rich_text)}</h1>\n`;
    case 'heading_2':
      return `<h2${idAttr}>${renderRichText(data.rich_text)}</h2>\n`;
    case 'heading_3':
      return `<h3${idAttr}>${renderRichText(data.rich_text)}</h3>\n`;
    case 'bulleted_list_item':
    case 'numbered_list_item': {
      const text = renderRichText(data.rich_text);
      const inner = await renderChildrenIfAny(block);
      return `  <li${idAttr}>${text}${inner ? `\n${inner}` : ''}</li>\n`;
    }
    case 'to_do': {
      const checked = data.checked ? 'checked' : '';
      const text = renderRichText(data.rich_text);
      return `<div class="todo"${idAttr}><label><input type="checkbox" disabled ${checked}> ${text}</label></div>\n`;
    }
    case 'toggle': {
      const summary = renderRichText(data.rich_text);
      const inner = await renderChildrenIfAny(block);
      return `<details${idAttr}><summary>${summary}</summary>\n${inner}</details>\n`;
    }
    case 'quote': {
      const text = renderRichText(data.rich_text);
      const inner = await renderChildrenIfAny(block);
      return `<blockquote${idAttr}>${text}${inner}</blockquote>\n`;
    }
    case 'callout': {
      const icon = data.icon && data.icon.emoji ? `${data.icon.emoji} ` : '';
      const text = renderRichText(data.rich_text);
      const inner = await renderChildrenIfAny(block);
      return `<div class="callout"${idAttr}>${icon}${text}${inner}</div>\n`;
    }
    case 'code': {
      const text = escapeHtml((data.rich_text || []).map((r) => r.plain_text).join(''));
      const lang = data.language || '';
      return `<pre${idAttr}><code class="language-${escapeHtml(lang)}">${text}</code></pre>\n`;
    }
    case 'divider':
      return `<hr${idAttr}>\n`;
    case 'image': {
      const url = data.type === 'external' ? data.external.url : data.file.url;
      const caption = renderRichText(data.caption);
      return `<figure${idAttr}><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}">${
        caption ? `<figcaption>${caption}</figcaption>` : ''
      }</figure>\n`;
    }
    case 'video':
    case 'file':
    case 'pdf': {
      const url = data.type === 'external' ? data.external.url : (data.file && data.file.url);
      return `<p${idAttr}><a href="${escapeHtml(url || '#')}" target="_blank" rel="noopener">${type} attachment</a></p>\n`;
    }
    case 'bookmark':
    case 'link_preview': {
      const url = data.url || '';
      return `<p${idAttr}><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></p>\n`;
    }
    case 'table': {
      const rows = await fetchAllChildren(block.id);
      let rowsHtml = '';
      for (const row of rows) {
        if (row.type !== 'table_row') continue;
        const cellsHtml = row.table_row.cells
          .map((cell) => `<td>${renderRichText(cell)}</td>`)
          .join('');
        rowsHtml += `<tr>${cellsHtml}</tr>\n`;
      }
      return `<table${idAttr}>\n${rowsHtml}</table>\n`;
    }
    case 'column_list': {
      const columns = await fetchAllChildren(block.id);
      let colsHtml = '';
      for (const col of columns) {
        const inner = await renderChildrenIfAny(col);
        colsHtml += `<div class="column">${inner}</div>\n`;
      }
      return `<div class="column-list"${idAttr}>\n${colsHtml}</div>\n`;
    }
    case 'child_page':
      return `<p${idAttr}><em>[Sub-page: ${escapeHtml(data.title || '')}]</em></p>\n`;
    case 'synced_block': {
      const inner = await renderChildrenIfAny(block);
      return `<div class="synced-block"${idAttr}>${inner}</div>\n`;
    }
    default:
      // Fallback: unsupported block type, note it so nothing silently vanishes
      return `<!-- unsupported block type: ${type} -->\n`;
  }
}
 
// Extract a human-readable title from a page's properties
function getPageTitle(page) {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && prop.title && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join('');
    }
  }
  return page.id;
}
 
// Render the page's database properties as a small metadata table
function renderProperties(page) {

  const props = page.properties || {};
  const rows = [];
  for (const [name, prop] of Object.entries(props)) {
    let value = '';
    switch (prop.type) {
      case 'title':
        value = prop.title.map((t) => t.plain_text).join('');
        break;
      case 'rich_text':
        value = prop.rich_text.map((t) => t.plain_text).join('');
        break;
      case 'select':
        value = prop.select ? prop.select.name : '';
        break;
      case 'multi_select':
        value = prop.multi_select.map((s) => s.name).join(', ');
        break;
      case 'status':
        value = prop.status ? prop.status.name : '';
        break;
      case 'date':
        value = prop.date ? `${prop.date.start}${prop.date.end ? ' → ' + prop.date.end : ''}` : '';
        break;
      case 'checkbox':
        value = prop.checkbox ? 'Yes' : 'No';
        break;
      case 'number':
        value = prop.number != null ? String(prop.number) : '';
        break;
      case 'url':
        value = prop.url || '';
        break;
      case 'email':
        value = prop.email || '';
        break;
      case 'phone_number':
        value = prop.phone_number || '';
        break;
      case 'people':
        value = prop.people.map((p) => p.name || p.id).join(', ');
        break;
      case 'files':
        value = prop.files.map((f) => f.name).join(', ');
        break;
      case 'relation':
        value = prop.relation.map((r) => r.id).join(', ');
        break;
      case 'formula':
        value = prop.formula[prop.formula.type] != null ? String(prop.formula[prop.formula.type]) : '';
        break;
      default:
        value = '';
    }
    if (value !== '') {
      rows.push(`<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(value)}</td></tr>`);
    }
  }
  if (rows.length === 0) return '';
  return `<table class="properties">\n${rows.join('\n')}\n</table>\n`;
}
 
function wrapHtmlDocument(title, propsHtml, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
  h1, h2, h3 { line-height: 1.3; }
  pre { background: #f4f4f4; padding: 12px; overflow-x: auto; border-radius: 6px; }
  code { background: #f4f4f4; padding: 2px 4px; border-radius: 4px; }
  blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 16px; color: #555; }
  .callout { background: #f7f6f3; border-radius: 6px; padding: 12px 16px; margin: 12px 0; }
  table.properties { border-collapse: collapse; margin-bottom: 24px; }
  table.properties th, table.properties td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  table { border-collapse: collapse; margin: 12px 0; }
  table td, table th { border: 1px solid #ddd; padding: 6px 10px; }
  figure { margin: 12px 0; }
  img { max-width: 100%; }
  .column-list { display: flex; gap: 24px; }
  .column { flex: 1; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${propsHtml}
${bodyHtml}
</body>
</html>
`;
}
 
// As of the Notion API version 2025-09-03, databases can contain multiple
// "data sources", and querying moved from /v1/databases/{id}/query to
// /v1/data_sources/{id}/query. We first retrieve the database to discover
// its data source id(s), then query each data source.
async function getDataSourceIds(databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  if (db.data_sources && db.data_sources.length > 0) {
    return db.data_sources.map((ds) => ds.id);
  }
  // Fallback for older workspaces/SDKs without the data_sources field
  return [databaseId];
}
 
// Fetch ALL pages across all data sources of the database, handling pagination
async function fetchAllDatabasePages(databaseId) {

  const dataSourceIds = await getDataSourceIds(databaseId);
  const pages = [];
  for (const dataSourceId of dataSourceIds) {
    let cursor = undefined;
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
 
async function exportPage(page, index, total) {
  const title = getPageTitle(page);
  const filename = sanitizeFilename(title) + '.html';
  console.log(`[${index + 1}/${total}] Exporting "${title}" -> ${filename}`);
 
  const blocks = await fetchAllChildren(page.id);
  const bodyHtml = await renderBlocks(blocks);
  const propsHtml = renderProperties(page);
  const doc = wrapHtmlDocument(title, propsHtml, bodyHtml);
 
  // Handle duplicate filenames by appending the page id suffix
  let outPath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(outPath)) {
    const shortId = page.id.replace(/-/g, '').slice(0, 8);
    outPath = path.join(OUTPUT_DIR, `${sanitizeFilename(title)}-${shortId}.html`);
  }
 
  fs.writeFileSync(outPath, doc, 'utf8');
}
 
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
 
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