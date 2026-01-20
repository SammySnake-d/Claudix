## Enhanced Features

This release introduces significant enhancements over the original version:

### 🚀 New Capabilities

- **Restore Functionality**: Automatically resume your session state, ensuring you never lose your context.
- **Queue Mode**: A robust message queue system to handle multiple prompts and operations efficiently.
- **Multi-session Mode**: Work on multiple tasks simultaneously with independent session management.
- **Ace Enhance Integration**: Seamless integration with `ace-tool` to refine and optimize your prompts using AI.

### ⚙️ Configuration & Usage

#### Ace Enhance Setup
To enable prompt enhancement:
1.  Download `ace-tool-rs` from [https://github.com/missdeer/ace-tool-rs](https://github.com/missdeer/ace-tool-rs).
2.  Configure `claudix.aceTool` in VS Code settings:
    *   **Executable**: Path to the binary (or `npx`).
    *   **Args**: Ensure `${prompt}` is included.
    *(See README.md for a visual configuration guide)*

#### API Management
We effectively recommend using **`cc switch`** for convenient API key and endpoint management.

### 📝 Notes
For a full guide on configuration and features, please refer to the [README](https://github.com/Haleclipse/Claudix/blob/main/README.md).
