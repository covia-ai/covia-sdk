import { fetchStreamWithError, fetchWithError } from './Utils';

export interface VenueRequestContext {
  baseUrl: string;
  venueId: string;
  auth: {
    apply(headers: Record<string, string>, audience?: string): void;
  };
}

export type VenueRequestInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
  /** Defaults to application/json on requests WITH a body; bodiless requests
   *  send no Content-Type (in browsers it makes every GET a non-simple CORS
   *  request, forcing a preflight per call on the hottest read paths).
   *  Pass null to suppress it on binary bodies. */
  contentType?: string | null;
};

function requestOptions(
  venue: VenueRequestContext,
  options: VenueRequestInit,
): RequestInit {
  const {
    contentType,
    headers: suppliedHeaders = {},
    ...request
  } = options;
  const headers = { ...suppliedHeaders };
  const effectiveContentType = contentType !== undefined
    ? contentType
    : (request.body != null ? 'application/json' : null);
  if (effectiveContentType && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = effectiveContentType;
  }
  venue.auth.apply(headers, venue.venueId);
  return { ...request, headers };
}

/** Make an authenticated JSON request against a venue API path. */
export function venueJson<T>(
  venue: VenueRequestContext,
  path: string,
  options: VenueRequestInit = {},
): Promise<T> {
  return fetchWithError<T>(
    `${venue.baseUrl}${path}`,
    requestOptions(venue, options),
  );
}

/** Make an authenticated streaming request against a venue API path. */
export function venueStream(
  venue: VenueRequestContext,
  path: string,
  options: VenueRequestInit = {},
): Promise<Response> {
  return fetchStreamWithError(
    `${venue.baseUrl}${path}`,
    requestOptions(venue, options),
  );
}
