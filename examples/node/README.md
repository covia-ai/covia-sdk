# @covia/covia-sdk Node.js Example

Demonstrates the main features of the [@covia/covia-sdk](https://www.npmjs.com/package/@covia/covia-sdk):

- Connecting to a venue (with or without authentication)
- Running and invoking operations
- Registering assets and uploading/downloading content
- Job lifecycle (list, get, status helpers)
- Workspace read/write
- Agents, secrets, and discovery

## Prerequisites

- Node.js >= 18
- A running Covia venue (or access to one)

## Setup

```bash
npm install
```

Set `VENUE_URL` to the venue you want to use. The example has no hard-coded
deployment default:

```bash
VENUE_URL=https://your-venue.example.com npm start
```

## Run

```bash
npm start
```

## Resources

- [Covia.ai](https://covia.ai)
- [Documentation](https://docs.covia.ai)
- [GitHub](https://github.com/covia-ai/covia-sdk)
