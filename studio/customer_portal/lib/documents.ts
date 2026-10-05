/** Shared document rules, so a document reads the same on every page it appears on. */

import { dayjs } from "frappe-ui"

export const EMPTY = "—"

// ---------------------------------------------------------------- formatting
export function formatDate(value: string | null | undefined): string {
	if (!value) return ""
	const day = dayjs(String(value).slice(0, 10))
	if (!day.isValid()) return ""
	return day.toDate().toLocaleDateString("en-GB", {
		day: "numeric", month: "short", year: "numeric",
	})
}

export function formatMoney(value: number | null | undefined, currency = "INR"): string {
	return money(value, currency, 0)
}

export function formatMoneyExact(value: number | null | undefined, currency = "INR"): string {
	return money(value, currency, 2)
}

function money(value: number | null | undefined, currency: string, fractionDigits: number): string {
	if (value == null) return ""
	return new Intl.NumberFormat("en-IN", {
		style: "currency", currency, maximumFractionDigits: fractionDigits,
	}).format(value)
}

export function daysUntil(date: string | null | undefined): number | null {
	if (!date) return null
	const day = dayjs(String(date).slice(0, 10))
	if (!day.isValid()) return null
	return day.startOf("day").diff(dayjs().startOf("day"), "day")
}

// ---------------------------------------------------------------- status
const THEME: Record<string, string> = {
	// Quotation
	Open: "blue", "Partially Ordered": "blue", Ordered: "green",
	Lost: "red", Expired: "gray",
	// Sales Order
	"To Deliver and Bill": "blue", "To Deliver": "blue", "To Bill": "blue",
	"To Pay": "blue", "On Hold": "gray", Completed: "green", Closed: "gray",
	// Sales Invoice
	Unpaid: "blue", "Unpaid and Discounted": "blue",
	"Partly Paid": "amber", "Partly Paid and Discounted": "amber",
	Overdue: "red", "Overdue and Discounted": "red", Paid: "green",
	Return: "gray", "Credit Note Issued": "gray",
	// Delivery Note — our own words, see shipmentStatus() below
	Dispatched: "blue", Returned: "gray", Cancelled: "gray",
}

export function statusTheme(status: string): string {
	return THEME[status] || "gray"
}

/** Sales Order statuses where the order is still running. */
export const ACTIVE_ORDER_STATUSES = [
	"To Deliver and Bill", "To Deliver", "To Bill", "To Pay", "On Hold",
]

// ---------------------------------------------------------------- quotations
export const HIDDEN_QUOTATION_STATUSES = ["Replied"]

/** Open and inside its last week — the window drawn in red. */
export function quotationIsUrgent(q: any): boolean {
	const left = daysUntil(q.valid_till)
	return q.status === "Open" && left !== null && left >= 0 && left <= 7
}

/** A validity countdown only means something while the quotation is open; on a
 *  Lost or Ordered one the clock has already stopped. */
export function quotationNote(q: any): string {
	if (q.status === "Expired") return "expired " + formatDate(q.valid_till)
	if (q.status === "Lost") return "issued " + formatDate(q.transaction_date)
	if (!q.valid_till) return "no validity set"
	if (q.status !== "Open") return "valid till " + formatDate(q.valid_till)
	const left = daysUntil(q.valid_till)
	if (left === null) return "no validity set"
	if (left < 0) return "lapsed " + formatDate(q.valid_till)
	if (left === 0) return "expires today"
	if (left <= 7) return left + (left === 1 ? " day left" : " days left")
	return "valid till " + formatDate(q.valid_till)
}

// ---------------------------------------------------------------- orders
export function orderIsDelivered(o: any): boolean {
	return Number(o.per_delivered ?? 0) >= 100
}

/** Only while the order is still running — a closed or completed one has no
 *  deadline left to miss. */
export function orderIsOverdue(o: any): boolean {
	if (!ACTIVE_ORDER_STATUSES.includes(o.status) || orderIsDelivered(o)) return false
	const left = daysUntil(o.delivery_date)
	return left !== null && left < 0
}

