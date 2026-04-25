export function create_element(tag_name, class_name)
{
	const element = document.createElement(tag_name);

	if (class_name)
	{
		element.className = class_name;
	}

	return element;
}

export function get_trimmed_string(value)
{
	return typeof value === "string" ? value.trim() : "";
}

export function normalize_query(value)
{
	return get_trimmed_string(value).toLowerCase().replace(/\s+/g, " ");
}

export function get_query_terms(value)
{
	const normalized_query = normalize_query(value);

	return normalized_query ? normalized_query.split(" ") : [];
}

export function clamp_number(value, minimum, maximum, fallback)
{
	const numeric_value = Number(value);

	if (!Number.isFinite(numeric_value))
	{
		return fallback;
	}

	return Math.min(maximum, Math.max(minimum, numeric_value));
}

export function clamp_integer(value, minimum, maximum, fallback)
{
	return Math.round(clamp_number(value, minimum, maximum, fallback));
}
