/** Generic helpers shared by the portal pages: formatting, the ink tokens the
 *  detail pages draw with, and the small presentational bits. Nothing here knows
 *  anything about quotations, orders, invoices or shipments — those rules live in
 *  lib/documents.ts. */

import { dayjs } from "frappe-ui"

export const EMPTY = "—"

// ---------------------------------------------------------------- dates and money
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
