/**
 * Highlight.js initialization for code blocks
 * This script ensures all code blocks have syntax highlighting applied correctly
 */

// This function will apply highlighting to all code blocks
function applyHighlighting() {
    // Select all pre code blocks that haven't been highlighted yet
    document.querySelectorAll('pre code:not(.hljs)').forEach((block) => {
        // Apply highlighting
        hljs.highlightElement(block);
    });
}

// Initialize highlight.js for all existing code blocks
document.addEventListener('DOMContentLoaded', () => {
    // Initial application
    applyHighlighting();
});

// Create a MutationObserver to detect when new messages are added to the chat
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
            // Apply highlighting to any new code blocks
            applyHighlighting();
        }
    });
});

// Start observing the chat messages container
document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
        observer.observe(chatMessages, { childList: true, subtree: true });
    }
});

// Export the applyHighlighting function so it can be called from other scripts
window.applyHighlighting = applyHighlighting; 