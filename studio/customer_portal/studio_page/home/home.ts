/** Home. The signed-in contact and the activity feed are STATIC. */

import { computed } from "vue"
import { usePortalIdentity } from "@app/composables/usePortalIdentity"
import { useSession } from "@app/composables/useSession"
import { daysUntil, formatDate, formatMoney } from "@app/utils"
import {
	ACTIVE_ORDER_STATUSES,
	groupItemNames,
	HIDDEN_QUOTATION_STATUSES,
	invoiceIsUrgent,
	invoiceNote,
	invoiceOutstanding,
	orderIsOverdue,
	orderNote,
	previewNames,
	quotationIsUrgent,
	quotationNote,
	statusTheme,
} from "@app/lib/documents"

export default function setup(context) {
	const quotations = computed<any[]>(() => context.quotations?.data ?? [])
	const orders = computed<any[]>(() => context.orders?.data ?? [])
	const invoices = computed<any[]>(() => context.invoices?.data ?? [])

	// Each list carries its own child-row query; `groupItemNames` folds the
	// one-row-per-item results back into names per document.
	const itemNames = {
		quotations: computed(() => groupItemNames(context.quotationItems?.data)),
		orders: computed(() => groupItemNames(context.orderItems?.data)),
		invoices: computed(() => groupItemNames(context.invoiceItems?.data)),
	}

	// ---------------------------------------------------------------- status

	function isSettableStatus(status: string): boolean {
		return !HIDDEN_QUOTATION_STATUSES.includes(status)
	}

	// ---------------------------------------------------------------- header
	const live = computed(() => quotations.value.filter((q) => isSettableStatus(q.status)))
	const openQuotations = computed(() => quotations.value.filter((q) => q.status === "Open"))

	const { companyName, companyInitial } = usePortalIdentity(() => quotations.value[0]?.company)
	const { user, customers } = useSession()
	const customerName = computed(
		() => quotations.value[0]?.customer_name ?? quotations.value[0]?.party_name ?? "",
	)

	/** Earliest quotation we can see — the honest stand-in for "customer since". */
	const accountLine = computed(() => {
		if (!quotations.value.length) return ""
		const earliest = quotations.value.map((q) => q.transaction_date).filter(Boolean).sort()[0]
		if (!earliest) return "Account with " + companyName.value
		const since = new Date(String(earliest).slice(0, 10) + "T00:00:00").toLocaleDateString(
			"en-GB", { month: "short", year: "numeric" },
		)
		return "Account with " + companyName.value + " since " + since
	})

	// ---------------------------------------------------------------- counters
	const activeOrders = computed(() =>
		orders.value.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status)),
	)
	const undeliveredOrders = computed(() =>
		activeOrders.value.filter((o) => Number(o.per_delivered ?? 0) < 100),
	)

	const openShipments = computed(() => {
		const wanted = new Set(activeOrders.value.map((o) => o.name))
		const byName: Record<string, string> = {}
		for (const row of context.shipmentRows?.data ?? []) {
			if (!row?.name || row.is_return) continue
			if (!wanted.has(row.against_sales_order)) continue
			byName[row.name] = row.posting_date
		}
		const dates = Object.values(byName).filter(Boolean).sort()
		return { count: dates.length, last: dates[dates.length - 1] }
	})

	const counters = computed(() => {
		const nextExpiry = openQuotations.value.map((q) => q.valid_till).filter(Boolean).sort()[0]
		const nextDelivery = undeliveredOrders.value
			.map((o) => o.delivery_date).filter(Boolean).sort()[0]
		const unsettled = invoices.value.filter((v) => invoiceOutstanding(v) > 0)
		const owed = unsettled.reduce((total, v) => total + invoiceOutstanding(v), 0)
		const overdue = unsettled.filter((v) => {
			const left = daysUntil(v.due_date)
			return left !== null && left < 0
		})
		const shipped = openShipments.value
		return [
			{
				label: "Open quotations",
				value: String(openQuotations.value.length),
				sub: nextExpiry ? "valid till " + formatDate(nextExpiry) : "no validity set",
			},
			{
				label: "Orders awaiting delivery",
				value: String(undeliveredOrders.value.length),
				sub: nextDelivery
					? "next delivery " + formatDate(nextDelivery)
					: "no delivery date set",
			},
			// SENT, not arrived: a submitted delivery note proves the goods left
			// the warehouse, and ERPNext records nothing about them turning up.
			{
				label: "Shipments sent",
				value: String(shipped.count),
				sub: shipped.last ? "last sent " + formatDate(shipped.last) : "nothing sent yet",
			},
			{
				label: "Outstanding",
				value: formatMoney(owed),
				sub: overdue.length
					? overdue.length + (overdue.length === 1 ? " invoice overdue" : " invoices overdue")
					: "across " + unsettled.length + (unsettled.length === 1 ? " invoice" : " invoices"),
			},
		]
	})

	// ---------------------------------------------------------------- groups
	/** Home shows the few rows that matter; "Show all" carries the full count. */
	const PREVIEW_ROWS = 3

	/** Newest first, except that anything urgent jumps the queue — the same rule
	 *  the three list pages use, so a document sits in the same place on both. */
	function byUrgency(isUrgent, dateField, deadlineField) {
		return (a: any, b: any) => {
			const ua = isUrgent(a)
			const ub = isUrgent(b)
			if (ua !== ub) return ua ? -1 : 1
			if (ua) return String(a[deadlineField]).localeCompare(String(b[deadlineField]))
			return String(b[dateField]).localeCompare(String(a[dateField]))
		}
	}

	const quotationRows = computed(() =>
		live.value
			.slice()
			.sort(byUrgency(quotationIsUrgent, "transaction_date", "valid_till"))
			.slice(0, PREVIEW_ROWS)
			.map((q) => ({
				name: q.name,
				id: q.name,
				route: "/quotations/" + encodeURIComponent(q.name),
				items: previewNames(itemNames.quotations.value[q.name]),
				note: quotationNote(q),
				urgent: quotationIsUrgent(q),
				status: q.status,
				theme: statusTheme(q.status),
				amount: formatMoney(q.grand_total, q.currency),
			})),
	)

	const orderRows = computed(() =>
		orders.value
			.slice()
			.sort(byUrgency(orderIsOverdue, "transaction_date", "delivery_date"))
			.slice(0, PREVIEW_ROWS)
			.map((o) => ({
				name: o.name,
				id: o.name,
				route: "/orders/" + encodeURIComponent(o.name),
				items: previewNames(itemNames.orders.value[o.name]),
				note: orderNote(o),
				urgent: orderIsOverdue(o),
				status: o.status,
				theme: statusTheme(o.status),
				amount: formatMoney(o.grand_total, o.currency),
			})),
	)

	const invoiceRows = computed(() =>
		invoices.value
			.slice()
			.sort(byUrgency(invoiceIsUrgent, "posting_date", "due_date"))
			.slice(0, PREVIEW_ROWS)
			.map((v) => ({
				name: v.name,
				id: v.name,
				route: "/invoices/" + encodeURIComponent(v.name),
				items: previewNames(itemNames.invoices.value[v.name]),
				note: invoiceNote(v),
				urgent: invoiceIsUrgent(v),
				status: v.status,
				theme: statusTheme(v.status),
				amount: formatMoney(v.grand_total, v.currency),
			})),
	)

	/** The count belongs to the action that reveals them — a bare number beside
	 *  the heading did not say what it counted, and read as a status badge. */
	function showAll(total: number): string {
		return "Show all " + total
	}

	const homeGroups = computed(() => [
		{
			key: "quotations",
			title: "Quotations",
			route: "/quotations",
			showAll: showAll(live.value.length),
			rows: quotationRows.value,
		},
		{
			key: "orders",
			title: "Orders",
			route: "/orders",
			showAll: showAll(orders.value.length),
			rows: orderRows.value,
		},
		{
			key: "invoices",
			title: "Invoices",
			route: "/invoices",
			showAll: showAll(invoices.value.length),
			rows: invoiceRows.value,
		},
	])

	// ---------------------------------------------------------------- activity
	// STATIC — a real feed needs a whitelisted method that merges document
	// timestamps for this contact's own documents; reading Version/Comment rows
	// straight from the portal would leak other customers' records.
	function daysAgo(n: number): string {
		return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ")
	}

	const activity = [
		{ type: "log", key: "log:1", timestamp: daysAgo(1), author: { fullname: "Aurelia Components" },
		  data: { name: "1", subtype: "created", text: "Payment of ₹4,21,850 recorded against ACC-SINV-2026-00118" } },
		{ type: "log", key: "log:2", timestamp: daysAgo(2), author: { fullname: "Aurelia Components" },
		  data: { name: "2", subtype: "created", text: "8 of 12 cylinders dispatched on MAT-DN-2026-00042" } },
		{ type: "log", key: "log:3", timestamp: daysAgo(5), author: { fullname: "Aurelia Components" },
		  data: { name: "3", subtype: "created", text: "Aurelia Components sent a revised quotation QTN-2026-00091" } },
		{ type: "log", key: "log:4", timestamp: daysAgo(8), author: { fullname: "Rahul Menon" },
		  data: { name: "4", subtype: "created", text: "Rahul Menon asked for changes on QTN-2026-00084" } },
	]

	return {
		companyName, customerName, companyInitial, accountLine, user, customers,
		counters, homeGroups, activity,
		formatDate, formatMoney, statusTheme,
	}
}
