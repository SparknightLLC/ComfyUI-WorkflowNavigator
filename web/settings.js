import { SETTINGS } from "./constants.js";
import { clamp_integer } from "./utils.js";

function normalize_max_rendered_results(value)
{
	return clamp_integer(
		value,
		SETTINGS.MIN_MAX_RENDERED_RESULTS,
		SETTINGS.MAX_MAX_RENDERED_RESULTS,
		SETTINGS.DEFAULT_MAX_RENDERED_RESULTS
	);
}

function normalize_query_debounce_ms(value)
{
	return clamp_integer(
		value,
		SETTINGS.MIN_QUERY_DEBOUNCE_MS,
		SETTINGS.MAX_QUERY_DEBOUNCE_MS,
		SETTINGS.DEFAULT_QUERY_DEBOUNCE_MS
	);
}

function normalize_jump_zoom_enabled(value)
{
	return value !== false;
}

export function create_settings_store(app)
{
	const listeners = new Set();
	const state = {
		max_rendered_results: SETTINGS.DEFAULT_MAX_RENDERED_RESULTS,
		jump_zoom_enabled: SETTINGS.DEFAULT_JUMP_ZOOM_ENABLED,
		query_debounce_ms: SETTINGS.DEFAULT_QUERY_DEBOUNCE_MS,
	};

	function emit_change(changed_key)
	{
		for (const listener of listeners)
		{
			listener(changed_key, get_values());
		}
	}

	function get_setting_value(setting_id, fallback_value)
	{
		return app?.ui?.settings?.getSettingValue?.(setting_id, fallback_value) ?? fallback_value;
	}

	function load_values_from_ui()
	{
		state.max_rendered_results = normalize_max_rendered_results(
			get_setting_value(
				SETTINGS.MAX_RENDERED_RESULTS_ID,
				SETTINGS.DEFAULT_MAX_RENDERED_RESULTS
			)
		);
		state.jump_zoom_enabled = normalize_jump_zoom_enabled(
			get_setting_value(
				SETTINGS.JUMP_ZOOM_ENABLED_ID,
				SETTINGS.DEFAULT_JUMP_ZOOM_ENABLED
			)
		);
		state.query_debounce_ms = normalize_query_debounce_ms(
			get_setting_value(
				SETTINGS.QUERY_DEBOUNCE_MS_ID,
				SETTINGS.DEFAULT_QUERY_DEBOUNCE_MS
			)
		);
	}

	function get_values()
	{
		return {
			max_rendered_results: state.max_rendered_results,
			jump_zoom_enabled: state.jump_zoom_enabled,
			query_debounce_ms: state.query_debounce_ms,
		};
	}

	function subscribe(listener)
	{
		listeners.add(listener);

		return () =>
		{
			listeners.delete(listener);
		};
	}

	async function install()
	{
		const ui_settings = app?.ui?.settings;

		if (!ui_settings)
		{
			return;
		}

		if (ui_settings.setup)
		{
			await ui_settings.setup;
		}

		load_values_from_ui();

		if (ui_settings.__workflow_navigator_settings_installed)
		{
			return;
		}

		ui_settings.__workflow_navigator_settings_installed = true;

		ui_settings.addSetting({
			id: SETTINGS.MAX_RENDERED_RESULTS_ID,
			name: "Navigator: Max rendered results",
			type: "number",
			defaultValue: state.max_rendered_results,
			attrs: {
				min: SETTINGS.MIN_MAX_RENDERED_RESULTS,
				max: SETTINGS.MAX_MAX_RENDERED_RESULTS,
				step: 1,
			},
			onChange: (next_value) =>
			{
				state.max_rendered_results = normalize_max_rendered_results(next_value);
				emit_change("max_rendered_results");
			},
		});

		ui_settings.addSetting({
			id: SETTINGS.JUMP_ZOOM_ENABLED_ID,
			name: "Navigator: Apply jump zoom",
			type: "boolean",
			defaultValue: state.jump_zoom_enabled,
			onChange: (next_value) =>
			{
				state.jump_zoom_enabled = normalize_jump_zoom_enabled(next_value);
				emit_change("jump_zoom_enabled");
			},
		});

		ui_settings.addSetting({
			id: SETTINGS.QUERY_DEBOUNCE_MS_ID,
			name: "Navigator: Search debounce (ms)",
			type: "number",
			defaultValue: state.query_debounce_ms,
			attrs: {
				min: SETTINGS.MIN_QUERY_DEBOUNCE_MS,
				max: SETTINGS.MAX_QUERY_DEBOUNCE_MS,
				step: 5,
			},
			onChange: (next_value) =>
			{
				state.query_debounce_ms = normalize_query_debounce_ms(next_value);
				emit_change("query_debounce_ms");
			},
		});
	}

	return {
		install,
		subscribe,
		get_values,
		get_max_rendered_results: () => state.max_rendered_results,
		get_query_debounce_ms: () => state.query_debounce_ms,
		is_jump_zoom_enabled: () => state.jump_zoom_enabled,
	};
}
