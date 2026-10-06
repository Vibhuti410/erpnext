/** Order detail. No action row: nothing on a sales order is customer-actionable. */

import { computed } from "vue"
import { usePortalIdentity } from "@app/composables/usePortalIdentity"
import { useSession } from "@app/composables/useSession"
import {
	daysUntil,
	descriptionOf,
	EMPTY,
	formatDate,
	formatMoneyExact as formatMoney,
	formatQty,
	INK5,
	INK6,
	INK9,
	line,
	printDocument,
	RED,
} from "@app/utils"
import { ACTIVE_ORDER_STATUSES, statusTheme } from "@app/lib/documents"

export default function setup(context) {
	const doc = computed<any>(() => context.order?.doc ?? {})

	// ---------------------------------------------------------------- status
	const status = computed<string>(() => doc.value.status ?? "")

	// ---------------------------------------------------------------- header
	const docId = computed(() => doc.value.name ?? "")
	const crumbs = computed(() => [
		{ label: "Orders", route: "/orders" },
		{ label: docId.value },
	])

	/** Used by the info grid's cross-reference rows (see parts.info_column). */
	function goTo(route: string) {
		if (route) context.router.push(route)
	}

	// ---------------------------------------------------------------- info
	// step 7, not 6: the step frappe-ui itself uses for red text

	const delivered = computed(() => Number(doc.value.per_delivered ?? 0) >= 100)

	/** Only while the order is still running — a closed or completed one has no
	 *  deadline left to miss. */
	const overdue = computed(() => {
		if (!ACTIVE_ORDER_STATUSES.includes(status.value) || delivered.value) return false
		const left = daysUntil(doc.value.delivery_date)
		return left !== null && left < 0
	})

	const deliveryLine = computed(() => {
		const date = doc.value.delivery_date
		if (!date) return line("Delivery date", EMPTY, INK5)
		// Red carries the lateness; the row is labelled "Delivery date", so its
		// job is the date — the same trade the Quotation page makes on validity.
		return overdue.value
			? line("Delivery date", formatDate(date), RED, "500")
			: line("Delivery date", formatDate(date))
	})

	const salesInfo = computed(() => {
		const rows: any[] = [
			line("Date", formatDate(doc.value.transaction_date)),
			deliveryLine.value,
			line("Contact", doc.value.contact_display || doc.value.contact_person || EMPTY,
				doc.value.contact_display || doc.value.contact_person ? INK9 : INK5),
		]
		if (doc.value.po_no) rows.push(line("Your PO", doc.value.po_no))
		// The quotations this order came from — one row each, `route` making each
		// one a cross-reference the customer can follow back.
		sourceQuotations.value.forEach((name, i) => {
			rows.push({
				key: "quotation:" + name,
				// Label on the first row only; the rest keep the indent via `gutter`
				// so the ids stay in one column.
				label: i > 0 ? "" : sourceQuotations.value.length > 1 ? "From quotations" : "From quotation",
				gutter: true,
				value: name,
				color: INK9,
				weight: "420",
				route: "/quotations/" + encodeURIComponent(name),
			})
		})
		return rows
	})

	const sourceQuotations = computed<string[]>(() => {
		const names = new Set(
			(doc.value.items ?? []).map((row: any) => row.prevdoc_docname).filter(Boolean),
		)
		return [...names].sort()
	})

	function addressBlock(display: string | null, email: string | null) {
		const name = doc.value.customer_name || doc.value.customer || ""
		const rows = [{ key: "name", label: "", value: name, color: INK9, weight: "500" }]
		rows.push({
			key: "address", label: "",
			value: (display || "").replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]+>/g, "").trim() || EMPTY,
			color: INK6, weight: "420",
		})
		if (email) rows.push({ key: "email", label: "", value: email, color: INK6, weight: "420" })
		return rows
	}

	const billingAddress = computed(() =>
		addressBlock(doc.value.address_display, doc.value.contact_email),
	)
	const shippingAddress = computed(() =>
		addressBlock(doc.value.shipping_address || doc.value.address_display, null),
	)

	// ---------------------------------------------------------------- items
	const currency = computed(() => doc.value.currency || "INR")

	const items = computed(() =>
		(doc.value.items ?? []).map((row: any) => ({
			name: row.item_name || row.item_code,
			description: descriptionOf(row),
			qty: formatQty(row.qty, row.uom),
			rate: formatMoney(row.rate, currency.value),
			amount: formatMoney(row.amount, currency.value),
		})),
	)

	const totals = computed(() => {
		const rows = [
			{ label: "Subtotal", value: formatMoney(doc.value.total, currency.value),
			  color: INK6, weight: "420", size: "text-sm" },
		]
		for (const tax of doc.value.taxes ?? []) {
			rows.push({
				label: tax.description || tax.account_head,
				value: formatMoney(tax.tax_amount, currency.value),
				color: INK6, weight: "420", size: "text-sm",
			})
		}
		rows.push({
			label: "Total", value: formatMoney(doc.value.grand_total, currency.value),
			color: INK9, weight: "600", size: "text-base",
		})
		return rows
	})

	// ---------------------------------------------------------------- comments
	// STATIC — a real thread needs a whitelisted method scoped to this contact's
	// own documents; reading Comment rows straight from the portal would leak
	// other customers' records.

	function daysAgo(n: number): string {
		return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ")
	}

	const comments = [
		{ type: "comment", key: "comment:1", timestamp: daysAgo(2),
		  author: { fullname: "Meera Iyer" },
		  data: { name: "1", content: "Production is on schedule. We will confirm the dispatch date once the first lot clears inspection." } },
	]

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => doc.value.company)
	const { user, customers } = useSession()
	const customerName = computed(() => doc.value.customer_name ?? doc.value.customer ?? "")

	return {
		docId, crumbs, status, statusTheme, printDocument, goTo,
		salesInfo, billingAddress, shippingAddress,
		items, totals, comments,
		companyName, customerName, companyInitial, user, customers,
		formatDate, formatMoney,
	}
}
