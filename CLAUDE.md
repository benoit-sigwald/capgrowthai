# CapGrowth AI — Developer Guidelines

## Architecture Overview
Next.js application interacting with Oracle Autonomous Database 23ai (`PROSPECTS` schema) using the node-oracledb driver and Mistral AI API for copy generation.

## Key Developer Directives
- **Oracle Transactions:** Ensure connection pools are properly closed after query execution.
- **Vector Operations:** Use native `VECTOR_DISTANCE(..., COSINE)` for semantic queries.
- **Response Style:** 3-6 lines maximum. Concise and actionable English.
