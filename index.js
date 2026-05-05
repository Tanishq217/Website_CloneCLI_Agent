import fs from 'fs/promises';
import { exec } from 'child_process';
import readline from 'readline/promises';
import Groq from 'groq-sdk';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

// grab api key from .env
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    console.error("[ERROR] GROQ_API_KEY not found in .env file. Please add it and try again.");
    process.exit(1);
}

const groq = new Groq({ apiKey });

// ─────────────────────────────────────────────
// TOOL DEFINITIONS
// The agent uses these tools to get things done.
// ─────────────────────────────────────────────

// Tool 1 — write HTML file to disk
async function createFile(filename, content) {
    try {
        await fs.writeFile(filename, content, 'utf8');
        return `File "${filename}" created successfully.`;
    } catch (err) {
        return `Error creating file: ${err.message}`;
    }
}

// Tool 2 — open a local HTML file in the default browser
async function openInBrowser(filename) {
    try {
        const abs = `${process.cwd()}/${filename}`;
        const cmd = process.platform === 'darwin' ? `open "${abs}"` :
                    process.platform === 'win32'  ? `start "" "${abs}"` :
                                                    `xdg-open "${abs}"`;
        // wait a bit so the file is definitely flushed before browser tries to read it
        await new Promise(r => setTimeout(r, 700));
        exec(cmd);
        return `Opened "${filename}" in browser.`;
    } catch (err) {
        return `Error opening browser: ${err.message}`;
    }
}

// Tool 3 — fetch a URL and extract page structure using cheerio
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
        title:      $('title').text().trim().substring(0, 120)         || 'Untitled',
        navText:    $('header, nav').first().text().replace(/\s+/g,' ').trim().substring(0, 400) || '',
        heroText:   $('main, [class*="hero"], section').first().text().replace(/\s+/g,' ').trim().substring(0, 700) || '',
        footerText: $('footer').first().text().replace(/\s+/g,' ').trim().substring(0, 500) || '',
    };
}

// ─────────────────────────────────────────────
// CORE AGENT — START → THINK → TOOL → OBSERVE → OUTPUT
// ─────────────────────────────────────────────

async function cloneWebsite(url) {

    // ── START ──────────────────────────────────
    console.log("\n[START] New cloning task received.");
    console.log(`        Target URL: ${url}`);

    // ── THINK ──────────────────────────────────
    console.log("\n[THINK] Breaking down the task...");
    console.log("        Step 1: Scrape the target website to extract layout data.");
    console.log("        Step 2: Send scraped data to the LLM to generate HTML/CSS.");
    console.log("        Step 3: Write the generated code to 'website_clone.html'.");
    console.log("        Step 4: Open the file in the browser for the user.");

    // ── TOOL: scrapeWebsite ────────────────────
    console.log("\n[TOOL]  → scrapeWebsite(" + url + ")");
    let scraped;
    try {
        scraped = await scrapeWebsite(url);
    } catch (err) {
        console.error(`\n[OBSERVE] ❌ Scraping failed: ${err.message}`);
        console.log("          The site may be blocking automated requests (e.g. Cloudflare). Try another URL.");
        return;
    }

    // ── OBSERVE ────────────────────────────────
    console.log(`\n[OBSERVE] Scrape complete.`);
    console.log(`          Title    : ${scraped.title}`);
    console.log(`          Nav items: ${scraped.navText.substring(0, 80)}...`);
    console.log(`          Hero text: ${scraped.heroText.substring(0, 80)}...`);

    // ── THINK (step 2) ─────────────────────────
    console.log("\n[THINK]  Preparing design context and calling LLM (llama-3.3-70b-versatile)...");

    // Inject Scaler-specific design tokens if applicable
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
Return ONLY a complete, valid HTML5 document. No markdown fences, no explanation text, no code comments explaining what you are doing — just the raw HTML starting with <!DOCTYPE html>.`;

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
3. <section class="courses"> — heading "Our Programs", CSS Grid with 3–4 real course cards from scraped data.
4. <footer> — dark background, 4-column layout, real links from scraped footer text, copyright line.

CSS RULES:
- All CSS in a single <style> block in <head>. No inline styles.
- Google Fonts Inter imported via @import.
- Hover effects on all buttons and nav links.
- Fully responsive (media query for screens < 768px).
- No Lorem ipsum. Use real scraped text throughout.

Start immediately with <!DOCTYPE html>.`;

    // ── TOOL: Groq LLM HTML generation ────────
    console.log("\n[TOOL]  → groq.chat.completions.create(llama-3.3-70b-versatile)");
    let htmlContent = '';
    try {
        const completion = await groq.chat.completions.create({
            model:       "llama-3.3-70b-versatile",
            messages:    [
                { role: "system", content: systemPrompt },
                { role: "user",   content: userPrompt }
            ],
            max_tokens:  8192,
            temperature: 0.2,
        });
        htmlContent = completion.choices[0].message.content.trim();
        // strip any markdown the model might still add
        if (htmlContent.startsWith('```')) {
            htmlContent = htmlContent.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
        }
    } catch (err) {
        console.error("\n[OBSERVE] ❌ LLM generation failed:", err.message);
        return;
    }

    // ── OBSERVE ────────────────────────────────
    const lineCount = htmlContent.split('\n').length;
    console.log(`\n[OBSERVE] HTML generated successfully. (${lineCount} lines)`);

    // ── TOOL: createFile ───────────────────────
    const filename = 'website_clone.html';
    console.log(`\n[TOOL]  → createFile("${filename}")`);
    const fileResult = await createFile(filename, htmlContent);
    console.log(`[OBSERVE] ${fileResult}`);

    // ── TOOL: openInBrowser ────────────────────
    console.log(`\n[TOOL]  → openInBrowser("${filename}")`);
    const browserResult = await openInBrowser(filename);
    console.log(`[OBSERVE] ${browserResult}`);

    // ── OUTPUT ─────────────────────────────────
    console.log("\n[OUTPUT] ✅ Clone complete!");
    console.log(`         File : ${process.cwd()}/${filename}`);
    console.log("         The cloned website has been opened in your browser.\n");
}

// ─────────────────────────────────────────────
// CLI LOOP — keep running until user types exit/quit
// ─────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// accept https:// URLs and also bare domains like "scaler.com" or "clone google.com"
function extractUrl(input) {
    // first try to find a full URL with protocol
    let match = input.match(/https?:\/\/[^\s]+/);
    if (match) return match[0];

    // fallback: find anything that looks like a domain (word.word or word.word/path)
    match = input.match(/\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)\b/);
    if (match) return `https://${match[1]}`;

    return null;
}

async function chatLoop() {
    console.log("\n==========================================");
    console.log("  🤖  Website Cloner AI  —  Powered by Groq");
    console.log("==========================================");
    console.log("  I can clone any website into an HTML file.");
    console.log("  Give me a URL, e.g.: Clone https://scaler.com");
    console.log("  Type 'exit' or 'quit' to stop.\n");

    // keep the conversation going forever — this is the agent loop
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
            // kick off the cloning agent loop
            await cloneWebsite(url);
        } else {
            // conversational fallback — ask the user for a URL
            console.log("\nAgent: I'm a website cloning agent! Give me a URL and I'll clone it.");
            console.log("       Example: Clone https://scaler.com\n");
        }
    }
}

chatLoop();
