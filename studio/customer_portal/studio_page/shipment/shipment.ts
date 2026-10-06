/** Shipment detail: when it left, how to trace it, what shipped and what is still to come. */

import { computed } from "vue"
import { usePortalIdentity } from "@app/composables/usePortalIdentity"
import { useSession } from "@app/composables/useSession"
import {
	descriptionOf,
	EMPTY,
	formatDate,
	formatMoney,
	formatQty,
	INK5,
	INK6,
	INK9,
	line,
	printDocument,
} from "@app/utils"
import { shipmentStatus, statusTheme } from "@app/lib/documents"

export default function setup(context) {
	const doc = computed<any>(() => context.shipment?.doc ?? {})

	// ---------------------------------------------------------------- header
	const docId = computed(() => doc.value.name ?? "")
	const status = computed(() => shipmentStatus(doc.value))
	const theme = computed(() => statusTheme(status.value))

	const crumbs = computed(() => [
		{ label: "Shipments", route: "/shipments" },
		{ label: docId.value },
	])

	/** Used by the info grid's cross-reference rows (see parts.info_column). */
	function goTo(route: string) {
		if (route) context.router.push(route)
	}

	// ---------------------------------------------------------------- info

	/** A value we hold, or an em dash that reads as deliberately empty. */
	function optional(label: string, value: string | null | undefined) {
		return value ? line(label, String(value)) : line(label, EMPTY, INK5)
	}

	const sourceOrders = computed<string[]>(() => {
		const names = new Set(
			(doc.value.items ?? []).map((row: any) => row.against_sales_order).filter(Boolean),
		)
		return [...names].sort()
	})

	const dispatchInfo = computed(() => {
		const rows: any[] = [
			line("Dispatched", formatDate(doc.value.posting_date) || EMPTY,
				doc.value.posting_date ? INK9 : INK5),
		]
		// Each order is a cross-reference the customer can follow back, laid out
		// the same way the Order page lists its source quotations.
		sourceOrders.value.forEach((name, i) => {
			rows.push({
				key: "order:" + name,
				label: i > 0 ? "" : sourceOrders.value.length > 1 ? "For orders" : "For order",
				gutter: true,
				value: name,
				color: INK9,
				weight: "420",
				route: "/orders/" + encodeURIComponent(name),
			})
		})
		rows.push(line("Goods value", formatMoney(doc.value.grand_total, doc.value.currency)))
		rows.push(line("Invoiced", billedLine.value, INK6))
		rows.push(optional("Contact", doc.value.contact_display || doc.value.contact_person))
		return rows
	})

	const billedLine = computed(() => {
		const billed = Number(doc.value.per_billed ?? 0)
		if (billed >= 100) return "In full"
		if (billed > 0) return "In part"
		return "Not yet"
	})

	const tracking = computed(() => [
		optional("Receipt no", doc.value.lr_no),
		optional("Transporter", doc.value.transporter_name),
		optional("Vehicle", doc.value.vehicle_no),
		optional("Driver", doc.value.driver_name),
	])

	function addressBlock(display: string | null) {
		const name = doc.value.customer_name || doc.value.customer || ""
		return [
			{ key: "name", label: "", value: name, color: INK9, weight: "500" },
			{
				key: "address", label: "",
				value: (display || "").replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]+>/g, "").trim() || EMPTY,
				color: INK6, weight: "420",
			},
		]
	}

	const shippingAddress = computed(() =>
		addressBlock(doc.value.shipping_address || doc.value.address_display),
	)

	// ---------------------------------------------------------------- items
	const orderLines = computed(() => {
		const map: Record<string, Record<string, { qty: number; delivered: number }>> = {}
		for (const row of context.orderLines?.data ?? []) {
			if (!row?.name || !row?.item_code) continue
			const order = (map[row.name] ||= {})
			const line = (order[row.item_code] ||= { qty: 0, delivered: 0 })
			line.qty += Number(row.qty ?? 0)
			line.delivered += Number(row.delivered_qty ?? 0)
		}
		return map
	})

	const items = computed(() =>
		(doc.value.items ?? []).map((row: any) => {
			const line = orderLines.value[row.against_sales_order]?.[row.item_code]
			const pending = line ? Math.max(0, line.qty - line.delivered) : null
			return {
				name: row.item_name || row.item_code,
				description: descriptionOf(row),
				shipped: line
					? formatQty(row.qty) + " of " + formatQty(line.qty, row.uom)
					: formatQty(row.qty, row.uom),
				pending: pending === null ? EMPTY : formatQty(pending),
			}
		}),
	)

	/** Total still outstanding across every line in this shipment's orders. */
	const pendingTotal = computed(() =>
		(doc.value.items ?? []).reduce((total: number, row: any) => {
			const line = orderLines.value[row.against_sales_order]?.[row.item_code]
			return total + (line ? Math.max(0, line.qty - line.delivered) : 0)
		}, 0),
	)

	const summary = computed(() => {
		if (!sourceOrders.value.length) {
			return [{
				label: "In this shipment",
				value: formatQty(doc.value.total_qty),
				color: INK9, weight: "600", size: "text-base",
			}]
		}
		return [{
			label: pendingTotal.value ? "Remaining on the order" : "This completes the order",
			value: pendingTotal.value ? formatQty(pendingTotal.value) : EMPTY,
			color: INK9, weight: "600", size: "text-base",
		}]
	})

	// ---------------------------------------------------------------- comments
	// STATIC — a real thread needs a whitelisted method scoped to this contact's
	// own documents; reading Comment rows straight from the portal would leak
	// other customers' records.

	function daysAgo(n: number): string {
		return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ")
	}

	const comments = [
		{ type: "comment", key: "comment:1", timestamp: daysAgo(1),
		  author: { fullname: "Meera Iyer" },
		  data: { name: "1", content: "Dispatched this morning. The balance follows once the next lot clears inspection." } },
	]

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => doc.value.company)
	const { user, customers } = useSession()
	const customerName = computed(() => doc.value.customer_name ?? doc.value.customer ?? "")

	return {
		docId, crumbs, status, statusTheme: theme, printDocument, goTo,
		dispatchInfo, tracking, shippingAddress,
		items, summary, comments,
		companyName, customerName, companyInitial, user, customers,
		formatDate,
	}
}
