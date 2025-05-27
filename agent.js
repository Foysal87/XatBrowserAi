class BrowserAgent {
    constructor(configManager) {
        this.configManager = configManager;
        this.currentModel = null;
        this.isProcessing = false;
        this.taskQueue = [];
        this.currentTabId = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.dynamicTools = new Map();
        this.toolExecutionHistory = [];
    }

    async setModel(modelId) {
        const isValid = await this.configManager.validateModel(modelId);
        if (!isValid) {
            throw new Error('Invalid model configuration');
        }
        this.currentModel = modelId;
    }

    async processUserQuery(query) {
        if (!this.currentModel) {
            throw new Error('No model selected');
        }

        this.isProcessing = true;
        this.retryCount = 0;

        try {
            const modelConfig = this.configManager.getModelConfig(this.currentModel);
            
            // Enhanced analysis to determine tool needs and execution plan
            const analysisPrompt = `Analyze this user query and create a complete execution plan: "${query}"

Return a JSON object with:
{
    "needsNewTools": boolean,
    "toolsToGenerate": [
        {"description": "tool description", "priority": 1}
    ],
    "executionPlan": [
        {"tool": "toolName", "args": {...}, "description": "what this step does"}
    ],
    "expectedOutcome": "what the user should expect"
}

Be specific about tool generation needs and create a detailed step-by-step plan.`;

            const analysisResponse = await this.getAIResponse(analysisPrompt, modelConfig);
            let analysis;
            
            try {
                analysis = JSON.parse(analysisResponse);
            } catch (error) {
                console.error('Error parsing analysis:', error);
                // Fallback to simple execution
                analysis = {
                    needsNewTools: false,
                    toolsToGenerate: [],
                    executionPlan: [{ tool: "searchWeb", args: { query }, description: "Search for information" }],
                    expectedOutcome: "Search results"
                };
            }
            
            // Generate any needed tools first
            if (analysis.needsNewTools && analysis.toolsToGenerate) {
                for (const toolSpec of analysis.toolsToGenerate) {
                    try {
                        await this.generateTool(toolSpec.description);
                    } catch (error) {
                        console.error('Failed to generate tool:', error);
                    }
                }
            }

            // Execute the planned tool chain
            const executionResults = await this.executeToolChain(analysis.executionPlan);
            
            // Generate final response based on results
            const responsePrompt = `Based on the execution results, provide a comprehensive response to the user query: "${query}"

Execution Results:
${JSON.stringify(executionResults, null, 2)}

Provide a well-structured, informative response that directly answers the user's question.`;

            const finalResponse = await this.getAIResponse(responsePrompt, modelConfig);
            
            return {
                success: true,
                response: finalResponse,
                executionResults,
                toolsGenerated: analysis.toolsToGenerate?.length || 0,
                explanation: analysis.expectedOutcome
            };
            
        } catch (error) {
            console.error('Error processing query:', error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    async getAIResponse(query, modelConfig) {
        // Implementation will vary based on the service (Azure/Claude)
        const prompt = this.buildPrompt(query);
        
        if (modelConfig.service === 'Azure') {
            return await this.callAzureAPI(prompt, modelConfig);
        } else if (modelConfig.service === 'Claude') {
            return await this.callClaudeAPI(prompt, modelConfig);
        }
        
        throw new Error('Unsupported AI service');
    }

    buildPrompt(query) {
        return {
            messages: [
                {
                    role: "system",
                    content: "You are a browser automation assistant. Respond with a JSON object containing the following properties: actions (array of actions to perform), validation (array of validation steps), and explanation (string explaining the plan)."
                },
                {
                    role: "user",
                    content: query
                }
            ]
        };
    }

    async executeTool(toolName, args) {
        console.log(`Executing tool: ${toolName} with args:`, args);
        
        // Check if it's a dynamic tool
        if (this.dynamicTools.has(toolName)) {
            return await this.dynamicTools.get(toolName)(args);
        }
        
        // Handle built-in tools
        switch (toolName) {
            case 'openNewTab':
                const tabResult = await this.sendMessageToBackground({ type: 'OPEN_TAB', url: args.url });
                this.currentTabId = tabResult.tabId;
                return tabResult;
                
            case 'searchWeb':
                const searchResult = await this.sendMessageToBackground({ 
                    type: 'SEARCH_WEB', 
                    query: args.query,
                    tabId: args.tabId || this.currentTabId 
                });
                this.currentTabId = searchResult.tabId;
                return searchResult;
                
            case 'getActiveTabInfo':
                return await this.sendMessageToBackground({ type: 'GET_TAB_INFO' });
                
            case 'getActiveTabHtml':
                const htmlResult = await this.sendMessageToBackground({ type: 'GET_PAGE_HTML' });
                return htmlResult;

            case 'generateTool':
                return await this.generateTool(args.description);
                
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    async sendMessageToBackground(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async executeTask(aiResponse) {
        const { actions, validation, explanation } = JSON.parse(aiResponse);
        
        // Execute validation steps first
        for (const validationStep of validation) {
            const isValid = await this.validateStep(validationStep);
            if (!isValid) {
                throw new Error(`Validation failed: ${validationStep.description}`);
            }
        }

        // Execute actions
        for (const action of actions) {
            await this.executeAction(action);
        }

        return {
            success: true,
            explanation
        };
    }

    async validateStep(step) {
        // Implement validation logic based on step type
        switch (step.type) {
            case 'element_exists':
                return await this.validateElementExists(step.selector);
            case 'page_loaded':
                return await this.validatePageLoaded();
            // Add more validation types as needed
            default:
                return false;
        }
    }

    async executeAction(action) {
        // Implement action execution logic
        switch (action.type) {
            case 'click':
                await this.clickElement(action.selector);
                break;
            case 'type':
                await this.typeText(action.selector, action.text);
                break;
            case 'navigate':
                await this.navigateTo(action.url);
                break;
            // Add more action types as needed
        }
    }

    // Helper methods for validation and actions
    async validateElementExists(selector) {
        return await chrome.tabs.executeScript({
            code: `document.querySelector('${selector}') !== null`
        });
    }

    async validatePageLoaded() {
        return await chrome.tabs.executeScript({
            code: 'document.readyState === "complete"'
        });
    }

    async clickElement(selector) {
        await chrome.tabs.executeScript({
            code: `
                const element = document.querySelector('${selector}');
                if (element) {
                    element.click();
                }
            `
        });
    }

    async typeText(selector, text) {
        await chrome.tabs.executeScript({
            code: `
                const element = document.querySelector('${selector}');
                if (element) {
                    element.value = '${text}';
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                }
            `
        });
    }

    async navigateTo(url) {
        await chrome.tabs.update({ url });
    }

    async registerDynamicTool(toolName, toolDefinition) {
        if (typeof toolDefinition !== 'function') {
            throw new Error('Tool definition must be a function');
        }
        this.dynamicTools.set(toolName, toolDefinition);
    }

    async generateTool(toolDescription) {
        // Generate a tool based on the description
        const toolPrompt = `Create a browser automation tool based on this description: ${toolDescription}

Return a JSON object with:
{
    "name": "uniqueToolName",
    "description": "what the tool does",
    "parameters": [
        {"name": "paramName", "type": "string|number|object", "description": "param description"}
    ],
    "implementation": "return (async function(args) { /* your implementation here */ })();"
}

The implementation should be a complete JavaScript function that:
1. Takes an 'args' parameter containing the tool arguments
2. Uses browser APIs or DOM manipulation as needed
3. Returns a meaningful result object
4. Handles errors gracefully

Example for news extraction:
{
    "name": "extractNewsHeadlines",
    "description": "Extracts news headlines and metadata from HTML content",
    "parameters": [
        {"name": "html", "type": "string", "description": "HTML content to parse"},
        {"name": "keywords", "type": "array", "description": "Keywords to filter by"}
    ],
    "implementation": "return (async function(args) { const parser = new DOMParser(); const doc = parser.parseFromString(args.html, 'text/html'); const headlines = Array.from(doc.querySelectorAll('h1, h2, h3, .headline, .title')).map(el => ({ text: el.textContent.trim(), url: el.closest('a')?.href || '', timestamp: new Date().toISOString() })).filter(h => h.text && (!args.keywords || args.keywords.some(k => h.text.toLowerCase().includes(k.toLowerCase())))); return { headlines, count: headlines.length, extractedAt: new Date().toISOString() }; })();"
}`;

        const modelConfig = this.configManager.getModelConfig(this.currentModel);
        const response = await this.getAIResponse(toolPrompt, modelConfig);
        
        let toolSpec;
        try {
            toolSpec = JSON.parse(response);
        } catch (error) {
            console.error('Error parsing tool specification:', error);
            throw new Error('Failed to generate valid tool specification');
        }

        // Create the tool function with better error handling
        const toolFunction = new Function('args', `
            try {
                ${toolSpec.implementation}
            } catch (error) {
                console.error('Tool execution error:', error);
                return { error: error.message, success: false };
            }
        `);
        
        // Register the tool
        await this.registerDynamicTool(toolSpec.name, async (args) => {
            try {
                const result = await toolFunction(args);
                this.toolExecutionHistory.push({
                    tool: toolSpec.name,
                    args,
                    result,
                    timestamp: new Date().toISOString()
                });
                return result;
            } catch (error) {
                console.error(`Error executing dynamic tool ${toolSpec.name}:`, error);
                throw error;
            }
        });

        console.log(`Generated and registered tool: ${toolSpec.name}`);
        return {
            name: toolSpec.name,
            description: toolSpec.description,
            parameters: toolSpec.parameters,
            success: true
        };
    }

    async executeToolChain(tools) {
        const results = [];
        
        for (const toolCall of tools) {
            try {
                console.log(`Executing tool: ${toolCall.tool}`);
                const result = await this.executeTool(toolCall.tool, toolCall.args);
                results.push({
                    tool: toolCall.tool,
                    args: toolCall.args,
                    result,
                    success: true
                });
                
                // Add delay between tool executions to allow pages to load
                if (toolCall.tool === 'searchWeb' || toolCall.tool === 'openNewTab') {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`Tool execution failed: ${toolCall.tool}`, error);
                results.push({
                    tool: toolCall.tool,
                    args: toolCall.args,
                    error: error.message,
                    success: false
                });
                break; // Stop execution on error
            }
        }
        
        return results;
    }
}

export default BrowserAgent; 