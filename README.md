# ComfyUI-WorkflowNavigator

https://github.com/user-attachments/assets/2a137966-77bc-4ae9-9412-6729f76b5a78

A frontend-only extension for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) that adds a `Navigator` sidebar for keyboard-first workflow search and jump.

This is designed for large graphs and/or small displays, where manually panning around the canvas gets tedious. It lets you open a search panel, type what you are looking for, move through results with the keyboard, and jump directly to the matching part of the current workflow.

It can locate nodes, notes, groups, subgraphs, and more.

### Installation

Clone this repository into your `ComfyUI/custom_nodes` directory and restart ComfyUI.

If you use ComfyUI Manager, you can also install it directly from the repository URL.

### Getting Started

After installing the extension, you can toggle the Navigator panel with `Ctrl+Shift+F`. You can change this hotkey through ComfyUI's `Keybindings` window.

Once the panel is open:

- Type to search the currently loaded workflow.
- Use `↑` and `↓` to move through results.
- Press `Enter` to jump and close the Navigator.
- Press `Shift+Enter` to jump and keep the Navigator open.
- Press `Esc` to clear the search, then press it again to close the panel.

Settings are available in ComfyUI's settings panel for max rendered results, usage-aware ranking, search debounce, and jump zoom behavior. Jump zoom is a fit factor: lower values keep more surrounding canvas visible, while higher values frame the selected item more tightly.

## Features

- Adds a dedicated `Navigator` sidebar tab.
- Registers the `workflowNavigator.open` command.
- Ships with a default `Ctrl+Shift+F` hotkey.
- Uses lazy graph enumeration with invalidation on workflow changes.
- Supports keyboard-first result navigation inside the panel.
- Can optionally prioritize workflow items you jump to often.
- Lets you keep, disable, or tune the zoom level used when jumping.
- Jumps directly to matching workflow items, including:
	- nodes in the current workflow
	- note-like nodes when their text is exposed by the frontend model
	- groups / frames when exposed by the current graph model
	- nested subgraphs by switching graph context when available

### Why Use It?

- Focused current-workflow search instead of a general command launcher or add-node browser.
- Faster navigation in large workflows, especially when the canvas is hard to inspect at a glance.
- Better usability on laptops, remote desktops, and smaller displays.
- Broader workflow coverage than node-only lists, including note-like nodes, groups/frames, and nested subgraphs when Comfy exposes them to the frontend.
- Keyboard-first open, search, select, and jump behavior with a configurable toggle hotkey.
- Optional usage-aware ranking so frequently visited workflow items can rise naturally over time.
- Native-sidebar presentation without monkey-patching LiteGraph or ComfyUI internals.
- No backend Python node implementation required beyond static asset packaging.

Compared with Comfy's built-in Properties Panel, Workflow Navigator is tuned specifically for search-and-jump navigation. It auto-focuses the search field, supports direct keyboard result navigation, includes node IDs in results, and avoids relying on a node-only results list.

## Notes

- The implementation uses official ComfyUI frontend extension APIs:
	- sidebar tab registration
	- commands and keybindings
	- graph change invalidation
- It does not monkey-patch LiteGraph or ComfyUI internals.
- Note-text search is best-effort because note storage varies by node/frontend representation.
