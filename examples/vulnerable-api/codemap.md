# examples/vulnerable-api/

## Responsibility
Intentionally vulnerable Express API showcasing the kinds of defects CodeAgora should detect.

## Design
The file is structured as a grab bag of insecure endpoints: hardcoded secrets, SQL injection, auth bypasses, command injection, SSRF/path traversal, XSS, template injection, weak crypto, and unsafe payment flows.

## Flow
Requests are accepted with minimal validation, user input is passed into queries/commands/paths, and the server returns responses that expose the vulnerable behavior.

## Integration
Used as benchmark/demo input for review runs and detector validation; it is explicitly non-production example code.
