# ComfyUI-WorkflowNavigator

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

## Features

- Adds a dedicated `Navigator` sidebar tab.
- Registers the `workflowNavigator.open` command.
- Ships with a default `Ctrl+Shift+F` hotkey.
- Uses lazy graph enumeration with invalidation on workflow changes.
- Supports keyboard-first result navigation inside the panel.
- Jumps directly to matching workflow items, including:
	- nodes in the current workflow
	- note-like nodes when their text is exposed by the frontend model
	- groups / frames when exposed by the current graph model
	- nested subgraphs by switching graph context when available

### Why Use It?

- Faster navigation in large workflows.
- Better usability on laptops, remote desktops, and smaller displays.
- No monkey-patching of LiteGraph or ComfyUI internals.
- No backend Python node implementation required beyond static asset packaging.

## Notes

- The implementation uses official ComfyUI frontend extension APIs:
	- sidebar tab registration
	- commands and keybindings
	- graph change invalidation
- It does not monkey-patch LiteGraph or ComfyUI internals.
- Note-text search is best-effort because note storage varies by node/frontend representation.
