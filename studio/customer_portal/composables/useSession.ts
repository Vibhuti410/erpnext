/** Who is signed in, and which customers they may see. One call, shared by every page. */

import { ref } from "vue"
import { call } from "frappe-ui"

const METHOD = "erpnext.controllers.website_list_for_contact.get_portal_context"

export type PortalUser = { fullName: string; email: string; initials: string }

/**
 * Empty until the call answers. Every list filters on `customers` with an `in`,
 * and an empty `in` matches nothing — so a page that renders before the answer
 * arrives shows no documents rather than everyone's.
 */
const customers = ref<string[]>([])
const user = ref<PortalUser>({ fullName: "", email: "", initials: "" })

let started = false

function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean)
	if (!parts.length) return ""
	return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

/** Module scope, so the call runs once for the session rather than once per page. */
function load(): void {
	if (started) return
	started = true
	call(METHOD)
		.then((data: any) => {
			customers.value = data?.customers ?? []
			const fullName = data?.full_name || data?.user || ""
			user.value = { fullName, email: data?.email || "", initials: initialsOf(fullName) }
		})
		.catch(() => {
			// leave both empty: the lists stay closed rather than opening up
		})
}

export function useSession() {
	load()
	return { user, customers }
}
