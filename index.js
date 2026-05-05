import fs from 'fs/promises';
import { exec } from 'child_process';
import readline from 'readline/promises';
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

// okay so let's figure out what user wants - student like comment!
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

const availableTools = {
    createFile,
    openInBrowser
};

const toolDefinitions = [
    {
        type: "function",
        function: {
            name: "createFile",
            description: "writes HTML/CSS/JS content to a file",
            parameters: {
                type: "object",
                properties: {
                    filename: { type: "string", description: "Name of the file, e.g., scaler_clone.html" },
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
    }
];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const systemMessage = {
    role: "system",
    content: `You are a helpful CLI AI agent. 
When the user asks you to clone the Scaler Academy website, you MUST generate a stunning, premium HTML file with embedded CSS. 
The generated clone MUST include:
1. Header: Navigation bar with logo (text), Courses, Mentorship, Success Stories.
2. Hero Section: Headline ("Unlock Your Coding Potential"), subheading, CTA button with hover effects.
3. Footer: Copyright, links, social icons.
Design constraints: Use dark mode, modern gradients (e.g., purple/blue like typical EdTech), flexbox/grid for layout, and modern fonts (Google Fonts like Inter or Roboto).
Use the 'createFile' tool to save it as "scaler_clone.html", then use 'openInBrowser' to open it.

IMPORTANT: Always briefly explain your reasoning before calling tools so the user can see your thought process.
Keep your conversational responses natural and human-like.`
};

let conversationHistory = [systemMessage];

async function chatLoop() {
    console.log("=========================================");
    console.log("🤖 AI Agent CLI Started! Type 'exit' or 'quit' to stop.");
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
                model: "llama3-70b-8192", // good model for tool calling
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
                    
                    console.log(`[TOOL] Executing ${functionName} with arguments: ${JSON.stringify(functionArgs).substring(0, 100)}...`);
                    
                    const toolFunction = availableTools[functionName];
                    const toolResult = await toolFunction(functionArgs.filename, functionArgs.content);
                    
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
                    model: "llama3-70b-8192",
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
