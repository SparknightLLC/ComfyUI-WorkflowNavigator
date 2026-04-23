import {
	DEFAULT_GROUP_SIZE,
	NOTE_LIKE_PATTERN,
} from "./constants.js";
import {
	get_trimmed_string,
	normalize_query,
} from "./utils.js";

function get_current_graph(app)
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

function get_node_label(node)
{
	const explicit_title = get_trimmed_string(node?.title);

	if (explicit_title)
	{
		return explicit_title;
	}

	if (typeof node?.getTitle === "function")
	{
		const node_title = get_trimmed_string(node.getTitle());

		if (node_title)
		{
			return node_title;
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

export function get_node_bounds(node)
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

export function get_group_bounds(group)
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

export function get_graph_bounds(graph)
{
	const bounds_list = [];

	for (const node of get_graph_nodes(graph))
	{
		const node_bounds = get_node_bounds(node);

		if (node_bounds)
		{
			bounds_list.push(node_bounds);
		}
	}

	for (const group of get_graph_groups(graph))
	{
		const group_bounds = get_group_bounds(group);

		if (group_bounds)
		{
			bounds_list.push(group_bounds);
		}
	}

	return get_union_bounds(bounds_list);
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

	return {
		entry_id: make_entry_id(kind, normalized_path, id),
		kind: kind,
		id: id,
		title: normalized_title,
		type: normalized_type,
		note_text: normalized_note,
		path: normalized_path,
		meta_label: normalized_meta,
		search_text: normalize_query(search_segments.filter(Boolean).join(" ")),
		position: get_bounds_center(bounds),
		bounds: bounds,
		graph_ref: graph_ref,
		raw_ref: raw_ref,
		title_lc: normalize_query(normalized_title),
		type_lc: normalize_query(normalized_type),
		note_lc: normalize_query(normalized_note),
		path_lc: normalize_query(normalized_path),
		meta_lc: normalize_query(normalized_meta),
		stable_index: -1,
	};
}

function enumerate_graph_entries(app)
{
	const current_graph = get_current_graph(app);
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

				entries.push(
					build_entry(
						"subgraph_entry",
						`${node?.id ?? node_label}:subgraph`,
						subgraph_title,
						"Subgraph",
						"",
						path_label,
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

	const sorted_entries = entries.sort(compare_entries_stably);

	return sorted_entries.map((entry, stable_index) =>
	{
		entry.stable_index = stable_index;
		return entry;
	});
}

export function create_graph_index(app)
{
	const state = {
		entries: [],
		cache_invalidated: true,
		revision: 0,
	};

	function invalidate()
	{
		state.cache_invalidated = true;
		state.revision += 1;
	}

	function ensure()
	{
		if (!state.cache_invalidated)
		{
			return state.entries;
		}

		state.entries = enumerate_graph_entries(app);
		state.cache_invalidated = false;

		return state.entries;
	}

	return {
		invalidate,
		ensure,
		get_entries: () => state.entries,
		get_total_count: () => state.entries.length,
		get_revision: () => state.revision,
		is_invalidated: () => state.cache_invalidated,
	};
}
