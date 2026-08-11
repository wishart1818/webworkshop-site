import type { Prospect } from "@/lib/prospect-engine";
import {
  discoveryIdentityEvidenceFromSignals,
  isCredibleOwnedWebsiteCandidate,
  normalizedBusinessIdentityName,
  normalizedCompletePhone,
  normalizedStreetAddress,
} from "@/lib/prospect-identity-evidence";

type GooglePlaceCandidate = {
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
};

type GooglePlacesSearchResponse = {
  places?: GooglePlaceCandidate[];
};

export type OwnedWebsiteRecoveryDependencies = {
  fetch?: typeof fetch;
  apiKey?: string;
  timeoutMs?: number;
};

function normalizedHost(value: string) {
  try {
    const url = new URL(value.trim());
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function boundedQuery(prospect: Prospect) {
  return [prospect.businessName, prospect.address, prospect.city, prospect.state]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
}

function knownIdentityBindings(prospect: Prospect) {
  const evidence = discoveryIdentityEvidenceFromSignals(prospect.activitySignals);
  const phones = new Set([
    normalizedCompletePhone(prospect.phone),
    ...evidence.map((item) => normalizedCompletePhone(item.phone)),
  ].filter(Boolean));
  const addresses = new Set([
    normalizedStreetAddress(prospect.address),
    ...evidence.map((item) => normalizedStreetAddress(item.address)),
  ].filter(Boolean));
  return { phones, addresses };
}

function placeMatchesProspect(
  prospect: Prospect,
  place: GooglePlaceCandidate,
  bindings: ReturnType<typeof knownIdentityBindings>,
) {
  const placeName = normalizedBusinessIdentityName(place.displayName?.text ?? "");
  const expectedName = normalizedBusinessIdentityName(prospect.businessName);
  if (!placeName || !expectedName || placeName !== expectedName) return false;

  const placePhone = normalizedCompletePhone(place.nationalPhoneNumber ?? "");
  const placeAddress = normalizedStreetAddress(place.formattedAddress ?? "");
  const phoneMatch = Boolean(placePhone && bindings.phones.has(placePhone));
  const addressMatch = Boolean(placeAddress && bindings.addresses.has(placeAddress));
  return phoneMatch || addressMatch;
}

/**
 * Bounded recovery for a discovery provider record that arrived without an owned website.
 *
 * This is intentionally conservative: an exact Google Places re-query may contribute a
 * website candidate only when the normalized business name matches and either a complete
 * phone number or the full normalized address matches evidence already stored on the
 * prospect. Multiple conflicting candidate hosts fail closed.
 */
export async function discoverGoogleOwnedWebsiteCandidates(
  prospect: Prospect,
  dependencies: OwnedWebsiteRecoveryDependencies = {},
) {
  if (prospect.website.trim() || prospect.inactive) return [];
  const apiKey = (dependencies.apiKey ?? process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) return [];

  const query = boundedQuery(prospect);
  if (!query) return [];
  const fetchImpl = dependencies.fetch ?? fetch;
  const timeoutMs = Math.min(6_000, Math.max(750, dependencies.timeoutMs ?? 5_000));

  try {
    const response = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];

    const payload = await response.json() as GooglePlacesSearchResponse;
    const bindings = knownIdentityBindings(prospect);
    if (bindings.phones.size === 0 && bindings.addresses.size === 0) return [];

    const candidates = [...new Set((payload.places ?? [])
      .filter((place) => placeMatchesProspect(prospect, place, bindings))
      .map((place) => place.websiteUri?.trim() ?? "")
      .filter((value) => value && isCredibleOwnedWebsiteCandidate(value)))];

    const hosts = new Set(candidates.map(normalizedHost).filter(Boolean));
    if (hosts.size !== 1) return [];
    return candidates.slice(0, 3);
  } catch {
    return [];
  }
}
