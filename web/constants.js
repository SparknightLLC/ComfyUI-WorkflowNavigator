export const EXTENSION_NAME = "ComfyUI-WorkflowNavigator";
export const TAB_ID = "workflowNavigator";
export const COMMAND_ID = "workflowNavigator.open";
export const DEFAULT_ICON = "pi pi-compass";
export const STYLE_ID = "workflow-navigator-style";
export const DEFAULT_GROUP_SIZE = [320, 180];
export const DEFAULT_JUMP_ZOOM = 0.75;
export const NOTE_LIKE_PATTERN = /(note|comment|annotation|markdown|sticky)/i;

export const FILTER_ALL = "all";
export const FILTER_TITLES = "titles";
export const FILTER_TYPES = "types";
export const FILTER_NOTES = "notes";
export const FILTER_FRAMES_GROUPS = "frames_groups";
export const FILTER_SUBGRAPHS = "subgraphs";

export const FILTER_DEFINITIONS = [
	{ id: FILTER_ALL, label: "All" },
	{ id: FILTER_TITLES, label: "Titles" },
	{ id: FILTER_TYPES, label: "Types" },
	{ id: FILTER_NOTES, label: "Notes" },
	{ id: FILTER_FRAMES_GROUPS, label: "Frames/Groups" },
	{ id: FILTER_SUBGRAPHS, label: "Subgraphs" },
];

export const SETTINGS = {
	MAX_RENDERED_RESULTS_ID: "WorkflowNavigator.MaxRenderedResults",
	JUMP_ZOOM_ENABLED_ID: "WorkflowNavigator.JumpZoomEnabled",
	QUERY_DEBOUNCE_MS_ID: "WorkflowNavigator.QueryDebounceMs",
	DEFAULT_MAX_RENDERED_RESULTS: 50,
	DEFAULT_JUMP_ZOOM_ENABLED: true,
	DEFAULT_QUERY_DEBOUNCE_MS: 40,
	MIN_MAX_RENDERED_RESULTS: 10,
	MAX_MAX_RENDERED_RESULTS: 500,
	MIN_QUERY_DEBOUNCE_MS: 0,
	MAX_QUERY_DEBOUNCE_MS: 500,
};

export const SEARCH_SHELL_CLASSES = "group rounded-lg bg-component-node-widget-background transition-all duration-150 flex flex-1 items-center border-0 text-base-foreground focus-within:ring focus-within:ring-component-node-widget-background-highlighted/80";
export const SEARCH_ICON_CLASSES = "ml-2 size-4 shrink-0 transition-colors duration-150 icon-[lucide--search] text-muted-foreground group-focus-within:text-base-foreground group-hover:text-base-foreground";
export const SEARCH_INPUT_CLASSES = "mx-2 my-1.5 h-5 w-full min-w-0 border-0 bg-transparent ring-0 outline-0";
export const SEARCH_CLEAR_BUTTON_CLASSES = "m-0 flex shrink-0 items-center justify-center border-0 bg-transparent p-0 pr-3 pl-1 text-muted-foreground ring-0 outline-0 transition-all duration-150 hover:scale-108 hover:text-base-foreground";
