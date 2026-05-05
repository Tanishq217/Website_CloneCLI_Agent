import fs from 'fs/promises';
import { exec } from 'child_process';
import readline from 'readline/promises';
import Groq from 'groq-sdk';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

// grab api key from .env, exit early if it's missing
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    console.error("[ERROR] GROQ_API_KEY not found in .env file. Please add it and try again.");
    process.exit(1);
}

const groq = new Groq({ apiKey });

// these are the three tools the agent uses
// each one does exactly one thing — that's the point

// writes the final HTML to a file
async function createFile(filename, content) {
    try {
        await fs.writeFile(filename, content, 'utf8');
        return `File "${filename}" created successfully.`;
    } catch (err) {
        return `Error creating file: ${err.message}`;
    }
}

// opens the cloned page in whatever browser the user has
async function openInBrowser(filename) {
    try {
        const abs = `${process.cwd()}/${filename}`;
        const cmd = process.platform === 'darwin' ? `open "${abs}"` :
            process.platform === 'win32' ? `start "" "${abs}"` :
                `xdg-open "${abs}"`;
        // wait a bit so the file is written before the browser tries to open it
        await new Promise(r => setTimeout(r, 700));
        exec(cmd);
        return `Opened "${filename}" in browser.`;
    } catch (err) {
        return `Error opening browser: ${err.message}`;
    }
}

// fetches the website and pulls out the parts we care about
async function scrapeWebsite(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    return {
        title: $('title').text().trim().substring(0, 120) || 'Untitled',
        navText: $('header, nav').first().text().replace(/\s+/g, ' ').trim().substring(0, 400) || '',
        heroText: $('main, [class*="hero"], section').first().text().replace(/\s+/g, ' ').trim().substring(0, 700) || '',
        footerText: $('footer').first().text().replace(/\s+/g, ' ').trim().substring(0, 500) || '',
    };
}

