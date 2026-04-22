import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const EXTENSION_NAME = "ComfyUI-WorkflowNavigator";
const TAB_ID = "workflowNavigator";
const COMMAND_ID = "workflowNavigator.open";
const DEFAULT_ICON = "pi pi-compass";
const STYLE_ID = "workflow-navigator-style";
const MAX_RENDERED_RESULTS = 50;
const FILTER_ALL = "all";
const FILTER_TITLES = "titles";
const FILTER_TYPES = "types";
const FILTER_NOTES = "notes";
const FILTER_FRAMES_GROUPS = "frames_groups";
const FILTER_SUBGRAPHS = "subgraphs";
const NOTE_LIKE_PATTERN = /(note|comment|annotation|markdown|sticky)/i;
const DEFAULT_GROUP_SIZE = [320, 180];

const FILTER_DEFINITIONS = [
	{ id: FILTER_ALL, label: "All" },
	{ id: FILTER_TITLES, label: "Titles" },
	{ id: FILTER_TYPES, label: "Types" },
	{ id: FILTER_NOTES, label: "Notes" },
	{ id: FILTER_FRAMES_GROUPS, label: "Frames/Groups" },
	{ id: FILTER_SUBGRAPHS, label: "Subgraphs" },
];

const state =
{
	cache_entries: [],
	cache_invalidated: true,
	filter_id: FILTER_ALL,
	query: "",
	results: [],
	selected_index: -1,
	render_host: null,
	dom:
	{
		host: null,
		panel: null,
		top_section: null,
		search_input: null,
		clear_button: null,
		filter_buttons: new Map(),
		results_list: null,
		status_label: null,
		footer_label: null,
	},
};

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

function create_element(tag_name, class_name)
{
	const element = document.createElement(tag_name);

	if (class_name)
	{
		element.className = class_name;
	}

	return element;
}

