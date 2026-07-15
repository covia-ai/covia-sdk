import { Venue,  CoviaError, GridError, NotFoundError,  StatusData, Job, Grid, RunStatus, isJobComplete, isJobFinished, getParsedAssetId, getAssetIdFromPath, getAssetIdFromVenueId } from './src/index';

// Live-venue integration suite. Required env (via .env or the shell):
//   VENUE_HOST        - connectable venue id: did:web:<host> or a URL
//   VENUE_URL         - the venue's base URL (https://.../ no trailing slash)
//   VENUE_NAME        - expected venue name (status/metadata)
//   MIN_ASSETS_VENUE  - lower bound on the venue's asset count
//   VALID_ASSET       - asset id of the Iris Dataset on the venue
//   VALID_OP          - an invokable op path (e.g. v/test/ops/random)
//   VALID_OP2         - a slow/cancellable op path (e.g. v/test/ops/delay)
//   VALID_OP2_INPUT   - JSON input for VALID_OP2 (e.g. {"delay": 8000})
//
// The suite is capability-aware: on a venue with the default public read-only
// ceiling, anonymous invokes are expected to FAIL with a diagnosable
// "Capability denied" error (venue 0.5+ names the missing capability); on a
// permissive venue they complete. Both outcomes pass their respective checks.

let venue:Venue;

beforeAll(async () => {
     const venueDid = process.env.VENUE_HOST?.toString();
      if(venueDid)
          venue = await Grid.connect(venueDid);
      else
          throw new Error("Unable to connect to Venue "+venueDid)
});

test('GridConnectWithDid', async () => {
  const v = await Grid.connect(process.env.VENUE_HOST!);
  // Canonical venue identity is the did:key (did:web is discovery, covia#167)
  expect(v.venueId.startsWith('did:')).toBe(true);
  const stats = await v.status();
  expect(v.venueId).toBe(stats?.did);
});

test('GridConnectWithUrl', async () => {
  const v = await Grid.connect(process.env.VENUE_URL!);
  const viaHost = await Grid.connect(process.env.VENUE_HOST!);
  expect(v.venueId).toBe(viaHost.venueId);
});

test('GridConnectCheckName', async () => {
  const v = await Grid.connect(process.env.VENUE_HOST!);
  expect(v.metadata.name).toBe(process.env.VENUE_NAME!);
});

test('venueHasAssets', async () => {
  const assetList = await venue.listAssets();
  expect(Array.isArray(assetList.items)).toBe(true);
  expect(assetList.items.length).toBeGreaterThan(Number(process.env.MIN_ASSETS_VENUE));
});

test('venueHasAssetId', async () => {
  const asset = await venue.getAsset(process.env.VALID_ASSET!);
  expect(asset).not.toBeNull();
  const metadata = await asset.getMetadata();
  expect(metadata?.name).toBe('Iris Dataset');
});

test('venueInvokeOp', async () => {
  const operation = await venue.getAsset(process.env.VALID_OP!);
  expect(operation).not.toBeNull();
  expect(operation.id).not.toBeNull();
  const result = await operation.invoke({ length: "10" });
  if (result.metadata.status === RunStatus.FAILED) {
    // Public read-only ceiling: anonymous invoke is denied — the denial must
    // be diagnosable (names the missing capability, venue 0.5+).
    expect(String(result.metadata.error)).toContain('Capability denied');
    expect(String(result.metadata.error)).toContain('invoke');
    return;
  }
  expect(result.metadata.status).toBe(RunStatus.COMPLETE);
  const jobId = result.id;
  const job = await venue.getJob(jobId);
  expect(job?.metadata.input).toEqual({ length: '10' });
});

