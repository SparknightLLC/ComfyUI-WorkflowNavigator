import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

import {
	COMMAND_ID,
	DEFAULT_ICON,
	EXTENSION_NAME,
	STYLE_ID,
	TAB_ID,
} from "./constants.js";
import { create_graph_index } from "./graph_index.js";
import { create_navigator } from "./navigation.js";
import { create_navigator_panel } from "./navigator_panel.js";
import { create_search_engine } from "./search_engine.js";
import { create_settings_store } from "./settings.js";
import { create_sidebar_controller } from "./sidebar_controller.js";

function add_styles()
{
	if (document.getElementById(STYLE_ID))
	{
		return;
	}

	const link = document.createElement("link");
	link.id = STYLE_ID;
	link.rel = "stylesheet";
	link.href = "/extensions/ComfyUI-WorkflowNavigator/style.css";
	document.head.appendChild(link);
}

add_styles();

const graph_index = create_graph_index(app);
const settings_store = create_settings_store(app);
const sidebar_controller = create_sidebar_controller(app, TAB_ID);
const search_engine = create_search_engine(graph_index, settings_store);
const navigator = create_navigator(app, settings_store, sidebar_controller);
const navigator_panel = create_navigator_panel({
	graph_index,
	search_engine,
	sidebar_controller,
	navigator,
	settings_store,
});

app.registerExtension({
	name: EXTENSION_NAME,

	commands: [
		{
			id: COMMAND_ID,
			label: "Toggle Workflow Navigator",
			function: () =>
			{
				navigator_panel.toggle_from_command();
			},
		},
	],

	keybindings: [
		{
			commandId: COMMAND_ID,
			combo: { key: "f", ctrl: true, shift: true },
		},
	],

	async setup()
	{
		await settings_store.install();

		app.extensionManager?.registerSidebarTab?.({
			id: TAB_ID,
			icon: DEFAULT_ICON,
			title: "Navigator",
			tooltip: "Search current workflow",
			type: "custom",
			render: (host_element) =>
			{
				navigator_panel.render(host_element);
			},
		});

		api.addEventListener("graphChanged", () =>
		{
			navigator_panel.invalidate_cache();
		});
	},

	async afterConfigureGraph()
	{
		navigator_panel.invalidate_cache();
	},
});
