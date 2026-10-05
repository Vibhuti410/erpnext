/** Quotation detail. The approval sheet and comment thread are STATIC — they write nothing. */

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
} from "@app/utils"
import { statusTheme } from "@app/lib/documents"

export default function setup(context) {
	const doc = computed<any>(() => context.quotation?.doc ?? {})

	// ---------------------------------------------------------------- status
	const status = computed<string>(() => doc.value.status ?? "")

	/** The accept / request-changes / reject row. Only an Open quotation is the
	 *  customer's to act on — once it is Ordered, Lost or Expired the decision
	 *  has already been made. */
	const canAct = computed(() => status.value === "Open")

	// ---------------------------------------------------------------- header
	const docId = computed(() => doc.value.name ?? "")
	const crumbs = computed(() => [
		{ label: "Quotations", route: "/quotations" },
		{ label: docId.value },
	])

	// ---------------------------------------------------------------- info
	// step 7, not 6: the step frappe-ui itself uses for red text

	const validityLine = computed(() => {
		const till = doc.value.valid_till
		if (!till) return line("Valid till", EMPTY, INK5)
		const left = daysUntil(till)
		const urgent = status.value === "Open" && left !== null && left >= 0 && left <= 7
		return urgent ? line("Valid till", formatDate(till), RED, "500") : line("Valid till", formatDate(till))
	})

	const salesInfo = computed(() => {
		const rows = [
			line("Date", formatDate(doc.value.transaction_date)),
			validityLine.value,
			line("Contact", doc.value.contact_display || doc.value.contact_person || EMPTY,
				doc.value.contact_display || doc.value.contact_person ? INK9 : INK5),
		]
		// Amendments are the one place a customer sees two documents as one thread.
		if (doc.value.amended_from) rows.push(line("Amended from", doc.value.amended_from))
		return rows
	})

	/** An address block: the customer's name, then the address, then the email.
	 *  ERPNext leaves these empty until an Address is linked, so each falls back
	 *  to a muted placeholder rather than collapsing the column. */
	function addressBlock(display: string | null, email: string | null) {
		const name = doc.value.customer_name || doc.value.party_name || ""
		const rows = [{ key: "name", label: "", value: name, color: INK9, weight: "500" }]
		rows.push({
			key: "address",
			label: "",
			value: (display || "").replace(/<br\s*\/?>/gi, ", ").replace(/<[^>]+>/g, "").trim() || EMPTY,
			color: INK6,
			weight: "420",
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
			// ERPNext repeats item_name into description when none was written; the
			// portal shows a description only when it actually says something more.
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

	// ---------------------------------------------------------------- sheet
	const SHEETS: Record<string, any> = {
		sign: {
			title: "Accept & e-sign",
			cta: "Accept quotation",
			buttonTheme: "gray",
			icon: "lucide-pen-line",
			field: { label: "Type your full name to sign" },
		},
		changes: {
			title: "Request changes",
			cta: "Send request",
			buttonTheme: "gray",
			icon: "lucide-message-square-text",
			field: {
				label: "What should change?",
				placeholder: "e.g. quantity, delivery date, or price",
			},
		},
		reject: {
			title: "Reject quotation",
			cta: "Reject",
			buttonTheme: "red",
			icon: "lucide-triangle-alert",
			// The only one that reddens its header badge. Desk does the same:
			// frappe.warn sets indicator "red" and themes the primary button red,
			// and reserves both for the destructive confirm.
			iconTheme: "red",
			// "(optional)" rides in the label rather than costing a description
			// line of its own.
			field: { label: "Reason (optional)" },
		},
	}

	const sheet = ref<string | null>(null)
	function openSheet(kind: string) {
		sheet.value = kind
	}
	function closeSheet() {
		sheet.value = null
	}

	const dialogOpen = computed({
		get: () => sheet.value !== null,
		set: (open: boolean) => {
			if (!open) sheet.value = null
		},
	})

	const sheetConfig = computed(() => (sheet.value ? SHEETS[sheet.value] : {}) ?? {})
	const sheetTitle = computed(() => sheetConfig.value.title ?? "")
	/** v1 takes a lucide-* STRING here and the badge tone in a separate `theme`;
	 *  the old `{ name, theme }` object silently rendered an empty badge. */
	const dialogIcon = computed(() => sheetConfig.value.icon ?? null)
	const dialogTheme = computed(() => sheetConfig.value.iconTheme ?? null)
	const fieldLabel = computed(() => sheetConfig.value.field?.label ?? "")
	const fieldPlaceholder = computed(() => sheetConfig.value.field?.placeholder ?? "")
	const fieldDescription = computed(() => sheetConfig.value.field?.description ?? "")

	const dialogMessage = computed(() => {
		const id = docId.value
		if (sheet.value === "sign") {
			return `You are accepting ${id} for ${formatMoney(doc.value.grand_total, currency.value)}.`
		}
		if (sheet.value === "reject") return `This will close ${id} and cannot be undone.`
		return ""
	})

	const dialogActions = computed(() => {
		const cfg = sheetConfig.value
		if (!sheet.value) return []
		return [
			{ label: "Cancel", variant: "subtle", onClick: ({ close }) => close() },
			{ label: cfg.cta, variant: "solid", theme: cfg.buttonTheme, onClick: ({ close }) => close() },
		]
	})

	const signedAs = computed(() => `Signed as ${user.fullName}, ${user.email}`)

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
		  data: { name: "1", content: "Revised rates as discussed. Galvanising is now included in the flange line, so the separate treatment charge only covers inspection." } },
		{ type: "comment", key: "comment:2", timestamp: daysAgo(3),
		  author: { fullname: user.fullName },
		  data: { name: "2", content: "Can you confirm whether the bolt quantity covers spares? We had asked for 5% extra." } },
		{ type: "comment", key: "comment:3", timestamp: daysAgo(5),
		  author: { fullname: "Meera Iyer" },
		  data: { name: "3", content: "Quotation sent. Delivery is 4 weeks from order confirmation." } },
	]

	// ---------------------------------------------------------------- sidebar
	const { companyName, companyInitial } = usePortalIdentity(() => doc.value.company)
	const customerName = computed(() => doc.value.customer_name ?? doc.value.party_name ?? "")

	return {
		docId, crumbs, status, statusTheme, canAct, printDocument,
		salesInfo, billingAddress, shippingAddress,
		items, totals,
		sheet, openSheet, closeSheet, dialogOpen, dialogActions,
		sheetTitle, dialogIcon, dialogTheme, dialogMessage,
		fieldLabel, fieldPlaceholder, fieldDescription, signedAs,
		comments,
		companyName, customerName, companyInitial, user,
		formatDate, formatMoney,
	}
}
