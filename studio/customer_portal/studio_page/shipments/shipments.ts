/** Shipments list, over submitted delivery notes. */

import { computed, ref } from "vue"
import { usePortalIdentity, user } from "@app/composables/usePortalIdentity"
import { formatDate, formatQty } from "@app/utils"
import {
	groupItemNames,
	previewNames,
	shipmentNote,
	shipmentStatus,
	statusTheme,
} from "@app/lib/documents"

export default function setup(context) {
	const shipments = computed<any[]>(() => context.shipments?.data ?? [])
	/** One row per item comes back from `shipmentItems`; fold it into names per document. */
	const itemNames = computed(() => groupItemNames(context.shipmentItems?.data))

	// ---------------------------------------------------------------- filters
	const FILTERS = ["All", "Dispatched", "Returned"]
	const filter = ref("All")
	const query = ref("")

	const counts = computed<Record<string, number>>(() => {
		const result: Record<string, number> = { All: shipments.value.length }
		for (const name of FILTERS) {
			if (name !== "All") {
				result[name] = shipments.value.filter((s) => shipmentStatus(s) === name).length
			}
		}
		return result
	})

	const filterOptions = computed(() =>
		FILTERS.map((name) => ({ label: `${name} ${counts.value[name]}`, value: name })),
	)

	// ---------------------------------------------------------------- rows
	/** Newest dispatch first. Nothing here expires or falls due, so there is no
	 *  urgency tier to float above it — unlike the other three lists. */
	function byRecency(a: any, b: any): number {
		return String(b.posting_date).localeCompare(String(a.posting_date))
	}

	const rows = computed(() => {
		const term = query.value.trim().toLowerCase()
		return shipments.value
			.filter((s) => filter.value === "All" || shipmentStatus(s) === filter.value)
			.filter((s) => {
				if (!term) return true
				return (
					String(s.name).toLowerCase().includes(term) ||
					String(s.lr_no ?? "").toLowerCase().includes(term)
				)
			})
			.slice()
			.sort(byRecency)
			.map((s) => ({
				name: s.name,
				id: s.name,
				route: "/shipments/" + encodeURIComponent(s.name),
				items: previewNames(itemNames.value[s.name]),
				note: shipmentNote(s),
				urgent: false,
				status: shipmentStatus(s),
				theme: statusTheme(shipmentStatus(s)),
				qty: formatQty(s.total_qty),
			}))
	})

	const searching = computed(() => Boolean(query.value.trim()) || filter.value !== "All")
	const emptyTitle = computed(() => (searching.value ? "No shipments match" : "No shipments yet"))
	const emptyCaption = computed(() =>
		searching.value
			? "Try a different status, or clear the search."
			: "Deliveries against your orders will appear here.",
	)

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => shipments.value[0]?.company)
	const customerName = computed(
		() => shipments.value[0]?.customer_name ?? shipments.value[0]?.customer ?? "",
	)

	return {
		companyName, customerName, companyInitial, user,
		filter, query, filterOptions, counts, rows,
		emptyTitle, emptyCaption,
		formatDate, statusTheme,
	}
}
