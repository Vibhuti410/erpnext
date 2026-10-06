/** The company whose portal this is, for the shared sidebar. Memoised so the header
 *  does not blank on every navigation. The signed-in contact comes from
 *  @app/composables/useSession. */

import { computed, ref, watch } from "vue"

const STORAGE_KEY = "customer-portal:company"

function readStored(): string {
	// Private-mode and blocked-storage browsers throw on access, and a missing
	// name is not worth failing a page render over.
	try {
		return sessionStorage.getItem(STORAGE_KEY) ?? ""
	} catch {
		return ""
	}
}

let remembered = readStored()

function remember(name: string): void {
	if (!name || name === remembered) return
	remembered = name
	try {
		sessionStorage.setItem(STORAGE_KEY, name)
	} catch {
		// nothing to do: the in-memory copy above still covers this session
	}
}

export function usePortalIdentity(source: () => string | undefined | null) {
	const companyName = ref(remembered)

	watch(
		source,
		(name) => {
			if (!name) return
			remember(name)
			companyName.value = name
		},
		{ immediate: true },
	)

	const companyInitial = computed(() => companyName.value.charAt(0).toUpperCase())

	return { companyName, companyInitial }
}
