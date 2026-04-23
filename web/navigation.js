import { DEFAULT_JUMP_ZOOM } from "./constants.js";
import { get_graph_bounds, get_node_bounds } from "./graph_index.js";

function mark_canvas_dirty(app)
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

function get_canvas_viewport_size(app)
{
	const canvas_element = app?.canvas?.canvas;
	const device_pixel_ratio = window.devicePixelRatio || 1;
	const viewport_width = Number(canvas_element?.clientWidth) || Number(canvas_element?.width ?? 0) / device_pixel_ratio;
	const viewport_height = Number(canvas_element?.clientHeight) || Number(canvas_element?.height ?? 0) / device_pixel_ratio;

	return [viewport_width, viewport_height];
}

function center_bounds_without_zoom(app, bounds)
{
	const drag_scale = app?.canvas?.ds;

	if (!drag_scale || !bounds)
	{
		return;
	}

	const scale = Number(drag_scale.scale) || 1;
	const [viewport_width, viewport_height] = get_canvas_viewport_size(app);

	if (!viewport_width || !viewport_height)
	{
		return;
	}

	const center_x = bounds[0] + bounds[2] / 2;
	const center_y = bounds[1] + bounds[3] / 2;

	drag_scale.offset[0] = -center_x + viewport_width / (2 * scale);
	drag_scale.offset[1] = -center_y + viewport_height / (2 * scale);
	mark_canvas_dirty(app);
}

function navigate_to_bounds(app, bounds, apply_jump_zoom)
{
	if (!bounds || !app?.canvas)
	{
		return;
	}

	const drag_scale = app.canvas.ds;

	if (!drag_scale)
	{
		return;
	}

	if (!apply_jump_zoom)
	{
		center_bounds_without_zoom(app, bounds);
		return;
	}

	if (typeof drag_scale.animateToBounds === "function")
	{
		drag_scale.animateToBounds(
			bounds,
			() =>
			{
				mark_canvas_dirty(app);
			},
			{
				zoom: DEFAULT_JUMP_ZOOM,
			}
		);
		return;
	}

	if (typeof drag_scale.fitToBounds === "function")
	{
		drag_scale.fitToBounds(bounds, { zoom: DEFAULT_JUMP_ZOOM });
		mark_canvas_dirty(app);
		return;
	}

	center_bounds_without_zoom(app, bounds);
}

function select_node(app, node)
{
	if (typeof app?.canvas?.selectNode === "function")
	{
		app.canvas.selectNode(node, false);
	}
}

export function create_navigator(app, settings_store, sidebar_controller)
{
	function jump_to_entry(entry, options = {})
	{
		if (!entry || !app?.canvas)
		{
			return;
		}

		const keep_panel_open = options.keep_panel_open ?? false;
		const refocus_search = options.refocus_search ?? (() => {});
		const apply_jump_zoom = settings_store.is_jump_zoom_enabled();
		const current_graph = app.canvas.graph;
		const target_graph = entry.graph_ref;

		const perform_navigation = () =>
		{
			if (entry.kind === "group")
			{
				navigate_to_bounds(app, entry.bounds, apply_jump_zoom);
			}
			else if (entry.kind === "subgraph_entry")
			{
				navigate_to_bounds(app, get_graph_bounds(target_graph), apply_jump_zoom);
			}
			else
			{
				select_node(app, entry.raw_ref);

				if (apply_jump_zoom)
				{
					navigate_to_bounds(app, get_node_bounds(entry.raw_ref), true);
				}
				else if (typeof app.canvas.centerOnNode === "function")
				{
					app.canvas.centerOnNode(entry.raw_ref);
					mark_canvas_dirty(app);
				}
				else
				{
					center_bounds_without_zoom(app, get_node_bounds(entry.raw_ref));
				}
			}

			if (keep_panel_open)
			{
				window.setTimeout(() =>
				{
					refocus_search();
				}, 0);
			}
			else
			{
				sidebar_controller.close_from_surface();

				window.setTimeout(() =>
				{
					sidebar_controller.focus_canvas();
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

	return {
		jump_to_entry,
	};
}
