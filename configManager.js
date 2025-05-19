class ConfigManager {
    constructor() {
        this.availableModels = new Map();
        this.configContent = null;
        this.defaultConfigPath = chrome.runtime.getURL('config/config.json');
    }

    async initialize() {
        try {
            // Try to load from storage first
            const { configContent } = await chrome.storage.local.get('configContent');
            if (configContent) {
                try {
                    this.configContent = JSON.parse(configContent);
                    this.parseConfig(this.configContent);
                    return true;
                } catch (error) {
                    console.error('Error parsing stored config:', error);
                    // If stored config is invalid, try loading default
                }
            }

            // Fall back to default config
            return await this.loadDefaultConfig();
        } catch (error) {
            console.error('Error initializing config:', error);
            return false;
        }
    }

    async loadDefaultConfig() {
        try {
            const response = await fetch(this.defaultConfigPath);
            if (!response.ok) {
                throw new Error(`Failed to load default config: ${response.statusText}`);
            }
            const config = await response.json();
            
            // Validate the default config
            if (!this.validateConfig(config)) {
                throw new Error('Invalid default config structure');
            }

            this.configContent = config;
            this.parseConfig(config);
            return true;
        } catch (error) {
            console.error('Error loading default config:', error);
            
            // If default config fails to load, create an empty config
            this.configContent = {
                AzureOpenAi: {},
                ClaudeAi: {}
            };
            this.parseConfig(this.configContent);
            
            // Show a more user-friendly error message
            throw new Error('Failed to load configuration. Please add your AI model settings in the extension options.');
        }
    }

    setConfigContent(config) {
        if (!this.validateConfig(config)) {
            throw new Error('Invalid config structure. Please ensure all required fields are present.');
        }
        this.configContent = config;
        this.parseConfig(config);
    }

    getConfigContent() {
        return this.configContent;
    }

    validateConfig(config) {
        if (!config || typeof config !== 'object') {
            return false;
        }

        // At least one AI provider should be present
        if (!config.AzureOpenAi && !config.ClaudeAi) {
            return false;
        }

        // Validate Azure models if present
        if (config.AzureOpenAi) {
            if (typeof config.AzureOpenAi !== 'object') {
                return false;
            }
            for (const [modelId, models] of Object.entries(config.AzureOpenAi)) {
                if (!Array.isArray(models) || models.length === 0) return false;
                const model = models[0];
                if (!model.ApiUrl || !model.ApiKey || !model.ModelName) return false;
            }
        }

        // Validate Claude models if present
        if (config.ClaudeAi) {
            if (typeof config.ClaudeAi !== 'object') {
                return false;
            }
            for (const [modelId, models] of Object.entries(config.ClaudeAi)) {
                if (!Array.isArray(models) || models.length === 0) return false;
                const model = models[0];
                if (!model.ApiUrl || !model.ApiKey || !model.ModelName) return false;
            }
        }

        return true;
    }

    parseConfig(config) {
        this.availableModels.clear();

        // Parse Azure OpenAI models
        if (config.AzureOpenAi) {
            for (const [modelId, models] of Object.entries(config.AzureOpenAi)) {
                if (Array.isArray(models) && models.length > 0) {
                    const model = models[0];
                    this.availableModels.set(modelId, {
                        type: 'azure',
                        ...model
                    });
                }
            }
        }

        // Parse Claude models
        if (config.ClaudeAi) {
            for (const [modelId, models] of Object.entries(config.ClaudeAi)) {
                if (Array.isArray(models) && models.length > 0) {
                    const model = models[0];
                    this.availableModels.set(modelId, {
                        type: 'claude',
                        ...model
                    });
                }
            }
        }
    }

    getAvailableModels() {
        return Array.from(this.availableModels.keys());
    }

    getModelConfig(modelId) {
        return this.availableModels.get(modelId);
    }

    async loadConfig() {
        if (!this.configContent) {
            return await this.initialize();
        }
        return true;
    }
}

export default ConfigManager; 