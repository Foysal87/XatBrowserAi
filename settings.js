import ConfigManager from './configManager.js';

class SettingsManager {
    constructor() {
        this.configManager = new ConfigManager();
        this.initializeElements();
        this.attachEventListeners();
        this.loadCurrentSettings();
    }

    initializeElements() {
        this.configTextarea = document.getElementById('configContent');
        this.saveButton = document.getElementById('saveConfig');
        this.status = document.getElementById('status');
        this.modelList = document.getElementById('modelList');
    }

    attachEventListeners() {
        this.saveButton.addEventListener('click', () => this.saveConfig());
    }

    async loadCurrentSettings() {
        try {
            // Load saved config content
            const { configContent } = await chrome.storage.local.get('configContent');
            if (configContent) {
                // Update textarea with formatted JSON
                this.configTextarea.value = JSON.stringify(JSON.parse(configContent), null, 2);
                this.saveButton.disabled = false;
                
                // Update config manager with saved content
                this.configManager.setConfigContent(JSON.parse(configContent));
                await this.loadModels();
            } else {
                // Load default config
                await this.loadModels();
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showStatus('Error loading settings', false);
        }
    }

    async saveConfig() {
        try {
            const content = this.configTextarea.value;
            if (!content) {
                throw new Error('Configuration cannot be empty');
            }

            // Parse and validate the config
            const config = JSON.parse(content);
            if (!this.validateConfig(config)) {
                throw new Error('Invalid config structure');
            }

            // Save to Chrome storage
            await chrome.storage.local.set({
                configContent: content
            });
            
            // Update config manager
            this.configManager.setConfigContent(config);
            await this.loadModels();
            
            this.showStatus('Configuration saved successfully', true);
        } catch (error) {
            console.error('Error saving config:', error);
            this.showStatus(error.message || 'Error saving configuration', false);
        }
    }

    validateConfig(config) {
        // Check if config has required sections
        if (!config.AzureOpenAi && !config.ClaudeAi) {
            return false;
        }

        // Validate Azure models if present
        if (config.AzureOpenAi) {
            for (const [modelId, models] of Object.entries(config.AzureOpenAi)) {
                if (!Array.isArray(models) || models.length === 0) return false;
                const model = models[0];
                if (!model.ApiUrl || !model.ApiKey || !model.ModelName) return false;
            }
        }

        // Validate Claude models if present
        if (config.ClaudeAi) {
            for (const [modelId, models] of Object.entries(config.ClaudeAi)) {
                if (!Array.isArray(models) || models.length === 0) return false;
                const model = models[0];
                if (!model.ApiUrl || !model.ApiKey || !model.ModelName) return false;
            }
        }

        return true;
    }

    async loadModels() {
        try {
            const success = await this.configManager.loadConfig();
            if (success) {
                this.displayModels();
                this.showStatus('Models loaded successfully', true);
            } else {
                this.showStatus('Error loading models', false);
            }
        } catch (error) {
            console.error('Error loading models:', error);
            this.showStatus('Error loading models', false);
        }
    }

    displayModels() {
        const models = this.configManager.getAvailableModels();
        this.modelList.innerHTML = '';

        models.forEach(modelId => {
            const config = this.configManager.getModelConfig(modelId);
            const modelDiv = document.createElement('div');
            modelDiv.className = 'model-item';
            modelDiv.innerHTML = `
                <h3>${modelId}</h3>
                <div class="model-details">
                    <span>Type: ${config.type}</span>
                    <span>Model: ${config.ModelName}</span>
                    <span>API Version: ${config.ApiVersion}</span>
                    <span>Max Tokens: ${config.MaxTokens}</span>
                    <span>Temperature: ${config.Temperature}</span>
                </div>
            `;
            this.modelList.appendChild(modelDiv);
        });
    }

    showStatus(message, isSuccess) {
        this.status.textContent = message;
        this.status.className = `status ${isSuccess ? 'success' : 'error'}`;
        this.status.style.display = 'block';
        
        // Hide status after 3 seconds
        setTimeout(() => {
            this.status.style.display = 'none';
        }, 3000);
    }
}

// Initialize settings when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
}); 