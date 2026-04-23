export function create_sidebar_controller(app, tab_id)
{
	function get_sidebar_tab_button()
	{
		const selectors = [
			`.${tab_id}-tab-button`,
			`[data-sidebar-tab-id="${tab_id}"]`,
			`[data-tab-id="${tab_id}"]`,
		];

		for (const selector of selectors)
		{
			const element = document.querySelector(selector);

			if (element instanceof HTMLElement)
			{
				return element;
			}
		}

		return null;
	}

	function get_extension_manager()
	{
		return app?.extensionManager ?? null;
	}

	function get_active_sidebar_tab_id()
	{
		const manager = get_extension_manager();

		return manager?.activeSidebarTabId ?? manager?.activeSidebarTab?.id ?? null;
	}

	function is_button_open(button)
	{
		if (!(button instanceof HTMLElement))
		{
			return false;
		}

		return button.getAttribute("aria-pressed") === "true"
			|| button.getAttribute("aria-selected") === "true"
			|| button.dataset.active === "true"
			|| button.classList.contains("is-active")
			|| button.classList.contains("active")
			|| button.classList.contains("p-highlight");
	}

	function is_open()
	{
		const sidebar_tab_button = get_sidebar_tab_button();

		if (sidebar_tab_button)
		{
			return is_button_open(sidebar_tab_button);
		}

		return get_active_sidebar_tab_id() === tab_id;
	}

	function apply_active_tab_id(next_tab_id)
	{
		const manager = get_extension_manager();

		if (!manager || !("activeSidebarTabId" in manager))
		{
			return false;
		}

		manager.activeSidebarTabId = next_tab_id;

		return true;
	}

	function set_open(next_open)
	{
		const manager = get_extension_manager();
		const sidebar_tab_button = get_sidebar_tab_button();
		const manager_open = get_active_sidebar_tab_id() === tab_id;
		const button_open = is_button_open(sidebar_tab_button);

		if (next_open)
		{
			if (sidebar_tab_button)
			{
				if (!button_open)
				{
					sidebar_tab_button.click();
				}

				return true;
			}

			if (manager_open)
			{
				return true;
			}
		}
		else
		{
			if (sidebar_tab_button && button_open)
			{
				sidebar_tab_button.click();
				return true;
			}

			if (!sidebar_tab_button && !manager_open)
			{
				return true;
			}

			if (sidebar_tab_button && !button_open && !manager_open)
			{
				return true;
			}
		}

		if (next_open && typeof manager?.activateSidebarTab === "function")
		{
			manager.activateSidebarTab(tab_id);
			return true;
		}

		if (!next_open && typeof manager?.closeSidebarTab === "function")
		{
			manager.closeSidebarTab(tab_id);
			return true;
		}

		if (apply_active_tab_id(next_open ? tab_id : null))
		{
			return true;
		}

		if (typeof manager?.toggleSidebarTab === "function")
		{
			manager.toggleSidebarTab(tab_id);
			return true;
		}

		return true;
	}

	function open()
	{
		return set_open(true);
	}

	function close()
	{
		return set_open(false);
	}

	function close_from_surface()
	{
		const sidebar_tab_button = get_sidebar_tab_button();

		if (sidebar_tab_button)
		{
			sidebar_tab_button.click();
			return true;
		}

		return close();
	}

	function focus_canvas()
	{
		const canvas_targets = [
			document.getElementById("graph-canvas"),
			document.querySelector("#graph-canvas-container canvas"),
			document.getElementById("graph-canvas-container"),
		];

		for (const canvas_target of canvas_targets)
		{
			if (canvas_target instanceof HTMLElement)
			{
				if (!canvas_target.hasAttribute("tabindex"))
				{
					canvas_target.setAttribute("tabindex", "-1");
				}

				canvas_target.focus();
				return;
			}
		}
	}

	return {
		open,
		close,
		close_from_surface,
		is_open,
		focus_canvas,
	};
}