// this is the main agent function
// it follows the START -> THINK -> TOOL -> OBSERVE -> OUTPUT pattern
async function cloneWebsite(url) {

    console.log("\n[START] New cloning task received.");
    console.log(`        Target URL: ${url}`);

    // figure out what needs to happen before doing anything
    console.log("\n[THINK] Breaking down the task...");
    console.log("        Step 1: Scrape the target website to extract layout data.");
    console.log("        Step 2: Send scraped data to the LLM to generate HTML/CSS.");
    console.log("        Step 3: Write the generated code to 'website_clone.html'.");
    console.log("        Step 4: Open the file in the browser for the user.");

    // step 1: actually scrape the site
    console.log("\n[TOOL]  → scrapeWebsite(" + url + ")");
    let scraped;
    try {
        scraped = await scrapeWebsite(url);
    } catch (err) {
        console.error(`\n[OBSERVE] Scraping failed: ${err.message}`);
        console.log("          The site may be blocking bots (Cloudflare etc). Try another URL.");
        return;
    }

    console.log(`\n[OBSERVE] Scrape complete.`);
    console.log(`          Title    : ${scraped.title}`);
    console.log(`          Nav items: ${scraped.navText.substring(0, 80)}...`);
    console.log(`          Hero text: ${scraped.heroText.substring(0, 80)}...`);

    // now prep the prompt — if it's scaler we inject specific color tokens
    // so the clone actually looks like the real thing
    console.log("\n[THINK]  Preparing design context and calling LLM (llama-3.3-70b-versatile)...");

    let designHints = `Use Google Fonts (Inter), Flexbox/Grid, and a modern professional color palette appropriate for the scraped site.`;
    if (url.includes('scaler.com')) {
        designHints = `
Exact Scaler Academy Design Tokens — replicate these precisely:
- Font        : 'Inter' from Google Fonts
- Navbar      : white (#ffffff) background, 70px height, logo left, links right, subtle bottom shadow
- Hero bg     : linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e40af 100%)
- Hero H1     : 48px, weight 800, color #ffffff, max-width 700px
- Hero subtext: 18px, color #c7d2fe, max-width 560px
- CTA buttons : primary = #2563eb bg, white text, padding 14px 32px, radius 8px, weight 700
                secondary = outlined, white border, white text
- Courses grid: white cards, radius 12px, box-shadow, on #f8fafc background
- Footer      : background #0f172a, text #94a3b8, 4-column link grid
- Transitions : 0.2s ease on all hover states
- Spacing     : generous padding (80px vertical, 5% horizontal)`.trim();
    }

    const systemPrompt = `You are an expert frontend developer. 
Return ONLY a complete, valid HTML5 document. No markdown fences, no explanation text — just the raw HTML starting with <!DOCTYPE html>.`;

    const userPrompt = `Clone this website's visual design into a single HTML file.

SCRAPED DATA:
Title   : ${scraped.title}
Nav     : ${scraped.navText}
Hero    : ${scraped.heroText}
Footer  : ${scraped.footerText}

DESIGN INSTRUCTIONS:
${designHints}

BUILD THESE SECTIONS:
1. <header> — sticky navbar, logo text on left, nav links on right, professional styling.
2. <section class="hero"> — full-width, use the gradient, real headline from scraped data, subtext, 2 CTA buttons.
3. <section class="courses"> — heading "Our Programs", CSS Grid with 3-4 real course cards from scraped data.
4. <footer> — dark background, 4-column layout, real links from scraped footer text, copyright line.

CSS RULES:
- All CSS in a single <style> block in <head>. No inline styles.
- Google Fonts Inter imported via @import.
- Hover effects on all buttons and nav links.
- Fully responsive (media query for screens < 768px).
- No Lorem ipsum. Use real scraped text throughout.

Start immediately with <!DOCTYPE html>.`;

    // step 2: ask the LLM to generate the HTML
    console.log("\n[TOOL]  → groq.chat.completions.create(llama-3.3-70b-versatile)");
    let htmlContent = '';
    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 8192,
            temperature: 0.2,
        });
        htmlContent = completion.choices[0].message.content.trim();

        // model sometimes wraps in ``` even when told not to, strip those out
        if (htmlContent.startsWith('```')) {
            htmlContent = htmlContent.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
        }
    } catch (err) {
        console.error("\n[OBSERVE] LLM generation failed:", err.message);
        return;
    }

    const lineCount = htmlContent.split('\n').length;
    console.log(`\n[OBSERVE] HTML generated successfully. (${lineCount} lines)`);

    // step 3: save the file
    const filename = 'website_clone.html';
    console.log(`\n[TOOL]  → createFile("${filename}")`);
    const fileResult = await createFile(filename, htmlContent);
    console.log(`[OBSERVE] ${fileResult}`);

    // step 4: pop it open in the browser
    console.log(`\n[TOOL]  → openInBrowser("${filename}")`);
    const browserResult = await openInBrowser(filename);
    console.log(`[OBSERVE] ${browserResult}`);

    console.log("\n[OUTPUT] Clone complete!");
    console.log(`         File saved at: ${process.cwd()}/${filename}`);
    console.log("         Check your browser — the cloned site should be open now.\n");
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// try to find a URL in whatever the user typed
// handles both full URLs (https://...) and bare domains (scaler.com)
function extractUrl(input) {
    let match = input.match(/https?:\/\/[^\s]+/);
    if (match) return match[0];

    // if no protocol found, check for something that looks like a domain
    match = input.match(/\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)\b/);
    if (match) return `https://${match[1]}`;

    return null;
}

async function chatLoop() {
    console.log("\n==========================================");
    console.log("  Website Cloner AI  —  Powered by Groq");
    console.log("==========================================");
    console.log("  Give me any URL and I'll clone it for you.");
    console.log("  Example: Clone https://scaler.com");
    console.log("  Type 'exit' or 'quit' to stop.\n");

    // keep looping until user says exit — this is the agent loop
    while (true) {
        const userInput = await rl.question("You: ");
        const trimmed = userInput.trim();

        if (!trimmed) continue;

        if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
            console.log("\nAgent: Goodbye! 👋\n");
            rl.close();
            break;
        }

        const url = extractUrl(trimmed);

        if (url) {
            await cloneWebsite(url);
        } else {
            // doesn't look like a URL, just guide them
            console.log("\nAgent: I need a website URL to clone. Try something like:");
            console.log("       Clone https://scaler.com\n");
        }
    }
}

chatLoop();
