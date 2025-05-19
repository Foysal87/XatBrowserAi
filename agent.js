class BrowserAgent {
    constructor(configManager) {
        this.configManager = configManager;
        this.currentModel = null;
        this.isProcessing = false;
        this.taskQueue = [];
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
        try {
            const modelConfig = this.configManager.getModelConfig(this.currentModel);
            const response = await this.getAIResponse(query, modelConfig);
            return await this.executeTask(response);
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
}

export default BrowserAgent; 