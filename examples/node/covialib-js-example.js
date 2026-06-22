// Node.js example for using @covia/covia-sdk
// Demonstrates the main SDK features: operations, assets, jobs, agents, workspace, and secrets

import { Grid, Venue, KeyPairAuth, RunStatus } from "@covia/covia-sdk";

const VENUE_URL = "https://venue-3.covia.ai";

async function getSHA256Hash(input) {
  const textAsBuffer = new TextEncoder().encode(input.toString());
  const hashBuffer = await crypto.subtle.digest("SHA-256", textAsBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function main() {
  // ── Connect ──
  // Connect without auth
  const venue = await Grid.connect(VENUE_URL);
  console.log(`Connected to ${venue.metadata.name} (${venue.venueId})`);

  // Or connect with Ed25519 keypair auth
  // const auth = KeyPairAuth.generate();
  // console.log(`DID: ${auth.getDID()}`);
  // const venue = await Venue.connect(VENUE_URL, auth);

  // ── Venue Status ──
  const status = await venue.status();
  console.log(`Status: ${status.status}`);
  console.log(`Stats:`, status.stats);

  // ── Operations ──
  // List available operations
  const ops = await venue.operations.list();
  console.log(`\nOperations: ${ops.length}`);
  ops.slice(0, 5).forEach((op) => {
    console.log(`  - ${op.name}: ${op.description || "(no description)"}`);
  });

  // Run an operation synchronously (invoke + wait for result)
  console.log(`\nRunning v/ops/schema/infer...`);
  const inferResult = await venue.operations.run("v/ops/schema/infer", {
    value: { name: "Ada", age: 36, admin: true },
  });
  console.log(`Inferred schema:`, inferResult);

  // Invoke an operation asynchronously (returns a Job)
  console.log(`\nInvoking v/ops/schema/infer async...`);
  const job = await venue.operations.invoke("v/ops/schema/infer", {
    value: { name: "Bob", age: 42 },
  });
  console.log(`Job ID: ${job.id}, Status: ${job.metadata.status}`);

  // Wait for the job to complete and get the result
  const result = await job.result({ timeout: 10000 });
  console.log(`Job result:`, result);

  // ── Assets ──
  // List assets
  const assetList = await venue.listAssets({ limit: 10 });
  console.log(`\nAssets: ${assetList.total} total`);

  // Get a specific asset (returns Operation or DataAsset)
  if (assetList.items.length > 0) {
    const asset = await venue.getAsset(assetList.items[0]);
    console.log(`Asset: ${asset.id}`);
    const meta = await asset.getMetadata();
    console.log(`  Name: ${meta.name}`);
  }

  // Register a new data asset and upload content
  const contentData = "Hello World from example code";
  const contentType = "text/plain";
  const hash = await getSHA256Hash(Buffer.from(contentData));

  const newAsset = await venue.assets.register({
    name: "SDK Example Asset",
    creator: "covia-sdk-example",
    description: "Test data uploaded from the Node.js example.",
    dateCreated: new Date().toISOString().slice(0, 10),
    keywords: ["test", "example"],
    content: { sha256: hash, contentType },
  });
  console.log(`\nRegistered asset: ${newAsset.id}`);

  // Upload content
  const blob = new Blob([contentData], { type: contentType });
  const uploadResult = await newAsset.putContent(blob);
  console.log(`Upload hash: ${uploadResult.hash}`);

  // Download content
  const stream = await newAsset.getContent();
  if (stream) {
    const { value } = await stream.getReader().read();
    const text = new TextDecoder().decode(value);
    console.log(`Downloaded: "${text}"`);
  }

  // Content URL
  console.log(`Content URL: ${newAsset.getContentURL()}`);

  // ── Jobs ──
  // List jobs
  const jobIds = await venue.jobs.list();
  console.log(`\nJobs: ${jobIds.length}`);

  // Get a job by ID
  if (jobIds.length > 0) {
    const fetched = await venue.jobs.get(jobIds[0]);
    console.log(`Job ${fetched.id}: ${fetched.metadata.status}`);

    // Job status helpers
    console.log(`  isFinished: ${fetched.isFinished}`);
    console.log(`  isComplete: ${fetched.isComplete}`);
    console.log(`  isPaused: ${fetched.isPaused}`);
  }

  // ── Workspace ──
  console.log(`\nWorkspace operations...`);
  await venue.workspace.write("w/sdk-example/greeting", "Hello World");
  const readResult = await venue.workspace.read("w/sdk-example/greeting");
  console.log(`Read: ${readResult.value}`);
  await venue.workspace.delete("w/sdk-example/greeting");

  // List functions and adapters
  const funcs = await venue.workspace.functions();
  console.log(`Functions: ${funcs.functions?.length || 0}`);

  const adapters = await venue.workspace.adapters();
  console.log(`Adapters: ${adapters.adapters?.length || 0}`);

  // ── Agents ──
  console.log(`\nListing agents...`);
  const agentList = await venue.agents.list();
  console.log(`Agents: ${agentList.agents?.length || 0}`);

  // ── Secrets ──
  console.log(`\nListing secrets...`);
  const secrets = await venue.secrets.list();
  console.log(`Secrets: ${secrets.length} stored`);

  // ── Clean up ──
  venue.close();
  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.name === "GridError") {
    console.error(`HTTP ${err.statusCode}:`, err.responseBody);
  }
  process.exit(1);
});
