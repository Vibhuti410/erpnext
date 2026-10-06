/** Quotations list. `Replied` is hidden — see HIDDEN_QUOTATION_STATUSES. */

import { computed, ref } from "vue"
import { usePortalIdentity } from "@app/composables/usePortalIdentity"
import { useSession } from "@app/composables/useSession"
import { daysUntil, formatMoney } from "@app/utils"
import { groupItemNames, previewNames, quotationNote, statusTheme } from "@app/lib/documents"

export default function setup(context) {
	const quotations = computed<any[]>(() => context.quotations?.data ?? [])
	/** One row per item comes back from `quotationItems`; fold it into names per document. */
	const itemNames = computed(() => groupItemNames(context.quotationItems?.data))

	const HIDDEN_STATUSES = ["Replied"]

	function isSettableStatus(status: string): boolean {
		return !HIDDEN_STATUSES.includes(status)
	}

	function noteIsUrgent(q: any): boolean {
		const left = daysUntil(q.valid_till)
		return q.status === "Open" && left !== null && left >= 0 && left <= 7
	}

	function byUrgencyThenRecency(a: any, b: any): number {
		const urgentA = noteIsUrgent(a)
		const urgentB = noteIsUrgent(b)
		if (urgentA !== urgentB) return urgentA ? -1 : 1
		// inside the urgent tier the deadline is what matters, not the issue date
		if (urgentA) return String(a.valid_till).localeCompare(String(b.valid_till))
		return String(b.transaction_date).localeCompare(String(a.transaction_date))
	}

	// ---------------------------------------------------------------- data
	const live = computed(() => quotations.value.filter((q) => isSettableStatus(q.status)))

	/** Reverse of `amended_from`: the quotation that supersedes this one, if any. */
	const amendedBy = computed(() => {
		const map: Record<string, string> = {}
		for (const q of quotations.value) {
			if (q.amended_from) map[q.amended_from] = q.name
		}
		return map
	})

	function amendmentNote(q: any): string {
		const notes: string[] = []
		if (q.amended_from) notes.push("Amended from " + q.amended_from)
		if (amendedBy.value[q.name]) notes.push("Amended to " + amendedBy.value[q.name])
		return notes.join(" · ")
	}

	// ---------------------------------------------------------------- filters
	const FILTERS = ["Open", "All", "Ordered", "Expired"]
	const filter = ref("Open")
	const query = ref("")

	const counts = computed<Record<string, number>>(() => {
		const result: Record<string, number> = { All: live.value.length }
		for (const name of FILTERS) {
			if (name !== "All") result[name] = live.value.filter((q) => q.status === name).length
		}
		return result
	})

	const filterOptions = computed(() =>
		FILTERS.map((name) => ({ label: `${name} ${counts.value[name]}`, value: name })),
	)

	const rows = computed(() => {
		const term = query.value.trim().toLowerCase()
		return live.value
			.filter((q) => filter.value === "All" || q.status === filter.value)
			.filter((q) => !term || String(q.name).toLowerCase().includes(term))
			.slice()
			.sort(byUrgencyThenRecency)
			.map((q) => ({
				name: q.name,
				id: q.name,
				route: "/quotations/" + encodeURIComponent(q.name),
				items: previewNames(itemNames.value[q.name]),
				note: quotationNote(q),
				urgent: noteIsUrgent(q),
				relation: amendmentNote(q),
				status: q.status,
				theme: statusTheme(q.status),
				amount: formatMoney(q.grand_total, q.currency),
			}))
	})

	/** Nothing to show is either "no quotations at all" or "the filter is too narrow" —
	 *  they need different words, so the empty state reads its copy from here. */
	const searching = computed(() => Boolean(query.value.trim()) || filter.value !== "All")
	const emptyTitle = computed(() =>
		searching.value ? "No quotations match" : "No quotations yet",
	)
	const emptyCaption = computed(() =>
		searching.value
			? "Try a different status, or clear the search."
			: "Quotations shared with you will appear here.",
	)

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => quotations.value[0]?.company)
	const { user, customers } = useSession()
	const customerName = computed(
		() => quotations.value[0]?.customer_name ?? quotations.value[0]?.party_name ?? "",
	)

	return {
		companyName, customerName, companyInitial, user, customers,
		filter, query, filterOptions, counts, rows,
		emptyTitle, emptyCaption,
		formatMoney, statusTheme,
	}
}
