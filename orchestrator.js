/**
 * XatBrowser AI Orchestrator
 * Manages tool execution with real-time UI feedback and iterative error handling
 */

// Prevent multiple declarations
if (typeof window.ToolOrchestrator !== 'undefined') {
    console.log('ToolOrchestrator already exists, skipping redeclaration');
} else {

class ToolOrchestrator {
    constructor() {
        this.tools = new Map();
        this.executionQueue = [];
        this.isExecuting = false;
        this.currentExecution = null;
        this.maxRetries = 3;
        this.executionHistory = [];
        this.uiCallbacks = {
            onToolStart: null,
            onToolProgress: null,
            onToolComplete: null,
            onToolError: null,
            onExecutionComplete: null
        };
        
        this.initializeBuiltInTools();
    }

    /**
     * Register UI callbacks for real-time feedback
     */
    setUICallbacks(callbacks) {
        this.uiCallbacks = { ...this.uiCallbacks, ...callbacks };
    }

    /**
     * Initialize built-in tools with Cursor-like definitions
     */
    initializeBuiltInTools() {
        // Web Search Tool
        this.registerTool({
            type: "function",
            name: "searchWeb",
            displayTitle: "Search Web",
            wouldLikeTo: "search for {{{ query }}}",
            isCurrently: "searching for {{{ query }}}",
            hasAlready: "found search results for {{{ query }}}",
            group: "web",
            readonly: false,
            isInstant: false,
            requiresConfirmation: false,
            function: {
                name: "searchWeb",
                description: "Search the web for information",
                parameters: {
                    type: "object",
                    required: ["query"],
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query"
                        },
                        tabId: {
                            type: "number",
                            description: "Optional tab ID to search in"
                        }
                    }
                }
            },
            implementation: this.searchWebImpl.bind(this)
        });

        // Open New Tab Tool
        this.registerTool({
            type: "function",
            name: "openNewTab",
            displayTitle: "Open New Tab",
            wouldLikeTo: "open a new tab with {{{ url }}}",
            isCurrently: "opening new tab with {{{ url }}}",
            hasAlready: "opened new tab with {{{ url }}}",
            group: "navigation",
            readonly: false,
            isInstant: true,
            requiresConfirmation: false,
            function: {
                name: "openNewTab",
                description: "Open a new browser tab",
                parameters: {
                    type: "object",
                    required: ["url"],
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL to open"
                        }
                    }
                }
            },
            implementation: this.openNewTabImpl.bind(this)
        });

        // Get Page Content Tool
        this.registerTool({
            type: "function",
            name: "getPageContent",
            displayTitle: "Get Page Content",
            wouldLikeTo: "analyze the current page content",
            isCurrently: "extracting page content",
            hasAlready: "extracted page content",
            group: "analysis",
            readonly: true,
            isInstant: true,
            requiresConfirmation: false,
            function: {
                name: "getPageContent",
                description: "Extract content from the current page",
                parameters: {
                    type: "object",
                    properties: {
                        tabId: {
                            type: "number",
                            description: "Optional tab ID"
                        }
                    }
                }
            },
            implementation: this.getPageContentImpl.bind(this)
        });

        // Generate Dynamic Tool
        this.registerTool({
            type: "function",
            name: "generateTool",
            displayTitle: "Generate Tool",
            wouldLikeTo: "create a specialized tool for {{{ description }}}",
            isCurrently: "generating tool for {{{ description }}}",
            hasAlready: "created tool for {{{ description }}}",
            group: "meta",
            readonly: false,
            isInstant: false,
            requiresConfirmation: false,
            function: {
                name: "generateTool",
                description: "Generate a specialized tool based on description",
                parameters: {
                    type: "object",
                    required: ["description"],
                    properties: {
                        description: {
                            type: "string",
                            description: "Description of what the tool should do"
                        },
                        name: {
                            type: "string",
                            description: "Optional name for the tool"
                        }
                    }
                }
            },
            implementation: this.generateToolImpl.bind(this)
        });
    }

    /**
     * Register a new tool
     */
    registerTool(toolDefinition) {
        this.tools.set(toolDefinition.name, toolDefinition);
        console.log(`Registered tool: ${toolDefinition.name}`);
    }

    /**
     * Execute a tool call with real-time UI feedback
     */
    async executeTool(toolName, args, context = {}) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool "${toolName}" not found`);
        }

        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const execution = {
            id: executionId,
            tool,
            args,
            context,
            startTime: Date.now(),
            status: 'pending',
            retryCount: 0,
            result: null,
            error: null
        };

        this.currentExecution = execution;

        try {
            // Notify UI that tool execution is starting
            this.notifyUI('onToolStart', {
                executionId,
                tool,
                args,
                message: this.formatMessage(tool.isCurrently, args)
            });

            // Validate arguments
            this.validateArguments(tool, args);

            // Execute the tool
            execution.status = 'running';
            const result = await tool.implementation(args, {
                tool,
                context,
                onProgress: (progress) => {
                    this.notifyUI('onToolProgress', {
                        executionId,
                        tool,
                        progress,
                        message: progress.message || this.formatMessage(tool.isCurrently, args)
                    });
                }
            });

            execution.status = 'completed';
            execution.result = result;
            execution.endTime = Date.now();

            // Notify UI of completion
            this.notifyUI('onToolComplete', {
                executionId,
                tool,
                result,
                message: this.formatMessage(tool.hasAlready, args),
                duration: execution.endTime - execution.startTime
            });

            // Add to history
            this.executionHistory.push(execution);

            return result;

        } catch (error) {
            execution.status = 'error';
            execution.error = error;
            execution.endTime = Date.now();

            // Notify UI of error
            this.notifyUI('onToolError', {
                executionId,
                tool,
                error,
                message: `Error: ${error.message}`,
                canRetry: execution.retryCount < this.maxRetries
            });

            // Add to history even if failed
            this.executionHistory.push(execution);

            throw error;
        } finally {
            this.currentExecution = null;
        }
    }

    /**
     * Execute a tool with automatic retry on failure
     */
    async executeToolWithRetry(toolName, args, context = {}) {
        let lastError = null;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await this.executeTool(toolName, args, {
                    ...context,
                    attempt: attempt + 1,
                    previousErrors: lastError ? [lastError] : []
                });
                return result;
            } catch (error) {
                lastError = error;
                
                if (attempt < this.maxRetries) {
                    console.log(`Tool execution failed (attempt ${attempt + 1}), retrying...`, error);
                    
                    // Add error context for next attempt
                    context.previousErrors = context.previousErrors || [];
                    context.previousErrors.push({
                        attempt: attempt + 1,
                        error: error.message,
                        timestamp: Date.now()
                    });
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                } else {
                    console.error(`Tool execution failed after ${this.maxRetries + 1} attempts`, error);
                    throw error;
                }
            }
        }
    }

    /**
     * Execute a chain of tools
     */
    async executeToolChain(toolCalls, context = {}) {
        const chainId = `chain_${Date.now()}`;
        const results = [];
        
        this.notifyUI('onExecutionStart', {
            chainId,
            toolCount: toolCalls.length,
            tools: toolCalls.map(call => call.tool)
        });

        for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            
            try {
                const result = await this.executeToolWithRetry(
                    toolCall.tool,
                    toolCall.args,
                    {
                        ...context,
                        chainId,
                        stepIndex: i,
                        totalSteps: toolCalls.length,
                        previousResults: results
                    }
                );
                
                results.push({
                    tool: toolCall.tool,
                    args: toolCall.args,
                    result,
                    success: true,
                    stepIndex: i
                });
                
            } catch (error) {
                results.push({
                    tool: toolCall.tool,
                    args: toolCall.args,
                    error: error.message,
                    success: false,
                    stepIndex: i
                });
                
                // Stop chain execution on error
                break;
            }
        }

        this.notifyUI('onExecutionComplete', {
            chainId,
            results,
            success: results.every(r => r.success)
        });

        return results;
    }

    /**
     * Validate tool arguments against schema
     */
    validateArguments(tool, args) {
        const schema = tool.function.parameters;
        const required = schema.required || [];
        
        // Check required parameters
        for (const param of required) {
            if (!(param in args)) {
                throw new Error(`Missing required parameter: ${param}`);
            }
        }
        
        // Basic type checking
        for (const [key, value] of Object.entries(args)) {
            const paramSchema = schema.properties[key];
            if (paramSchema && paramSchema.type) {
                const expectedType = paramSchema.type;
                const actualType = typeof value;
                
                if (expectedType === 'string' && actualType !== 'string') {
                    throw new Error(`Parameter ${key} must be a string`);
                }
                if (expectedType === 'number' && actualType !== 'number') {
                    throw new Error(`Parameter ${key} must be a number`);
                }
                if (expectedType === 'boolean' && actualType !== 'boolean') {
                    throw new Error(`Parameter ${key} must be a boolean`);
                }
            }
        }
    }

    /**
     * Format message templates with arguments
     */
    formatMessage(template, args) {
        if (!template) return '';
        
        return template.replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (match, key) => {
            return args[key] || match;
        });
    }

    /**
     * Notify UI callbacks
     */
    notifyUI(eventType, data) {
        const callback = this.uiCallbacks[eventType];
        if (callback && typeof callback === 'function') {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in UI callback ${eventType}:`, error);
            }
        }
    }

    // Tool Implementations

    async searchWebImpl(args, extras) {
        const { query, tabId } = args;
        
        extras.onProgress?.({ message: `Searching for: ${query}` });
        
        const result = await chrome.runtime.sendMessage({
            type: 'SEARCH_WEB',
            query,
            tabId
        });
        
        return {
            success: true,
            query,
            tabId: result.tabId,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            timestamp: Date.now()
        };
    }

    async openNewTabImpl(args, extras) {
        const { url } = args;
        
        extras.onProgress?.({ message: `Opening: ${url}` });
        
        const result = await chrome.runtime.sendMessage({
            type: 'OPEN_TAB',
            url
        });
        
        return {
            success: true,
            url,
            tabId: result.tabId,
            timestamp: Date.now()
        };
    }

    async getPageContentImpl(args, extras) {
        const { tabId } = args;
        
        extras.onProgress?.({ message: 'Extracting page content...' });
        
        const result = await chrome.runtime.sendMessage({
            type: 'GET_PAGE_HTML',
            tabId
        });
        
        return {
            success: true,
            html: result.html,
            length: result.html?.length || 0,
            timestamp: Date.now()
        };
    }

    async generateToolImpl(args, extras) {
        const { description, name } = args;
        
        extras.onProgress?.({ message: `Generating tool: ${description}` });
        
        // This would integrate with your AI service to generate the tool
        const toolSpec = await this.generateToolWithAI(description, name);
        
        // Register the generated tool
        this.registerTool(toolSpec);
        
        return {
            success: true,
            toolName: toolSpec.name,
            description: toolSpec.function.description,
            timestamp: Date.now()
        };
    }

    async generateToolWithAI(description, suggestedName) {
        // This would call your AI service to generate the tool
        // For now, return a placeholder
        const toolName = suggestedName || `generated_${Date.now()}`;
        
        return {
            type: "function",
            name: toolName,
            displayTitle: `Generated: ${description}`,
            wouldLikeTo: `execute ${description}`,
            isCurrently: `executing ${description}`,
            hasAlready: `completed ${description}`,
            group: "generated",
            readonly: false,
            isInstant: false,
            requiresConfirmation: false,
            function: {
                name: toolName,
                description: description,
                parameters: {
                    type: "object",
                    properties: {}
                }
            },
            implementation: async (args, extras) => {
                // Generated tool implementation would go here
                return { success: true, message: "Generated tool executed" };
            }
        };
    }

    /**
     * Get tool by name
     */
    getTool(name) {
        return this.tools.get(name);
    }

    /**
     * Get all tools
     */
    getAllTools() {
        return Array.from(this.tools.values());
    }

    /**
     * Get execution history
     */
    getExecutionHistory() {
        return this.executionHistory;
    }

    /**
     * Clear execution history
     */
    clearHistory() {
        this.executionHistory = [];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToolOrchestrator;
} else if (typeof window !== 'undefined') {
    window.ToolOrchestrator = ToolOrchestrator;
}

} 