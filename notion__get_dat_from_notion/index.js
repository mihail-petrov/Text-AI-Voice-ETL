import * as cheerio from 'cheerio';
import { Client } from '@notionhq/client';

const urlCollection = [
    // { where: 'VarnaConf', when: '2012', url: 'https://varnaconf.com/archive/2012' },
    // { where: 'VarnaConf', when: '2013', url: 'https://varnaconf.com/archive/2013' },
    { where: 'RuseConf', when: '2014', url: 'https://ruseconf.com/archive/2014' },
    { where: 'RuseConf', when: '2015', url: 'https://ruseconf.com/archive/2015' },
    { where: 'RuseConf', when: '2016', url: 'https://ruseconf.com/archive/2016' },
    { where: 'RuseConf', when: '2017', url: 'https://ruseconf.com/archive/2017' },
    { where: 'RuseConf', when: '2018', url: 'https://ruseconf.com/archive/2018' },
    { where: 'RuseConf', when: '2019', url: 'https://ruseconf.com/archive/2019' },
    { where: 'RuseConf', when: '2022', url: 'https://ruseconf.com/archive/2022' },
    { where: 'RuseConf', when: '2023', url: 'https://ruseconf.com/archive/2023' },
    { where: 'RuseConf', when: '2024', url: 'https://ruseconf.com/archive/2024' },
    // { where: 'VarnaConf', when: '2025', url: 'https://varnaconf.com/archive/2025' },
];

// Config
const NOTION_TOKEN  = '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';
const DATABASE_ID   = '232ae491ed5480c3b298c4caf9f4b69d';

// Init Notion client
const notion = new Client({ auth: NOTION_TOKEN });

async function extractSchedule(record) {
    try {

        const response = await fetch(record.url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const html  = await response.text();
        const $     = cheerio.load(html);

        // Select the #schedule article
        const schedule = $('#schedule');
        if (schedule.length === 0) {
            console.log('No schedule found.');
            return;
        }

        const lines = [];

        // Loop through all <li> inside #schedule
        schedule.find('li').each(async (index, li) => {
            const title     = $(li).find('strong').text().trim()    || '';
            const speaker   = $(li).find('.speaker').text().trim()  || '';
            const video     = $(li).find('.video').attr('href')     || null;

            // Skip if speaker is missing
            if (!speaker) return;

            // Escape double quotes in CSV
            const csvTitle      = `${title.replace(/"/g, '""')}`;
            const csvSpeaker    = `${speaker.replace(/"/g, '""')}`;
            const csvVideo      = (video) ? `${video.replace(/"/g, '""')}` : null;

            const titleObject   = {};
            titleObject['content']   = csvTitle;

            if(video) {
                titleObject['link']   = { type: "url", url: csvVideo };
            }


            await notion.pages.create({
                parent: { database_id: DATABASE_ID },
                properties: {
                    Name: {
                        title: [{ text: titleObject }],
                    },
                    "Лектор": {
                        rich_text: [{ 
                            text: { content: csvSpeaker},
                             "annotations": { color: "red" }
                        }],
                    },
                    "Кога ?": {
                        rich_text: [{ 
                            text: { content: record.when } 
                        }],
                    },
                    "Къде ?": {
                        rich_text: [{ 
                            text: { content: record.where } 
                        }],
                    }
                },
            });
            console.log(`✅ Page record created`);

            lines.push(`${csvTitle},${csvSpeaker},${csvVideo}`);
        });

        if (lines.length === 0) {
            console.log('No valid schedule entries found.');
            return;
        }

    } catch (error) {
        console.error('Error:', error);
    }
}


for(const record of urlCollection) {
    await extractSchedule(record);
}