export function orderNote(o: any): string {
	if (o.status === "Closed") return "ordered " + formatDate(o.transaction_date)
	if (o.status === "Completed" || orderIsDelivered(o)) {
		return "delivered " + formatDate(o.delivery_date)
	}
	if (!o.delivery_date) return "no delivery date set"
	if (orderIsOverdue(o)) return "delivery was due " + formatDate(o.delivery_date)
	return "delivery by " + formatDate(o.delivery_date)
}

// ---------------------------------------------------------------- invoices
export function invoiceOutstanding(v: any): number {
	return Number(v.outstanding_amount ?? 0)
}

/** Late, or due within three days. */
export function invoiceIsUrgent(v: any): boolean {
	if (invoiceOutstanding(v) <= 0) return false
	const left = daysUntil(v.due_date)
	return left !== null && left <= 3
}

export function invoiceNote(v: any): string {
	// A credit note carries no balance, so it would otherwise fall into the
	// "paid" branch below — telling a customer they settled a document that is
	// in fact money coming back to them.
	if (v?.is_return || v?.status === "Return") return "credited " + formatDate(v.posting_date)
	// The original invoice, once a credit note has cancelled it out. No date:
	// the one that matters belongs to the credit note, which is a different row.
	if (v?.status === "Credit Note Issued") return "settled by credit note"
	const out = invoiceOutstanding(v)
	if (out <= 0) return "paid " + formatDate(v.posting_date)
	if (!v.due_date) return "no due date set"
	const left = daysUntil(v.due_date)
	if (left !== null && left < 0) return "was due " + formatDate(v.due_date)
	if (left === 0) return "due today"
	if (left !== null && left <= 3) return left + (left === 1 ? " day left" : " days left")
	return "due " + formatDate(v.due_date)
}

// ---------------------------------------------------------------- shipments
export function shipmentStatus(shipment: any): string {
	if (Number(shipment?.docstatus) === 2) return "Cancelled"
	if (shipment?.is_return) return "Returned"
	return "Dispatched"
}

/** The one-line context under a shipment id. */
export function shipmentNote(shipment: any): string {
	const date = formatDate(shipment?.posting_date)
	if (!date) return ""
	return (shipment?.is_return ? "returned " : "dispatched ") + date
}

// ---------------------------------------------------------------- item names
export function groupItemNames(rows: any[] | undefined): Record<string, string[]> {
	const map: Record<string, string[]> = {}
	for (const row of rows ?? []) {
		if (!row?.name || !row?.item_name) continue
		;(map[row.name] ||= []).push(row.item_name)
	}
	return map
}

export function previewNames(names: string[] | undefined, limit = 3): string {
	const list = names ?? []
	if (!list.length) return ""
	if (list.length <= limit) return list.join(", ")
	return list.slice(0, limit).join(", ") + " +" + (list.length - limit) + " more"
}

// ---------------------------------------------------------------- detail pages
/** Ink tokens the detail pages share. `-7` is the step frappe-ui uses for red text. */
export const INK9 = "var(--ink-gray-9)"
export const INK6 = "var(--ink-gray-6)"
export const INK5 = "var(--ink-gray-5)"
export const RED = "var(--ink-red-7)"

/** One label/value row of a detail page's info grid. */
export function line(label: string, value: string, color = INK9, weight = "420") {
	return { key: label + "|" + value, label, value, color, weight }
}

/** "2" or "2.50", with the unit when there is one. */
export function formatQty(value: number | null | undefined, uom?: string): string {
	if (value == null) return ""
	const qty = Number(value)
	return (Number.isInteger(qty) ? String(qty) : qty.toFixed(2)) + (uom ? " " + uom : "")
}

/** An item's description, stripped of markup. Falls back to the item code, and
 *  stays empty when the description only repeats the item name. */
export function descriptionOf(row: any): string {
	const text = String(row.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
	if (text && text !== (row.item_name || "").trim()) return text
	return row.item_code || ""
}

export function printDocument() {
	window.print()
}
