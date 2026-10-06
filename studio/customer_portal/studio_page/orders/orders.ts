/** Orders list. */

import { computed, ref } from "vue"
import { usePortalIdentity } from "@app/composables/usePortalIdentity"
import { useSession } from "@app/composables/useSession"
import { daysUntil, formatMoney } from "@app/utils"
import {
	ACTIVE_ORDER_STATUSES,
	groupItemNames,
	orderNote,
	previewNames,
	statusTheme,
} from "@app/lib/documents"

export default function setup(context) {
	const orders = computed<any[]>(() => context.orders?.data ?? [])
	/** One row per item comes back from `orderItems`; fold it into names per document. */
	const itemNames = computed(() => groupItemNames(context.orderItems?.data))

	function isSettableStatus(_status: string): boolean {
		return true
	}

	const live = computed(() => orders.value.filter((o) => isSettableStatus(o.status)))

	// ---------------------------------------------------------------- row note
	function delivered(o: any): boolean {
		return Number(o.per_delivered ?? 0) >= 100
	}

	/** True only while the order is still running — a closed or completed order
	 *  has no deadline left to miss. */
	function isOverdue(o: any): boolean {
		if (!ACTIVE_ORDER_STATUSES.includes(o.status) || delivered(o)) return false
		const left = daysUntil(o.delivery_date)
		return left !== null && left < 0
	}

	// ---------------------------------------------------------------- filters
	const FILTERS = ["Active", "All", "Completed", "Closed"]
	const filter = ref("Active")
	const query = ref("")

	function matchesFilter(o: any, name: string): boolean {
		if (name === "All") return true
		if (name === "Active") return ACTIVE_ORDER_STATUSES.includes(o.status)
		return o.status === name
	}

	const counts = computed<Record<string, number>>(() => {
		const result: Record<string, number> = {}
		for (const name of FILTERS) result[name] = live.value.filter((o) => matchesFilter(o, name)).length
		return result
	})

	const filterOptions = computed(() =>
		FILTERS.map((name) => ({ label: `${name} ${counts.value[name]}`, value: name })),
	)

	function byUrgencyThenRecency(a: any, b: any): number {
		const lateA = isOverdue(a)
		const lateB = isOverdue(b)
		if (lateA !== lateB) return lateA ? -1 : 1
		if (lateA) return String(a.delivery_date).localeCompare(String(b.delivery_date))
		return String(b.transaction_date).localeCompare(String(a.transaction_date))
	}

	const rows = computed(() => {
		const term = query.value.trim().toLowerCase()
		return live.value
			.filter((o) => matchesFilter(o, filter.value))
			.filter((o) => !term || String(o.name).toLowerCase().includes(term))
			.slice()
			.sort(byUrgencyThenRecency)
			.map((o) => ({
				name: o.name,
				id: o.name,
				route: "/orders/" + encodeURIComponent(o.name),
				items: previewNames(itemNames.value[o.name]),
				note: orderNote(o),
				urgent: isOverdue(o),
				status: o.status,
				theme: statusTheme(o.status),
				amount: formatMoney(o.grand_total, o.currency),
			}))
	})

	const searching = computed(() => Boolean(query.value.trim()) || filter.value !== "All")
	const emptyTitle = computed(() => (searching.value ? "No orders match" : "No orders yet"))
	const emptyCaption = computed(() =>
		searching.value
			? "Try a different status, or clear the search."
			: "Orders placed against your quotations will appear here.",
	)

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => orders.value[0]?.company)
	const { user, customers } = useSession()
	const customerName = computed(() => orders.value[0]?.customer_name ?? orders.value[0]?.customer ?? "")

	return {
		companyName, customerName, companyInitial, user, customers,
		filter, query, filterOptions, counts, rows,
		emptyTitle, emptyCaption,
		formatMoney, statusTheme,
	}
}
