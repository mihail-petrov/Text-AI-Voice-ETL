
# Text & Notion Automation Utilities

A collection of utility scripts designed to automate interactions with Notion databases (fetching, exporting, and updating data) as well as generating voice audio from text documents.

## 🛠 Prerequisites

Before running these scripts, ensure you have the following installed and configured:

*   **Environment:** [e.g., Python 3.9+ or Node.js v16+]
*   **Dependencies:** Run `[e.g., pip install -r requirements.txt or npm install]`
*   **Notion API:** You will need a Notion Integration Token and the relevant Database IDs. Ensure your integration is invited to the specific databases you wish to interact with.

## 📁 Modules Overview

Here is a breakdown of the utilities included in this repository:

### 1. `extractor_voice` (Text-to-Speech Generation)
This module handles the conversion of text-based documents into audio files.
*   **Functionality:** Reads input text and utilizes a TTS (Text-to-Speech) engine to output an audio file (e.g., .mp3, .wav).
*   **Input:** [Specify input format: e.g., plain text file, string passed via command line]
*   **Output:** Generated audio file in the specified directory.
*   **Configuration needed:** [Mention if they need API keys for ElevenLabs, Google TTS, OpenAI, etc., or if it uses a local library].

### 2. `notion__add_new_record_to_db`
Automates data entry into your Notion workspace.
*   **Functionality:** Connects to the Notion API to programmatically insert a new page/row into a designated Notion Database.
*   **Use Case:** Useful for logging events, saving web clippings, or integrating external form submissions directly into Notion.
*   **Required Env Variables:** `NOTION_API_KEY`, `NOTION_DATABASE_ID`.

### 3. `notion__export_database_into_html`
Creates formatted, web-ready backups of your Notion data.
*   **Functionality:** Retrieves all records from a specific Notion database and parses the data into a structured HTML document.
*   **Use Case:** Generating static web pages from Notion data, or creating offline-readable, styled backups.

### 4. `notion__export_database_into_txt`
Extracts Notion data for simplified text processing.
*   **Functionality:** Retrieves records from a Notion database and formats them into a clean, plain `.txt` file.
*   **Use Case:** Ideal for feeding Notion data into Large Language Models (LLMs), creating minimalist backups, or parsing data without HTML/JSON overhead.

### 5. `notion__get_dat_from_notion` *(Retrieval Utility)*
*(Note: Assuming 'dat' means 'data')*
*   **Functionality:** The core querying utility. It fetches the raw JSON data/properties from a specified Notion database or page.
*   **Use Case:** Acts as a helper function for the other modules, or can be used independently to inspect the raw data structure coming from the Notion API.

## 🚀 How to Run

*(Provide basic examples of how to execute the scripts here. Example below assumes Python)*

**To export a database to TXT:**
```bash
cd notion__export_database_into_txt
python main.py --db_id <YOUR_DATABASE_ID>
```

**To generate voice from text:**
```bash
cd extractor_voice
python extract.py --input "path/to/text.txt" --output "output_audio.mp3"
```

## ⚙️ Environment Variables Setup

Create a `.env` file in the root directory (do not commit this file) and include the following:

```env
NOTION_API_KEY="secret_your_notion_integration_token_here"
DEFAULT_NOTION_DB_ID="your_database_id_here"
[ANY_OTHER_API_KEYS_HERE]="..."
```

## 📝 License

[Specify your license here, e.g., MIT, GPL, or state that it is for personal use]