# XatBrowser AI - Modern Chat Interface

A powerful Chrome extension that provides an AI-powered chat interface with modern, visually stunning design and comprehensive markdown support.

## ✨ New Features

### 🎨 Modern UI Design
- **Glassmorphism Design**: Beautiful glass-like effects with backdrop blur
- **Animated Background**: Subtle floating gradient animations
- **Smooth Transitions**: Fluid animations with cubic-bezier easing
- **Modern Typography**: Clean, readable fonts with proper hierarchy

### 🌈 Multiple Themes
- **Dark Theme**: Default elegant dark mode
- **Light Theme**: Clean and bright interface
- **Cyberpunk Theme**: Neon colors with futuristic feel
- **Ocean Theme**: Calming blue gradient theme

### 📝 Enhanced Markdown Support
- **Full Markdown Parsing**: Complete support using marked.js
- **Syntax Highlighting**: Code blocks with Prism.js highlighting
- **Copy Code Buttons**: One-click copy for code snippets
- **Rich Formatting**: Headers, lists, tables, blockquotes, links
- **Math Support**: Inline and block mathematical expressions

### 🚀 Modern Components
- **Floating Action Buttons**: Smooth hover effects and animations
- **Smart Input**: Auto-resizing textarea with keyboard shortcuts
- **Tool Execution Status**: Beautiful animated indicators for AI tool usage
- **Typing Indicators**: Elegant bouncing dots animation
- **Toast Notifications**: Slide-in notifications with proper styling

### 🎯 Enhanced User Experience
- **Thread Management**: Multiple conversation threads
- **Keyboard Shortcuts**: 
  - `Ctrl+N`: New chat thread
  - `Ctrl+L`: Toggle logs panel
  - `F11`: Toggle fullscreen
  - `Enter`: Send message
  - `Shift+Enter`: New line
- **Responsive Design**: Works on all screen sizes
- **Accessibility**: Proper focus states and reduced motion support

### 🔧 Technical Improvements
- **Better Performance**: Optimized rendering and animations
- **Local Storage**: Conversations saved locally for privacy
- **Error Handling**: Graceful error states with user feedback
- **Logging System**: Comprehensive logging for debugging
- **Theme Persistence**: Remembers your preferred theme

## 🎨 Theme Showcase

### Dark Theme (Default)
- Deep blue-gray backgrounds
- Indigo primary colors
- Subtle glass effects

### Light Theme
- Clean white backgrounds
- Bright, accessible colors
- Minimal shadows

### Cyberpunk Theme
- Neon green and pink accents
- Dark backgrounds
- Glowing effects

### Ocean Theme
- Blue gradient backgrounds
- Cyan accents
- Wave-like animations

## 📱 Responsive Design

The interface adapts beautifully to different screen sizes:
- **Desktop**: Full sidebar and log panel
- **Tablet**: Collapsible sidebar
- **Mobile**: Optimized touch interface

## 🔒 Privacy Features

- **Local Storage**: All conversations stored locally
- **No Data Collection**: No analytics or tracking
- **Secure Communication**: Only AI API calls for processing
- **Privacy Notice**: Clear information about data usage

## 🛠️ Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Configure your AI API keys in the extension options

## ⚙️ Configuration

1. Click the extension icon in Chrome
2. Go to Settings (⚙️ button)
3. Add your API keys for supported providers:
   - OpenAI
   - Anthropic (Claude)
   - Google AI
   - Groq
   - OpenRouter

## 🎮 Usage

1. **Start a Chat**: Click "New Chat" or use `Ctrl+N`
2. **Select Model**: Choose from available AI models
3. **Change Theme**: Use the theme selector in the header
4. **Send Messages**: Type and press Enter or click Send
5. **View Logs**: Toggle the logs panel for debugging

## 🔧 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New chat thread |
| `Ctrl+L` | Toggle logs panel |
| `F11` | Toggle fullscreen |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |

## 🎯 Markdown Support

The chat interface supports full markdown syntax:

```markdown
# Headers
## Subheaders
### Sub-subheaders

**Bold text**
*Italic text*
***Bold and italic***

- Bullet lists
- With multiple items

1. Numbered lists
2. With proper numbering

`inline code`

```javascript
// Code blocks with syntax highlighting
function hello() {
    console.log("Hello, World!");
}
```

> Blockquotes for important information

[Links](https://example.com)

| Tables | Are | Supported |
|--------|-----|-----------|
| With   | Proper | Styling |
```

## 🤖 Browser Tools

The extension exposes helper functions in `browserTools.js` that can be used by AI agents:

* `getActiveTabInfo()` – returns the id, URL and title of the active tab
* `getActiveTabHtml()` – retrieves the full HTML of the active tab
* `openNewTab(url)` – opens a new tab with the provided URL
* `searchWeb(query, tabId)` – searches the web for the query

### Using Tools

The AI model can request browser actions by returning a JSON object with a `tool` field:

Example workflow:
1. **User:** "Show me today's top tech news."
2. **Assistant:** `{"tool": "searchWeb", "args": {"query": "tech news today"}}`
3. The extension opens the search, obtains results and provides them to the model
4. **Assistant:** Summarizes the relevant headlines with beautiful formatting

## 🚀 Performance

- **Smooth Animations**: 60fps animations with hardware acceleration
- **Efficient Rendering**: Virtual scrolling for large conversations
- **Memory Management**: Automatic cleanup of old messages
- **Fast Startup**: Optimized initialization

## 🔮 Future Enhancements

- [ ] Voice input and output
- [ ] File upload support
- [ ] Custom theme creation
- [ ] Plugin system
- [ ] Advanced search
- [ ] Export conversations
- [ ] Collaborative features

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

If you encounter any issues or have suggestions, please open an issue on GitHub.

---

**Enjoy your modern AI chat experience! 🚀✨**
