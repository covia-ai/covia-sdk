import { Venue,  CoviaError, GridError, NotFoundError,  StatusData, Job, Grid, RunStatus, isJobComplete, isJobFinished, getParsedAssetId, getAssetIdFromPath, getAssetIdFromVenueId } from './src/index';

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
  expect(v.venueId).toBe(process.env.VENUE_HOST!);
});

test('GridConnectWithUrl', async () => {
  const v = await Grid.connect(process.env.VENUE_URL!);
  expect(v.venueId).toBe(process.env.VENUE_HOST!);
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
  const asset = await venue.register(metadata);
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
  await expect(venue.getJob('xyz')).rejects.toThrow(NotFoundError);
});

test('venueRunOpAndCancel', async () => {
  const operation = await venue.getAsset(process.env.VALID_OP2!);
  expect(operation).not.toBeNull();
  expect(operation.id).not.toBeNull();
  const result = await operation.invoke(process.env.VALID_OP2_INPUT!);
  if(result.metadata.status == 'STARTED' || result.metadata.status == 'PENDING') {
    const jobId = result.id;
    const status = await venue.cancelJob(jobId);
    expect(status).toBe(200);
  }
});

test('venueInvokeOpAndCancel', async () => {
  const operation = await venue.getAsset(process.env.VALID_OP2!);
  expect(operation).not.toBeNull();
  expect(operation.id).not.toBeNull();
  const result = await operation.invoke(process.env.VALID_OP2_INPUT!);
  if(result.metadata.status == 'STARTED' || result.metadata.status == 'PENDING') {
    const jobId = result.id;
    const status = await venue.cancelJob(jobId);
    expect(status).toBe(200);
  }
});

test('venueStatus', async () => {
  const stats = await venue.status();
  expect(stats?.status).toBe("OK");
  expect(stats?.url).toBe(process.env.VENUE_URL);
  expect(stats?.did).toBe(process.env.VENUE_HOST);
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
