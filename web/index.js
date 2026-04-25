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

const DEFAULT_KEYBINDING_COMBO = { key: "f", ctrl: true, shift: true };

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

function get_setting_value(setting_id, fallback_value)
{
	return app?.ui?.settings?.getSettingValue?.(setting_id, fallback_value) ?? fallback_value;
}

function combo_matches(left_combo, right_combo)
{
	return String(left_combo?.key ?? "").toUpperCase() === String(right_combo?.key ?? "").toUpperCase()
		&& Boolean(left_combo?.ctrl) === Boolean(right_combo?.ctrl)
		&& Boolean(left_combo?.alt) === Boolean(right_combo?.alt)
		&& Boolean(left_combo?.shift) === Boolean(right_combo?.shift);
}

function binding_matches(left_binding, right_binding)
{
	return left_binding?.commandId === right_binding?.commandId
		&& combo_matches(left_binding?.combo, right_binding?.combo)
		&& (left_binding?.targetElementId ?? "") === (right_binding?.targetElementId ?? "");
}

function format_keybinding_combo(combo)
{
	if (!combo?.key)
	{
		return "";
	}

	const parts = [];

	if (combo.ctrl)
	{
		parts.push("Ctrl");
	}

	if (combo.alt)
	{
		parts.push("Alt");
	}

	if (combo.shift)
	{
		parts.push("Shift");
	}

	parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);

	return parts.join("+");
}

function get_command_keybinding_combo(command_id)
{
	const new_bindings = get_setting_value("Comfy.Keybinding.NewBindings", []);
	const unset_bindings = get_setting_value("Comfy.Keybinding.UnsetBindings", []);
	const user_binding = new_bindings.find((binding) => binding?.commandId === command_id);

	if (user_binding?.combo)
	{
		return user_binding.combo;
	}

	const default_binding = {
		commandId: command_id,
		combo: DEFAULT_KEYBINDING_COMBO,
	};

	if (unset_bindings.some((binding) => binding_matches(binding, default_binding)))
	{
		return null;
	}

	return DEFAULT_KEYBINDING_COMBO;
}

function get_navigator_tooltip()
{
	const combo_text = format_keybinding_combo(get_command_keybinding_combo(COMMAND_ID));

	return combo_text ? `Navigator (${combo_text})` : "Navigator";
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
			combo: DEFAULT_KEYBINDING_COMBO,
		},
	],

	async setup()
	{
		await settings_store.install();

		app.extensionManager?.registerSidebarTab?.({
			id: TAB_ID,
			icon: DEFAULT_ICON,
			title: "Navigator",
			tooltip: get_navigator_tooltip(),
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
