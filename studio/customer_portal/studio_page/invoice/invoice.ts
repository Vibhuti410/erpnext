/** Invoice detail. The comment thread and "Pay now" are STATIC — no payment gateway is wired. */

import { computed, ref } from "vue"
import { usePortalIdentity, user } from "@app/composables/usePortalIdentity"
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
	statusTheme,
} from "@app/lib/documents"

export default function setup(context) {
	const doc = computed<any>(() => context.invoice?.doc ?? {})

	// ---------------------------------------------------------------- status

	const status = computed<string>(() => doc.value.status ?? "")
	const theme = computed(() => statusTheme(status.value))

	const currency = computed(() => doc.value.currency || "INR")
	const outstanding = computed(() => Number(doc.value.outstanding_amount ?? 0))
	const paid = computed(() => Number(doc.value.grand_total ?? 0) - outstanding.value)
	const overdue = computed(() => {
		if (outstanding.value <= 0) return false
		const left = daysUntil(doc.value.due_date)
		return left !== null && left < 0
	})

	// ---------------------------------------------------------------- header
	const docId = computed(() => doc.value.name ?? "")
	const crumbs = computed(() => [
		{ label: "Invoices", route: "/invoices" },
		{ label: docId.value },
	])

	/** Used by the info grid's cross-reference rows (see parts.info_column). */
	function goTo(route: string) {
		if (route) context.router.push(route)
	}

	// ---------------------------------------------------------------- info
	// step 7, not 6: the step frappe-ui itself uses for red text

	const dueLine = computed(() => {
		// Same trap as the list: a credit note has no balance, and "Paid on"
		// would read as the opposite of what the document does.
		if (doc.value.is_return || status.value === "Return") {
			return line("Credited on", formatDate(doc.value.posting_date))
		}
		if (status.value === "Credit Note Issued") return line("Settled by", "Credit note")
		if (outstanding.value <= 0) return line("Paid on", formatDate(doc.value.posting_date))
		const due = doc.value.due_date
		if (!due) return line("Due date", EMPTY, INK5)
		const left = daysUntil(due)
		const urgent = left !== null && left <= 3
		return urgent
			? line("Due date", formatDate(due), RED, "500")
			: line("Due date", formatDate(due))
	})

	const invoiceInfo = computed(() => {
		const rows: any[] = [
			line("Date", formatDate(doc.value.posting_date)),
			dueLine.value,
			line("Contact", doc.value.contact_display || doc.value.contact_person || EMPTY,
				doc.value.contact_display || doc.value.contact_person ? INK9 : INK5),
		]
		// Every order this invoice bills — one row each, so an invoice covering
		// two orders cannot look like one that came from none.
		sourceOrders.value.forEach((name, i) => {
			rows.push({
				key: "order:" + name,
				label: i > 0 ? "" : sourceOrders.value.length > 1 ? "From orders" : "From order",
				gutter: true,
				value: name,
				color: INK9,
				weight: "420",
				route: "/orders/" + encodeURIComponent(name),
			})
		})
		return rows
	})

	/** ERPNext records the source order per ITEM, so an invoice can bill more
	 *  than one. Every distinct order is listed. */
	const sourceOrders = computed<string[]>(() => {
		const names = new Set(
			(doc.value.items ?? []).map((row: any) => row.sales_order).filter(Boolean),
		)
		return [...names].sort()
	})

	function addressBlock(display: string | null, extra: string | null) {
		const name = doc.value.customer_name || doc.value.customer || ""
		const rows = [{ key: "name", label: "", value: name, color: INK9, weight: "500" }]
		rows.push({
			key: "address", label: "",
			value: (display || "").replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]+>/g, "").trim() || EMPTY,
			color: INK6, weight: "420",
		})
		if (extra) rows.push({ key: "extra", label: "", value: extra, color: INK6, weight: "420" })
		return rows
	}

	const billingAddress = computed(() =>
		addressBlock(doc.value.address_display, doc.value.customer_gstin ? "GSTIN " + doc.value.customer_gstin : null),
	)
	const shippingAddress = computed(() =>
		addressBlock(doc.value.shipping_address || doc.value.address_display, null),
	)

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
		const rows: any[] = [
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
		// `gap` sets the settlement pair apart from the arithmetic above it.
		if (paid.value > 0) {
			rows.push({ label: "Paid", value: formatMoney(paid.value, currency.value),
				color: INK6, weight: "420", size: "text-sm", gap: "6px" })
		}
		if (outstanding.value > 0) {
			rows.push({
				label: "Outstanding", value: formatMoney(outstanding.value, currency.value),
				color: overdue.value ? RED : INK9, weight: "600", size: "text-base",
				gap: paid.value > 0 ? "0px" : "6px",
			})
		}
		return rows
	})

	// ---------------------------------------------------------------- payments
	const payments = computed(() => {
		const rows = (context.paymentRows?.data ?? []).filter(
			(row: any) =>
				row?.reference_doctype === "Sales Invoice" && row?.reference_name === docId.value,
		)
		return rows
			.slice()
			.sort((a: any, b: any) => String(a.posting_date).localeCompare(String(b.posting_date)))
			.map((row: any) => ({
				key: row.name + ":" + row.posting_date,
				date: formatDate(row.posting_date),
				reference: row.reference_no || row.name,
				method: row.mode_of_payment || EMPTY,
				amount: formatMoney(row.allocated_amount, currency.value),
			}))
	})

	// ---------------------------------------------------------------- pay
	// STATIC — no payment gateway is wired, so this explains what would happen
	// and writes nothing. Shown only while money is actually outstanding.
	const canPay = computed(() => outstanding.value > 0)

	const payOpen = ref(false)

	function openPay() {
		payOpen.value = true
	}

	const payTitle = computed(() => "Pay " + formatMoney(outstanding.value, currency.value))
	const payMessage = computed(
		() => `You will be taken to the payment page to settle ${docId.value} in full. ` +
			`The invoice updates once the payment goes through.`,
	)
	const payActions = computed(() => [
		{ label: "Cancel", variant: "subtle", onClick: ({ close }) => close() },
		{ label: "Continue to payment", variant: "solid", onClick: ({ close }) => close() },
	])

	// ---------------------------------------------------------------- comments
	// STATIC — a real thread needs a whitelisted method scoped to this contact's
	// own documents; reading Comment rows straight from the portal would leak
	// other customers' records.

	function daysAgo(n: number): string {
		return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ")
	}

	const comments = [
		{ type: "comment", key: "comment:1", timestamp: daysAgo(3),
		  author: { fullname: "Meera Iyer" },
		  data: { name: "1", content: "Invoice raised against the delivered lines. Payment terms are 30 days from the invoice date." } },
	]

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => doc.value.company)
	const customerName = computed(() => doc.value.customer_name ?? doc.value.customer ?? "")

	return {
		docId, crumbs, status, statusTheme: theme, printDocument, goTo,
		invoiceInfo, billingAddress, shippingAddress,
		items, totals, payments, comments,
		canPay, payOpen, openPay, payTitle, payMessage, payActions,
		companyName, customerName, companyInitial, user,
		formatDate, formatMoney,
	}
}
