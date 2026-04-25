import {
	FILTER_DEFINITIONS,
} from "./constants.js";
import {
	create_element,
	normalize_query,
} from "./utils.js";

function get_entry_kind_label(kind)
{
	switch (kind)
	{
		case "group":
			return "Group";
		case "subgraph_entry":
			return "Subgraph";
		case "node":
		default:
			return "Node";
	}
}

function get_result_meta_text(entry)
{
	const parts = [];

	if (entry.kind === "node")
	{
		parts.push(entry.type || "Node");
		parts.push(`id ${entry.id}`);
	}
	else if (entry.kind === "group")
	{
		parts.push("Frame/Group");
	}
	else if (entry.kind === "subgraph_entry")
	{
		parts.push("Subgraph");
	}

	if (entry.path)
	{
		parts.push(entry.path);
	}

	return parts.join("  |  ");
}

function stop_handled_key_event(event)
{
	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();
}

export function create_navigator_panel(dependencies)
{
	const {
		graph_index,
		search_engine,
		sidebar_controller,
		navigator,
		settings_store,
	} = dependencies;

	const state = {
		query: "",
		active_filter_ids: new Set(FILTER_DEFINITIONS.map((filter) => filter.id)),
		results: [],
		selected_index: -1,
		last_render_key: "",
		search_timeout_id: 0,
		dom:
		{
			host: null,
			panel: null,
			search_input: null,
			search_icon: null,
			clear_button: null,
			filter_menu_button: null,
			filter_menu: null,
			filter_checkboxes: new Map(),
			results_list: null,
			status_label: null,
			footer_label: null,
		},
	};

	function clear_scheduled_search()
	{
		if (state.search_timeout_id)
		{
			window.clearTimeout(state.search_timeout_id);
			state.search_timeout_id = 0;
		}
	}

	function get_selected_entry_id()
	{
		if (state.selected_index < 0 || state.selected_index >= state.results.length)
		{
			return null;
		}

		return state.results[state.selected_index]?.entry_id ?? null;
	}

	function append_highlighted_text(parent, text)
	{
		const query = normalize_query(state.query);

		if (!query)
		{
			parent.appendChild(document.createTextNode(String(text ?? "")));
			return;
		}

		const raw_text = String(text ?? "");
		const lower_text = raw_text.toLowerCase();
		const match_index = lower_text.indexOf(query);

		if (match_index === -1)
		{
			parent.appendChild(document.createTextNode(raw_text));
			return;
		}

		const before = raw_text.slice(0, match_index);
		const match = raw_text.slice(match_index, match_index + query.length);
		const after = raw_text.slice(match_index + query.length);
		const mark = document.createElement("mark");

		mark.textContent = match;

		parent.appendChild(document.createTextNode(before));
		parent.appendChild(mark);
		parent.appendChild(document.createTextNode(after));
	}

	function update_search_clear_button()
	{
		const clear_button = state.dom.clear_button;
		const search_icon = state.dom.search_icon;

		if (!clear_button || !search_icon)
		{
			return;
		}

		const has_query = Boolean(state.query.trim().length);

		clear_button.hidden = !has_query;
		search_icon.hidden = has_query;
	}

	function update_status_label()
	{
		const status_label = state.dom.status_label;

		if (!status_label)
		{
			return;
		}

		const total_count = graph_index.get_total_count();
		const visible_count = state.results.length;
		const stale_suffix = graph_index.is_invalidated() ? "  |  refresh pending" : "";
		const active_filter_count = get_active_filter_ids().length;
		const filter_suffix = active_filter_count === FILTER_DEFINITIONS.length
			? ""
			: `  |  ${active_filter_count} ${active_filter_count === 1 ? "filter" : "filters"}`;

		status_label.textContent = `${visible_count} of ${total_count}${filter_suffix}${stale_suffix}`;
	}

	function update_footer_label()
	{
		const footer_label = state.dom.footer_label;

		if (!footer_label)
		{
			return;
		}

		footer_label.textContent = "↑/↓ move  •  Enter jump/close  •  Shift+Enter stay  •  Esc clear/close";
	}

	function get_active_filter_ids()
	{
		return FILTER_DEFINITIONS
			.map((filter) => filter.id)
			.filter((filter_id) => state.active_filter_ids.has(filter_id));
	}

	function update_filter_menu_state()
	{
		const menu_button = state.dom.filter_menu_button;
		const menu = state.dom.filter_menu;

		if (menu_button && menu)
		{
			menu_button.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
		}

		for (const [filter_id, checkbox] of state.dom.filter_checkboxes.entries())
		{
			const is_active = state.active_filter_ids.has(filter_id);
			const check_icon = checkbox.querySelector(".workflow-navigator-filter-check");

			checkbox.setAttribute("aria-checked", is_active ? "true" : "false");
			checkbox.classList.toggle("is-active", is_active);

			if (check_icon)
			{
				check_icon.style.visibility = is_active ? "visible" : "hidden";
			}
		}
	}

	function toggle_row_selected_state(index, selected)
	{
		const row = state.dom.results_list?.querySelector(`[data-index="${index}"]`);

		if (!row)
		{
			return;
		}

		row.classList.toggle("is-selected", selected);
		row.setAttribute("aria-selected", selected ? "true" : "false");
	}

	function scroll_selected_result_into_view()
	{
		if (!state.dom.results_list || state.selected_index < 0)
		{
			return;
		}

		const selected_row = state.dom.results_list.querySelector(`[data-index="${state.selected_index}"]`);

		selected_row?.scrollIntoView({
			block: "nearest",
		});
	}

	function update_selected_row(previous_index)
	{
		if (previous_index >= 0)
		{
			toggle_row_selected_state(previous_index, false);
		}

		if (state.selected_index >= 0)
		{
			toggle_row_selected_state(state.selected_index, true);
			scroll_selected_result_into_view();
		}
	}

	function render_empty_state(message)
	{
		const empty_state = create_element("div", "workflow-navigator-empty");
		empty_state.textContent = message;
		state.dom.results_list?.replaceChildren(empty_state);
		update_footer_label();
	}

	function render_results()
	{
		const results_list = state.dom.results_list;

		if (!results_list)
		{
			return;
		}

		if (!state.results.length)
		{
			render_empty_state(
				!get_active_filter_ids().length
					? "No search categories enabled."
					: state.query
					? "No matching workflow items."
					: "Type to search the current workflow."
			);
			return;
		}

		const fragment = document.createDocumentFragment();

		state.results.forEach((entry, index) =>
		{
			const row = create_element("button", "workflow-navigator-result");
			const title = create_element("div", "workflow-navigator-result-title");
			const meta = create_element("div", "workflow-navigator-result-meta");
			const badge = create_element("span", "workflow-navigator-kind");

			row.type = "button";
			row.dataset.index = String(index);
			row.dataset.kind = entry.kind;
			row.setAttribute("role", "option");
			row.classList.toggle("is-selected", index === state.selected_index);
			row.setAttribute("aria-selected", index === state.selected_index ? "true" : "false");

			badge.textContent = get_entry_kind_label(entry.kind);
			title.appendChild(badge);
			append_highlighted_text(title, entry.title);
			meta.textContent = get_result_meta_text(entry);

			row.appendChild(title);
			row.appendChild(meta);
			fragment.appendChild(row);
		});

		results_list.replaceChildren(fragment);
		update_footer_label();
		scroll_selected_result_into_view();
	}

	function set_selected_index(next_index)
	{
		if (!state.results.length)
		{
			const previous_index = state.selected_index;
			state.selected_index = -1;
			update_selected_row(previous_index);
			return;
		}

		const bounded_index = Math.max(0, Math.min(next_index, state.results.length - 1));

		if (bounded_index === state.selected_index)
		{
			return;
		}

		const previous_index = state.selected_index;
		state.selected_index = bounded_index;
		update_selected_row(previous_index);
	}

	function move_selection(delta)
	{
		if (!state.results.length)
		{
			return;
		}

		if (state.selected_index === -1)
		{
			set_selected_index(0);
			return;
		}

		const max_index = state.results.length - 1;
		const next_index = state.selected_index + delta;
		const wrapped_index = next_index < 0
			? max_index
			: next_index > max_index
				? 0
				: next_index;

		set_selected_index(wrapped_index);
	}

	function run_search()
	{
		state.search_timeout_id = 0;

		const previous_entry_id = get_selected_entry_id();
		const active_filter_ids = get_active_filter_ids();
		const next_results = search_engine.search(state.query, active_filter_ids);
		const next_render_key = [
			active_filter_ids.join(","),
			normalize_query(state.query),
			next_results.map((entry) => entry.entry_id).join("|"),
		].join("::");

		state.results = next_results;

		let next_selected_index = -1;

		if (previous_entry_id)
		{
			next_selected_index = next_results.findIndex((entry) => entry.entry_id === previous_entry_id);
		}

		if (next_selected_index === -1 && next_results.length)
		{
			next_selected_index = 0;
		}

		const previous_index = state.selected_index;
		state.selected_index = next_selected_index;

		if (state.last_render_key !== next_render_key)
		{
			state.last_render_key = next_render_key;
			render_results();
		}
		else
		{
			update_selected_row(previous_index);
		}

		update_status_label();
		update_search_clear_button();
	}

	function schedule_search(immediate = false)
	{
		clear_scheduled_search();

		if (immediate)
		{
			run_search();
			return;
		}

		const debounce_ms = settings_store.get_query_debounce_ms();

		if (debounce_ms <= 0)
		{
			run_search();
			return;
		}

		state.search_timeout_id = window.setTimeout(() =>
		{
			run_search();
		}, debounce_ms);
	}

	function focus_search_input(select_text = false, attempt = 0)
	{
		const search_input = state.dom.search_input;

		if (search_input?.isConnected)
		{
			schedule_search(true);
			search_input.focus();

			if (select_text)
			{
				search_input.select();
			}

			return;
		}

		if (attempt >= 12)
		{
			return;
		}

		window.setTimeout(() =>
		{
			focus_search_input(select_text, attempt + 1);
		}, 50);
	}

	function focus_search_input_when_visible(select_text = false, attempt = 0)
	{
		const host = state.dom.host;

		if (host?.isConnected && host.getClientRects().length > 0)
		{
			focus_search_input(select_text);
			return;
		}

		if (attempt >= 12)
		{
			return;
		}

		window.setTimeout(() =>
		{
			focus_search_input_when_visible(select_text, attempt + 1);
		}, 50);
	}

	function clear_search_query()
	{
		state.query = "";

		if (state.dom.search_input)
		{
			state.dom.search_input.value = "";
		}

		schedule_search(true);
	}

	function close_panel_and_focus_canvas()
	{
		sidebar_controller.close_from_surface();

		window.setTimeout(() =>
		{
			sidebar_controller.focus_canvas();
		}, 0);
	}

	function activate_selected_result(keep_panel_open)
	{
		if (state.selected_index < 0 || state.selected_index >= state.results.length)
		{
			return;
		}

		navigator.jump_to_entry(
			state.results[state.selected_index],
			{
				keep_panel_open: keep_panel_open,
				refocus_search: () =>
				{
					focus_search_input(false);
				},
			}
		);
	}

	function handle_search_input()
	{
		state.query = state.dom.search_input?.value ?? "";
		schedule_search(false);
	}

	function toggle_filter_menu()
	{
		const menu = state.dom.filter_menu;

		if (!menu)
		{
			return;
		}

		menu.hidden = !menu.hidden;
		update_filter_menu_state();
	}

	function close_filter_menu()
	{
		const menu = state.dom.filter_menu;

		if (!menu || menu.hidden)
		{
			return;
		}

		menu.hidden = true;
		update_filter_menu_state();
	}

	function toggle_filter(filter_id)
	{
		if (state.active_filter_ids.has(filter_id))
		{
			state.active_filter_ids.delete(filter_id);
		}
		else
		{
			state.active_filter_ids.add(filter_id);
		}

		update_filter_menu_state();
		schedule_search(true);
	}

	function is_filter_control_focused()
	{
		return document.activeElement === state.dom.filter_menu_button
			|| document.activeElement?.closest?.(".workflow-navigator-filter-menu") !== null;
	}

	function handle_panel_keydown(event)
	{
		if (!state.dom.panel?.contains(event.target))
		{
			return;
		}

		switch (event.key)
		{
			case "ArrowDown":
				if (is_filter_control_focused())
				{
					return;
				}

				stop_handled_key_event(event);
				move_selection(1);
				break;

			case "ArrowUp":
				if (is_filter_control_focused())
				{
					return;
				}

				stop_handled_key_event(event);
				move_selection(-1);
				break;

			case "Enter":
				if (is_filter_control_focused())
				{
					return;
				}

				stop_handled_key_event(event);
				activate_selected_result(event.shiftKey);
				break;

			case "Escape":
				stop_handled_key_event(event);

				if (state.dom.filter_menu && !state.dom.filter_menu.hidden)
				{
					close_filter_menu();
					state.dom.filter_menu_button?.focus();
				}
				else if (state.query)
				{
					clear_search_query();
					focus_search_input(false);
				}
				else
				{
					close_panel_and_focus_canvas();
				}
				break;
		}
	}

	function handle_results_pointer_over(event)
	{
		const row = event.target?.closest?.(".workflow-navigator-result");
		const next_index = Number(row?.dataset?.index);

		if (!Number.isInteger(next_index))
		{
			return;
		}

		set_selected_index(next_index);
	}

	function handle_results_click(event)
	{
		const row = event.target?.closest?.(".workflow-navigator-result");
		const next_index = Number(row?.dataset?.index);

		if (!Number.isInteger(next_index))
		{
			return;
		}

		set_selected_index(next_index);
		activate_selected_result(false);
	}

	function handle_document_pointer_down(event)
	{
		if (!state.dom.panel?.contains(event.target))
		{
			close_filter_menu();
			return;
		}

		if (
			!state.dom.filter_menu_button?.contains(event.target)
			&& !state.dom.filter_menu?.contains(event.target)
		)
		{
			close_filter_menu();
		}
	}

	function handle_document_click(event)
	{
		const tab_button = sidebar_controller.get_sidebar_tab_button?.();

		if (!tab_button?.contains(event.target))
		{
			return;
		}

		window.setTimeout(() =>
		{
			if (sidebar_controller.is_open())
			{
				focus_search_input_when_visible(false);
			}
		}, 0);
	}

	function build_panel()
	{
		if (state.dom.panel)
		{
			return state.dom.panel;
		}

		const panel = create_element("section", "workflow-navigator-panel");
		const top_section = create_element("div", "workflow-navigator-top");
		const title_row = create_element("div", "workflow-navigator-title-row flex min-h-16 items-center justify-between border-b border-interface-stroke px-3 2xl:px-4 text-base-foreground font-inter");
		const title_row_inner = create_element("div", "workflow-navigator-title-row-inner flex w-full items-center justify-between");
		const title = create_element("span", "workflow-navigator-title truncate font-bold text-base");
		const search_row = create_element("div", "workflow-navigator-search-row flex items-center gap-1 px-2 py-2 2xl:px-4");
		const search_shell = create_element("label", "workflow-navigator-search-shell group rounded-lg bg-secondary-background transition-all duration-150 flex flex-1 items-center border-0 text-base-foreground");
		const search_icon = create_element("i", "workflow-navigator-search-icon size-4 shrink-0 transition-colors duration-150 icon-[lucide--search] text-muted-foreground group-focus-within:text-base-foreground group-hover:text-base-foreground");
		const search_input = create_element("input", "workflow-navigator-search");
		const clear_button = create_element("button", "workflow-navigator-search-clear m-0 flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground ring-0 outline-0 transition-all duration-150 hover:text-base-foreground");
		const clear_icon = create_element("i", "icon-[lucide--x] size-4 cursor-pointer");
		const filter_menu_wrap = create_element("div", "workflow-navigator-filter-wrap");
		const filter_menu_button = create_element("button", "workflow-navigator-filter-button");
		const filter_menu_icon = create_element("i", "icon-[lucide--list-filter] size-4");
		const filter_menu = create_element("div", "workflow-navigator-filter-menu");
		const status_row = create_element("div", "workflow-navigator-status-row px-4 py-2");
		const status_label = create_element("div", "workflow-navigator-status text-sm text-muted-foreground");
		const results_list = create_element("div", "workflow-navigator-results");
		const footer_label = create_element("div", "workflow-navigator-footer");

		title.textContent = "Navigator";
		title.title = "Navigator";
		search_input.type = "text";
		search_input.className = "workflow-navigator-search h-5 w-full min-w-0 border-0 bg-transparent ring-0 outline-0 text-xs text-base-foreground placeholder:text-muted-foreground";
		search_input.placeholder = "Search...";
		search_input.autocomplete = "off";
		search_input.spellcheck = false;
		search_input.setAttribute("aria-label", "Search current workflow");
		clear_button.type = "button";
		clear_button.setAttribute("aria-label", "Clear search");
		clear_button.hidden = true;
		filter_menu_button.type = "button";
		filter_menu_button.setAttribute("aria-label", "Filter search categories");
		filter_menu_button.setAttribute("aria-haspopup", "menu");
		filter_menu_button.setAttribute("aria-expanded", "false");
		filter_menu.hidden = true;
		filter_menu.setAttribute("role", "menu");
		results_list.setAttribute("role", "listbox");

		search_input.addEventListener("input", handle_search_input);
		search_input.addEventListener("focus", () =>
		{
			schedule_search(true);
		});
		clear_button.addEventListener("click", (event) =>
		{
			event.preventDefault();
			clear_search_query();
			focus_search_input(false);
		});
		filter_menu_button.addEventListener("click", (event) =>
		{
			event.preventDefault();
			toggle_filter_menu();
		});
		panel.addEventListener("keydown", handle_panel_keydown, true);
		results_list.addEventListener("mouseover", handle_results_pointer_over);
		results_list.addEventListener("click", handle_results_click);
		document.addEventListener("pointerdown", handle_document_pointer_down, true);
		document.addEventListener("click", handle_document_click, true);

		for (const filter of FILTER_DEFINITIONS)
		{
			const item = create_element("button", "workflow-navigator-filter-item");
			const label = create_element("span", "workflow-navigator-filter-label");
			const check = create_element("i", "workflow-navigator-filter-check icon-[lucide--check] size-4");

			item.type = "button";
			item.setAttribute("role", "menuitemcheckbox");
			label.textContent = filter.label;
			item.addEventListener("click", () =>
			{
				toggle_filter(filter.id);
			});

			item.appendChild(label);
			item.appendChild(check);
			state.dom.filter_checkboxes.set(filter.id, item);
			filter_menu.appendChild(item);
		}

		title_row_inner.appendChild(title);
		title_row.appendChild(title_row_inner);
		clear_button.appendChild(clear_icon);
		search_shell.appendChild(search_icon);
		search_shell.appendChild(clear_button);
		search_shell.appendChild(search_input);
		filter_menu_button.appendChild(filter_menu_icon);
		filter_menu_wrap.appendChild(filter_menu_button);
		filter_menu_wrap.appendChild(filter_menu);
		search_row.appendChild(search_shell);
		search_row.appendChild(filter_menu_wrap);
		status_row.appendChild(status_label);
		top_section.appendChild(title_row);
		top_section.appendChild(search_row);
		top_section.appendChild(status_row);
		panel.appendChild(top_section);
		panel.appendChild(results_list);
		panel.appendChild(footer_label);

		state.dom.panel = panel;
		state.dom.search_input = search_input;
		state.dom.search_icon = search_icon;
		state.dom.clear_button = clear_button;
		state.dom.filter_menu_button = filter_menu_button;
		state.dom.filter_menu = filter_menu;
		state.dom.results_list = results_list;
		state.dom.status_label = status_label;
		state.dom.footer_label = footer_label;

		update_filter_menu_state();
		update_footer_label();
		update_status_label();
		update_search_clear_button();

		return panel;
	}

	function render(host_element)
	{
		const panel = build_panel();

		host_element.classList.add("workflow-navigator-host");
		state.dom.host = host_element;
		host_element.replaceChildren(panel);
		schedule_search(true);
		focus_search_input_when_visible(false);
	}

	function toggle_from_command()
	{
		if (sidebar_controller.is_open())
		{
			close_panel_and_focus_canvas();
			return;
		}

		sidebar_controller.open();
		focus_search_input(true);
	}

	function invalidate_cache()
	{
		graph_index.invalidate();
		search_engine.clear_cache();
		update_status_label();
	}

	settings_store.subscribe((changed_key) =>
	{
		if (changed_key === "max_rendered_results")
		{
			search_engine.clear_cache();
			schedule_search(true);
			return;
		}

		if (changed_key === "query_debounce_ms")
		{
			clear_scheduled_search();
		}
	});

	return {
		render,
		toggle_from_command,
		invalidate_cache,
	};
}
