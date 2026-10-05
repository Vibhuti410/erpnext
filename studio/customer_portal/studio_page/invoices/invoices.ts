/** Invoices list. Overdue is a subset of Outstanding, not a separate state. */

import { computed, ref } from "vue"
import { usePortalIdentity, user } from "@app/composables/usePortalIdentity"
import {
	groupItemNames, invoiceNote, previewNames, statusTheme, formatMoney, daysUntil,
} from "@app/lib/documents"

export default function setup(context) {
	const invoices = computed<any[]>(() => context.invoices?.data ?? [])
	/** One row per item comes back from `invoiceItems`; fold it into names per document. */
	const itemNames = computed(() => groupItemNames(context.invoiceItems?.data))

	// ---------------------------------------------------------------- status

	const live = computed(() => invoices.value)

	// ---------------------------------------------------------------- row note
	function outstanding(v: any): number {
		return Number(v.outstanding_amount ?? 0)
	}

	/** Late, or due within three days — the window the design paints red. */
	function isUrgent(v: any): boolean {
		if (outstanding(v) <= 0) return false
		const left = daysUntil(v.due_date)
		return left !== null && left <= 3
	}

	// ---------------------------------------------------------------- filters
	const FILTERS = ["Outstanding", "All", "Overdue", "Paid"]
	const filter = ref("Outstanding")
	const query = ref("")

	function matchesFilter(v: any, name: string): boolean {
		if (name === "All") return true
		if (name === "Outstanding") return outstanding(v) > 0
		return v.status === name
	}

	const counts = computed<Record<string, number>>(() => {
		const result: Record<string, number> = {}
		for (const name of FILTERS) result[name] = live.value.filter((v) => matchesFilter(v, name)).length
		return result
	})

	const filterOptions = computed(() =>
		FILTERS.map((name) => ({ label: `${name} ${counts.value[name]}`, value: name })),
	)

	function byUrgencyThenRecency(a: any, b: any): number {
		const urgentA = isUrgent(a)
		const urgentB = isUrgent(b)
		if (urgentA !== urgentB) return urgentA ? -1 : 1
		if (urgentA) return String(a.due_date).localeCompare(String(b.due_date))
		return String(b.posting_date).localeCompare(String(a.posting_date))
	}

	const rows = computed(() => {
		const term = query.value.trim().toLowerCase()
		return live.value
			.filter((v) => matchesFilter(v, filter.value))
			.filter((v) => !term || String(v.name).toLowerCase().includes(term))
			.slice()
			.sort(byUrgencyThenRecency)
			.map((v) => ({
				name: v.name,
				id: v.name,
				route: "/invoices/" + encodeURIComponent(v.name),
				items: previewNames(itemNames.value[v.name]),
				note: invoiceNote(v),
				urgent: isUrgent(v),
				status: v.status,
				theme: statusTheme(v.status),
				amount: formatMoney(v.grand_total, v.currency),
			}))
	})

	const searching = computed(() => Boolean(query.value.trim()) || filter.value !== "All")
	const emptyTitle = computed(() => (searching.value ? "No invoices match" : "No invoices yet"))
	const emptyCaption = computed(() =>
		searching.value
			? "Try a different status, or clear the search."
			: "Invoices raised against your orders will appear here.",
	)

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => invoices.value[0]?.company)
	const customerName = computed(
		() => invoices.value[0]?.customer_name ?? invoices.value[0]?.customer ?? "",
	)

	return {
		companyName, customerName, companyInitial, user,
		filter, query, filterOptions, counts, rows,
		emptyTitle, emptyCaption,
		formatMoney, statusTheme,
	}
}
