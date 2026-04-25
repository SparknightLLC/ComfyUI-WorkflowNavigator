import {
	FILTER_ALL,
	FILTER_FRAMES_GROUPS,
	FILTER_NOTES,
	FILTER_SUBGRAPHS,
	FILTER_TITLES,
	FILTER_TYPES,
	MAX_USAGE_RECORDS,
	USAGE_STORAGE_KEY,
} from "./constants.js";
import { get_query_terms, normalize_query } from "./utils.js";

function load_usage_records()
{
	try
	{
		const raw_records = window.localStorage?.getItem(USAGE_STORAGE_KEY);
		const parsed_records = raw_records ? JSON.parse(raw_records) : {};

		return parsed_records && typeof parsed_records === "object" && !Array.isArray(parsed_records)
			? parsed_records
			: {};
	}
	catch
	{
		return {};
	}
}

function save_usage_records(records)
{
	try
	{
		window.localStorage?.setItem(USAGE_STORAGE_KEY, JSON.stringify(records));
	}
	catch
	{
		// Local storage may be disabled; ranking can still work for the current session.
	}
}

function trim_usage_records(records)
{
	const entries = Object.entries(records);

	if (entries.length <= MAX_USAGE_RECORDS)
	{
		return records;
	}

	const trimmed_entries = entries
		.sort((left_entry, right_entry) =>
		{
			return Number(right_entry[1]?.last_used ?? 0) - Number(left_entry[1]?.last_used ?? 0);
		})
		.slice(0, MAX_USAGE_RECORDS);

	return Object.fromEntries(trimmed_entries);
}

function get_usage_boost(records, entry)
{
	const record = records[entry.entry_id];
	const count = Number(record?.count ?? 0);

	if (!Number.isFinite(count) || count <= 0)
	{
		return 0;
	}

	return Math.min(45, Math.log2(count + 1) * 14);
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

function compare_usage_ranked_entries(left_entry, right_entry, usage_records)
{
	const left_boost = get_usage_boost(usage_records, left_entry);
	const right_boost = get_usage_boost(usage_records, right_entry);

	if (left_boost !== right_boost)
	{
		return right_boost - left_boost;
	}

	const left_record = usage_records[left_entry.entry_id];
	const right_record = usage_records[right_entry.entry_id];
	const left_last_used = Number(left_record?.last_used ?? 0);
	const right_last_used = Number(right_record?.last_used ?? 0);

	if (left_last_used !== right_last_used)
	{
		return right_last_used - left_last_used;
	}

	return left_entry.stable_index - right_entry.stable_index;
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

function apply_usage_ranking(entries, usage_records, limit)
{
	return [...entries]
		.sort((left_entry, right_entry) =>
		{
			return compare_usage_ranked_entries(left_entry, right_entry, usage_records);
		})
		.slice(0, limit);
}

function get_default_results(entries, filter_id, limit, usage_records)
{
	const results = [];

	for (const entry of entries)
	{
		if (!entry_allowed_for_filter(entry, filter_id))
		{
			continue;
		}

		results.push(entry);

		if (!usage_records && results.length >= limit)
		{
			break;
		}
	}

	return usage_records ? apply_usage_ranking(results, usage_records, limit) : results;
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

function get_default_results_for_filters(entries, filter_ids, limit, usage_records)
{
	if (!filter_ids.length)
	{
		return [];
	}

	if (filter_ids.includes(FILTER_ALL))
	{
		return get_default_results(entries, FILTER_ALL, limit, usage_records);
	}

	const results = [];

	for (const entry of entries)
	{
		if (!filter_ids.some((filter_id) => entry_allowed_for_filter(entry, filter_id)))
		{
			continue;
		}

		results.push(entry);

		if (!usage_records && results.length >= limit)
		{
			break;
		}
	}

	return usage_records ? apply_usage_ranking(results, usage_records, limit) : results;
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

function search_entries(entries, query, filter_id, limit, usage_records)
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
		return get_default_results_for_filters(entries, filter_ids, limit, usage_records);
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
				score: usage_records
					? entry_score - get_usage_boost(usage_records, entry)
					: entry_score,
			},
			limit
		);
	}

	return ranked_entries.map((ranked_entry) => ranked_entry.entry);
}

export function create_search_engine(graph_index, settings_store)
{
	const query_cache = new Map();
	let usage_records = load_usage_records();
	let usage_revision = 0;

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
		const usage_ranking_enabled = settings_store.is_usage_aware_ranking_enabled();
		const active_usage_records = usage_ranking_enabled ? usage_records : null;
		const cache_key = [
			graph_index.get_revision(),
			usage_ranking_enabled ? usage_revision : "usage-off",
			filter_ids.join(","),
			result_limit,
			normalized_query,
		].join("|");

		if (query_cache.has(cache_key))
		{
			return query_cache.get(cache_key);
		}

		const results = search_entries(
			entries,
			normalized_query,
			filter_ids,
			result_limit,
			active_usage_records
		);

		query_cache.set(cache_key, results);

		if (query_cache.size > 24)
		{
			const oldest_cache_key = query_cache.keys().next().value;
			query_cache.delete(oldest_cache_key);
		}

		return results;
	}

	function record_usage(entry)
	{
		if (!entry?.entry_id)
		{
			return;
		}

		const current_record = usage_records[entry.entry_id] ?? {};

		usage_records = trim_usage_records({
			...usage_records,
			[entry.entry_id]: {
				count: Number(current_record.count ?? 0) + 1,
				last_used: Date.now(),
			},
		});
		usage_revision += 1;
		save_usage_records(usage_records);
		clear_cache();
	}

	return {
		search,
		record_usage,
		clear_cache,
	};
}
