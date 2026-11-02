import { Client } from '@notionhq/client';
import fs from 'fs';

// Config
const NOTION_TOKEN  = '';
const DATABASE_ID   = '';
const OUTPUT_FILE   = 'notion_database.json';

// Initialize Notion client
const notion = new Client({ auth: NOTION_TOKEN });

async function fetchDatabase() {

    const extractRecord = (results) => {

        return {
            id      : results?.id,
            title   : results?.properties['Лекция']?.title[0]?.plain_text,
            link    : results?.properties['Лекция']?.title[0]?.href,

            where   : results?.properties['Къде ?']?.rich_text[0]?.plain_text,
            when    : results?.properties['Кога ?']?.rich_text[0]?.plain_text,
            who     : results?.properties['Лектор']?.rich_text[0]?.plain_text,
        }
    };


    try {
        let results = [];
        let hasMore = true;
        let nextCursor = undefined;


        // Paginate through results
        while (hasMore) {
            const response = await notion.databases.query({
                database_id: DATABASE_ID,
                start_cursor: nextCursor,
            });

            results = results.concat(response.results);
            hasMore = response.has_more;
            nextCursor = response.next_cursor;
        }

        const simplified = [];
        for(const record of results) {
            simplified.push(extractRecord(record));
        }

        for(const record of simplified) {
            if(record.who == ' Стефан Ангелов') {
                await notion.pages.update({
                    page_id     : record.id,
                    properties  : {
                        "Лектор": {
                            rich_text: [{ 
                                text            : { 
                                    content : ' Стефан Ангелов',
                                    link    : { type: "url", url: 'https://www.linkedin.com/in/stangangelov/' } 
                                },
                                "annotations"   : { color: "yellow" }
                            }],
                        }
                    }
                })
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

fetchDatabase();