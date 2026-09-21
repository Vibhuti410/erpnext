import { ref } from "vue"
import { toast } from "frappe-ui"

export default function setup(context) {
	// Reactive state, computed values, watchers and functions for this page.
	// Read this page's data sources and variables from context, e.g. context.todos

	const numberOfComments = ref(5)

	/**
	 * Format a Frappe date field for display, e.g. "2026-09-11" -> "11 Sept 2026".
	 *
	 * slice(0, 10) tolerates the value arriving as a datetime. The explicit
	 * "T00:00:00" anchors it to LOCAL midnight: a bare ISO date parses as UTC, so
	 * without it the date renders a day early for any viewer in a UTC-negative
	 * timezone.
	 */
	function formatDate(value: string | null | undefined): string {
		if (!value) return ""
		return new Date(String(value).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", {
			day: "numeric",
			month: "short",
			year: "numeric",
		})
	}

	function createQuotation() {
		toast.success("Quotation created")
	}

	return { numberOfComments, formatDate, createQuotation }
}
