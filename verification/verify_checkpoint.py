
from playwright.sync_api import Page, expect, sync_playwright
import json
import time

def test_checkpoint_restore(page: Page):
    # Listen to console logs
    page.on("console", lambda msg: print(f"BROWSER: {msg.text}"))

    # Mock acquireVsCodeApi
    page.add_init_script("""
        window.acquireVsCodeApi = () => {
            console.log('Mock acquireVsCodeApi called');
            return {
                postMessage: (message) => {
                    console.log('Sending message to extension:', JSON.stringify(message));
                    window.handleExtensionMessage(message);
                },
                getState: () => ({}),
                setState: () => {}
            };
        };

        window.handleExtensionMessage = (message) => {
            // Helper to send response
            const sendResponse = (reqId, resp) => {
                 setTimeout(() => {
                    window.postMessage({
                        type: 'from-extension',
                        message: {
                            type: 'response',
                            requestId: reqId,
                            response: resp
                        }
                    }, '*');
                }, 50);
            };

            // Mock responses
            if (message.request && message.request.type === 'init') {
                console.log('Handling init');
                sendResponse(message.requestId, {
                    type: 'init_response',
                    state: {
                        modelSetting: 'default',
                        permissionMode: 'default'
                    }
                });
            } else if (message.request && message.request.type === 'list_sessions_request') {
                console.log('Handling list_sessions');
                sendResponse(message.requestId, {
                    type: 'list_sessions_response',
                    sessions: []
                });
            } else if (message.request && message.request.type === 'get_claude_state') {
                console.log('Handling get_claude_state');
                sendResponse(message.requestId, {
                    type: 'get_claude_state_response',
                    config: {
                         slashCommands: [],
                         models: [],
                         accountInfo: null
                    }
                });
            } else if (message.request && message.request.type === 'get_asset_uris') {
                console.log('Handling get_asset_uris');
                sendResponse(message.requestId, {
                    type: 'asset_uris_response',
                    assetUris: {}
                });
            } else if (message.request && message.request.type === 'get_current_selection') {
                 console.log('Handling get_current_selection');
                 sendResponse(message.requestId, {
                    type: 'get_current_selection_response',
                    selection: null
                });
            } else if (message.type === 'launch_claude') {
                 console.log('Handling launch_claude for channel', message.channelId);
                 // Simulate a user message arriving immediately after session launch
                 setTimeout(() => {
                    console.log('Injecting fake user message');
                    const fakeMsg = {
                        type: 'user',
                        message: {
                            id: 'msg-123',
                            content: 'Hello world',
                            role: 'user'
                        },
                        uuid: 'uuid-123',
                        timestamp: new Date().toISOString()
                    };

                    window.postMessage({
                        type: 'from-extension',
                        message: {
                            type: 'io_message',
                            channelId: message.channelId,
                            message: fakeMsg,
                            done: false
                        }
                    }, '*');
                 }, 500);
            }
        };
    """)

    # Go to the local dev server
    page.goto("http://localhost:5173/")

    # Wait for the chat page to load (it should be default)
    # The 'Hello world' message should appear
    expect(page.get_by_text("Hello world")).to_be_visible(timeout=10000)

    # Hover over the message to see the buttons (though they might be visible by default depending on CSS)
    # The CSS says .restore-button display: flex, so it should be visible.

    # Check for the restore button
    # It has class 'restore-button' and title 'Restore checkpoint'
    restore_btn = page.locator(".restore-button")
    expect(restore_btn).to_be_visible()

    # Take a screenshot
    page.screenshot(path="verification/checkpoint_restore.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_checkpoint_restore(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
