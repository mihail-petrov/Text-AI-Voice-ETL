import { Client } from '@notionhq/client';
import fs from 'fs';

// Config
const NOTION_TOKEN  = '';
const DATABASE_ID   = '';
const OUTPUT_FILE   = 'notion_database.json';

// Initialize Notion client
const notion = new Client({ auth: NOTION_TOKEN });

async function fetchDatabase() {

    const getLectorSet = (collection) => {

        const lectorSetCollection = new Set();

        for(const record of collection) {
            lectorSetCollection.add(record.who);
        }

        return lectorSetCollection;
    }

    const extractRecord = (results) => {

        return {
            title   : results?.properties['Лекция']?.title[0]?.plain_text,
            link    : results?.properties['Лекция']?.title[0]?.href,

            where   : results?.properties['Къде ?']?.rich_text[0]?.plain_text,
            when    : results?.properties['Кога ?']?.rich_text[0]?.plain_text,
            who     : results?.properties['Лектор']?.rich_text[0]?.plain_text,
        }
    };

    const sortConferencesByOrder = (conferences, order) => {

        // Create a map for quick lookup of the index of each "where" value
        const orderMap = order.reduce((acc, confName, index) => {
            acc[confName] = index;
            return acc;
        }, {});

        // Sort the array using the custom order
        return conferences.slice().sort((a, b) => {
            const indexA = orderMap[a.where] ?? Number.MAX_SAFE_INTEGER;
            const indexB = orderMap[b.where] ?? Number.MAX_SAFE_INTEGER;
            return indexA - indexB;
        });
    };

    const CONFERENCE_ORDER = [
        "TarnovoConf", "PlovdivConf", "BurgasConf", "VarnaConf", "RuseConf"
    ];

    try {
        let results = [];
        let hasMore = true;
        let nextCursor = undefined;

        console.log('🔍 Fetching database records...');

        // Paginate through results
        while (hasMore) {

            const response = await notion.databases.query({
                database_id: DATABASE_ID,
                start_cursor: nextCursor,
            });

            results     = results.concat(response.results);
            hasMore     = response.has_more;
            nextCursor  = response.next_cursor;
        }

        const simplified = [];
        for(const record of results) {
            simplified.push(extractRecord(record));
        }
        
        const result = sortConferencesByOrder(simplified, CONFERENCE_ORDER);
        fs.writeFileSync(OUTPUT_FILE        , JSON.stringify(result, null, 2), 'utf-8');

        const who    = getLectorSet(simplified);
        console.log(who);
        fs.writeFileSync("notion_lecturer"  , JSON.stringify(who, null, 2), 'utf-8');

        console.log(`✅ Exported ${simplified.length} rows to ${OUTPUT_FILE}`);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Helper: Extract text from Notion property
function extractValue(prop) {
    switch (prop.type) {
        case 'title':
            return prop.title.map(t => t.plain_text).join(' ');
        case 'rich_text':
            return prop.rich_text.map(t => t.plain_text).join(' ');
        case 'url':
            return prop.url || '';
        case 'number':
            return prop.number || null;
        case 'checkbox':
            return prop.checkbox || false;
        case 'select':
            return prop.select ? prop.select.name : '';
        case 'multi_select':
            return prop.multi_select.map(s => s.name);
        case 'date':
            return prop.date ? prop.date.start : '';
        case 'people':
            return prop.people.map(p => p.name || p.id);
        case 'files':
            return prop.files.map(f => f.name);
        default:
            return '';
    }
}

fetchDatabase();