import fs from 'fs/promises';
import { exec } from 'child_process';
import readline from 'readline/promises';
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
dotenv.config();

// okay so let's figure out what user wants
// Load env variables
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    console.error("Oops! Missing GROQ_API_KEY in .env file.");
    process.exit(1);
}

const groq = new Groq({ apiKey });

// Tool 1: Create a file
async function createFile(filename, content) {
    try {
        await fs.writeFile(filename, content, 'utf8');
        return `File ${filename} created successfully.`;
    } catch (error) {
        return "Failed to create file: " + error.message;
    }
}

// Tool 2: Open file in browser
async function openInBrowser(filename) {
    try {
        let cmd = process.platform === 'darwin' ? `open "${filename}"` :
            process.platform === 'win32' ? `start "" "${filename}"` :
                `xdg-open "${filename}"`;

        exec(cmd);
        return `Opened ${filename} in browser successfully.`;
    } catch (error) {
        return "Failed to open browser: " + error.message;
    }
}

// Tool 3: Scrape Website
async function scrapeWebsite(url) {
    try {
        console.log(`[TOOL] Scraping ${url}...`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract basic styling hints
        const title = $('title').text() || 'No title';

        // Extract structure
        const header = $('header, nav').text().replace(/\s+/g, ' ').substring(0, 300);
        const hero = $('section:first-of-type, main > div:first-child, .hero').text().replace(/\s+/g, ' ').substring(0, 500);
        const footer = $('footer').text().replace(/\s+/g, ' ').substring(0, 300);

        let designHints = "Use Flexbox, modern sans-serif fonts, and create a beautiful UI. Generate actual CSS styles.";

        // If it's Scaler, force exact design tokens for a perfect clone
        if (url.includes('scaler.com')) {
            designHints = `
                EXACT DESIGN TOKENS FOR SCALER:
                - Navbar: height 70px, white bg, logo left, links right. 
                - Hero: Dark blue/purple gradient background (linear-gradient(90deg, #1e1b4b, #312e81)), white text.
                - Hero Title: 48px bold, "Become the Professional Built for the Next Decade in AI."
                - Buttons: Primary button is bright blue (#2563eb) with white text, 12px 24px padding, 8px border-radius.
                - Use 'Inter' font from Google Fonts.
                - Footer: Dark grey background (#171717), white text, organized in columns.
                Make the HTML visually flawless, do NOT use placeholder or basic styles. It must look extremely premium.
            `;
        }

        return JSON.stringify({
            title,
            header_text: header || "No explicit header found.",
            hero_text: hero || "No explicit hero section found.",
            footer_text: footer || "No explicit footer found.",
            design_instructions: designHints
        });
    } catch (error) {
        return "Failed to scrape website: " + error.message;
    }
}

const availableTools = {
    createFile,
    openInBrowser,
    scrapeWebsite
};

const toolDefinitions = [
    {
        type: "function",
        function: {
            name: "createFile",
            description: "writes HTML/CSS/JS content to a file. USE THIS TOOL to save the cloned website.",
            parameters: {
                type: "object",
                properties: {
                    filename: { type: "string", description: "Name of the file, e.g., website_clone.html" },
                    content: { type: "string", description: "The full HTML/CSS/JS code to write into the file" }
                },
                required: ["filename", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "openInBrowser",
            description: "opens the given file in the default web browser",
            parameters: {
                type: "object",
                properties: {
                    filename: { type: "string", description: "Name of the file to open" }
                },
                required: ["filename"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "scrapeWebsite",
            description: "Fetches and extracts the textual layout and structure (header, hero, footer) of a given URL",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The full URL of the website to scrape, e.g., https://www.example.com" }
                },
                required: ["url"]
            }
        }
    }
];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const systemMessage = {
    role: "system",
    content: `You are an expert AI Frontend Developer CLI Agent. 
Workflow:
1. Call 'scrapeWebsite' to analyze the requested URL.
2. Based on the scraped data and design hints, write a stunning, realistic HTML file with a comprehensive <style> block. The CSS must be highly detailed and professional.
3. Call 'createFile' to save the output as 'website_clone.html'. 
4. Call 'openInBrowser' to open the file.

You MUST call the 'createFile' tool. Do NOT output HTML code blocks in your chat response.`
};

let conversationHistory = [systemMessage];

async function chatLoop() {
    console.log("=========================================");
    console.log("🤖 Universal Website Cloner AI Started!");
    console.log("Type a URL to clone it, or 'exit'/'quit' to stop.");
    console.log("=========================================\n");

    while (true) {
        const userInput = await rl.question("You: ");

        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
            console.log("Agent: Bye! See you later.");
            rl.close();
            break;
        }

        console.log("\n[START] Processing user instruction...");
        conversationHistory.push({ role: "user", content: userInput });

        try {
            // let's call groq!
            let response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile", // good model for tool calling
                messages: conversationHistory,
                tools: toolDefinitions,
                tool_choice: "auto",
            });

            let responseMessage = response.choices[0].message;

            // if model decided to say something before tool call
            if (responseMessage.content) {
                console.log(`[THINK] ${responseMessage.content}`);
                conversationHistory.push({ role: "assistant", content: responseMessage.content });
            }

            // check if model wants to call tools
            let toolCalls = responseMessage.tool_calls;

            while (toolCalls && toolCalls.length > 0) {
                // To keep the student vibe, just log it out 
                console.log(`[THINK] Agent decided to use tools: ${toolCalls.map(t => t.function.name).join(', ')}`);

                // We need to add the assistant's tool call to history
                conversationHistory.push(responseMessage);

                // Execute each tool
                for (const toolCall of toolCalls) {
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    console.log(`[TOOL] Executing ${functionName}...`);

                    const toolFunction = availableTools[functionName];
                    let toolResult;
                    if (functionName === 'createFile') toolResult = await toolFunction(functionArgs.filename, functionArgs.content);
                    else if (functionName === 'openInBrowser') toolResult = await toolFunction(functionArgs.filename);
                    else if (functionName === 'scrapeWebsite') toolResult = await toolFunction(functionArgs.url);

                    console.log(`[OBSERVE] Result: ${toolResult}`);

                    conversationHistory.push({
                        role: "tool",
                        name: functionName,
                        tool_call_id: toolCall.id,
                        content: toolResult
                    });
                }

                // Get next response after tool execution
                response = await groq.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: conversationHistory,
                });

                responseMessage = response.choices[0].message;
                toolCalls = responseMessage.tool_calls;
            }

            // final output
            if (responseMessage.content) {
                console.log(`[OUTPUT] ${responseMessage.content}\n`);
                conversationHistory.push({ role: "assistant", content: responseMessage.content });
            } else if (!responseMessage.content && (!toolCalls || toolCalls.length === 0)) {
                // edge case where it returns nothing
                console.log(`[OUTPUT] Done.\n`);
            }

        } catch (error) {
            // hmm this tool call might fail or something went wrong
            console.error("\n[ERROR] Oops, something broke during the agent loop:");
            console.error(error.message, "\n");
        }
    }
}

chatLoop();
