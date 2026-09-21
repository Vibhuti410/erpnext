import { computed } from "vue"

/**
 * Customer portal — Home.
 *
 * Quotation data is wired to the `quotations` resource. Orders, invoices,
 * deliveries and the activity feed have no backend yet, so they are marked
 * STATIC below and return fixture values of the right shape — swap the body of
 * each one for a real source without touching the page blocks.
 */
export default function setup(context) {
	const quotations = computed<any[]>(() => context.quotations?.data ?? [])

	// ---------------------------------------------------------------- formatting
	/** "2026-09-11" -> "11 Sept 2026". T00:00:00 anchors to local midnight; a bare
	 *  ISO date parses as UTC and renders a day early west of Greenwich. */
	function formatDate(value: string | null | undefined): string {
		if (!value) return ""
		return new Date(String(value).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
		})
	}

	function formatMoney(value: number | null | undefined, currency = "INR"): string {
		if (value == null) return ""
		return new Intl.NumberFormat("en-IN", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(value)
	}

	// ---------------------------------------------------------------- status mapping
	/** ERPNext's Quotation.status -> the customer-facing wording in the design.
	 *  Nothing is written back; this is presentation only. */
	function statusLabel(status: string): string {
		return (
			{
				Open: "Awaiting you",
				Replied: "Awaiting you",
				"Partially Ordered": "Accepted",
				Ordered: "Accepted",
				Lost: "Rejected",
				Expired: "Expired",
			}[status] || status
		)
	}

	/** Frappe's design language, not the mock: open -> blue, done -> green,
	 *  error -> red, everything else gray. Blue is this screen's single accent. */
	function statusTheme(status: string): string {
		return (
			{
				Open: "blue",
				Replied: "blue",
				"Partially Ordered": "blue", // still in progress, not done
				Ordered: "green",
				Lost: "red",
				Expired: "gray",
			}[status] || "gray"
		)
	}

	// quotations the customer still has to act on
	const awaiting = computed(() => quotations.value.filter((q) => q.status === "Open"))

	// ---------------------------------------------------------------- header
	const companyName = computed(() => quotations.value[0]?.company ?? "")
	const customerName = computed(
		() => quotations.value[0]?.customer_name ?? quotations.value[0]?.party_name ?? "",
	)

	// STATIC — no signed-in portal contact wired yet
	const user = { fullName: "Rahul Menon", initials: "RM" }

	const attentionLine = computed(() => {
		const n = attention.value.length
		if (!n) return "Nothing needs your attention"
		return n === 1 ? "One thing needs you" : `${n} things need you`
	})

	// ---------------------------------------------------------------- attention rows
	const attention = computed(() =>
		awaiting.value.map((q) => ({
			tag: "Awaiting you",
			theme: "blue",
			title: "A quotation is waiting for your response",
			sub: q.valid_till ? `Valid till ${formatDate(q.valid_till)}` : "No validity set",
			ref: q.name,
			amount: formatMoney(q.grand_total, q.currency),
			cta: "Review",
		})),
	)

	// ---------------------------------------------------------------- counters
	const counters = computed(() => [
		{
			label: "Awaiting your response",
			value: String(awaiting.value.length),
			sub: awaiting.value.length === 1 ? "quotation" : "quotations",
		},
		// STATIC — Sales Order / Delivery Note / Sales Invoice are not wired yet
		{ label: "Orders in progress", value: "2", sub: "1 part shipped" },
		{ label: "Pending deliveries", value: "1", sub: "in transit" },
		{ label: "Outstanding", value: formatMoney(421850), sub: "across 1 invoice" },
	])

	// ---------------------------------------------------------------- open documents
	const openDocs = computed(() => [
		...awaiting.value.map((q) => ({
			name: q.name,          // row identity for ListRow value
			kind: "Quotation",
			id: q.name,
			// the design's item summary ("Hydraulic cylinders and kits") has no source
			// on the list endpoint — the issue date is the honest stand-in
			what: `Issued ${formatDate(q.transaction_date)}`,
			status: statusLabel(q.status),
			theme: statusTheme(q.status),
			amount: formatMoney(q.grand_total, q.currency),
		})),
		// STATIC — until Sales Order / Sales Invoice are exposed to the portal
		{
			name: "SAL-ORD-2026-00031",
			kind: "Order",
			id: "SAL-ORD-2026-00031",
			what: "Part shipped, part invoiced",
			status: "In progress",
			theme: "blue",
			amount: formatMoney(843700),
		},
		{
			name: "ACC-SINV-2026-00118",
			kind: "Invoice",
			id: "ACC-SINV-2026-00118",
			what: "Due 12 Oct 2026",
			status: "Partly paid",
			theme: "gray",   // one accent per screen: blue is it, so this stays neutral
			amount: formatMoney(421850),
		},
	])

	// ---------------------------------------------------------------- activity
	// STATIC — a real feed needs a whitelisted method that merges document
	// timestamps for this contact's own documents; reading Version/Comment rows
	// straight from the portal would leak other customers' records.
	//
	// Shaped for @framework/ui's ActivityTimeline: `log` entries whose TimeAgo is
	// derived from a real timestamp (not a pre-baked "5 days ago" string), and
	// whose author fullname is bolded where it appears inside data.text.
	function daysAgo(n: number): string {
		return new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace("T", " ")
	}

	const activity = [
		{
			type: "log", key: "log:1", timestamp: daysAgo(1),
			author: { fullname: "Aurelia Components" },
			data: { name: "1", subtype: "created", text: "Payment of ₹4,21,850 recorded against ACC-SINV-2026-00118" },
		},
		{
			type: "log", key: "log:2", timestamp: daysAgo(2),
			author: { fullname: "Aurelia Components" },
			data: { name: "2", subtype: "created", text: "8 of 12 cylinders dispatched on MAT-DN-2026-00042" },
		},
		{
			type: "log", key: "log:3", timestamp: daysAgo(5),
			author: { fullname: "Aurelia Components" },
			data: { name: "3", subtype: "created", text: "Aurelia Components sent a revised quotation QTN-2026-00091" },
		},
		{
			type: "log", key: "log:4", timestamp: daysAgo(8),
			author: { fullname: "Rahul Menon" },
			data: { name: "4", subtype: "created", text: "Rahul Menon asked for changes on QTN-2026-00084" },
		},
	]

	return {
		companyName,
		customerName,
		user,
		attentionLine,
		attention,
		counters,
		openDocs,
		activity,
		formatDate,
		formatMoney,
		statusLabel,
		statusTheme,
	}
}