test('venueDataAsset', async () => {
  const contentData = 'Hello World', contentType = 'text/plain';
  const hash = await getSHA256Hash(Buffer.from(contentData));
  const metadata = {
    "name":"Test Metadata",
    "creator":"Test",
    "description":"Test data to upload and check content.",
    "dateCreated":"2025-08-12",
    "keywords":["test"],
    "content": {
      "sha256" : hash,
      "contentType" : contentType,
    }
  };
  const asset = await venue.assets.register(metadata);
  expect(asset.id).not.toBeNull();
  const content = new Blob([contentData], { type: contentType });
  const uploadResponse = await asset.putContent(content);
  expect(uploadResponse).not.toBeNull();
  const downloadResponse = await asset.getContent();
  const { done, value } = await downloadResponse!.getReader().read();
  const decoder = new TextDecoder('utf-8');
  const str = decoder.decode(value);
  expect(str).toBe(contentData);
  expect(asset.getContentURL()).toBe(process.env.VENUE_URL+"/api/v1/assets/"+asset.id+"/content");
});

test('venueDoesNotHaveAssetId', async () => {
  await expect(venue.getAsset('42322')).rejects.toThrow(GridError);
});

test('venueHasNoData', async () => {
  // Valid-hex but nonexistent job id → 404 (a malformed id is a 400, not NotFound)
  await expect(venue.getJob('00000000000000000000000000000000')).rejects.toThrow(NotFoundError);
});

test('venueRunOpAndCancel', async () => {
  const operation = await venue.getAsset(process.env.VALID_OP2!);
  expect(operation).not.toBeNull();
  expect(operation.id).not.toBeNull();
  const result = await operation.invoke(JSON.parse(process.env.VALID_OP2_INPUT!));
  if(result.metadata.status == 'STARTED' || result.metadata.status == 'PENDING') {
    const jobId = result.id;
    const status = await venue.jobs.cancel(jobId);
    expect(status.status).toBe('CANCELLED');
  }
});

test('venueInvokeOpAndCancel', async () => {
  const operation = await venue.getAsset(process.env.VALID_OP2!);
  expect(operation).not.toBeNull();
  expect(operation.id).not.toBeNull();
  const result = await operation.invoke(JSON.parse(process.env.VALID_OP2_INPUT!));
  if(result.metadata.status == 'STARTED' || result.metadata.status == 'PENDING') {
    const jobId = result.id;
    const status = await venue.jobs.cancel(jobId);
    expect(status.status).toBe('CANCELLED');
  }
});

test('venueStatus', async () => {
  const stats = await venue.status();
  expect(stats?.status).toBe("OK");
  expect(stats?.url).toBe(process.env.VENUE_URL);
  // The status did is the canonical did:key identity (covia#167)
  expect(stats?.did).toBe(venue.venueId);
});

test('isJobCompleteMethod', () => {
  expect(isJobComplete(RunStatus.COMPLETE)).toBe(true);
  expect(isJobComplete(RunStatus.PENDING)).toBe(false);
});

test('isJobFinsihedMethod', () => {
  expect(isJobFinished(RunStatus.COMPLETE)).toBe(true);
  expect(isJobFinished(RunStatus.FAILED)).toBe(true);
  expect(isJobFinished(RunStatus.REJECTED)).toBe(true);
  expect(isJobFinished(RunStatus.CANCELLED)).toBe(true);
  expect(isJobFinished(RunStatus.STARTED)).toBe(false);
  expect(isJobFinished(RunStatus.AUTH_REQUIRED)).toBe(false);
});

test('listJobs', async () => {
  const jobs = await venue.listJobs();
  expect(jobs.length).toBeGreaterThan(0);
  const job = await venue.getJob(jobs[0]);
  expect(job.id).not.toBeNull();
  expect(job.metadata.status).not.toBeNull();
});

const getSHA256Hash = async (input:Buffer<ArrayBuffer>) => {
      const textAsBuffer = new TextEncoder().encode(input.toString());
      const hashBuffer = await crypto.subtle.digest("SHA-256", textAsBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray
        .map((item) => item.toString(16).padStart(2, "0"))
        .join("");
      return hash;
};
