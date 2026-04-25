import {
	FILTER_ALL,
	FILTER_FRAMES_GROUPS,
	FILTER_NOTES,
	FILTER_SUBGRAPHS,
	FILTER_TITLES,
	FILTER_TYPES,
} from "./constants.js";
import { get_query_terms, normalize_query } from "./utils.js";

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

function get_match_score(text, query_terms, base_score)
{
	if (!query_terms.length)
	{
		return base_score + 500;
	}

	let total_score = base_score;

	for (const query_term of query_terms)
	{
		const match_index = text.indexOf(query_term);

		if (match_index === -1)
		{
			return Number.POSITIVE_INFINITY;
		}

		if (text === query_term)
		{
			total_score += 0;
		}
		else if (text.startsWith(query_term))
		{
			total_score += 10 + match_index;
		}
		else
		{
			total_score += 50 + match_index;
		}
	}

	return total_score;
}

function get_entry_score(entry, query_terms, filter_id)
{
	switch (filter_id)
	{
		case FILTER_TITLES:
			return get_match_score(entry.title_lc, query_terms, 0);
		case FILTER_TYPES:
			return get_match_score(entry.type_lc, query_terms, 100);
		case FILTER_NOTES:
			return get_match_score(entry.note_lc, query_terms, 200);
		case FILTER_FRAMES_GROUPS:
			return get_match_score(get_field_text_for_filter(entry, filter_id), query_terms, 300);
		case FILTER_SUBGRAPHS:
			return get_match_score(get_field_text_for_filter(entry, filter_id), query_terms, 400);
		case FILTER_ALL:
		default:
		{
			const title_score = get_match_score(entry.title_lc, query_terms, 0);
			const type_score = get_match_score(entry.type_lc, query_terms, 100);
			const note_score = get_match_score(entry.note_lc, query_terms, 200);
			const path_score = get_match_score(entry.path_lc, query_terms, 300);
			const meta_score = get_match_score(entry.meta_lc, query_terms, 350);

			return Math.min(title_score, type_score, note_score, path_score, meta_score);
		}
	}
}

function compare_ranked_entries(left_ranked_entry, right_ranked_entry)
{
	if (left_ranked_entry.score !== right_ranked_entry.score)
	{
		return left_ranked_entry.score - right_ranked_entry.score;
	}

	return left_ranked_entry.entry.stable_index - right_ranked_entry.entry.stable_index;
}

function insert_ranked_entry(sorted_ranked_entries, next_ranked_entry, limit)
{
	if (limit <= 0)
	{
		return;
	}

	if (sorted_ranked_entries.length >= limit)
	{
		const worst_ranked_entry = sorted_ranked_entries[sorted_ranked_entries.length - 1];

		if (compare_ranked_entries(next_ranked_entry, worst_ranked_entry) >= 0)
		{
			return;
		}
	}

	let insert_index = sorted_ranked_entries.findIndex((ranked_entry) =>
	{
		return compare_ranked_entries(next_ranked_entry, ranked_entry) < 0;
	});

	if (insert_index === -1)
	{
		insert_index = sorted_ranked_entries.length;
	}

	sorted_ranked_entries.splice(insert_index, 0, next_ranked_entry);

	if (sorted_ranked_entries.length > limit)
	{
		sorted_ranked_entries.pop();
	}
}

function get_default_results(entries, filter_id, limit)
{
	const results = [];

	for (const entry of entries)
	{
		if (!entry_allowed_for_filter(entry, filter_id))
		{
			continue;
		}

		results.push(entry);

		if (results.length >= limit)
		{
			break;
		}
	}

	return results;
}

function normalize_filter_ids(filter_ids)
{
	if (!Array.isArray(filter_ids))
	{
		return [filter_ids || FILTER_ALL];
	}

	const normalized_filter_ids = filter_ids.filter(Boolean);

	return normalized_filter_ids.length ? normalized_filter_ids : [];
}

function get_default_results_for_filters(entries, filter_ids, limit)
{
	if (!filter_ids.length)
	{
		return [];
	}

	if (filter_ids.includes(FILTER_ALL))
	{
		return get_default_results(entries, FILTER_ALL, limit);
	}

	const results = [];

	for (const entry of entries)
	{
		if (!filter_ids.some((filter_id) => entry_allowed_for_filter(entry, filter_id)))
		{
			continue;
		}

		results.push(entry);

		if (results.length >= limit)
		{
			break;
		}
	}

	return results;
}

function get_entry_score_for_filters(entry, query_terms, filter_ids)
{
	if (filter_ids.includes(FILTER_ALL))
	{
		if (!entry_allowed_for_filter(entry, FILTER_ALL))
		{
			return Number.POSITIVE_INFINITY;
		}

		return get_entry_score(entry, query_terms, FILTER_ALL);
	}

	let best_score = Number.POSITIVE_INFINITY;

	for (const filter_id of filter_ids)
	{
		if (!entry_allowed_for_filter(entry, filter_id))
		{
			continue;
		}

		best_score = Math.min(best_score, get_entry_score(entry, query_terms, filter_id));
	}

	return best_score;
}

function search_entries(entries, query, filter_id, limit)
{
	if (limit <= 0)
	{
		return [];
	}

	const filter_ids = normalize_filter_ids(filter_id);

	if (!filter_ids.length)
	{
		return [];
	}

	const query_terms = get_query_terms(query);

	if (!query_terms.length)
	{
		return get_default_results_for_filters(entries, filter_ids, limit);
	}

	const ranked_entries = [];

	for (const entry of entries)
	{
		const entry_score = get_entry_score_for_filters(entry, query_terms, filter_ids);

		if (!Number.isFinite(entry_score))
		{
			continue;
		}

		insert_ranked_entry(
			ranked_entries,
			{
				entry: entry,
				score: entry_score,
			},
			limit
		);
	}

	return ranked_entries.map((ranked_entry) => ranked_entry.entry);
}

export function create_search_engine(graph_index, settings_store)
{
	const query_cache = new Map();

	function clear_cache()
	{
		query_cache.clear();
	}

	function search(query, filter_id)
	{
		const entries = graph_index.ensure();
		const normalized_query = normalize_query(query);
		const result_limit = settings_store.get_max_rendered_results();
		const filter_ids = normalize_filter_ids(filter_id);
		const cache_key = [
			graph_index.get_revision(),
			filter_ids.join(","),
			result_limit,
			normalized_query,
		].join("|");

		if (query_cache.has(cache_key))
		{
			return query_cache.get(cache_key);
		}

		const results = search_entries(entries, normalized_query, filter_ids, result_limit);

		query_cache.set(cache_key, results);

		if (query_cache.size > 24)
		{
			const oldest_cache_key = query_cache.keys().next().value;
			query_cache.delete(oldest_cache_key);
		}

		return results;
	}

	return {
		search,
		clear_cache,
	};
}
