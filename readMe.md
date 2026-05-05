# AI Agent CLI Tool - Universal Website Cloner

This is a Node.js CLI tool that runs in the terminal and accepts natural language instructions from the user. It acts as an AI frontend developer agent powered by Groq (Llama 3.3). 
When provided with a URL, the agent can actively scrape the target website, reason through its structure, use internal tools (`scrapeWebsite`, `createFile`, `openInBrowser`), and clone the website by generating a fully working modern HTML webpage.

## Features
- **Conversational CLI**: Chat with the agent directly in your terminal.
- **Agentic Reasoning**: Follows the `START -> THINK -> TOOL -> OBSERVE -> OUTPUT` loop.
- **Dynamic Web Scraping**: The AI dynamically fetches and extracts the layout of **any** provided URL using `cheerio`.
- **Website Cloner**: Automatically generates a high-quality HTML/CSS clone focusing on the Header, Hero Section, and Footer.

## Setup Instructions

1. **Clone the repository** (or download the files).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Setup Environment Variables**:
   - Create a `.env` file in the root directory (you can copy `.env.example`).
   - Get a free API key from [Groq Console](https://console.groq.com/keys).
   - Add it to your `.env` file:
     ```env
     GROQ_API_KEY=your_actual_groq_api_key_here
     ```

## How to Run

Start the agent loop by running:
```bash
node index.js
```

You can then chat with it:
- "Hello, who are you?"
- "Can you clone https://scaler.com for me?"
- Type "exit" or "quit" to stop.

## Demo Recording Instructions (For YouTube Submission)
1. Open your terminal and screen recorder.
2. Run `node index.js`.
3. Type a simple hello prompt to show it works conversationally.
4. Type exactly: `"clone https://www.scaler.com"` (or any other website URL).
5. Let the video record the terminal showing the thought process (`[THINK]`, `[TOOL]`, `[OBSERVE]`, etc.), including the new `scrapeWebsite` tool.
6. The browser will automatically pop open with the newly generated `website_clone.html` file.
7. Scroll through the generated webpage (Header, Hero Section, Footer) to show the quality of the dynamic clone.
8. Go back to terminal and type `exit`.

---
*Created for Assignment 02 — AI Agent CLI Tool*