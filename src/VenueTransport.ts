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
  /** Defaults to application/json. Pass null for binary bodies. */
  contentType?: string | null;
};

function requestOptions(
  venue: VenueRequestContext,
  options: VenueRequestInit,
): RequestInit {
  const {
    contentType = 'application/json',
    headers: suppliedHeaders = {},
    ...request
  } = options;
  const headers = { ...suppliedHeaders };
  if (contentType && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = contentType;
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
