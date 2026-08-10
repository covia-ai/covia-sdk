import { CoviaError } from './index';
import { BearerAuth } from './Credentials';
import { Grid } from './Grid';


async function example() {
  try {
    // Create a venue connection
    const venue = await Grid.connect('https://your-venue.example.com');
    
    // List all assets
    const assets = await venue.listAssets();
    console.log('Found assets:', assets.items.length);

    // Get a specific asset
    const asset = await venue.getAsset('asset-id');
    console.log('Asset:', asset.id);

    // Get asset metadata
    const metadata = await asset.getMetadata();
    console.log('Asset metadata:', metadata);

    // Get assets (returns Operation or DataAsset based on metadata)
    const operation = await venue.getAsset('operation-id');
    console.log('Operation:', operation);

    // Invoke an operation with simplified API
    const result = await operation.invoke({ length: '100' });
    console.log('Operation result:', result);

    // Get data asset
    const dataAsset = await venue.getAsset('data-asset-id');
    console.log('Data Asset:', dataAsset);

    // Upload content to data asset
    const content = new Blob(['Hello World'], { type: 'text/plain' });
    await dataAsset.putContent(content);

    // Get content from data asset
    const stream = await dataAsset.getContent();
    if (stream) {
      const bytes = await new Response(stream).arrayBuffer();
      console.log('Content bytes:', bytes.byteLength);
    }

    // List all jobs
    const jobs = await venue.listJobs();
    console.log('Jobs:', jobs);

    // Get a specific job
    const job = await venue.getJob('job-id');
    console.log('Job:', job);

  } catch (error) {
    if (error instanceof CoviaError) {
      console.error('Covia error:', error.message, error.code);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// Example usage of the Covia API
async function webExamples() {
  const auth = new BearerAuth("my-api-key");

  // Connect to a Venue
  const venue = await Grid.connect("https://your-venue.example.com", auth);

  // Use a stable catalog path rather than a deployment-specific asset hash.
  const result = await venue.operations.run("v/ops/schema/infer", {
    value: { name: "Ada", age: 36, admin: true },
  });
  console.log("Inferred schema:", result);

}

export { example, webExamples };