function escape_html(value)
{
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function get_trimmed_string(value)
{
	return typeof value === "string" ? value.trim() : "";
}

function normalize_query(value)
{
	return get_trimmed_string(value).toLowerCase().replace(/\s+/g, " ");
}

function get_query_terms(query)
{
	const normalized_query = normalize_query(query);

	return normalized_query ? normalized_query.split(" ") : [];
}

function get_current_graph()
{
	return app?.canvas?.graph || app?.graph || null;
}

function get_root_graph(graph)
{
	if (!graph)
	{
		return null;
	}

	return graph.rootGraph || graph;
}

function get_graph_nodes(graph)
{
	if (!graph)
	{
		return [];
	}

	if (Array.isArray(graph._nodes))
	{
		return graph._nodes;
	}

	if (Array.isArray(graph.nodes))
	{
		return graph.nodes;
	}

	return [];
}

function get_graph_groups(graph)
{
	if (!graph)
	{
		return [];
	}

	if (Array.isArray(graph._groups))
	{
		return graph._groups;
	}

	if (Array.isArray(graph.groups))
	{
		return graph.groups;
	}

	return [];
}

function get_graph_title(graph, fallback_label = "Graph")
{
	const title_candidates = [
		graph?.title,
		graph?.name,
		graph?.extra?.title,
		graph?.extra?.name,
	];

	for (const candidate of title_candidates)
	{
		const title = get_trimmed_string(candidate);

		if (title)
		{
			return title;
		}
	}

	return fallback_label;
}

function get_graph_bounds(graph)
{
	const bounds_list = [];

	for (const node of get_graph_nodes(graph))
	{
		const bounds = get_node_bounds(node);

		if (bounds)
		{
			bounds_list.push(bounds);
		}
	}

	for (const group of get_graph_groups(graph))
	{
		const bounds = get_group_bounds(group);

		if (bounds)
		{
			bounds_list.push(bounds);
		}
	}

	return get_union_bounds(bounds_list);
}

function get_union_bounds(bounds_list)
{
	if (!bounds_list.length)
	{
		return null;
	}

	let min_x = Number.POSITIVE_INFINITY;
	let min_y = Number.POSITIVE_INFINITY;
	let max_x = Number.NEGATIVE_INFINITY;
	let max_y = Number.NEGATIVE_INFINITY;

	for (const bounds of bounds_list)
	{
		if (!Array.isArray(bounds) || bounds.length < 4)
		{
			continue;
		}

		const [x, y, width, height] = bounds;

		if (![x, y, width, height].every(Number.isFinite))
		{
			continue;
		}

		min_x = Math.min(min_x, x);
		min_y = Math.min(min_y, y);
		max_x = Math.max(max_x, x + width);
		max_y = Math.max(max_y, y + height);
	}

	if (![min_x, min_y, max_x, max_y].every(Number.isFinite))
	{
		return null;
	}

	return [min_x, min_y, max_x - min_x, max_y - min_y];
}

function get_node_label(node)
{
	const explicit_title = get_trimmed_string(node?.title);

	if (explicit_title)
	{
		return explicit_title;
	}

	if (typeof node?.getTitle === "function")
	{
		const title = get_trimmed_string(node.getTitle());

		if (title)
		{
			return title;
		}
	}

	const node_type = get_trimmed_string(node?.type);

	if (node_type)
	{
		return node_type;
	}

	return `Node ${node?.id ?? "?"}`;
}

function get_node_type_label(node)
{
	return get_trimmed_string(node?.type) || "Node";
}

function get_node_bounds(node)
{
	if (!node)
	{
		return null;
	}

	const x = Number(node?.pos?.[0]);
	const y = Number(node?.pos?.[1]);
	const width = Number(node?.size?.[0] ?? 220);
	const height = Number(node?.size?.[1] ?? 110);

	if (![x, y, width, height].every(Number.isFinite))
	{
		return null;
	}

	return [x, y, width, height];
}

function get_group_title(group)
{
	const title_candidates = [
		group?.title,
		group?.name,
		group?._title,
	];

	for (const candidate of title_candidates)
	{
		const title = get_trimmed_string(candidate);

		if (title)
		{
			return title;
		}
	}

	return "Group";
}

function get_group_bounds(group)
{
	const explicit_bounds = group?._bounding || group?.bounding;

	if (Array.isArray(explicit_bounds) && explicit_bounds.length >= 4)
	{
		const [x, y, width, height] = explicit_bounds;

		if ([x, y, width, height].every(Number.isFinite))
		{
			return [x, y, width, height];
		}
	}

	const x = Number(group?.pos?.[0] ?? group?._pos?.[0] ?? 0);
	const y = Number(group?.pos?.[1] ?? group?._pos?.[1] ?? 0);
	const width = Number(group?.size?.[0] ?? group?._size?.[0] ?? DEFAULT_GROUP_SIZE[0]);
	const height = Number(group?.size?.[1] ?? group?._size?.[1] ?? DEFAULT_GROUP_SIZE[1]);

	if (![x, y, width, height].every(Number.isFinite))
	{
		return null;
	}

	return [x, y, width, height];
}

function get_bounds_center(bounds)
{
	if (!Array.isArray(bounds) || bounds.length < 4)
	{
		return null;
	}

	return [
		bounds[0] + bounds[2] / 2,
		bounds[1] + bounds[3] / 2,
	];
}

function get_path_label(path_parts)
{
	return path_parts.filter(Boolean).join(" > ");
}

function get_note_text(node)
{
	if (!node)
	{
		return "";
	}

	const type_label = get_node_type_label(node);
	const title_label = get_node_label(node);
	const looks_like_note = NOTE_LIKE_PATTERN.test(type_label) || NOTE_LIKE_PATTERN.test(title_label);

	if (!looks_like_note)
	{
		return "";
	}

	const note_candidates = [
		node?.properties?.text,
		node?.properties?.note,
		node?.properties?.comment,
		node?.properties?.value,
	];

	if (Array.isArray(node?.widgets_values))
	{
		for (const value of node.widgets_values)
		{
			if (typeof value === "string")
			{
				note_candidates.push(value);
			}
		}
	}

	if (Array.isArray(node?.widgets))
	{
		for (const widget of node.widgets)
		{
			if (typeof widget?.value === "string")
			{
				note_candidates.push(widget.value);
			}
		}
	}

	return note_candidates
		.map(get_trimmed_string)
		.filter(Boolean)
		.join(" ")
		.trim();
}

function make_entry_id(kind, path_label, id)
{
	return `${kind}:${path_label}:${id}`;
}

function build_entry(
	kind,
	id,
	title,
	type_label,
	note_text,
	path_label,
	graph_ref,
	raw_ref,
	bounds,
	meta_label
)
{
	const normalized_title = get_trimmed_string(title);
	const normalized_type = get_trimmed_string(type_label);
	const normalized_note = get_trimmed_string(note_text);
	const normalized_path = get_trimmed_string(path_label);
	const normalized_meta = get_trimmed_string(meta_label);
	const search_segments = [
		normalized_title,
		normalized_type,
		normalized_note,
		normalized_path,
		normalized_meta,
	];
	const search_text = normalize_query(search_segments.filter(Boolean).join(" "));
	const position = get_bounds_center(bounds);

	return {
		entry_id: make_entry_id(kind, normalized_path, id),
		kind: kind,
		id: id,
		title: normalized_title,
		type: normalized_type,
		note_text: normalized_note,
		path: normalized_path,
		meta_label: normalized_meta,
		search_text: search_text,
		position: position,
		bounds: bounds,
		graph_ref: graph_ref,
		raw_ref: raw_ref,
		title_lc: normalize_query(normalized_title),
		type_lc: normalize_query(normalized_type),
		note_lc: normalize_query(normalized_note),
		path_lc: normalize_query(normalized_path),
		meta_lc: normalize_query(normalized_meta),
	};
}

function enumerate_graph_entries()
{
	const current_graph = get_current_graph();
	const root_graph = get_root_graph(current_graph);
	const entries = [];
	const visited_graphs = new Set();

	if (!root_graph)
	{
		return entries;
	}

	function traverse_graph(graph, path_parts)
	{
		if (!graph || visited_graphs.has(graph))
		{
			return;
		}

		visited_graphs.add(graph);

		for (const node of get_graph_nodes(graph))
		{
			const node_label = get_node_label(node);
			const type_label = get_node_type_label(node);
			const note_text = get_note_text(node);
			const bounds = get_node_bounds(node);
			const path_label = get_path_label(path_parts);

			entries.push(
				build_entry(
					"node",
					node?.id ?? node_label,
					node_label,
					type_label,
					note_text,
					path_label,
					graph,
					node,
					bounds,
					`Node ${node?.id ?? "?"}`
				)
			);

			if (node?.subgraph)
			{
				const subgraph_title = get_graph_title(node.subgraph, node_label);
				const subgraph_bounds = get_graph_bounds(node.subgraph);
				const subgraph_path_label = get_path_label(path_parts);

				entries.push(
					build_entry(
						"subgraph_entry",
						`${node?.id ?? node_label}:subgraph`,
						subgraph_title,
						"Subgraph",
						"",
						subgraph_path_label,
						node.subgraph,
						node,
						subgraph_bounds,
						`Open subgraph from node ${node?.id ?? "?"}`
					)
				);

				traverse_graph(node.subgraph, [...path_parts, node_label]);
			}
		}

		for (const group of get_graph_groups(graph))
		{
			const bounds = get_group_bounds(group);

			entries.push(
				build_entry(
					"group",
					group?.id ?? group?.title ?? get_group_title(group),
					get_group_title(group),
					"Group",
					"",
					get_path_label(path_parts),
					graph,
					group,
					bounds,
					"Frame/Group"
				)
			);
		}
	}

	traverse_graph(root_graph, []);

	return entries.sort(compare_entries_stably);
}

function compare_entries_stably(left_entry, right_entry)
{
	const left_kind_order = get_kind_order(left_entry.kind);
	const right_kind_order = get_kind_order(right_entry.kind);

	if (left_kind_order !== right_kind_order)
	{
		return left_kind_order - right_kind_order;
	}

	const path_compare = left_entry.path.localeCompare(right_entry.path);

	if (path_compare !== 0)
	{
		return path_compare;
	}

	const title_compare = left_entry.title.localeCompare(right_entry.title);

	if (title_compare !== 0)
	{
		return title_compare;
	}

	const type_compare = left_entry.type.localeCompare(right_entry.type);

	if (type_compare !== 0)
	{
		return type_compare;
	}

	return String(left_entry.id).localeCompare(String(right_entry.id), undefined, { numeric: true });
}

function get_kind_order(kind)
{
	switch (kind)
	{
		case "node":
			return 0;
		case "group":
			return 1;
		case "subgraph_entry":
			return 2;
		default:
			return 9;
	}
}

function invalidate_cache()
{
	state.cache_invalidated = true;
	update_status_label();
}

function ensure_cache_ready()
{
	if (!state.cache_invalidated)
	{
		return;
	}

	state.cache_entries = enumerate_graph_entries();
	state.cache_invalidated = false;
	update_status_label();
}

function get_field_text_for_filter(entry, filter_id)
{
	switch (filter_id)
	{
		case FILTER_TITLES:
			return entry.title_lc;
		case FILTER_TYPES:
			return entry.type_lc;
		case FILTER_NOTES:
			return entry.note_lc;
		case FILTER_FRAMES_GROUPS:
			return normalize_query(`${entry.title} ${entry.path} ${entry.meta_label}`);
		case FILTER_SUBGRAPHS:
			return normalize_query(`${entry.title} ${entry.path} ${entry.meta_label}`);
		case FILTER_ALL:
		default:
			return entry.search_text;
	}
}

function entry_allowed_for_filter(entry, filter_id)
{
	switch (filter_id)
	{
		case FILTER_NOTES:
			return Boolean(entry.note_lc);
		case FILTER_FRAMES_GROUPS:
			return entry.kind === "group";
		case FILTER_SUBGRAPHS:
			return entry.kind === "subgraph_entry";
		default:
			return true;
	}
}

function text_matches_terms(text, terms)
{
	if (!terms.length)
	{
		return true;
	}

	return terms.every((term) => text.includes(term));
}

function get_match_score(text, terms, base_score)
{
	if (!terms.length)
	{
		return base_score + 500;
	}

	let total_score = base_score;

	for (const term of terms)
	{
		const index = text.indexOf(term);

		if (index === -1)
		{
			return Number.POSITIVE_INFINITY;
		}

		if (text === term)
		{
			total_score += 0;
		}
		else if (text.startsWith(term))
		{
			total_score += 10 + index;
		}
		else
		{
			total_score += 50 + index;
		}
	}

	return total_score;
}

function compare_results(left_entry, right_entry, terms, filter_id)
{
	const left_score = get_entry_score(left_entry, terms, filter_id);
	const right_score = get_entry_score(right_entry, terms, filter_id);

	if (left_score !== right_score)
	{
		return left_score - right_score;
	}

	return compare_entries_stably(left_entry, right_entry);
}

function get_entry_score(entry, terms, filter_id)
{
	switch (filter_id)
	{
		case FILTER_TITLES:
			return get_match_score(entry.title_lc, terms, 0);
		case FILTER_TYPES:
			return get_match_score(entry.type_lc, terms, 100);
		case FILTER_NOTES:
			return get_match_score(entry.note_lc, terms, 200);
		case FILTER_FRAMES_GROUPS:
			return get_match_score(get_field_text_for_filter(entry, filter_id), terms, 300);
		case FILTER_SUBGRAPHS:
			return get_match_score(get_field_text_for_filter(entry, filter_id), terms, 400);
		case FILTER_ALL:
		default:
		{
			const title_score = get_match_score(entry.title_lc, terms, 0);
			const type_score = get_match_score(entry.type_lc, terms, 100);
			const note_score = get_match_score(entry.note_lc, terms, 200);
			const path_score = get_match_score(entry.path_lc, terms, 300);
			const meta_score = get_match_score(entry.meta_lc, terms, 350);

			return Math.min(title_score, type_score, note_score, path_score, meta_score);
		}
	}
}

function update_results()
{
	ensure_cache_ready();

	const terms = get_query_terms(state.query);
	const filtered_entries = state.cache_entries
		.filter((entry) => entry_allowed_for_filter(entry, state.filter_id))
		.filter((entry) => text_matches_terms(get_field_text_for_filter(entry, state.filter_id), terms))
		.sort((left_entry, right_entry) => compare_results(left_entry, right_entry, terms, state.filter_id));

	state.results = filtered_entries.slice(0, MAX_RENDERED_RESULTS);

	if (!state.results.length)
	{
		state.selected_index = -1;
	}
	else if (state.selected_index < 0 || state.selected_index >= state.results.length)
	{
		state.selected_index = 0;
	}

	render_results();
	update_status_label();
	update_search_clear_button();
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

function highlight_query(text)
{
	const query = normalize_query(state.query);

	if (!query)
	{
		return escape_html(text);
	}

	const normalized_text = String(text ?? "");
	const lower_text = normalized_text.toLowerCase();
	const match_index = lower_text.indexOf(query);

	if (match_index === -1)
	{
		return escape_html(normalized_text);
	}

	const before = normalized_text.slice(0, match_index);
	const match = normalized_text.slice(match_index, match_index + query.length);
	const after = normalized_text.slice(match_index + query.length);

	return `${escape_html(before)}<mark>${escape_html(match)}</mark>${escape_html(after)}`;
}

function render_results()
{
	const results_list = state.dom.results_list;

	if (!results_list)
	{
		return;
	}

	results_list.innerHTML = "";

	if (!state.results.length)
	{
		const empty_state = create_element("div", "workflow-navigator-empty");
		empty_state.textContent = state.query
			? "No matching workflow items."
			: "Type to search the current workflow.";
		results_list.appendChild(empty_state);
		update_footer_label();
		return;
	}

	state.results.forEach((entry, index) =>
	{
		const row = create_element("button", "workflow-navigator-result");
		const title = create_element("div", "workflow-navigator-result-title");
		const meta = create_element("div", "workflow-navigator-result-meta");
		const badge = create_element("span", "workflow-navigator-kind");
		const meta_text = get_result_meta_text(entry);

		row.type = "button";
		row.dataset.index = String(index);
		row.dataset.kind = entry.kind;
		row.classList.toggle("is-selected", index === state.selected_index);
		row.setAttribute("aria-selected", index === state.selected_index ? "true" : "false");

		badge.textContent = get_entry_kind_label(entry.kind);
		title.innerHTML = `${badge.outerHTML}${highlight_query(entry.title)}`;
		meta.innerHTML = escape_html(meta_text);

		row.appendChild(title);
		row.appendChild(meta);

		row.addEventListener("mouseenter", () =>
		{
			set_selected_index(index);
		});

		row.addEventListener("click", () =>
		{
			set_selected_index(index);
			activate_selected_result(false);
		});

		results_list.appendChild(row);
	});

	update_footer_label();
	scroll_selected_result_into_view();
}

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

function set_selected_index(next_index)
{
	if (!state.results.length)
	{
		state.selected_index = -1;
		render_results();
		return;
	}

	const bounded_index = Math.max(0, Math.min(next_index, state.results.length - 1));

	if (bounded_index === state.selected_index)
	{
		return;
	}

	state.selected_index = bounded_index;
	render_results();
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

function update_status_label()
{
	const status_label = state.dom.status_label;

	if (!status_label)
	{
		return;
	}

	const total_count = state.cache_entries.length;
	const visible_count = state.results.length;
	const stale_suffix = state.cache_invalidated ? "  |  refresh pending" : "";

	status_label.textContent = `${visible_count} of ${total_count} shown${stale_suffix}`;
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

function update_search_clear_button()
{
	const clear_button = state.dom.clear_button;

	if (!clear_button)
	{
		return;
	}

	clear_button.hidden = !state.query.trim().length;
}

function get_sidebar_tab_button()
{
	const sidebar_button = document.querySelector(`.${TAB_ID}-tab-button`);

	return sidebar_button instanceof HTMLElement ? sidebar_button : null;
}

function get_active_sidebar_tab_id()
{
	const manager = app?.extensionManager;

	return manager?.activeSidebarTabId ?? manager?.activeSidebarTab?.id ?? null;
}

function is_sidebar_tab_open()
{
	return get_active_sidebar_tab_id() === TAB_ID;
}

function open_sidebar_tab()
{
	const manager = app?.extensionManager;
	const active_sidebar_tab_id = get_active_sidebar_tab_id();

	if (active_sidebar_tab_id === TAB_ID && state.dom.panel?.isConnected)
	{
		return;
	}

	if ("activeSidebarTabId" in (manager || {}))
	{
		manager.activeSidebarTabId = TAB_ID;
		return;
	}

	const sidebar_button = get_sidebar_tab_button();

	if (sidebar_button)
	{
		sidebar_button.click();
		return;
	}

	if (typeof manager?.toggleSidebarTab === "function")
	{
		manager.toggleSidebarTab(TAB_ID);
	}
}

function close_sidebar_tab()
{
	const manager = app?.extensionManager;
	const sidebar_button = get_sidebar_tab_button();

	if (sidebar_button)
	{
		sidebar_button.click();
		return;
	}

	if ("activeSidebarTabId" in (manager || {}))
	{
		manager.activeSidebarTabId = null;
		return;
	}

	if (typeof manager?.toggleSidebarTab === "function")
	{
		manager.toggleSidebarTab(TAB_ID);
	}
}

function focus_search_input(select_text = false, attempt = 0)
{
	const search_input = state.dom.search_input;

	if (search_input?.isConnected)
	{
		ensure_cache_ready();
		update_results();
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

function focus_canvas()
{
	const canvas_targets = [
		document.getElementById("graph-canvas"),
		document.querySelector("#graph-canvas-container canvas"),
		document.getElementById("graph-canvas-container"),
	];

	for (const target of canvas_targets)
	{
		if (target instanceof HTMLElement)
		{
			if (!target.hasAttribute("tabindex"))
			{
				target.setAttribute("tabindex", "-1");
			}

			target.focus();
			return;
		}
	}
}

function mark_canvas_dirty()
{
	if (typeof app?.canvas?.setDirty === "function")
	{
		app.canvas.setDirty(true, true);
		return;
	}

	if (typeof app?.graph?.setDirtyCanvas === "function")
	{
		app.graph.setDirtyCanvas(true, true);
	}
}

function navigate_to_bounds(bounds)
{
	if (!bounds || !app?.canvas)
	{
		return;
	}

	const drag_scale = app.canvas.ds;

	if (drag_scale && typeof drag_scale.animateToBounds === "function")
	{
		drag_scale.animateToBounds(
			bounds,
			() =>
			{
				mark_canvas_dirty();
			},
			{
				zoom: 0.75,
			}
		);
		return;
	}

	if (drag_scale && typeof drag_scale.fitToBounds === "function")
	{
		drag_scale.fitToBounds(bounds, { zoom: 0.75 });
		mark_canvas_dirty();
	}
}

function select_and_center_node(node)
{
	if (!app?.canvas || !node)
	{
		return;
	}

	if (typeof app.canvas.selectNode === "function")
	{
		app.canvas.selectNode(node, false);
	}

	if (typeof app.canvas.centerOnNode === "function")
	{
		app.canvas.centerOnNode(node);
	}
	else
	{
		navigate_to_bounds(get_node_bounds(node));
	}

	mark_canvas_dirty();
}

function jump_to_entry(entry, keep_focus_in_panel)
{
	if (!entry || !app?.canvas)
	{
		return;
	}

	const current_graph = app.canvas.graph;
	let target_graph = entry.graph_ref;

	if (entry.kind === "subgraph_entry")
	{
		target_graph = entry.graph_ref;
	}

	const perform_navigation = () =>
	{
		if (entry.kind === "group")
		{
			navigate_to_bounds(entry.bounds);
		}
		else if (entry.kind === "subgraph_entry")
		{
			const subgraph_bounds = get_graph_bounds(target_graph);

			if (subgraph_bounds)
			{
				navigate_to_bounds(subgraph_bounds);
			}
			else
			{
				mark_canvas_dirty();
			}
		}
		else
		{
			select_and_center_node(entry.raw_ref);
		}

		if (keep_focus_in_panel)
		{
			focus_search_input(false);
		}
		else
		{
			close_sidebar_tab();
			window.setTimeout(() =>
			{
				focus_canvas();
			}, 0);
		}
	};

	if (target_graph && current_graph !== target_graph && typeof app.canvas.setGraph === "function")
	{
		app.canvas.setGraph(target_graph);
		window.setTimeout(perform_navigation, 0);
		return;
	}

	perform_navigation();
}

function activate_selected_result(keep_focus_in_panel)
{
	if (state.selected_index < 0 || state.selected_index >= state.results.length)
	{
		return;
	}

	jump_to_entry(state.results[state.selected_index], keep_focus_in_panel);
}

function stop_handled_key_event(event)
{
	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();
}

function is_filter_button_focused()
{
	return document.activeElement?.classList?.contains("workflow-navigator-filter") ?? false;
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
			if (is_filter_button_focused())
			{
				return;
			}

			stop_handled_key_event(event);
			move_selection(1);
			break;

		case "ArrowUp":
			if (is_filter_button_focused())
			{
				return;
			}

			stop_handled_key_event(event);
			move_selection(-1);
			break;

		case "Enter":
			if (is_filter_button_focused())
			{
				return;
			}

			stop_handled_key_event(event);
			activate_selected_result(event.shiftKey);
			break;

		case "Escape":
			stop_handled_key_event(event);

			if (state.query)
			{
				clear_search_query();
				focus_search_input(false);
			}
			else
			{
				close_sidebar_tab();
				focus_canvas();
			}
			break;
	}
}

function handle_search_input()
{
	state.query = state.dom.search_input?.value ?? "";
	state.selected_index = 0;
	update_results();
}

function clear_search_query()
{
	state.query = "";

	if (state.dom.search_input)
	{
		state.dom.search_input.value = "";
	}

	state.selected_index = 0;
	update_results();
}

function handle_filter_click(filter_id)
{
	if (state.filter_id === filter_id)
	{
		return;
	}

	state.filter_id = filter_id;
	state.selected_index = 0;
	update_filter_buttons();
	update_results();
}

function update_filter_buttons()
{
	for (const [filter_id, button] of state.dom.filter_buttons.entries())
	{
		button.classList.toggle("is-active", filter_id === state.filter_id);
		button.setAttribute("aria-pressed", filter_id === state.filter_id ? "true" : "false");
	}
}

function build_panel()
{
	if (state.dom.panel)
	{
		return state.dom.panel;
	}

	const panel = create_element("section", "workflow-navigator-panel");
	const top_section = create_element("div", "workflow-navigator-top");
	const header = create_element("div", "workflow-navigator-header");
	const title = create_element("h3", "workflow-navigator-title");
	const search_shell = create_element(
		"label",
		"group rounded-lg bg-component-node-widget-background transition-all duration-150 flex flex-1 items-center border-0 text-base-foreground focus-within:ring focus-within:ring-component-node-widget-background-highlighted/80"
	);
	const search_icon = create_element(
		"i",
		"ml-2 size-4 shrink-0 transition-colors duration-150 icon-[lucide--search] text-muted-foreground group-focus-within:text-base-foreground group-hover:text-base-foreground"
	);
	const search_input = create_element("input", "workflow-navigator-search");
	const clear_button = create_element(
		"button",
		"m-0 flex shrink-0 items-center justify-center border-0 bg-transparent p-0 pr-3 pl-1 text-muted-foreground ring-0 outline-0 transition-all duration-150 hover:scale-108 hover:text-base-foreground"
	);
	const clear_icon = create_element("i", "icon-[lucide--delete] size-4 cursor-pointer");
	const filters = create_element("div", "workflow-navigator-filters");
	const status_label = create_element("div", "workflow-navigator-status");
	const results_list = create_element("div", "workflow-navigator-results");
	const footer_label = create_element("div", "workflow-navigator-footer");

	title.textContent = "Navigator";
	search_input.type = "text";
	search_input.className = "workflow-navigator-search mx-2 my-1.5 h-5 w-full min-w-0 border-0 bg-transparent ring-0 outline-0";
	search_input.placeholder = "Search titles, types, notes, groups, subgraphs";
	search_input.autocomplete = "off";
	search_input.spellcheck = false;
	clear_button.type = "button";
	clear_button.setAttribute("aria-label", "Clear search");
	clear_button.hidden = true;
	clear_button.appendChild(clear_icon);

	search_input.addEventListener("input", handle_search_input);
	search_input.addEventListener("focus", () =>
	{
		ensure_cache_ready();
		update_results();
	});
	clear_button.addEventListener("click", (event) =>
	{
		event.preventDefault();
		clear_search_query();
		focus_search_input(false);
	});

	panel.addEventListener("keydown", handle_panel_keydown, true);

	for (const filter of FILTER_DEFINITIONS)
	{
		const button = create_element("button", "workflow-navigator-filter");
		button.type = "button";
		button.textContent = filter.label;
		button.addEventListener("click", () =>
		{
			handle_filter_click(filter.id);
		});
		state.dom.filter_buttons.set(filter.id, button);
		filters.appendChild(button);
	}

	header.appendChild(title);
	search_shell.appendChild(search_icon);
	search_shell.appendChild(search_input);
	search_shell.appendChild(clear_button);
	header.appendChild(search_shell);
	top_section.appendChild(header);
	top_section.appendChild(filters);
	top_section.appendChild(status_label);
	panel.appendChild(top_section);
	panel.appendChild(results_list);
	panel.appendChild(footer_label);

	state.dom.panel = panel;
	state.dom.top_section = top_section;
	state.dom.search_input = search_input;
	state.dom.clear_button = clear_button;
	state.dom.results_list = results_list;
	state.dom.status_label = status_label;
	state.dom.footer_label = footer_label;

	update_filter_buttons();
	update_results();

	return panel;
}

function render_panel(host_element)
{
	const panel = build_panel();

	host_element.classList.add("workflow-navigator-host");
	state.render_host = host_element;
	state.dom.host = host_element;
	host_element.replaceChildren(panel);
	update_results();
}

function open_navigator_command()
{
	if (is_sidebar_tab_open())
	{
		close_sidebar_tab();
		focus_canvas();
		return;
	}

	open_sidebar_tab();
	focus_search_input(true);
}

add_styles();

app.registerExtension({
	name: EXTENSION_NAME,

	commands: [
		{
			id: COMMAND_ID,
			label: "Toggle Workflow Navigator",
			function: open_navigator_command,
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
		app.extensionManager?.registerSidebarTab?.({
			id: TAB_ID,
			icon: DEFAULT_ICON,
			title: "Navigator",
			tooltip: "Search current workflow",
			type: "custom",
			render: render_panel,
		});

		api.addEventListener("graphChanged", invalidate_cache);
	},

	async afterConfigureGraph()
	{
		invalidate_cache();
	},
});
